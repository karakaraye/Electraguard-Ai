from hashlib import sha256
from io import StringIO
from secrets import token_urlsafe
from uuid import uuid4

from django.core.management import call_command
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from accounts.models import INITIAL_ORGANISATION, Organisation, User

from .citizen_views import CACHE
from .models import CitizenReply, Report, ReportIdempotency, ReviewEvent

PUBLIC = "/api/v1/public"


class CitizenReportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("load_reference_areas", stdout=StringIO())
        cls.reviewer = User.objects.create_user("staff@citizen.example", role=User.Role.REVIEWER)
        cls.other_group = Organisation.objects.create(name="Second fictional organisation")
        cls.foreign = User.objects.create_user(
            "other@citizen.example", role=User.Role.REVIEWER, organisation=cls.other_group,
        )

    def setUp(self):
        CACHE.clear()
        self.addCleanup(CACHE.clear)
        self.client = Client(enforce_csrf_checks=True)
        self.secret = token_urlsafe(32)
        self.body = {
            "kind": "incident", "language": "en", "occurred_at": timezone.now().isoformat(),
            "place": {"ward_code": "SYN-KN-01-01"}, "category_observer": "not_sure",
            "danger_now": False, "firsthand": True, "description": "Synthetic citizen observation.",
            "receipt_secret": self.secret,
        }

    def post(self, path, body, *, key=None, proof=None):
        csrf = self.client.get("/api/v1/auth/csrf").json()["csrf_token"]
        return self.client.post(
            path, body, content_type="application/json", HTTP_X_CSRFTOKEN=csrf,
            HTTP_IDEMPOTENCY_KEY=str(key or uuid4()), HTTP_X_RECEIPT_SECRET=proof or "",
        )

    def submit(self, key=None):
        result = self.post(f"{PUBLIC}/reports", self.body, key=key)
        self.assertEqual(result.status_code, 201, result.content)
        return result.json()

    def test_anonymous_create_scope_paused_replay_and_secret_storage(self):
        key = uuid4()
        self.client.force_login(self.foreign)
        first = self.submit(key)
        report = Report.objects.get(pk=first["id"])
        self.assertIsNone(report.observer_id)
        self.assertEqual(report.organisation_id, INITIAL_ORGANISATION)
        self.assertEqual(report.receipt_secret_digest, sha256(self.secret.encode()).hexdigest())
        self.assertNotIn(self.secret, str(first))
        record = ReportIdempotency.objects.get()
        self.assertIsNone(record.actor_id)
        self.assertNotIn(self.secret, str(record.body))
        self.assertEqual(first["channel"], "citizen")
        with override_settings(OBSERVATION_INTAKE_ENABLED=False):
            repeated = self.post(f"{PUBLIC}/reports", self.body, key=key)
            self.assertEqual((repeated.status_code, repeated.json()), (200, first))
            self.assertEqual(self.post(f"{PUBLIC}/reports", self.body).json()["error"]["code"], "intake_paused")
        conflict = self.post(f"{PUBLIC}/reports", {**self.body, "description": "Different"}, key=key)
        self.assertEqual(conflict.json()["error"]["code"], "idempotency_key_reused")
        separate = self.post(f"{PUBLIC}/reports", {**self.body, "receipt_secret": token_urlsafe(32)}, key=key)
        self.assertEqual(separate.status_code, 201)
        self.assertNotEqual(separate.json()["id"], first["id"])

    def test_submission_validates_proof_kind_and_csrf(self):
        self.assertEqual(
            self.client.post(f"{PUBLIC}/reports", self.body, content_type="application/json").json()["error"]["code"],
            "csrf_failed",
        )
        invalid = self.post(f"{PUBLIC}/reports", {**self.body, "receipt_secret": "short"})
        self.assertEqual((invalid.status_code, invalid.json()["error"]["fields"]["receipt_secret"]["code"]), (422, "invalid"))
        wrong_kind = self.post(f"{PUBLIC}/reports", {**self.body, "kind": "checklist"})
        self.assertEqual(wrong_kind.json()["error"]["fields"]["kind"]["code"], "not_allowed_for_kind")
        self.assertFalse(Report.objects.exists())

    def test_status_is_minimal_and_conversation_requires_proof(self):
        created = self.submit()
        path = f"{PUBLIC}/receipts/{created['receipt_code']}"
        status = self.client.get(path)
        self.assertEqual(status.status_code, 200)
        self.assertEqual(set(status.json()), {
            "receipt_code", "status", "outcome", "has_open_question", "received_on", "updated_on",
        })
        self.assertEqual(status.json()["status"], "received")
        self.assertIn("no-store", status["Cache-Control"])
        self.assertEqual(self.client.get(f"{PUBLIC}/receipts/not-a-code").status_code, 422)
        self.assertEqual(self.client.get(path + "/conversation").status_code, 401)
        self.assertEqual(self.client.get(path + "/conversation", HTTP_X_RECEIPT_SECRET=token_urlsafe(32)).status_code, 401)
        self.assertEqual(self.client.get(path + "/conversation", HTTP_X_RECEIPT_SECRET=self.secret).json()["messages"], [])

    def test_reply_is_idempotent_and_visible_to_assigned_reviewer(self):
        created = self.submit()
        report = Report.objects.get(pk=created["id"])
        report.assigned_reviewer = self.reviewer
        report.status = Report.Status.NEEDS_CLARIFICATION
        report.version = 1
        report.save()
        ReviewEvent.objects.create(
            report=report, actor=self.reviewer, version=1, action=ReviewEvent.Action.REQUEST_CLARIFICATION,
            change={"note": "Which fictional entrance?"},
        )
        path = f"{PUBLIC}/receipts/{created['receipt_code']}"
        messages = self.client.get(path + "/conversation", HTTP_X_RECEIPT_SECRET=self.secret).json()["messages"]
        self.assertEqual(messages[0]["question_state"], "open")
        key = uuid4()
        data = {"question_id": messages[0]["id"], "body": "The fictional north entrance."}
        result = self.post(path + "/reply", data, key=key, proof=self.secret)
        self.assertEqual(result.status_code, 201, result.content)
        self.assertEqual(self.post(path + "/reply", data, key=key, proof=self.secret).json(), result.json())
        self.assertEqual(self.post(path + "/reply", data, proof=self.secret).json()["error"]["code"], "question_closed")
        self.assertEqual(CitizenReply.objects.count(), 1)
        self.assertNotIn(data["body"], str(report.review_events.get(version=2).change))
        self.client.force_login(self.reviewer)
        history = self.client.get(f"/api/review/{report.pk}").json()["history"]
        self.assertEqual(history[-1]["change"]["note"], data["body"])
        self.assertEqual(history[-1]["actor"], "Citizen, not accredited")
        self.client.force_login(self.foreign)
        self.assertEqual(self.client.get(f"/api/review/{report.pk}").status_code, 404)
        with override_settings(PUBLIC_INTAKE_ORGANISATION_ID=self.other_group.pk):
            self.assertEqual(self.client.get(path).status_code, 404)
            self.assertEqual(self.client.get(path + "/conversation", HTTP_X_RECEIPT_SECRET=self.secret).status_code, 401)

    def test_withdraw_purges_and_replay_returns_stub(self):
        key = uuid4()
        created = self.submit(key)
        path = f"{PUBLIC}/receipts/{created['receipt_code']}/withdraw"
        self.assertEqual(self.post(path, {"confirm": True}).status_code, 401)
        withdrawn = self.post(path, {"confirm": True}, proof=self.secret)
        self.assertEqual(withdrawn.status_code, 200, withdrawn.content)
        self.assertEqual(withdrawn.json()["channel"], "citizen")
        self.assertEqual(self.post(f"{PUBLIC}/reports", self.body, key=key).json(), withdrawn.json())
        self.assertEqual(Report.objects.get().description, "")
