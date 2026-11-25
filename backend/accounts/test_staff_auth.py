from datetime import datetime, timedelta, timezone as utc
from unittest.mock import patch
from uuid import uuid4

from django.conf import settings
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from reports.models import Report, ReviewEvent

from .models import AccountOffboarding, AccountSession, Organisation, StaffCredential, StaffMutation, StaffSecurityAlert, User
from .staff_auth import decrypt, encrypt, totp

AUTH = "/api/v1/auth/"
STAFF = AUTH + "staff/"
ADMIN = "/api/v1/admin/staff"
ME = AUTH + "me"
PASSWORD = "Fictional woodland batteries 983!"


class StaffAuthTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.reviewer = User.objects.create_user("reviewer@example.test", PASSWORD, role=User.Role.REVIEWER)
        cls.admin = User.objects.create_user("admin@example.test", PASSWORD, role=User.Role.ORG_ADMIN)
        other = Organisation.objects.create(name="Synthetic other organisation")
        cls.other = User.objects.create_user(
            "remote@example.test", PASSWORD, organisation=other, role=User.Role.REVIEWER,
        )

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.now = datetime(2026, 11, 23, 10, 0, tzinfo=utc.utc)
        clock = patch("django.utils.timezone.now", side_effect=lambda: self.now)
        clock.start()
        self.addCleanup(clock.stop)

    def request(self, client, method, path, body, *, key=None, csrf=None):
        token = csrf or client.get(AUTH + "csrf").json()["csrf_token"]
        headers = {"X-CSRFToken": token}
        if key is not None:
            headers["Idempotency-Key"] = str(key)
        return getattr(client, method)(path, body, content_type="application/json", headers=headers)

    def begin(self, user, client, password=PASSWORD):
        return self.request(client, "post", STAFF + "sign-in", {"email": user.email.upper(), "password": password})

    def code(self, secret, offset=0):
        return totp(secret, int(self.now.timestamp()) // 30 + offset)

    def enrol(self, user, client, *, offset=0):
        response = self.begin(user, client)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["status"], "totp_enrolment_required")
        # A browser cannot read the HttpOnly cookie, so it fetches the rotated token from AUTH-01.
        token = client.get(AUTH + "csrf").json()["csrf_token"]
        response = self.request(client, "post", STAFF + "totp/enrolment", {}, csrf=token)
        self.assertEqual(response.status_code, 200, response.content)
        secret = response.json()["secret"]
        response = self.request(
            client, "post", STAFF + "totp/enrolment/confirm", {"code": self.code(secret, offset)}, csrf=token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        return secret, response

    def verify(self, client, code):
        return self.request(
            client, "post", STAFF + "totp", {"code": code}, csrf=client.cookies[settings.CSRF_COOKIE_NAME].value,
        )

    def admin_post(self, client, path, data, *, key=None):
        return self.request(client, "post", ADMIN + path, data, key=key or uuid4())

    def assert_error(self, response, status, code):
        self.assertEqual(response.status_code, status, response.content)
        self.assertEqual(response.json()["error"]["code"], code)

    def test_pending_fences_every_other_route_and_expires(self):
        self.assertFalse(self.client.get(ME).json()["authenticated"])
        self.assert_error(
            self.client.post(STAFF + "sign-in", {"email": self.reviewer.email, "password": PASSWORD}, content_type="application/json"),
            403, "csrf_failed",
        )
        response = self.begin(self.reviewer, self.client)
        self.assertEqual(response.cookies[settings.SESSION_COOKIE_NAME]["max-age"], "")
        self.assertEqual(self.client.get(ME).json()["pending"], "totp_enrolment_required")
        self.assertEqual(self.client.get(AUTH + "csrf").status_code, 200)
        for path in ("/api/auth/me", "/api/v1/review/queue", ADMIN, "/health/live"):
            self.assert_error(self.client.get(path), 403, "totp_required")
        self.assertNotIn("_auth_user_id", self.client.session)
        self.now += timedelta(minutes=5)
        self.assertNotIn("pending", self.client.get(ME).json())
        self.assert_error(self.verify(self.client, "111111"), 401, "not_authenticated")

    def test_enrolment_replaces_secret_and_uses_rfc6238(self):
        secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
        self.assertEqual(totp(secret, 59 // 30), "287082")
        self.begin(self.reviewer, self.client)
        token = self.client.cookies[settings.CSRF_COOKIE_NAME].value
        path = STAFF + "totp/enrolment"
        first = self.request(self.client, "post", path, {}, csrf=token).json()
        second = self.request(self.client, "post", path, {}, csrf=token).json()
        self.assertNotEqual(first["secret"], second["secret"])
        pending = AccountSession.objects.get(user=self.reviewer, pending=True)
        self.assertNotEqual(pending.enrolment_secret, second["secret"])
        self.assertEqual(decrypt(pending.enrolment_secret), second["secret"])
        result = self.request(
            self.client, "post", path + "/confirm", {"code": self.code(second["secret"], -1)}, csrf=token,
        )
        self.assertEqual(result.status_code, 200, result.content)
        self.assertTrue(result.json()["me"]["user"]["totp_enrolled"])
        credential = StaffCredential.objects.get(user=self.reviewer)
        self.assertNotIn(second["secret"], credential.secret)
        self.assertEqual(decrypt(credential.secret), second["secret"])
        with override_settings(SECRET_KEY="synthetic-key-for-rotation", SECRET_KEY_FALLBACKS=[settings.SECRET_KEY]):
            self.assertEqual(decrypt(credential.secret), second["secret"])
            self.assertEqual(decrypt(encrypt(second["secret"])), second["secret"])
        self.assertFalse(AccountSession.objects.filter(user=self.reviewer, pending=True).exists())

    def test_replay_and_clock_drift(self):
        secret, _ = self.enrol(self.reviewer, self.client)
        another = Client(enforce_csrf_checks=True)
        self.assertEqual(self.begin(self.reviewer, another).json()["status"], "totp_required")
        self.assert_error(self.verify(another, self.code(secret)), 401, "totp_invalid")
        self.assert_error(self.verify(another, self.code(secret, 2)), 401, "totp_invalid")
        self.assertEqual(self.verify(another, self.code(secret, 1)).status_code, 200)
        legacy = Client()
        response = legacy.post("/api/auth/sign-in", {"email": self.reviewer.email, "password": PASSWORD})
        self.assertEqual(response.status_code, 401)

    def test_verified_session_idle_absolute_and_sign_out_everywhere(self):
        secret, response = self.enrol(self.reviewer, self.client)
        self.assertEqual(response.cookies[settings.SESSION_COOKIE_NAME]["max-age"], "")
        self.assertEqual(response.cookies[settings.SESSION_COOKIE_NAME]["expires"], "")
        self.now += timedelta(minutes=29)
        self.assertTrue(self.client.get(ME).json()["authenticated"])
        another = Client(enforce_csrf_checks=True)
        self.begin(self.reviewer, another)
        self.verify(another, self.code(secret))
        self.assertEqual(self.request(self.client, "post", AUTH + "sign-out", {"everywhere": True}).status_code, 204)
        self.assertFalse(another.get(ME).json()["authenticated"])
        self.begin(self.reviewer, self.client)
        self.assertEqual(self.verify(self.client, self.code(secret, 1)).status_code, 200)
        self.now += timedelta(minutes=30)
        self.assertFalse(self.client.get(ME).json()["authenticated"])
        self.begin(self.reviewer, self.client)
        self.assertEqual(self.verify(self.client, self.code(secret)).status_code, 200)
        for _ in range(17):
            self.now += timedelta(minutes=28)
            self.assertTrue(self.client.get(ME).json()["authenticated"])
        self.now += timedelta(minutes=4)
        self.assertFalse(self.client.get(ME).json()["authenticated"])

    def test_password_and_ip_lockout(self):
        for _ in range(4):
            self.assert_error(self.begin(self.reviewer, self.client, "Wrong"), 401, "invalid_credentials")
        locked = self.begin(self.reviewer, self.client, "Wrong")
        self.assert_error(locked, 423, "account_locked")
        self.assertEqual(locked["Retry-After"], "900")
        self.assert_error(self.begin(self.reviewer, self.client), 423, "account_locked")
        self.assertTrue(StaffSecurityAlert.objects.filter(rule="repeated_failed_staff_sign_in", user=self.reviewer).exists())
        for _ in range(24):
            self.begin(self.reviewer, self.client, "Wrong")
        self.assert_error(self.begin(self.reviewer, self.client), 429, "rate_limited")
        self.now += timedelta(minutes=15)
        self.assertEqual(self.begin(self.reviewer, self.client).status_code, 200)

    def test_totp_session_and_account_lockouts(self):
        secret, _ = self.enrol(self.reviewer, self.client)
        wrong = next(str(number).zfill(6) for number in range(100) if str(number).zfill(6) not in {
            self.code(secret, offset) for offset in (-1, 0, 1)
        })
        for batch in range(2):
            client = Client(enforce_csrf_checks=True)
            self.assertEqual(self.begin(self.reviewer, client).status_code, 200)
            for attempt in range(5):
                response = self.verify(client, wrong)
                if batch == 1 and attempt == 4:
                    self.assert_error(response, 423, "account_locked")
                else:
                    self.assert_error(response, 401, "totp_invalid")
            self.assertNotIn("pending", client.get(ME).json())
        self.assert_error(self.begin(self.reviewer, Client(enforce_csrf_checks=True)), 423, "account_locked")
        self.now += timedelta(hours=1)
        self.assertEqual(self.begin(self.reviewer, Client(enforce_csrf_checks=True)).status_code, 200)

    def test_invite_single_use_expiry_and_no_secret_on_replay(self):
        self.enrol(self.admin, self.client)
        key = uuid4()
        body = {"email": "invited@example.test", "display_name": "Fictional Staff", "roles": ["moderator", "reviewer"]}
        response = self.admin_post(self.client, "", body, key=key)
        self.assertEqual(response.status_code, 201, response.content)
        token = response.json()["invite"]["url"].split("=", 1)[1]
        self.assertNotIn(token, str(StaffMutation.objects.get(actor=self.admin).body))
        replay = self.admin_post(self.client, "", body, key=key)
        self.assertEqual(replay.status_code, 200, replay.content)
        self.assertNotIn("invite", replay.json())
        self.assert_error(self.admin_post(self.client, "", {**body, "display_name": "Another Name"}, key=key),
                          409, "idempotency_key_reused")
        invited = Client(enforce_csrf_checks=True)
        claim = self.request(invited, "post", STAFF + "invite", {"token": token, "password": PASSWORD})
        self.assertEqual(claim.json()["status"], "totp_enrolment_required")
        self.assert_error(self.request(
            Client(enforce_csrf_checks=True), "post", STAFF + "invite", {"token": token, "password": PASSWORD},
        ), 401, "invalid_credentials")
        account = User.objects.get(email=body["email"])
        self.assertEqual(account.application_roles, body["roles"])
        self.assertEqual(Client().post("/api/auth/sign-in", {"email": account.email, "password": PASSWORD}).status_code, 401)

        another = self.admin_post(self.client, "", {**body, "email": "expired@example.test"})
        old_token = another.json()["invite"]["url"].split("=", 1)[1]
        self.now += timedelta(hours=72)
        self.assert_error(self.request(
            Client(enforce_csrf_checks=True), "post", STAFF + "invite", {"token": old_token, "password": PASSWORD},
        ), 401, "invalid_credentials")

    def test_administration_access_offboard_reset_and_review_unassignment(self):
        self.enrol(self.admin, self.client)
        reviewer_client = Client(enforce_csrf_checks=True)
        self.enrol(self.reviewer, reviewer_client)
        self.assert_error(reviewer_client.get(ADMIN), 403, "forbidden")
        self.assertNotIn(self.other.email, str(self.client.get(ADMIN).json()))
        self.assert_error(self.admin_post(self.client, f"/{self.other.pk}/reset-2fa", {"version": 0}), 404, "not_found")
        self.assert_error(self.request(
            self.client, "patch", f"{ADMIN}/{self.admin.pk}", {"version": 0, "roles": ["reviewer"]},
        ), 409, "last_admin")
        updated = self.request(
            self.client, "patch", f"{ADMIN}/{self.reviewer.pk}", {"version": 0, "roles": ["moderator", "reviewer"]},
        )
        self.assertEqual(updated.status_code, 200, updated.content)
        self.assertEqual(reviewer_client.get(ME).json()["user"]["roles"], ["moderator", "reviewer"])
        self.assertEqual(reviewer_client.get("/api/v1/review/queue").status_code, 200)
        self.assert_error(self.admin_post(self.client, f"/{self.reviewer.pk}/reset-2fa", {"version": 0}), 409, "stale_version")
        reset = self.admin_post(self.client, f"/{self.reviewer.pk}/reset-2fa", {"version": 1})
        self.assertEqual(reset.status_code, 200, reset.content)
        self.assertFalse(reviewer_client.get(ME).json()["authenticated"])
        self.assertEqual(self.begin(self.reviewer, reviewer_client).json()["status"], "totp_enrolment_required")
        case = Report.objects.create(assigned_reviewer=self.reviewer, submission_key=uuid4())
        closed = Report.objects.create(assigned_reviewer=self.reviewer, submission_key=uuid4(), status=Report.Status.CLOSED)
        response = self.admin_post(self.client, f"/{self.reviewer.pk}/offboard", {"version": 2, "reason": "access_ended"})
        self.assertEqual(response.status_code, 200, response.content)
        case.refresh_from_db()
        closed.refresh_from_db()
        self.assertIsNone(case.assigned_reviewer_id)
        self.assertEqual(closed.assigned_reviewer_id, self.reviewer.pk)
        self.assertTrue(ReviewEvent.objects.filter(report=case, actor=self.admin, action="assign").exists())
        self.assertTrue(AccountOffboarding.objects.filter(account=self.reviewer, authorized_by=self.admin).exists())
        self.assertTrue(StaffSecurityAlert.objects.filter(user=self.reviewer, rule="staff_offboarded_with_cases").exists())
        self.assertNotIn("pending", reviewer_client.get(ME).json())
        self.assert_error(self.begin(self.reviewer, reviewer_client), 401, "invalid_credentials")
