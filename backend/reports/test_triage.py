from io import StringIO
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User

from .models import Report, Triage, TriageMatch
from .triage import METHOD_VERSION, process_next


class AdvisoryTriageTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.observer = User.objects.create_user("observer@triage.example", role=User.Role.OBSERVER)
        cls.reviewer = User.objects.create_user("reviewer@triage.example", role=User.Role.REVIEWER)
        cls.other = User.objects.create_user("other@triage.example", role=User.Role.REVIEWER)

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)

    def post(self, path, data, **headers):
        token = self.client.get("/api/auth/csrf").json()["csrfToken"]
        return self.client.post(path, data, format="json", HTTP_X_CSRFTOKEN=token, **headers)

    def submit(self, reviewer=None, key=None, **overrides):
        self.client.force_login(self.observer)
        response = self.post("/api/reports", {
            "occurred_at": "2026-05-01T09:00:00+01:00",
            "location": "Fictional Cedar Training Hall",
            "description": "Wheelchair users could not enter because the ramp was blocked.",
            **overrides,
        }, HTTP_IDEMPOTENCY_KEY=str(key or uuid4()))
        self.assertIn(response.status_code, (200, 201))
        reference = response.data["reference"]
        if reviewer:
            Report.objects.filter(pk=reference).update(assigned_reviewer=reviewer)
        return reference

    def run_worker(self, **options):
        call_command("run_triage", once=True, stdout=StringIO(), stderr=StringIO(), **options)

    def test_worker_suggests_true_duplicate_and_excludes_similar_unrelated_reports(self):
        key = uuid4()
        current = self.submit(self.reviewer, key=key)
        self.assertEqual(self.submit(key=key), current)
        self.assertEqual(Triage.objects.count(), 1)
        self.assertEqual(process_next(), "ready")
        duplicate = self.submit(
            self.reviewer, occurred_at="2026-05-01T09:12:00+01:00",
            description="Wheelchair users could not enter because a crate blocked the ramp.",
        )
        self.submit(self.reviewer, location="Fictional Pine Field")
        self.submit(self.reviewer, occurred_at="2026-05-02T09:05:00+01:00")
        self.submit(self.reviewer, description="Election workers requested spare forms for the attendance log.")
        hidden = self.submit(self.other, occurred_at="2026-05-01T09:02:00+01:00")
        self.run_worker()
        self.run_worker()

        self.client.force_login(self.reviewer)
        response = self.client.get(f"/api/review/{current}/triage")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["category"], "access")
        self.assertEqual(response.data["method_version"], METHOD_VERSION)
        self.assertTrue(response.data["attempted_at"])
        self.assertEqual([str(match["reference"]) for match in response.data["matches"]], [duplicate])
        self.assertNotIn(hidden, response.content.decode())
        self.assertEqual(
            [str(match["reference"]) for match in self.client.get(f"/api/review/{duplicate}/triage").data["matches"]],
            [current],
        )
        self.assertEqual(TriageMatch.objects.count(), 3)
        self.assertEqual(Triage.objects.count(), 6)
        self.assertEqual(self.client.get(f"/api/review/{hidden}/triage").status_code, 404)
        self.assertEqual(
            self.post(f"/api/review/{current}/triage/matches/{hidden}", {
                "version": 0, "decision": "confirmed",
            }).status_code, 404,
        )

    def test_feedback_is_audited_and_candidate_reassignment_hides_match_history(self):
        current = self.submit(self.reviewer)
        confirmed = self.submit(self.reviewer, occurred_at="2026-05-01T09:04:00+01:00")
        dismissed = self.submit(self.reviewer, occurred_at="2026-05-01T09:06:00+01:00")
        self.run_worker()
        self.client.force_login(self.reviewer)
        path = f"/api/review/{current}/triage"
        self.assertEqual(self.client.post(f"{path}/category", {}, format="json").status_code, 403)
        self.assertEqual(self.post(f"{path}/category", {"version": 0, "category": "other"}).status_code, 200)
        self.assertEqual(self.post(f"{path}/category", {"version": 0, "category": "conduct"}).status_code, 409)
        self.assertEqual(self.post(f"{path}/matches/{confirmed}", {
            "version": 1, "decision": "confirmed",
        }).status_code, 200)
        self.assertEqual(self.post(f"{path}/matches/{dismissed}", {
            "version": 2, "decision": "dismissed",
        }).status_code, 200)
        data = self.client.get(path).data
        self.assertEqual((data["category"], data["corrected_category"]), ("access", "other"))
        self.assertEqual(
            {str(match["reference"]): match["decision"] for match in data["matches"]},
            {confirmed: "confirmed", dismissed: "dismissed"},
        )
        report = Report.objects.get(pk=current)
        self.assertEqual(report.status, Report.Status.SUBMITTED)
        self.assertEqual(Report.objects.count(), 3)
        history = self.client.get(f"/api/review/{current}").data["history"]
        self.assertEqual([event["action"] for event in history], ["correct_category", "decide_match", "decide_match"])
        self.assertTrue(all(event["actor"] == self.reviewer.email for event in history))
        self.assertTrue(all(event["created_at"] for event in history))

        admin = User.objects.create_user("admin@triage.example", role=User.Role.ADMINISTRATOR)
        self.client.force_login(admin)
        self.assertEqual(self.post(f"/api/assignments/{confirmed}", {
            "reviewer": self.other.pk, "version": 0,
        }).status_code, 200)
        self.assertEqual(self.client.get(path).status_code, 403)
        self.client.force_login(self.reviewer)
        for api_path in (path, f"/api/review/{current}"):
            self.assertNotIn(confirmed, self.client.get(api_path).content.decode())
        self.assertEqual(report.review_events.count(), 3)
        self.assertEqual(self.post(f"{path}/matches/{confirmed}", {
            "version": 3, "decision": "dismissed",
        }).status_code, 404)

    def test_failure_and_retry_leave_manual_review_available(self):
        current = self.submit(self.reviewer)
        self.client.force_login(self.reviewer)
        path = f"/api/review/{current}"
        self.assertEqual(self.client.get(f"{path}/triage").data["status"], "pending")
        with patch("reports.triage.categorize", side_effect=RuntimeError("synthetic failure fixture")):
            self.run_worker()
        result = self.client.get(f"{path}/triage")
        self.assertEqual(result.data["status"], "failed")
        self.assertNotIn("synthetic failure fixture", result.content.decode())
        self.assertEqual(self.post(f"{path}/actions", {"version": 0, "action": "start"}).status_code, 200)
        self.assertEqual(self.post(f"{path}/actions", {
            "version": 1, "action": "close", "outcome": "out_of_scope", "note": "Synthetic rationale.",
        }).status_code, 200)
        self.run_worker(retry_failed=True)
        self.run_worker(retry_failed=True)
        self.assertEqual(self.client.get(f"{path}/triage").data["status"], "ready")
        self.assertEqual(Triage.objects.count(), 1)
        self.assertEqual(Report.objects.get(pk=current).status, Report.Status.CLOSED)
