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
