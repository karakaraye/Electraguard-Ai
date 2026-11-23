from datetime import timedelta

from django.test import Client, TestCase, override_settings
from django.utils import timezone

from .models import User
from .observer_credentials import digest
from .staff_auth import totp


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class StaffAuthTests(TestCase):
    password = "mountains-are-quiet-27"

    def setUp(self):
        self.user = User.objects.create_user("staff@example.org", self.password, role="reviewer")

    def post(self, path, body=None, *, client=None, **headers):
        return (client or self.client).post(
            "/api/v1/auth/" + path, body or {}, content_type="application/json", **headers,
        )

    def sign_in(self, client=None):
        return self.post("staff/sign-in", {
            "email": self.user.email, "password": self.password,
        }, client=client)

    def test_enrolment_and_replay(self):
        self.assertEqual(self.sign_in().json()["status"], "totp_enrolment_required")
        self.assertEqual(self.client.get("/api/v1/auth/me").json()["error"]["code"], "totp_required")
        secret = self.post("staff/totp/enrolment").json()["secret"]
        step = int(timezone.now().timestamp()) // 30
        code = totp(secret, step)
        result = self.post("staff/totp/enrolment/confirm", {"code": code})
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.json()["me"]["user"]["totp_enrolled"])
        second = Client()
        self.assertEqual(self.sign_in(second).json()["status"], "totp_required")
        self.assertEqual(
            self.post("staff/totp", {"code": code}, client=second).json()["error"]["code"],
            "totp_invalid",
        )
        self.assertEqual(self.post("sign-out", {"everywhere": True}).status_code, 204)
        self.assertEqual(self.post("staff/totp", {"code": code}, client=second).status_code, 403)

    def test_sign_in_lockout_and_validation(self):
        self.assertEqual(self.post("staff/sign-in").status_code, 422)
        for _ in range(4):
            self.assertEqual(
                self.post("staff/sign-in", {"email": self.user.email, "password": "wrong"}).status_code,
                401,
            )
        self.assertEqual(
            self.post("staff/sign-in", {"email": self.user.email, "password": "wrong"}).status_code,
            423,
        )
        self.assertEqual(self.sign_in().status_code, 423)

    def test_invite_is_single_use(self):
        token = "inv_one_time_test_token"
        self.user.staff_invite_digest = digest("staff-invite", token)
        self.user.staff_invite_expires_at = timezone.now() + timedelta(hours=1)
        self.user.set_unusable_password()
        self.user.save()
        body = {"token": token, "password": self.password}
        self.assertEqual(self.post("staff/invite", body).json()["status"], "totp_enrolment_required")
        self.assertEqual(self.post("staff/invite", body).status_code, 401)

    def test_csrf_is_required(self):
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(self.sign_in(client).json()["error"]["code"], "csrf_failed")
