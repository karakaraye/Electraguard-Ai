import json
import secrets
from uuid import uuid4

from django.contrib.auth.models import Permission, User
from django.test import Client, TestCase, override_settings

from .models import Report, ReviewEvent


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
