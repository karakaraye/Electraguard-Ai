from uuid import uuid4

from django.test import TestCase

from accounts.models import Organisation, User
from accounts.staff_auth import VERIFIED
from reports.models import Evidence, Report, TriageMatch

from .models import AuditEvent


class CaseActionTests(TestCase):
    def setUp(self):
        self.reviewer = User.objects.create_user("reviewer@example.org", role="reviewer")
        observer = User.objects.create_user("observer@example.org", role="observer")
        self.report = Report.objects.create(
            assigned_reviewer=self.reviewer, observer=observer, submission_key=uuid4(),
            receipt_code="EG-1234-0000",
        )
        self.url = f"/api/v1/review/cases/{self.report.pk}/actions"
        self.client.force_login(self.reviewer)
        session = self.client.session
        session[VERIFIED] = True
        session.save()

    def action(self, body, key=None):
        return self.client.post(
            self.url, body, content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(key or uuid4()),
        )

    def test_start_ask_close_and_replay(self):
        key = uuid4()
        start = {"action": "start", "version": 0}
        self.assertEqual(self.action(start, key).json()["status"], "in_review")
        question = self.action({"action": "ask", "question": "When did it happen?", "version": 1})
        self.assertEqual(question.json()["status"], "question")
        self.assertIn("question_id", question.json())
        self.assertEqual(self.action(start, key)["Idempotent-Replayed"], "true")
        self.assertEqual(self.action(start).json()["error"]["code"], "stale_version")
        closed = self.action({
            "action": "close", "version": 2, "outcome": "corroborated",
            "rationale": "Evidence corroborates the observation.", "expected_media_ids": [],
        })
        self.assertEqual(closed.json()["status"], "closed")
        self.assertEqual(closed.json()["closure"], {"media_ids": [], "pending_uploads": []})
        self.assertEqual(AuditEvent.objects.filter(object_id=str(self.report.pk)).count(), 3)

    def test_case_rejects_close_until_new_evidence_reviewed(self):
        body = {
            "action": "close", "version": 0, "outcome": "corroborated",
            "rationale": "Evidence corroborates the observation.", "expected_media_ids": [],
        }
        self.assertEqual(self.action(body).json()["error"]["code"], "invalid_transition")
        self.action({"action": "start", "version": 0})
        evidence = Evidence.objects.create(
            report=self.report, name="photo.png", content_type="image/png",
            sha256="a" * 64, content=b"evidence",
        )
        body["version"] = 1
        self.assertEqual(self.action(body).json()["error"]["code"], "closure_evidence_changed")
        body["expected_media_ids"] = [str(evidence.pk)]
        body["rationale"] = ""
        self.assertEqual(self.action(body).status_code, 422)
        body["rationale"] = "Reviewed attachment."
        self.assertEqual(self.action(body).json()["closure"]["media_ids"], [str(evidence.pk)])

    def test_scope_is_checked_before_mutation(self):
        organisation = Organisation.objects.create(name="Other")
        Report.objects.filter(pk=self.report.pk).update(organisation=organisation)
        self.assertEqual(self.action({"action": "start", "version": 0}).status_code, 404)

    def edit(self, suffix, data):
        return self.client.post(
            self.url.removesuffix("actions") + suffix, data, content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )

    def test_queue_orders_by_urgency_and_pages(self):
        urgent = Report.objects.create(
            assigned_reviewer=self.reviewer, observer=self.report.observer, submission_key=uuid4(),
            incident_details={"danger_now": True, "category": "intimidation_violence"},
        )
        url = "/api/v1/review/queue"
        response = self.client.get(url, {"limit": 1}).json()
        self.assertEqual(response["items"][0]["id"], str(urgent.pk))
        self.assertEqual(response["counts"]["received"], 2)
        next_page = self.client.get(url, {"limit": 1, "cursor": response["next_cursor"]}).json()
        self.assertEqual(next_page["items"][0]["id"], str(self.report.pk))
        self.assertEqual(self.client.get(url, {"status": "bad"}).status_code, 422)

    def test_redaction_and_urgency_correction(self):
        self.report.description = "😀 Ada made an observation."
        self.report.save(update_fields=["description"])
        response = self.edit("redaction", {"version": 0, "spans": [{"start": 2, "end": 5}]})
        self.assertEqual(response.json()["redacted_description"], "😀 [name removed] made an observation.")
        result = self.edit("suggestions/urgency", {"version": 1, "decision": "correct", "value": "low"})
        self.assertEqual(result.json()["suggestion"]["corrected_value"], "low")
        detail = self.client.get(self.url.removesuffix("/actions")).json()
        self.assertEqual(detail["original"]["description"], self.report.description)
        self.assertTrue(detail["history"]["chain_intact"])
        self.assertEqual(self.edit("redaction", {"version": 2, "spans": [{"start": 0, "end": 99}]}).status_code, 422)

    def test_duplicate_decision_keeps_unassigned_content_private(self):
        other = Report.objects.create(
            observer=self.report.observer, submission_key=uuid4(),
            receipt_code="EG-0000-0000", description="private candidate",
        )
        first, second = sorted([self.report.pk, other.pk])
        match = TriageMatch.objects.create(first_id=first, second_id=second, score=0.9)
        target = f"duplicates/{other.pk}"
        self.assertEqual(self.edit(target, {"version": 0, "decision": "link"}).status_code, 200)
        details = self.client.get(self.url.removesuffix("/actions")).json()["duplicates"][0]
        self.assertIsNone(details["summary"]["description"])
        self.assertIsNone(details["receipt_code"])
        self.assertEqual(self.edit(target, {"version": 1, "decision": "link"}).status_code, 409)
        self.assertEqual(self.edit(target, {"version": 1, "decision": "keep_separate"}).status_code, 200)
        match.refresh_from_db()
        self.assertEqual(match.decision, TriageMatch.Decision.DISMISSED)
