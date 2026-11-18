from io import BytesIO
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from accounts.models import User

from .models import Evidence, Report
from .uploads import MAX_FILE_SIZE


class ReportingTests(TestCase):
    url = "/api/reports"
    payload = {
        "occurred_at": "2026-05-01T09:15:00+01:00",
        "location": "Fictional community hall",
        "description": "Synthetic observation for testing.",
    }

    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user("owner@tests.example", role=User.Role.OBSERVER)
        cls.other = User.objects.create_user("other@tests.example", role=User.Role.OBSERVER)
        cls.reviewer = User.objects.create_user("reviewer@tests.example", role=User.Role.REVIEWER)
        cls.administrator = User.objects.create_user("admin@tests.example", role=User.Role.ADMINISTRATOR)

    def setUp(self):
        self.client = APIClient()

    def submit(self, key=None, payload=None):
        return self.client.post(
            self.url, payload if payload is not None else self.payload,
            format="json", HTTP_IDEMPOTENCY_KEY=str(key or uuid4()),
        )

    def image(self):
        buffer = BytesIO()
        Image.new("RGB", (8, 8), color="green").save(buffer, format="PNG")
        return buffer.getvalue()

    def upload(self, report_url, content, name="test.png"):
        return self.client.post(
            f"{report_url}/attachments",
            {"file": SimpleUploadedFile(name, content, content_type="image/png")},
        )

    def create_report(self):
        self.client.force_login(self.owner)
        response = self.submit()
        self.assertEqual(response.status_code, 201, response.data)
        return f"{self.url}/{response.data['reference']}"

    def test_submission_replay_and_conflict(self):
        self.client.force_login(self.owner)
        key = uuid4()
        first = self.submit(key, {**self.payload, "observer": self.other.pk, "status": "reviewed"})
        self.assertEqual(first.status_code, 201)
        retry = self.submit(key, {**self.payload, "occurred_at": "2026-05-01T08:15:00Z"})
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.data, first.data)
        self.assertEqual(self.submit(key, {**self.payload, "location": "Other place"}).status_code, 409)
        report = Report.objects.get()
        self.assertEqual(report.observer, self.owner)
        self.assertEqual(report.status, Report.Status.SUBMITTED)

        self.client.force_login(self.other)
        second = self.submit(key)
        self.assertEqual(second.status_code, 201)
        self.assertNotEqual(first.data["reference"], second.data["reference"])

    def test_validation_and_csrf(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.owner)
        self.assertEqual(client.post(self.url, self.payload, format="json").status_code, 403)
        token = client.get("/api/auth/csrf").json()["csrfToken"]
        self.assertEqual(
            client.post(self.url, self.payload, format="json", HTTP_X_CSRFTOKEN=token).status_code,
            400,
        )
        self.client.force_login(self.owner)
        self.assertEqual(self.submit(payload={**self.payload, "location": " "}).status_code, 400)
        report_url = self.create_report()
        self.assertEqual(client.post(f"{report_url}/attachments").status_code, 403)

    def test_list_detail_and_attachment_ownership(self):
        report_url = self.create_report()
        upload = self.upload(report_url, self.image())
        self.assertEqual(upload.status_code, 201)
        attachment_url = f"{report_url}/attachments/{upload.data['id']}"
        own_list = self.client.get(self.url)
        self.assertEqual(len(own_list.data), 1)
        self.assertEqual(own_list.data[0]["reference"], report_url.split("/")[-1])
        detail = self.client.get(report_url)
        self.assertEqual(detail.data["attachments"], [upload.data])
        download = self.client.get(attachment_url)
        self.assertEqual(download.status_code, 200)
        self.assertEqual(download["Content-Type"], "image/png")
        self.assertIn("attachment;", download["Content-Disposition"])
        self.assertIn("no-store", download["Cache-Control"])
        self.assertEqual(b"".join(download.streaming_content), self.image())

        self.client.force_login(self.other)
        self.assertEqual(self.client.get(self.url).data, [])
        self.assertEqual(self.client.get(report_url).status_code, 404)
        self.assertEqual(self.client.get(attachment_url).status_code, 404)
        self.assertEqual(self.upload(report_url, self.image()).status_code, 404)
        self.assertEqual(self.submit().status_code, 201)
        own_reference = self.client.get(self.url).data[0]["reference"]
        self.assertEqual(
            self.client.get(f"{self.url}/{own_reference}/attachments/{upload.data['id']}").status_code,
            404,
        )

        for user in (None, self.reviewer, self.administrator):
            with self.subTest(user=user):
                self.client.logout()
                if user:
                    self.client.force_login(user)
                self.assertEqual(self.client.get(self.url).status_code, 403)
                self.assertEqual(self.submit().status_code, 403)
                self.assertEqual(self.client.get(report_url).status_code, 403)
                self.assertEqual(
                    self.client.get(attachment_url).status_code,
                    404 if user == self.reviewer else 403,
                )
                self.assertEqual(self.upload(report_url, self.image()).status_code, 403)

    def test_invalid_upload_does_not_undo_report_and_retry_is_safe(self):
        report_url = self.create_report()
        content = self.image()
        for invalid in (b"spoofed PNG contents", content[:45], b"x" * (MAX_FILE_SIZE + 1)):
            with self.subTest(size=len(invalid)):
                self.assertEqual(self.upload(report_url, invalid).status_code, 400)
        self.assertEqual(self.client.get(report_url).data["attachments"], [])
        self.assertEqual(Report.objects.count(), 1)
        self.assertEqual(Evidence.objects.count(), 0)
        first = self.upload(report_url, content)
        retry = self.upload(report_url, content)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(first.data, retry.data)
        self.assertEqual(Report.objects.count(), 1)
        self.assertEqual(Evidence.objects.count(), 1)
