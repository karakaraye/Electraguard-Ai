import json
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from uuid import uuid4

from django.contrib.auth.models import Permission, User
from django.db import close_old_connections, connection, connections
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from .models import Report, ReportLink, ReviewEvent


def post_json(client, path, body, **headers):
    csrf_token = client.get("/api/csrf/").json()["token"]
    return client.post(
        path, json.dumps(body), content_type="application/json",
        HTTP_X_CSRFTOKEN=csrf_token, **headers,
    )


def observation(description="A passage was temporarily blocked."):
    return {
        "receipt_secret": secrets.token_hex(32),
        "area": "Area 04",
        "occurred_at": "2026-11-20T09:00:00+01:00",
        "category": "access",
        "firsthand": True,
        "description": description,
    }


def staff_account(username, *permissions):
    account = User.objects.create_user(username)
    account.user_permissions.add(*Permission.objects.filter(
        content_type__app_label="reports", codename__in=permissions,
    ))
    return account


@override_settings(INTAKE_TOKEN="isolated-workflow")
class WorkflowTests(TestCase):
    def test_receipt_lifecycle_and_permissions_through_supported_endpoints(self):
        observer = Client(enforce_csrf_checks=True)
        body = observation()
        credentials = {
            "HTTP_IDEMPOTENCY_KEY": str(uuid4()),
            "HTTP_X_INTAKE_TOKEN": "isolated-workflow",
        }
        submitted = post_json(observer, "/api/reports/", body, **credentials)
        self.assertEqual(submitted.status_code, 201, submitted.content)
        reference = submitted.json()["reference"]
        review_url = f"/api/review/{reference}/"
        claim = {"receipt_secret": body["receipt_secret"]}

        supervisor = staff_account("coordinator", "view_report", "assign_report")
        reviewer = staff_account("reviewer", "view_report", "change_report")
        alternate = staff_account("alternate", "view_report", "change_report")
        staff = Client(enforce_csrf_checks=True)
        staff.force_login(supervisor)
        self.assertEqual(post_json(staff, review_url, {"version": 0, "action": "start"}).status_code, 403)
        for version, account in enumerate((reviewer, alternate)):
            assigned = post_json(staff, review_url + "assignment/", {
                "version": version, "reviewer": account.pk,
            })
            self.assertEqual(assigned.status_code, 200, assigned.content)

        staff.force_login(reviewer)
        self.assertEqual(staff.get(review_url).status_code, 404)
        self.assertEqual(post_json(staff, review_url, {"version": 2, "action": "start"}).status_code, 404)
        staff.force_login(alternate)
        for change, status in (
            ({"version": 2, "action": "start"}, "in_review"),
            ({"version": 3, "action": "close", "reason": "insufficient_information"}, "closed"),
        ):
            updated = post_json(staff, review_url, change)
            self.assertEqual(updated.status_code, 200, updated.content)
            receipt = post_json(observer, "/api/receipt/", claim)
            self.assertEqual(receipt.json()["status"], status)
            self.assertEqual(set(receipt.json()), {"reference", "received_at", "status"})
            self.assertEqual(receipt.json()["reference"], reference)
        self.assertEqual(post_json(observer, "/api/reports/", body, **credentials).status_code, 200)
        self.assertEqual(Report.objects.count(), 1)
        self.assertEqual(
            list(ReviewEvent.objects.order_by("version").values_list("version", flat=True)),
            [1, 2, 3, 4],
        )

    def test_overview_groups_transitive_links_reversal_and_receipt_windows(self):
        coordinator = staff_account("coordinator", "view_report", "assign_report")
        self.client.force_login(coordinator)
        now = timezone.now()
        reports = [
            Report.objects.create(
                submission_key=uuid4(), submission_digest=secrets.token_hex(32),
                receipt_digest=secrets.token_hex(32), area="Area 04",
                occurred_at=now, category="access", firsthand=True, description="Report",
            )
            for _ in range(4)
        ]
        first, second, third, older = reports
        Report.objects.filter(pk=older.pk).update(received_at=now - timedelta(days=15))
        ReportLink.objects.create(first=first, second=second, decision="linked")
        bridge = ReportLink.objects.create(first=second, second=third, decision="linked")
        ReportLink.objects.create(first=third, second=older, decision="linked")

        recent = self.client.get("/review/overview/").context
        self.assertEqual((recent["received"], recent["distinct"], recent["unassigned"]), (3, 1, 3))
        all_window = self.client.get("/review/overview/?days=30").context
        self.assertEqual((all_window["received"], all_window["distinct"]), (4, 1))
        bridge.decision = "separate"
        bridge.save(update_fields=["decision"])
        self.assertEqual(self.client.get("/review/overview/").context["distinct"], 2)
        self.assertEqual(self.client.get("/review/overview/?days=30").context["distinct"], 2)


@override_settings(INTAKE_TOKEN="isolated-workflow")
class ConcurrentWorkflowTests(TransactionTestCase):
    def test_postgresql_replay_and_review_races_have_single_winners(self):
        if connection.vendor != "postgresql":
            self.skipTest("Run database concurrency checks on PostgreSQL.")

        def race(path, payload, auth=None, **headers):
            gate = Barrier(2, timeout=10)

            def send():
                close_old_connections()
                try:
                    client = Client(enforce_csrf_checks=True)
                    if auth:
                        client.force_login(auth)
                    token = client.get("/api/csrf/").json()["token"]
                    gate.wait()
                    return client.post(
                        path, json.dumps(payload), content_type="application/json",
                        HTTP_X_CSRFTOKEN=token, **headers,
                    )
                finally:
                    connections.close_all()

            with ThreadPoolExecutor(max_workers=2) as threads:
                attempts = [threads.submit(send) for _ in range(2)]
                return [attempt.result(timeout=15) for attempt in attempts]

        attempts = race(
            "/api/reports/", observation(),
            HTTP_IDEMPOTENCY_KEY=str(uuid4()), HTTP_X_INTAKE_TOKEN="isolated-workflow",
        )
        self.assertEqual(sorted(result.status_code for result in attempts), [200, 201])
        self.assertEqual(attempts[0].json(), attempts[1].json())
        self.assertEqual(Report.objects.count(), 1)
        reviewer = staff_account("reviewer", "view_report", "change_report")
        report = Report.objects.get()
        report.assigned_to = reviewer
        report.save(update_fields=["assigned_to"])
        review = race(
            f"/api/review/{report.reference}/", {"version": 0, "action": "start"}, auth=reviewer,
        )
        self.assertEqual(sorted(result.status_code for result in review), [200, 409])
        self.assertEqual(ReviewEvent.objects.filter(report=report, version=1).count(), 1)
