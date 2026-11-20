import json
import secrets
from datetime import timedelta
from io import StringIO
from uuid import uuid4

from django.contrib.auth.models import Permission, User
from django.core.management import call_command
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from .models import Report, ReportLink, ReviewEvent


@override_settings(INTAKE_TOKEN="local-test-intake")
class ReportingTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.headers = {
            "HTTP_IDEMPOTENCY_KEY": str(uuid4()),
            "HTTP_X_INTAKE_TOKEN": "local-test-intake",
        }
        self.report = {
            "receipt_secret": secrets.token_hex(32),
            "area": "Test area",
            "occurred_at": "2026-11-20T09:00:00+01:00",
            "category": "access",
            "firsthand": True,
            "description": "Private observation text.",
        }

    def post(self, path, data, **headers):
        csrf = self.client.get("/api/csrf/").json()["token"]
        return self.client.post(
            path, json.dumps(data), content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf, **headers,
        )

    def submit(self):
        return self.post("/api/reports/", self.report, **self.headers)

    def test_retry_after_lost_acknowledgement_and_private_receipt(self):
        first = self.submit()
        retry = self.submit()
        self.assertEqual((first.status_code, retry.status_code), (201, 200))
        self.assertEqual(first.json(), retry.json())
        self.assertEqual(Report.objects.count(), 1)
        self.report["description"] = "Changed observation"
        self.assertEqual(self.submit().status_code, 409)
        result = self.post("/api/receipt/", {"receipt_secret": self.report["receipt_secret"]})
        self.assertEqual(result.json(), first.json())
        self.assertIn("no-store", result.headers["Cache-Control"])
        self.assertEqual(self.post("/api/receipt/", {"receipt_secret": secrets.token_hex(32)}).status_code, 404)
        self.assertNotEqual(Report.objects.get().receipt_digest, self.report["receipt_secret"])

    def test_intake_credential_csrf_and_no_personal_fields(self):
        self.assertEqual(self.post("/api/reports/", self.report).status_code, 403)
        self.assertEqual(self.client.post(
            "/api/reports/", json.dumps(self.report), content_type="application/json", **self.headers,
        ).status_code, 403)
        self.report["name"] = "Unexpected field"
        self.assertEqual(self.submit().status_code, 400)
        self.assertEqual(Report.objects.count(), 0)

    def test_permission_and_versioned_review_with_audit(self):
        reference = self.submit().json()["reference"]
        path = f"/api/review/{reference}/"
        self.assertEqual(self.client.get("/api/review/").status_code, 403)
        self.assertEqual(self.post(path, {"action": "start", "version": 0}).status_code, 403)
        reviewer = User.objects.create_user("reviewer")
        reviewer.user_permissions.add(*Permission.objects.filter(
            content_type__app_label="reports", codename__in=["view_report", "change_report"],
        ))
        self.client.force_login(reviewer)
        self.assertEqual(self.client.get("/api/review/").json()["reports"], [])
        self.assertEqual(self.client.get(path).status_code, 404)
        Report.objects.filter(reference=reference).update(assigned_to=reviewer)
        self.assertEqual(self.client.get("/api/review/").json()["reports"][0]["reference"], reference)
        self.assertEqual(self.post(path, {"action": "start", "version": 0}).status_code, 200)
        self.assertEqual(self.post(path, {"action": "start", "version": 0}).status_code, 409)
        self.assertEqual(self.post(path, {
            "action": "close", "reason": "insufficient_information", "version": 1,
        }).status_code, 200)
        self.assertEqual(list(ReviewEvent.objects.order_by("version").values_list("reason", flat=True)), [
            "review_started", "insufficient_information",
        ])
        self.assertEqual(self.post("/api/receipt/", {
            "receipt_secret": self.report["receipt_secret"],
        }).json()["status"], "closed")

    def test_assignment_and_pair_decisions_are_scoped_and_reversible(self):
        first = self.submit().json()["reference"]
        self.headers["HTTP_IDEMPOTENCY_KEY"] = str(uuid4())
        self.report.update(receipt_secret=secrets.token_hex(32), occurred_at="2026-11-20T09:12:00+01:00")
        second = self.submit().json()["reference"]
        coordinator = User.objects.create_superuser("coordinator", password="test-password")
        reviewer = User.objects.create_user("reviewer")
        other = User.objects.create_user("another-reviewer")
        permissions = Permission.objects.filter(
            content_type__app_label="reports", codename__in=["view_report", "change_report"],
        )
        for account in (reviewer, other):
            account.user_permissions.add(*permissions)
        self.client.force_login(coordinator)
        for reference in (first, second):
            self.assertEqual(self.post(f"/api/review/{reference}/assignment/", {
                "version": 0, "reviewer": reviewer.pk,
            }).status_code, 200)
        self.client.force_login(reviewer)
        detail = self.client.get(f"/api/review/{first}/").json()
        self.assertEqual([item["reference"] for item in detail["candidates"]], [second])
        self.assertEqual(self.client.get("/api/review/?q=" + first[:8]).json()["reports"][0]["reference"], first)
        path = f"/api/review/{first}/links/{second}/"
        payload = {"versions": {first: 1, second: 1}, "decision": "linked", "note": "Matching context"}
        self.assertEqual(self.post(path, payload).status_code, 200)
        self.assertEqual(self.client.get("/review/overview/").status_code, 403)
        self.client.force_login(coordinator)
        self.assertEqual(self.client.get("/review/overview/").context["distinct"], 1)
        self.client.force_login(reviewer)
        self.assertEqual(self.post(path, payload).status_code, 409)
        payload.update(versions={first: 2, second: 2}, decision="separate", note="Different observations")
        self.assertEqual(self.post(path, payload).status_code, 200)
        self.assertEqual(ReportLink.objects.get().decision, "separate")
        self.assertEqual(ReviewEvent.objects.filter(reason="reports_linked").count(), 2)
        self.assertEqual(ReviewEvent.objects.filter(reason="reports_separate").count(), 2)
        self.client.force_login(coordinator)
        self.assertEqual(self.client.get("/review/overview/").context["distinct"], 2)
        self.assertEqual(self.post(f"/api/review/{second}/assignment/", {
            "version": 3, "reviewer": other.pk,
        }).status_code, 200)
        self.client.force_login(reviewer)
        self.assertEqual(self.client.get(f"/api/review/{second}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/review/{first}/").json()["candidates"], [])
        self.assertEqual(self.post(path, payload).status_code, 404)

    def test_public_shell_and_worker_do_not_embed_intake_credential(self):
        for path in ("/", "/service-worker.js"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertNotContains(response, "local-test-intake")
            self.assertNotIn("csrftoken", response.cookies)
        self.assertRedirects(self.client.get("/review/"), "/review/sign-in/?next=/review/")

    def test_retention_defaults_to_count_and_invalidates_purged_receipt(self):
        old = self.submit().json()["reference"]
        old_secret = self.report["receipt_secret"]
        Report.objects.filter(reference=old).update(received_at=timezone.now() - timedelta(days=31))
        self.headers["HTTP_IDEMPOTENCY_KEY"] = str(uuid4())
        self.report["receipt_secret"] = secrets.token_hex(32)
        self.submit()
        result = StringIO()
        call_command("purge_reports", days=30, stdout=result)
        self.assertIn("1 reports eligible", result.getvalue())
        self.assertEqual(Report.objects.count(), 2)
        call_command("purge_reports", days=30, apply=True, stdout=result)
        self.assertEqual(Report.objects.count(), 1)
        self.assertEqual(self.post("/api/receipt/", {"receipt_secret": old_secret}).status_code, 404)
