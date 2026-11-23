from uuid import uuid4

from django.test import Client, TestCase

from accounts.models import Organisation, User
from accounts.staff_sessions import VERIFIED

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
