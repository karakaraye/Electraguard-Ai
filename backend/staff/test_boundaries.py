from unittest.mock import patch
from uuid import uuid4

from django.test import Client, TestCase
from django.utils import timezone

from accounts.models import Organisation, User
from accounts.staff_sessions import VERIFIED

from .codes import LAGOS
from .models import AuditEvent, CodeIssuance
from .test_support import bind_staff_session


class StaffBoundariesTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user("administrator@example.test", role=User.Role.ORG_ADMIN)
        self.other = User.objects.create_user(
            "other-admin@example.test", role=User.Role.ORG_ADMIN,
            organisation=Organisation.objects.create(name="Other programme"),
        )
        self.url = "/api/v1/admin/code-batches"

    def sign_in(self, user, *, csrf=False):
        client = Client(enforce_csrf_checks=csrf)
        client.force_login(user)
        session = client.session
        session[VERIFIED] = True
        session.save()
        bind_staff_session(session, user)
        return client

    def create_batch(self, client, label="Training"):
        return client.post(
            self.url, {"label": label, "count": 1}, content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )

    def test_code_mutation_requires_csrf(self):
        response = self.create_batch(self.sign_in(self.admin, csrf=True))
        self.assertEqual(response.status_code, 403)

    def test_print_data_and_codes_are_scoped_to_organisation(self):
        response = self.create_batch(self.sign_in(self.other)).json()
        admin = self.sign_in(self.admin)
        paths = [
            self.url + "/" + response["batch"]["id"] + "/print-data",
            "/api/v1/admin/codes/" + response["cards"][0]["observer_code"] + "/revoke",
        ]
        for endpoint in paths:
            result = admin.post(
                endpoint, {"confirm_reset_setup_pins": True, "reason": "other"},
                content_type="application/json", HTTP_IDEMPOTENCY_KEY=str(uuid4()),
            )
            self.assertEqual(result.status_code, 404)

    def test_audit_export_rate_limit_is_organisation_scoped(self):
        admin = self.sign_in(self.admin)
        path = "/api/v1/audit/export"
        for _ in range(10):
            self.assertEqual(admin.get(path).status_code, 200)
        limited = admin.get(path)
        self.assertEqual(limited.status_code, 429)
        self.assertIn("Retry-After", limited)
        self.assertEqual(self.sign_in(self.other).get(path).status_code, 200)


    def test_batch_print_confirmation_and_same_key_reuse(self):
        admin = self.sign_in(self.admin)
        key = str(uuid4())
        body = {"label": "Training", "count": 1}

        def create(data, **headers):
            return admin.post(self.url, data, content_type="application/json", **headers)

        missing = create(body)
        self.assertEqual(missing.json()["error"]["code"], "idempotency_key_required")
        result = create(body, HTTP_IDEMPOTENCY_KEY=key).json()
        different = create({**body, "label": "Other"}, HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(different.json()["error"]["code"], "idempotency_key_reused")
        endpoint = f'{self.url}/{result["batch"]["id"]}/print-data'
        denied = admin.post(endpoint, {}, content_type="application/json")
        self.assertEqual(denied.json()["error"]["code"], "confirmation_required")
        printed = admin.post(endpoint, {"confirm_reset_setup_pins": True}, content_type="application/json")
        self.assertEqual(printed.status_code, 200)
        self.assertEqual(printed.json()["cards"][0]["observer_code"], result["cards"][0]["observer_code"])
        self.assertTrue(AuditEvent.objects.filter(organisation=self.admin.organisation, action="print_code_batch").exists())

    def test_daily_code_limit_and_invalid_count(self):
        admin = self.sign_in(self.admin)
        CodeIssuance.objects.create(
            organisation=self.admin.organisation, day=timezone.now().astimezone(LAGOS).date(), count=2000,
        )
        invalid = admin.post(
            self.url, {"label": "Test", "count": 501}, content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(invalid.status_code, 422)
        limited = self.create_batch(admin)
        self.assertEqual(limited.json()["error"]["code"], "rate_limited")
        self.assertIn("Retry-After", limited)
        self.assertEqual(self.create_batch(self.sign_in(self.other)).status_code, 201)

    def test_rumour_rejects_malformed_image_before_storage(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        actor = User.objects.create_user("coordinator@example.test", role=User.Role.COORDINATOR)
        client = self.sign_in(actor)
        path = "/api/v1/rumours/claims"
        data = {"seen_on": "other", "language": "en"}
        fake = SimpleUploadedFile("not-an-image.jpg", b"Not an image", content_type="image/jpeg")
        response = client.post(path, {**data, "image": fake}, HTTP_IDEMPOTENCY_KEY=str(uuid4()))
        self.assertEqual(response.status_code, 415)
        with patch("rumours.views.rate_limit", return_value=30):
            response = client.post(
                path, {**data, "text": "A claim"}, content_type="application/json",
                HTTP_IDEMPOTENCY_KEY=str(uuid4()),
            )
        self.assertEqual(response.json()["error"]["code"], "rate_limited")
        self.assertEqual(response["Retry-After"], "30")
