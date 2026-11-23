from unittest.mock import patch
from uuid import uuid4

from django.test import Client, TestCase, override_settings

from accounts.models import INITIAL_ORGANISATION, Organisation, User
from accounts.observer_credentials import ALPHABET, check_symbol

from . import test_v1_reports
from .models import Report, ReviewEvent
from .workflow import record_change

SECRET = "B" * 42 + "A"
HEADERS = {"HTTP_X_RECEIPT_SECRET": SECRET}


def code(response):
    return response.json()["error"]["code"]


def field_code(response, name):
    return response.json()["error"]["fields"][name]["code"]


class MessageErrorTests(TestCase):
    setUpTestData = classmethod(test_v1_reports.ObserverReportTests.setUpTestData.__func__)
    post = test_v1_reports.ObserverReportTests.post
    create = test_v1_reports.ObserverReportTests.create

    def setUp(self):
        test_v1_reports.ObserverReportTests.setUp(self)
        self.report = Report.objects.get(pk=self.create()["id"])
        self.path = f"/api/v1/reports/{self.report.pk}/messages"
        self.reviewer = User.objects.create_user("msg-reviewer@example.test", role=User.Role.REVIEWER)

    def ask(self, text="Which gate?"):
        report = Report.objects.get(pk=self.report.pk)
        report.status = Report.Status.NEEDS_CLARIFICATION
        record_change(report, self.reviewer, ReviewEvent.Action.REQUEST_CLARIFICATION, {"note": text}, "status")
        return self.client.get(self.path).json()["items"][-1]["id"]

    def test_access_is_limited_to_owner_and_assigned_reviewer(self):
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(self.path).status_code, 404)
        self.assertEqual(self.post({"kind": "message", "body": "Hi"}, path=self.path).status_code, 404)
        self.client.force_login(self.foreign)
        self.assertEqual(self.client.get(self.path).status_code, 404)
        self.client.force_login(self.reviewer)
        self.assertEqual(self.client.get(self.path).status_code, 404)
        coordinator = User.objects.create_user("msg-coordinator@example.test", role=User.Role.ADMINISTRATOR)
        self.client.force_login(coordinator)
        self.assertEqual(self.client.get(self.path).status_code, 403)
        self.client.logout()
        self.assertEqual(self.client.get(self.path).status_code, 401)
        self.client.force_login(self.observer)
        self.assertEqual(self.client.get(f"/api/v1/reports/{uuid4()}/messages").status_code, 404)

    def test_message_validation_codes(self):
        self.assertEqual(code(self.client.post(self.path, {}, content_type="application/json")), "csrf_failed")
        csrf = self.client.get("/api/v1/auth/csrf").json()["csrf_token"]
        no_key = self.client.post(self.path, {"kind": "message", "body": "Hi"}, content_type="application/json",
                                  HTTP_X_CSRFTOKEN=csrf)
        self.assertEqual(code(no_key), "idempotency_key_required")
        cases = [
            ({"kind": "formal_question", "body": "Hi"}, "kind", "invalid_choice"),
            ({"kind": "message", "body": ""}, "body", "invalid"),
            ({"kind": "message", "body": "x" * 2001}, "body", "invalid"),
            ({"kind": "reply", "body": "Hi"}, "reply_to", "required"),
            ({"kind": "reply", "body": "Hi", "reply_to": "nope"}, "reply_to", "invalid"),
            ({"kind": "message", "body": "Hi", "attachment_media_id": str(uuid4())}, "attachment_media_id", "invalid"),
            ({"kind": "message", "body": "Hi", "attachment_media_id": 4}, "attachment_media_id", "invalid"),
        ]
        for data, name, expected in cases:
            response = self.post(data, path=self.path)
            self.assertEqual((response.status_code, field_code(response, name)), (422, expected), data)

    def test_replay_key_reuse_and_reply_flow(self):
        key = uuid4()
        data = {"kind": "message", "body": "Early note."}
        self.assertEqual(self.post(data, key=key, path=self.path).status_code, 201)
        self.assertEqual(self.post(data, key=key, path=self.path).status_code, 200)
        self.assertEqual(code(self.post({**data, "body": "Changed"}, key=key, path=self.path)), "idempotency_key_reused")
        question = self.ask()
        reply = {"kind": "reply", "body": "The east gate.", "reply_to": question}
        sent = self.post(reply, path=self.path)
        self.assertEqual(sent.status_code, 201, sent.content)
        self.assertEqual(sent.json()["report_status"], "in_review")
        self.assertEqual(sent.json()["message"]["reply_to"], question)
        self.assertEqual(sent.json()["message"]["author_label"], "You")
        self.assertEqual(code(self.post({**reply, "body": "Again"}, path=self.path)), "question_closed")
        items = self.client.get(self.path).json()["items"]
        self.assertEqual([i["question_state"] for i in items if i["kind"] == "formal_question"], ["answered"])

    def test_wrong_question_is_closed(self):
        self.ask()
        reply = {"kind": "reply", "body": "Hi", "reply_to": str(uuid4())}
        self.assertEqual(code(self.post(reply, path=self.path)), "question_closed")

    def test_closed_and_withdrawn_reports_refuse_messages(self):
        Report.objects.filter(pk=self.report.pk).update(status=Report.Status.CLOSED)
        self.assertEqual(code(self.post({"kind": "message", "body": "Hi"}, path=self.path)), "report_closed")
        Report.objects.filter(pk=self.report.pk).update(status=Report.Status.WITHDRAWN)
        self.assertEqual(code(self.post({"kind": "message", "body": "Hi"}, path=self.path)), "report_withdrawn")
        self.assertEqual(self.client.get(self.path).json()["items"], [])

    def test_message_rate_limit(self):
        with patch("reports.conversation.rate_limit", return_value=12):
            response = self.post({"kind": "message", "body": "Hi"}, path=self.path)
        self.assertEqual((response.status_code, response.headers["Retry-After"]), (429, "12"))

    def test_listing_pagination_and_mark_read_errors(self):
        for text in ("one", "two", "three"):
            self.post({"kind": "message", "body": text}, path=self.path)
        first = self.client.get(self.path, {"limit": 2}).json()
        self.assertEqual([i["body"] for i in first["items"]], ["one", "two"])
        second = self.client.get(self.path, {"limit": 2, "cursor": first["next_cursor"]}).json()
        self.assertEqual(([i["body"] for i in second["items"]], second["next_cursor"]), (["three"], None))
        for params in ({"limit": 0}, {"limit": "x"}, {"cursor": str(uuid4())}):
            self.assertEqual(self.client.get(self.path, params).status_code, 422, params)
        read = f"{self.path}/read"
        self.assertEqual(field_code(self.post({}, path=read), "up_to_message_id"), "invalid")
        self.assertEqual(self.post({"up_to_message_id": str(uuid4())}, path=read).status_code, 404)

    def test_reviewer_labels_and_stale_version(self):
        self.post({"kind": "message", "body": "Note"}, path=self.path)
        Report.objects.filter(pk=self.report.pk).update(assigned_reviewer=self.reviewer)
        self.client.force_login(self.reviewer)
        item = self.client.get(self.path).json()["items"][0]
        self.assertEqual(item["author_label"], self.report_label())
        version = Report.objects.get(pk=self.report.pk).version
        stale = self.post({"kind": "message", "body": "x", "version": version + 5}, path=self.path)
        self.assertEqual((stale.status_code, code(stale)), (409, "stale_version"))
        bad = self.post({"kind": "reply", "body": "x", "reply_to": str(uuid4()), "version": version}, path=self.path)
        self.assertEqual(field_code(bad, "kind"), "invalid_choice")
        missing_version = self.post({"kind": "message", "body": "x"}, path=self.path)
        self.assertEqual(field_code(missing_version, "version"), "invalid")

    def report_label(self):
        return Report.objects.get(pk=self.report.pk).observer_code or "Observer"


@override_settings(PUBLIC_INTAKE_ORGANISATION_ID=INITIAL_ORGANISATION)
class CitizenErrorTests(TestCase):
    setUpTestData = classmethod(test_v1_reports.ObserverReportTests.setUpTestData.__func__)
    post = test_v1_reports.ObserverReportTests.post

    def setUp(self):
        test_v1_reports.ObserverReportTests.setUp(self)
        self.client = Client(enforce_csrf_checks=True)
        self.client.logout()
        self.data = {**self.valid, "receipt_secret": SECRET}
        self.create_url = "/api/v1/public/reports"

    def make(self):
        response = self.post(self.data, path=self.create_url)
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def test_create_errors(self):
        for secret in (None, "short", "!" * 43, "B" * 44):
            data = {k: v for k, v in self.data.items() if k != "receipt_secret"}
            if secret is not None:
                data["receipt_secret"] = secret
            self.assertEqual(field_code(self.post(data, path=self.create_url), "receipt_secret"), "invalid", secret)
        for kind in ("checklist", "result_sheet"):
            response = self.post({**self.data, "kind": kind}, path=self.create_url)
            self.assertEqual((response.status_code, field_code(response, "kind")), (422, "not_allowed_for_kind"))
        bad = self.post({**self.data, "occurred_at": "2999-01-01T00:00:00+01:00"}, path=self.create_url)
        self.assertEqual(field_code(bad, "occurred_at"), "in_future")
        related = self.post({**self.data, "related_report_id": str(uuid4())}, path=self.create_url)
        self.assertEqual(related.status_code, 404)
        no_key = self.client.post(self.create_url, self.data, content_type="application/json",
                                  HTTP_X_CSRFTOKEN=self.client.get("/api/v1/auth/csrf").json()["csrf_token"])
        self.assertEqual(code(no_key), "idempotency_key_required")
        self.assertEqual(Report.objects.count(), 0)

    def test_key_reuse_scope_and_no_stored_address(self):
        key = uuid4()
        self.assertEqual(self.post(self.data, key=key, path=self.create_url).status_code, 201)
        changed = self.post({**self.data, "description": "Different"}, key=key, path=self.create_url)
        self.assertEqual(code(changed), "idempotency_key_reused")
        other_secret = self.post({**self.data, "receipt_secret": "C" * 42 + "A"}, key=key, path=self.create_url)
        self.assertEqual(other_secret.status_code, 201)
        self.assertEqual(Report.objects.count(), 2)
        report = Report.objects.first()
        self.assertEqual(report.receipt_secret_hash, report.receipt_secret_hash.lower())
        self.assertNotIn(SECRET, report.receipt_secret_hash)
        self.assertEqual(len(report.receipt_secret_hash), 64)

    def test_pause_and_limits(self):
        Organisation.objects.filter(pk=INITIAL_ORGANISATION).update(intake_paused=True)
        paused = self.post(self.data, path=self.create_url)
        self.assertEqual((paused.status_code, code(paused), paused["Retry-After"]), (503, "intake_paused", "600"))
        Organisation.objects.filter(pk=INITIAL_ORGANISATION).update(intake_paused=False)
        with override_settings(PUBLIC_INTAKE_ORGANISATION_ID="not-a-uuid"):
            self.assertEqual(code(self.post(self.data, path=self.create_url)), "intake_paused")
        with patch("reports.citizen.rate_limit", return_value=9):
            limited = self.post(self.data, path=self.create_url)
        self.assertEqual((limited.status_code, limited["Retry-After"]), (429, "9"))

    def test_status_lookup(self):
        receipt = self.make()["receipt_code"]
        url = "/api/v1/public/receipts/"
        self.assertEqual(self.client.get(url + receipt.lower().replace("-", " ")).json()["receipt_code"], receipt)
        self.assertEqual(code(self.client.get(url + "EG-4H7Q-92KD")), "receipt_code_invalid")
        self.assertEqual(code(self.client.get(url + "nonsense")), "receipt_code_invalid")
        prefix = "".join(ALPHABET[i] for i in (3, 4, 5, 6, 7, 8, 9))
        unknown = f"EG-{prefix[:4]}-{prefix[4:]}{check_symbol(prefix)}"
        self.assertEqual(code(self.client.get(url + unknown)), "not_found")
        with patch("reports.citizen.rate_limit", return_value=4):
            limited = self.client.get(url + receipt)
        self.assertEqual((limited.status_code, limited["Retry-After"]), (429, "4"))

    def test_status_shows_question_and_closure_without_detail(self):
        receipt = self.make()["receipt_code"]
        report = Report.objects.get(receipt_code=receipt)
        reviewer = User.objects.create_user("citizen-status-reviewer@example.test", role=User.Role.REVIEWER)
        report.status = Report.Status.NEEDS_CLARIFICATION
        record_change(report, reviewer, ReviewEvent.Action.REQUEST_CLARIFICATION, {"note": "Which gate?"}, "status")
        body = self.client.get(f"/api/v1/public/receipts/{receipt}").json()
        self.assertEqual((body["status"], body["has_open_question"], body["outcome"]), ("question", True, None))
        report.status = Report.Status.CLOSED
        record_change(report, reviewer, ReviewEvent.Action.CLOSE, {"outcome": "out_of_scope"}, "status")
        body = self.client.get(f"/api/v1/public/receipts/{receipt}").json()
        self.assertEqual((body["status"], body["outcome"]), ("closed", "out_of_scope"))
        self.assertNotIn("description", body)

    @patch("reports.citizen.rate_limit", return_value=None)
    def test_conversation_and_reply_errors(self, _):
        receipt = self.make()["receipt_code"]
        base = f"/api/v1/public/receipts/{receipt}"
        report = Report.objects.get(receipt_code=receipt)
        reviewer = User.objects.create_user("citizen-conv-reviewer@example.test", role=User.Role.REVIEWER)
        report.status = Report.Status.NEEDS_CLARIFICATION
        record_change(report, reviewer, ReviewEvent.Action.REQUEST_CLARIFICATION, {"note": "Which gate?"}, "status")
        wrong = {"HTTP_X_RECEIPT_SECRET": "C" * 42 + "A"}
        self.assertEqual(code(self.client.get(f"{base}/conversation", **wrong)), "receipt_secret_invalid")
        self.assertEqual(code(self.client.get(f"{base}/conversation", HTTP_X_RECEIPT_SECRET="bad")), "receipt_secret_invalid")
        self.assertEqual(code(self.client.get(f"{base}/conversation")), "receipt_secret_invalid")
        self.assertEqual(code(self.client.get("/api/v1/public/receipts/EG-bad/conversation", **HEADERS)), "receipt_code_invalid")
        self.assertEqual(self.client.get(f"{base[:-11]}EG-4H7Q-92KD/conversation", **HEADERS).status_code, 422)
        conversation = self.client.get(f"{base}/conversation", **HEADERS).json()
        self.assertEqual(conversation["messages"][0]["author_label"], "Reviewer")
        self.assertNotIn("attachment", {k for m in conversation["messages"] for k in m if m[k]})
        question = conversation["messages"][0]["id"]
        self.assertEqual(code(self.post({"question_id": question, "body": "x"}, path=f"{base}/reply", **wrong)),
                         "receipt_secret_invalid")
        for payload, name in (({"body": "x"}, "question_id"), ({"question_id": "bad", "body": "x"}, "question_id"),
                              ({"question_id": question, "body": ""}, "body"),
                              ({"question_id": question, "body": "y" * 2001}, "body")):
            response = self.post(payload, path=f"{base}/reply", **HEADERS)
            self.assertEqual((response.status_code, response.json()["error"]["code"]), (422, "validation_failed"), payload)
            self.assertIn(name, response.json()["error"]["fields"])
        with patch("reports.citizen.rate_limit", return_value=3):
            limited = self.post({"question_id": question, "body": "x"}, path=f"{base}/reply", **HEADERS)
        self.assertEqual((limited.status_code, limited["Retry-After"]), (429, "3"))
        old = self.post({"question_id": str(uuid4()), "body": "x"}, path=f"{base}/reply", **HEADERS)
        self.assertEqual(code(old), "question_closed")
        report.status = Report.Status.CLOSED
        report.save(update_fields=["status"])
        closed = self.post({"question_id": question, "body": "x"}, path=f"{base}/reply", **HEADERS)
        self.assertEqual(code(closed), "report_closed")
        Report.objects.filter(pk=report.pk).update(status=Report.Status.WITHDRAWN)
        withdrawn = self.post({"question_id": question, "body": "x"}, path=f"{base}/reply", **HEADERS)
        self.assertEqual(code(withdrawn), "report_withdrawn")
        self.assertEqual(self.client.get(f"{base}/conversation", **HEADERS).json()["messages"], [])

    def test_observer_reports_are_not_reachable_with_a_receipt_secret(self):
        report = Report.objects.get(pk=self.observer_report())
        url = f"/api/v1/public/receipts/{report.receipt_code}/conversation"
        self.assertEqual(self.client.get(url, **HEADERS).status_code, 404)

    def observer_report(self):
        self.client.force_login(self.observer)
        response = self.post(self.valid)
        self.client.logout()
        return response.json()["id"]
