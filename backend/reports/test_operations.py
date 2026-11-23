import importlib
import json
from datetime import datetime
from hashlib import sha256
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.apps import apps
from django.core.management import call_command
from django.db import connection
from django.test import Client, TestCase, override_settings

from accounts.models import Organisation, User

from .media_storage import photo_key, storage
from .models import AssignmentBatch, MediaItem, Report, ReviewEvent, Triage
from .v1_views import receipt

ASSIGN = "/api/v1/assignments"
OPS = "/api/v1/ops/overview"


class CoordinatorTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.coordinator = User.objects.create_user("coord@operations.example", role=User.Role.COORDINATOR)
        cls.observer = User.objects.create_user("observer@operations.example", role=User.Role.OBSERVER)
        cls.reviewer = User.objects.create_user("reviewer@operations.example", role=User.Role.REVIEWER)
        cls.other = User.objects.create_user("other@operations.example", role=User.Role.REVIEWER)
        cls.admin = User.objects.create_user("admin@operations.example", role=User.Role.ORG_ADMIN)
        cls.foreign = Organisation.objects.create(name="Separate synthetic organisation")
        cls.foreign_coordinator = User.objects.create_user(
            "foreign-coord@operations.example", role=User.Role.COORDINATOR, organisation=cls.foreign,
        )
        cls.foreign_reviewer = User.objects.create_user(
            "foreign-review@operations.example", role=User.Role.REVIEWER, organisation=cls.foreign,
        )

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.client.force_login(self.coordinator)

    def report(self, date="2026-11-23T09:00:00+01:00", **kwargs):
        fields = {
            "observer": self.observer, "occurred_at": datetime.fromisoformat(date),
            "incident_details": {
                "area": {
                    "state_code": "SYN-KN", "state_name": "Synthetic Kano", "lga_code": "SYN-KN-01",
                    "lga_name": "Fictional LGA", "ward_code": "SYN-KN-01-01", "ward_name": "Ward",
                    "polling_unit_code": "private-unit", "polling_unit_name": "Private Unit",
                    "private_extra": "do not expose",
                },
                "category_observer": "access_barrier",
                "danger_now": True,
            },
        }
        fields.update(kwargs)
        return Report.objects.create(
            receipt_code=receipt(), submission_key=uuid4(), description="Private fictional description",
            location="Private fictional location", **fields,
        )

    def post(self, items, key=None):
        token = self.client.get("/api/v1/auth/csrf").json()["csrf_token"]
        return self.client.post(
            ASSIGN, {"items": items}, content_type="application/json",
            HTTP_X_CSRFTOKEN=token, HTTP_IDEMPOTENCY_KEY=str(key or uuid4()),
        )

    def test_roles_migrate_and_legacy_endpoints_keep_working(self):
        legacy = User.objects.create_user("legacy@operations.example", role=User.Role.ADMINISTRATOR)
        migration = importlib.import_module("accounts.migrations.0006_alter_accountoffboarding_role_alter_user_role")
        migration.migrate_administrators(apps, SimpleNamespace(connection=connection))
        legacy.refresh_from_db()
        self.assertEqual(legacy.role, User.Role.COORDINATOR)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, User.Role.ORG_ADMIN)
        self.client.force_login(legacy)
        self.assertEqual(self.client.get("/api/auth/me").json()["role"], "administrator")
        self.assertEqual(self.client.get("/api/v1/auth/me").json()["user"]["roles"], ["coordinator"])
        for path in ("/api/workspaces/administrator", "/api/assignments", "/api/dashboard", ASSIGN, OPS):
            self.assertEqual(self.client.get(path).status_code, 200)

    def test_coordinator_only_and_summaries_reveal_no_content(self):
        self.report()
        for user in (self.observer, self.reviewer, self.admin, None):
            self.client.logout()
            if user is not None:
                self.client.force_login(user)
            status = 403 if user else 401
            self.assertEqual(self.client.get(ASSIGN).status_code, status)
            self.assertEqual(self.client.get(OPS).status_code, status)
            self.assertEqual(self.post([]).status_code, status)
        self.client.force_login(self.foreign_coordinator)
        self.assertEqual(self.client.get(ASSIGN).json()["items"], [])
        self.assertEqual(self.client.get(OPS).json()["totals"]["reports"], 0)
        self.client.force_login(self.coordinator)
        listing = self.client.get(ASSIGN, {"assigned": "none", "urgency": "urgent"})
        self.assertEqual(listing.status_code, 200, listing.content)
        item = listing.json()["items"][0]
        self.assertIsNone(item["area"]["polling_unit_code"])
        self.assertIsNone(item["area"]["polling_unit_name"])
        for private in ("Private fictional", "Private Unit", "private_extra", self.observer.email):
            self.assertNotIn(private, listing.content.decode())
        self.assertIsNotNone(item["suggested_reviewer"])
        self.assertNotIn(str(self.foreign_reviewer.pk), [row["id"] for row in listing.json()["reviewers"]])

    def test_bulk_partial_success_replay_and_foreign_reviewer(self):
        first, second = self.report(), self.report()
        key = uuid4()
        items = [
            {"report_id": str(first.pk), "reviewer_id": str(self.reviewer.pk), "version": 0},
            {"report_id": str(uuid4()), "reviewer_id": str(self.reviewer.pk), "version": 0},
            {"report_id": str(second.pk), "reviewer_id": str(self.foreign_reviewer.pk), "version": 0},
        ]
        created = self.post(items, key)
        self.assertEqual(created.status_code, 200, created.content)
        results = created.json()["results"]
        self.assertTrue(results[0]["ok"])
        self.assertEqual(results[1]["error"]["code"], "not_found")
        self.assertEqual(results[2]["error"]["code"], "validation_failed")
        repeat = self.post(items, key)
        self.assertEqual((repeat.json(), repeat["Idempotent-Replayed"]), (created.json(), "true"))
        self.assertEqual(self.post([], key).json()["error"]["code"], "idempotency_key_reused")
        self.assertEqual(ReviewEvent.objects.filter(action="assign").count(), 1)
        self.assertEqual(self.post([items[0]]).json()["results"][0]["error"]["code"], "stale_version")

    def test_interrupted_batch_resumes_after_committed_item(self):
        first, second = self.report(), self.report()
        key = uuid4()
        body = [{"report_id": str(report.pk), "reviewer_id": "suggested", "version": 0} for report in (first, second)]
        from .operations_views import assign_item

        def interrupted(request, item):
            if item["report_id"] == str(second.pk):
                raise RuntimeError("synthetic interruption")
            return assign_item(request, item)

        with patch("reports.operations_views.assign_item", side_effect=interrupted):
            with self.assertRaisesMessage(RuntimeError, "synthetic interruption"):
                self.post(body, key)
        self.assertEqual(len(AssignmentBatch.objects.get(key=key).results), 1)
        replayed = self.post(body, key)
        self.assertTrue(all(result["ok"] for result in replayed.json()["results"]))
        self.assertEqual(ReviewEvent.objects.filter(action="assign").count(), 2)

    def test_reassignment_revokes_case_and_photo(self):
        report = self.report(assigned_reviewer=self.reviewer)
        photo = MediaItem.objects.create(
            report=report, purpose="evidence", size_bytes=3, sha256=sha256(b"abc").hexdigest(),
            original_sha256=sha256(b"abc").hexdigest(),
        )
        case = f"/api/v1/review/cases/{report.pk}"
        media = f"/api/v1/media/{photo.pk}/content?variant=original"
        with TemporaryDirectory() as directory, override_settings(PRIVATE_MEDIA_ROOT=Path(directory)):
            storage().write(photo_key(photo.organisation_id, photo.pk), b"abc")
            self.client.force_login(self.reviewer)
            self.assertEqual(self.client.get(case).status_code, 200)
            self.assertEqual(self.client.get(media, HTTP_X_MEDIA_ACCESS_REASON="Synthetic review").status_code, 200)
            self.client.force_login(self.coordinator)
            result = self.post([{"report_id": str(report.pk), "reviewer_id": str(self.other.pk), "version": 0}])
            self.assertTrue(result.json()["results"][0]["ok"])
            self.client.force_login(self.reviewer)
            self.assertEqual(self.client.get(case).status_code, 404)
            self.assertEqual(self.client.get(media, HTTP_X_MEDIA_ACCESS_REASON="Synthetic review").status_code, 404)
            self.client.force_login(self.other)
            self.assertEqual(self.client.get(case).status_code, 200)

    def test_overview_matches_reconciliation_and_wat_filter(self):
        first = self.report("2026-11-22T23:00:00Z")
        self.report("2026-11-23T22:59:59.999999Z", observer=None, status=Report.Status.NEEDS_CLARIFICATION)
        self.report("2026-11-23T23:00:00Z")
        self.report("2026-11-22T22:59:59Z")
        self.report(organisation=self.foreign)
        self.report(status=Report.Status.WITHDRAWN, occurred_at=None, withdrawn_at=datetime.fromisoformat("2026-11-23T09:00:00+01:00"))
        Triage.objects.create(report=first, status=Triage.Status.READY, method_version="synthetic", category="conduct")
        first.review_suggestions = {"category": {"value": "intimidation_violence", "corrected_value": "good_practice", "decision": "corrected"}}
        first.save(update_fields=["review_suggestions"])
        query = {"from": "2026-11-23", "to": "2026-11-23"}
        response = self.client.get(OPS, query)
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        output = StringIO()
        call_command("reconcile_observations", "--start", "2026-11-23", "--end", "2026-11-23",
                     organisation=self.coordinator.organisation_id, stdout=output)
        reconciled = json.loads(output.getvalue())
        self.assertEqual(body["totals"]["reports"], reconciled["report_count"])
        statuses = {row["label"]: row["count"] for row in reconciled["statuses"]}
        self.assertEqual(body["by_status"], [
            {"status": "question", "count": statuses["Needs clarification"]},
            {"status": "received", "count": statuses["Submitted"]},
        ])
        self.assertEqual(body["totals"]["reports"], 2)
        self.assertEqual(body["totals"]["withdrawn"], 1)
        self.assertEqual(body["totals"]["urgent_open"], 2)
        self.assertEqual(body["totals"]["open_questions"], 1)
        self.assertEqual(body["by_channel"], [{"channel": "app", "count": 1}, {"channel": "citizen", "count": 1}])
        self.assertIn({"category": "good_practice", "count": 1}, body["by_category"])
        self.assertEqual(body["by_lga"][0]["count"], 2)
        self.assertNotIn("incidents_after_links", body["totals"])
        self.assertNotIn("private-unit", response.content.decode())
        self.assertEqual(self.client.get(OPS, {**query, "to": "2026-12-24"}).status_code, 422)
