from datetime import timedelta
from uuid import uuid4

from django.test import Client, TestCase
from django.utils import timezone

from accounts.models import Organisation, User

from .citizen_views import CACHE
from .models import Evidence, MediaItem, Report, ReviewEvent, Triage, UploadSession
from .v1_views import receipt

ROOT = "/api/v1/review"


class ReviewerV1Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.observer = User.objects.create_user("observer@c6.example", role=User.Role.OBSERVER)
        cls.reviewer = User.objects.create_user("reviewer@c6.example", role=User.Role.REVIEWER)
        cls.other = User.objects.create_user("other@c6.example", role=User.Role.REVIEWER)
        cls.admin = User.objects.create_user("coordinator@c6.example", role=User.Role.ADMINISTRATOR)
        group = Organisation.objects.create(name="Other fictional organisation")
        cls.foreign = User.objects.create_user(
            "foreign@c6.example", role=User.Role.REVIEWER, organisation=group,
        )

    def setUp(self):
        CACHE.clear()
        self.addCleanup(CACHE.clear)
        self.client = Client(enforce_csrf_checks=True)
        self.client.force_login(self.reviewer)

    def report(self, *, status=Report.Status.SUBMITTED, details=None, reviewer=None, citizen=False):
        fields = {"receipt_secret_digest": ""}
        if citizen:
            self.secret = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
            from hashlib import sha256

            fields["receipt_secret_digest"] = sha256(self.secret.encode()).hexdigest()
        return Report.objects.create(
            observer=None if citizen else self.observer,
            assigned_reviewer=self.reviewer if reviewer is None else reviewer,
            status=status, receipt_code=receipt(), submission_key=uuid4(),
            occurred_at=timezone.now(), description="Àda met an observer.", location="Fictional venue",
            incident_details=details or {}, **fields,
        )

    def case_path(self, report):
        return f"{ROOT}/cases/{report.pk}"

    def post(self, path, body, key=None, **headers):
        token = self.client.get("/api/v1/auth/csrf").json()["csrf_token"]
        return self.client.post(
            path, body, content_type="application/json", HTTP_IDEMPOTENCY_KEY=str(key or uuid4()),
            HTTP_X_CSRFTOKEN=token, **headers,
        )

    def test_queue_permissions_urgency_filters_and_cursor(self):
        ordinary = self.report()
        urgent = self.report(details={
            "danger_now": True, "category_observer": "intimidation_violence",
            "area": {"state_code": "SYN-KN", "lga_code": "SYN-KN-01"},
        })
        excluded = self.report(reviewer=self.other)
        first = self.client.get(f"{ROOT}/queue", {"limit": 1}).json()
        self.assertEqual(first["counts"]["received"], 2)
        self.assertEqual(first["items"][0]["id"], str(urgent.pk))
        self.assertEqual(first["items"][0]["urgency"]["level"], "urgent")
        self.assertIn("danger_reported", first["items"][0]["urgency"]["reasons"])
        second = self.client.get(f"{ROOT}/queue", {"cursor": first["next_cursor"]}).json()
        self.assertEqual([item["id"] for item in second["items"]], [str(ordinary.pk)])
        filtered = self.client.get(f"{ROOT}/queue", {
            "status": ["received", "question"], "state_code": "SYN-KN", "urgency": "urgent",
            "channel": "app", "kind": "incident", "has_evidence": "false",
        }).json()
        self.assertEqual([item["id"] for item in filtered["items"]], [str(urgent.pk)])
        self.assertEqual(self.client.get(self.case_path(excluded)).status_code, 404)
        self.assertEqual(self.client.get(f"{ROOT}/queue", {"urgency": "unexpected"}).status_code, 422)
        # An inconsistent foreign assignment still must not bypass organisation scope.
        Report.objects.filter(pk=excluded.pk).update(assigned_reviewer=self.foreign)
        self.client.force_login(self.foreign)
        self.assertEqual(self.client.get(self.case_path(excluded)).status_code, 404)
        self.assertEqual(self.client.get(f"{ROOT}/queue").json()["items"], [])
        for actor in (self.foreign, self.admin):
            self.client.force_login(actor)
            self.assertEqual(self.client.get(self.case_path(urgent)).status_code, 404)
        self.client.force_login(self.reviewer)
        Report.objects.filter(pk=urgent.pk).update(assigned_reviewer=self.other)
        self.assertEqual(self.client.get(self.case_path(urgent)).status_code, 404)

    def test_version_idempotency_close_from_question_and_evidence_snapshot(self):
        report = self.report()
        path = self.case_path(report) + "/actions"
        close = {"action": "close", "outcome": "corroborated", "rationale": "Synthetic assessment.", "expected_media_ids": []}
        self.assertEqual(self.post(path, {**close, "version": 0}).json()["error"]["code"], "invalid_transition")
        key = uuid4()
        start = {"action": "start", "version": 0}
        start_response = self.post(path, start, key)
        self.assertEqual(start_response.status_code, 200, start_response.content)
        self.assertEqual(self.post(path, start, key).json(), start_response.json())
        self.assertEqual(self.post(path, start).json()["error"]["code"], "stale_version")
        asked = self.post(path, {"action": "ask", "question": "Which fictional gate?", "version": 1})
        self.assertEqual(asked.status_code, 200, asked.content)
        self.assertEqual(self.post(path, {"action": "ask", "question": "Again?", "version": 2}).json()["error"]["code"],
                         "invalid_transition")
        evidence = Evidence.objects.create(
            report=report, name="synthetic.png", content_type="image/png", sha256="e" * 64, content=b"synthetic",
        )
        photo = MediaItem.objects.create(
            report=report, purpose="evidence", size_bytes=1, sha256="f" * 64, original_sha256="a" * 64,
        )
        pending = UploadSession.objects.create(
            report=report, client_attachment_id="synthetic", content_type="image/jpeg", purpose="evidence",
            size_bytes=12, sha256="b" * 64, expires_at=timezone.now() + timedelta(hours=1),
        )
        self.assertEqual(self.client.get(f"/api/reports/{report.pk}/attachments/{evidence.pk}").status_code, 404)
        stale_media = self.post(path, {**close, "version": 2})
        self.assertEqual(stale_media.json()["error"]["code"], "closure_evidence_changed")
        close["expected_media_ids"] = [str(evidence.pk), str(photo.pk)]
        response = self.post(path, {**close, "version": 2})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["status"], "closed")
        self.assertEqual(set(response.json()["closure"]["media_ids"]), set(close["expected_media_ids"]))
        self.assertEqual(response.json()["closure"]["pending_uploads"][0]["id"], str(pending.pk))
        snapshot = ReviewEvent.objects.get(report=report, action="close").change
        self.assertEqual(snapshot["attachment_ids"], [str(evidence.pk)])
        self.assertEqual(snapshot["media_ids"], [{"id": str(photo.pk), "sha256": photo.sha256}])
        self.assertEqual(self.post(path, {**close, "version": 3}).json()["error"]["code"], "invalid_transition")
        self.assertEqual(self.client.get(self.case_path(report)).json()["conversation"][0]["question_state"], "closed_unanswered")
        self.assertEqual(list(ReviewEvent.objects.filter(report=report).values_list("action", flat=True)),
                         ["start", "request_clarification", "close"])
        Report.objects.filter(pk=report.pk).update(assigned_reviewer=self.other)
        self.assertEqual(self.post(path, start, key).status_code, 404)

    def test_all_case_action_state_pairs(self):
        allowed = {
            "start": {Report.Status.SUBMITTED},
            "ask": {Report.Status.IN_REVIEW},
            "close": {Report.Status.IN_REVIEW, Report.Status.NEEDS_CLARIFICATION},
        }
        inputs = {
            "start": {}, "ask": {"question": "Which fictional gate?"},
            "close": {"outcome": "out_of_scope", "rationale": "Synthetic rationale.", "expected_media_ids": []},
        }
        for status in Report.Status.values:
            for action, sources in allowed.items():
                with self.subTest(status=status, action=action):
                    report = self.report(status=status)
                    result = self.post(self.case_path(report) + "/actions", {
                        "action": action, "version": 0, **inputs[action],
                    })
                    expected = 200 if status in sources else (404 if status == Report.Status.WITHDRAWN else 409)
                    self.assertEqual(result.status_code, expected, result.content)

    def test_citizen_reply_is_in_assigned_case_conversation(self):
        report = self.report(status=Report.Status.IN_REVIEW, citizen=True)
        path = self.case_path(report)
        asked = self.post(path + "/actions", {"action": "ask", "question": "Which fictional entrance?", "version": 0})
        self.assertEqual(asked.status_code, 200, asked.content)
        self.assertEqual(self.client.get(path).json()["reporter"]["label"], "Citizen, not accredited")
        self.client.logout()
        reply = self.post(
            f"/api/v1/public/receipts/{report.receipt_code}/reply",
            {"question_id": asked.json()["question_id"], "body": "The fictional north entrance."},
            HTTP_X_RECEIPT_SECRET=self.secret,
        )
        self.assertEqual(reply.status_code, 201, reply.content)
        self.client.force_login(self.reviewer)
        case = self.client.get(path).json()
        self.assertEqual(case["conversation"][1]["author"], "citizen")
        self.assertEqual(case["conversation"][1]["body"], "The fictional north entrance.")
        self.assertEqual(case["status"], "in_review")

    def test_suggestions_and_unicode_redaction_are_audited(self):
        report = self.report()
        path = self.case_path(report)
        urgency = path + "/suggestions/urgency"
        self.assertEqual(self.post(urgency, {"decision": "accept", "version": 0}).status_code, 409)
        corrected = self.post(urgency, {"decision": "correct", "value": "urgent", "version": 0})
        self.assertEqual(corrected.status_code, 200, corrected.content)
        self.assertEqual(self.client.get(f"{ROOT}/queue").json()["items"][0]["urgency"]["source"], "corrected")
        Triage.objects.create(report=report, status=Triage.Status.READY, method_version="synthetic", category="conduct")
        accepted = self.post(path + "/suggestions/category", {"decision": "accept", "version": 1})
        self.assertEqual(accepted.status_code, 200, accepted.content)
        self.assertEqual(accepted.json()["suggestion"]["value"], "intimidation_violence")
        invalid = self.post(path + "/redaction", {"spans": [{"start": 0, "end": 99}], "version": 2})
        self.assertEqual(invalid.json()["error"]["fields"]["spans.0.end"]["code"], "max_value")
        result = self.post(path + "/redaction", {"spans": [{"start": 0, "end": 3}], "version": 2})
        self.assertEqual(result.status_code, 200, result.content)
        self.assertEqual(result.json()["redacted_description"], "[name removed] met an observer.")
        self.assertEqual(self.client.get(path).json()["original"]["description"], "Àda met an observer.")
        self.assertEqual(self.client.get(f"/api/review/{report.pk}").json()["description"], result.json()["redacted_description"])
        audits = list(ReviewEvent.objects.filter(report=report))
        self.assertEqual([event.action for event in audits], ["correct_suggestion", "accept_suggestion", "redact"])
        self.assertNotIn("Àda", str(audits[-1].change))
