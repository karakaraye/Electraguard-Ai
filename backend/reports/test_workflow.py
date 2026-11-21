from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from threading import Barrier
from unittest.mock import patch
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connections
from django.test import TestCase, TransactionTestCase
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User

from .models import Report, ReviewEvent


class ReviewWorkflowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.observer = User.objects.create_user("observer@workflow.example", role=User.Role.OBSERVER)
        cls.other_observer = User.objects.create_user("other@workflow.example", role=User.Role.OBSERVER)
        cls.reviewer = User.objects.create_user("reviewer@workflow.example", role=User.Role.REVIEWER)
        cls.replacement = User.objects.create_user("replacement@workflow.example", role=User.Role.REVIEWER)
        cls.inactive = User.objects.create_user(
            "inactive@workflow.example", role=User.Role.REVIEWER, is_active=False
        )
        cls.admin = User.objects.create_user("admin@workflow.example", role=User.Role.ADMINISTRATOR)

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.client.force_login(self.observer)
        report = self.post("/api/reports", {
            "occurred_at": "2026-05-01T09:15:00+01:00",
            "location": "Fictional community hall",
            "description": "Synthetic review workflow observation.",
        }, HTTP_IDEMPOTENCY_KEY=str(uuid4()))
        self.assertEqual(report.status_code, 201)
        self.ref = report.data["reference"]
        self.report_url = f"/api/reports/{self.ref}"
        self.assign_url = f"/api/assignments/{self.ref}"
        self.case_url = f"/api/review/{self.ref}"
        self.actions_url = f"{self.case_url}/actions"
        self.clarify_url = f"{self.report_url}/clarification"
        buffer = BytesIO()
        Image.new("RGB", (8, 8), color="blue").save(buffer, format="PNG")
        self.image = buffer.getvalue()
        token = self.client.get("/api/auth/csrf").json()["csrfToken"]
        evidence = self.client.post(
            f"{self.report_url}/attachments",
            {"file": SimpleUploadedFile("fictional.png", self.image)},
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(evidence.status_code, 201)
        self.evidence_id = evidence.data["id"]
        self.evidence_url = f"{self.report_url}/attachments/{self.evidence_id}"

    def post(self, url, data, **kwargs):
        token = self.client.get("/api/auth/csrf").json()["csrfToken"]
        return self.client.post(url, data, format="json", HTTP_X_CSRFTOKEN=token, **kwargs)

    def assign(self, reviewer, version):
        self.client.force_login(self.admin)
        return self.post(self.assign_url, {"reviewer": reviewer.pk, "version": version})

    def action(self, action, version, **data):
        return self.post(self.actions_url, {"action": action, "version": version, **data})

    def assert_no_case_access(self, reviewer, version):
        self.client.force_login(reviewer)
        self.assertEqual(self.client.get("/api/review").data, [])
        self.assertEqual(self.client.get(self.case_url).status_code, 404)
        self.assertEqual(self.client.get(self.evidence_url).status_code, 404)
        self.assertEqual(self.action("start", version).status_code, 404)

    def test_assignment_and_reassignment_revoke_previous_access(self):
        self.assert_no_case_access(self.reviewer, 0)
        self.assertEqual(self.post(self.assign_url, {"reviewer": self.reviewer.pk, "version": 0}).status_code, 403)
        self.assertEqual(self.assign(self.inactive, 0).status_code, 400)
        self.assertEqual(self.assign(self.observer, 0).status_code, 400)
        assignments = self.client.get("/api/assignments").data
        self.assertEqual(assignments["reports"][0], {
            "reference": self.ref, "status": "submitted", "reviewer": None, "version": 0,
        })
        self.assertNotIn(self.inactive.pk, [item["id"] for item in assignments["reviewers"]])
        self.assertEqual(self.client.get(self.report_url).status_code, 403)
        self.assertEqual(self.client.get(self.case_url).status_code, 403)
        self.assertEqual(self.client.get(self.evidence_url).status_code, 403)
        self.assertEqual(self.action("start", 0).status_code, 403)
        self.assertEqual(self.client.post(self.assign_url, {}, format="json").status_code, 403)
        self.assertEqual(self.assign(self.reviewer, 0).status_code, 200)

        self.assert_no_case_access(self.replacement, 1)
        self.client.force_login(self.reviewer)
        self.assertEqual(self.client.get("/api/review").data[0]["reference"], self.ref)
        self.assertEqual(self.client.get(self.case_url).data["attachments"][0]["name"], "fictional.png")
        download = self.client.get(self.evidence_url)
        self.assertIn("no-store", download["Cache-Control"])
        self.assertEqual(b"".join(download.streaming_content), self.image)
        self.assertEqual(self.action("start", 1).status_code, 200)

        self.assertEqual(self.assign(self.replacement, 1).status_code, 409)
        self.assertEqual(self.assign(self.replacement, 2).status_code, 200)
        self.assert_no_case_access(self.reviewer, 3)

        self.client.force_login(self.replacement)
        case = self.client.get(self.case_url).data
        self.assertEqual(case["status"], "in_review")
        self.assertEqual(self.client.get(self.evidence_url).status_code, 200)
        self.assertEqual([event["action"] for event in case["history"]], ["assign", "start", "assign"])
        self.assertEqual(case["history"][2]["actor"], self.admin.email)
        self.assertTrue(case["history"][2]["created_at"])
        self.assertEqual(case["history"][2]["change"], {
            "previous_reviewer": self.reviewer.email, "reviewer": self.replacement.email,
        })

        self.client.force_login(self.observer)
        self.assertEqual(self.client.get(self.report_url).status_code, 200)
        self.assertEqual(self.client.get(self.evidence_url).status_code, 200)

    def test_clarification_and_closure_require_valid_transition_and_rationale(self):
        self.assertEqual(self.assign(self.reviewer, 0).status_code, 200)
        self.client.force_login(self.reviewer)
        decision = {"note": "Synthetic rationale.", "outcome": "corroborated"}
        self.assertEqual(self.action("close", 1, **decision).status_code, 409)
        self.assertEqual(self.action("start", 1).status_code, 200)
        self.assertEqual(self.action("close", 2, outcome="corroborated").status_code, 400)
        self.assertEqual(self.action("close", 2, note=" ", outcome="corroborated").status_code, 400)
        self.assertEqual(self.action("close", 2, note="Synthetic", outcome="official").status_code, 400)
        self.assertEqual(self.action("close", 2, note="Synthetic").status_code, 400)
        question = "Which fictional entrance was observed?"
        self.assertEqual(self.action("request_clarification", 2, note=question).status_code, 200)
        self.assertEqual(self.action("close", 3, **decision).status_code, 409)
        self.assertEqual(self.post(self.clarify_url, {"version": 3, "note": "Reply"}).status_code, 403)

        self.client.force_login(self.other_observer)
        self.assertEqual(self.post(self.clarify_url, {"version": 3, "note": "Reply"}).status_code, 404)
        self.client.force_login(self.observer)
        self.assertEqual(self.client.get(self.report_url).data["clarification"], question)
        self.assertEqual(self.client.get("/api/reports").data[0]["status"], "needs_clarification")
        self.assertEqual(self.post(self.clarify_url, {"version": 2, "note": "Stale"}).status_code, 409)
        self.assertEqual(self.post(self.clarify_url, {"version": 3, "note": "Fictional north entrance."}).status_code, 200)
        self.assertIsNone(self.client.get(self.report_url).data["clarification"])
        self.assertEqual(self.client.get("/api/reports").data[0]["status"], "in_review")

        self.client.force_login(self.reviewer)
        self.assertEqual(self.action("close", 3, **decision).status_code, 409)
        self.assertEqual(self.action("close", 4, **decision).status_code, 200)
        self.assertEqual(self.action("close", 5, **decision).status_code, 409)
        history = self.client.get(self.case_url).data["history"]
        self.assertEqual([event["version"] for event in history], [1, 2, 3, 4, 5])
        self.assertEqual(history[-2]["actor"], "Observer")
        self.assertEqual(
            ReviewEvent.objects.get(report_id=self.ref, action=ReviewEvent.Action.RESPOND).actor,
            self.observer,
        )
        self.assertEqual(history[-1]["change"], {
            "from_status": "in_review", "to_status": "closed",
            "attachment_ids": [self.evidence_id], **decision,
        })
        self.assertEqual(self.assign(self.replacement, 5).status_code, 409)
        self.client.force_login(self.observer)
        self.assertEqual(self.client.get("/api/reports").data[0]["status"], "closed")
        detail = self.client.get(self.report_url).data
        self.assertNotIn("history", detail)
        self.assertEqual(detail["outcome"], "Corroborated by available evidence")
        self.assertEqual(
            [(event["action"], event["note"]) for event in detail["clarification_history"]],
            [("request_clarification", question), ("respond", "Fictional north entrance.")],
        )
        for event in detail["clarification_history"]:
            self.assertEqual(set(event), {"action", "created_at", "note"})
        self.assertNotIn(decision["note"], str(detail))
        self.assertNotIn(self.reviewer.email, str(detail))
        self.client.force_login(self.other_observer)
        self.assertEqual(self.client.get(self.report_url).status_code, 404)
        self.client.force_login(self.observer)
        token = self.client.get("/api/auth/csrf").json()["csrfToken"]
        upload = self.client.post(
            f"{self.report_url}/attachments",
            {"file": SimpleUploadedFile("new.png", self.image + b"new")},
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(upload.status_code, 409)
        download = self.client.get(self.evidence_url)
        self.assertEqual(download.status_code, 200)
        self.assertEqual(b"".join(download.streaming_content), self.image)
        self.assertEqual(Report.objects.get(pk=self.ref).attachments.count(), 1)

    def test_legacy_closure_keeps_its_original_audit_data(self):
        report = Report.objects.get(pk=self.ref)
        report.status = Report.Status.CLOSED
        report.assigned_reviewer = self.reviewer
        report.version = 1
        report.save(update_fields=["status", "assigned_reviewer", "version"])
        change = {
            "from_status": "in_review", "to_status": "closed",
            "note": "Synthetic legacy rationale.", "outcome": "out_of_scope",
        }
        event = ReviewEvent.objects.create(
            report=report, actor=self.reviewer, version=1, action=ReviewEvent.Action.CLOSE,
            change=change,
        )
        self.client.force_login(self.reviewer)
        history = self.client.get(self.case_url).data["history"]
        self.assertEqual(history[0]["change"], change)
        event.refresh_from_db()
        self.assertEqual(event.change, change)

    def test_failed_audit_write_rolls_back_assignment(self):
        with patch("reports.workflow.ReviewEvent.objects.create", side_effect=RuntimeError("audit failure")):
            with self.assertRaisesMessage(RuntimeError, "audit failure"):
                self.assign(self.reviewer, 0)
        report = Report.objects.get(pk=self.ref)
        self.assertIsNone(report.assigned_reviewer)
        self.assertEqual(report.version, 0)
        self.assertFalse(report.review_events.exists())


class ConcurrentReviewTests(TransactionTestCase):
    def test_concurrent_actions_with_same_version_record_one_change(self):
        observer = User.objects.create_user("observer@race.example", role=User.Role.OBSERVER)
        reviewer = User.objects.create_user("reviewer@race.example", role=User.Role.REVIEWER)
        report = Report.objects.create(
            observer=observer, assigned_reviewer=reviewer, submission_key=uuid4(),
            occurred_at="2026-05-01T08:15:00Z", location="Fictional hall",
            description="Synthetic race test.", status=Report.Status.IN_REVIEW,
        )
        ready = Barrier(2)

        def save_decision(outcome):
            try:
                client = APIClient()
                client.force_login(reviewer)
                ready.wait(timeout=10)
                response = client.post(f"/api/review/{report.reference}/actions", {
                    "action": "close", "version": 0, "note": f"Synthetic {outcome}", "outcome": outcome,
                }, format="json")
                return response.status_code, outcome
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(save_decision, ["corroborated", "out_of_scope"]))
        self.assertEqual(sorted(status for status, _ in results), [200, 409])
        report.refresh_from_db()
        self.assertEqual(report.status, Report.Status.CLOSED)
        self.assertEqual(report.version, 1)
        self.assertEqual(
            report.review_events.get().change["outcome"],
            next(outcome for status, outcome in results if status == 200),
        )

        self.assertEqual(report.review_events.get().change["attachment_ids"], [])

    def test_upload_racing_with_closure_is_snapshotted_or_rejected(self):
        observer = User.objects.create_user("observer@upload-race.example", role=User.Role.OBSERVER)
        reviewer = User.objects.create_user("reviewer@upload-race.example", role=User.Role.REVIEWER)
        report = Report.objects.create(
            observer=observer, assigned_reviewer=reviewer, submission_key=uuid4(),
            occurred_at="2026-05-01T08:15:00Z", location="Fictional hall",
            description="Synthetic evidence race test.", status=Report.Status.IN_REVIEW,
        )
        ready = Barrier(2)

        def upload():
            try:
                buffer = BytesIO()
                Image.new("RGB", (8, 8), color="blue").save(buffer, format="PNG")
                client = APIClient()
                client.force_login(observer)
                ready.wait(timeout=10)
                response = client.post(
                    f"/api/reports/{report.reference}/attachments",
                    {"file": SimpleUploadedFile("race.png", buffer.getvalue())},
                )
                return response.status_code, response.data.get("id")
            finally:
                connections.close_all()

        def close():
            try:
                client = APIClient()
                client.force_login(reviewer)
                ready.wait(timeout=10)
                return client.post(f"/api/review/{report.reference}/actions", {
                    "action": "close", "version": 0, "note": "Synthetic rationale.",
                    "outcome": "out_of_scope",
                }, format="json").status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as executor:
            upload_result = executor.submit(upload)
            closure_result = executor.submit(close)
            status, attachment_id = upload_result.result()
            self.assertEqual(closure_result.result(), 200)

        self.assertIn(status, (201, 409))
        expected_ids = [attachment_id] if status == 201 else []
        self.assertEqual(report.review_events.get().change["attachment_ids"], expected_ids)
        self.assertEqual([str(pk) for pk in report.attachments.values_list("id", flat=True)], expected_ids)
