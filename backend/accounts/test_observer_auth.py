from datetime import timedelta
from io import StringIO
from unittest.mock import patch
from uuid import UUID, uuid4

from django.conf import settings
from django.contrib.sessions.models import Session
from django.core.management import call_command
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from reports.models import Report

from .models import AccountSession, ObserverCode, ObserverSecurityAlert, Organisation, User
from .observer_credentials import check_symbol, generate_code, normalize_code

CSRF = "/api/v1/auth/csrf"
SIGN_IN = "/api/v1/auth/observer/sign-in"
SET_PIN = "/api/v1/auth/observer/pin"
CHANGE_PIN = "/api/v1/auth/observer/pin/change"
SIGN_OUT = "/api/v1/auth/sign-out"
ME = "/api/v1/auth/me"
PERSONAL = "246807"


class ObserverAuthTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        output = StringIO()
        with patch("accounts.observer_credentials.secrets.randbelow", return_value=50716942):
            call_command("issue_observer_codes", count=1, label="Synthetic training batch", stdout=output)
        cls.code, cls.setup_pin = output.getvalue().strip().split()

    def setUp(self):
        self.phone = Client(enforce_csrf_checks=True)

    def post(self, path, payload, phone=None):
        phone = phone or self.phone
        token = phone.get(CSRF).json()["csrf_token"]
        return phone.post(path, payload, content_type="application/json", HTTP_X_CSRFTOKEN=token)

    def sign_in(self, pin=None, code=None, phone=None):
        return self.post(SIGN_IN, {"code": code or self.code, "pin": pin or self.setup_pin}, phone)

    def setup_token(self):
        response = self.sign_in()
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["status"], "pin_setup_required")
        self.assertFalse(self.phone.get(ME).json()["authenticated"])
        return response.json()["setup_token"]

    def activate(self):
        return self.post(SET_PIN, {"setup_token": self.setup_token(), "new_pin": PERSONAL})

    def test_code_normalization_and_check_symbol(self):
        self.assertEqual(check_symbol("01ABC"), "C")
        self.assertEqual(normalize_code(" obs ol-ab cC "), "OBS-01ABCC")
        self.assertEqual(normalize_code("OBS-0IABCC"), "OBS-01ABCC")
        self.assertIsNone(normalize_code("OBS-01ABCH"))
        self.assertRegex(self.code, r"^OBS-[0-9A-HJKMNP-TV-Z]{6}$")
        self.assertEqual(normalize_code(self.code), self.code)
        self.assertEqual(self.sign_in(code=self.code.lower().replace("-", " ")).json()["status"], "pin_setup_required")

    def test_setup_rules_single_use_and_session_identity(self):
        token = self.setup_token()
        for pin in ("111111", "123456", "987654", self.setup_pin[:6]):
            response = self.post(SET_PIN, {"setup_token": token, "new_pin": pin})
            self.assertEqual((response.status_code, response.json()["error"]["fields"]["new_pin"]["code"]),
                             (422, "pin_same_as_setup" if pin == self.setup_pin[:6] else "pin_too_simple"))
        response = self.post(SET_PIN, {"setup_token": token, "new_pin": PERSONAL})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertGreater(int(response.cookies[settings.SESSION_COOKIE_NAME]["max-age"]), 0)
        identity = self.phone.get(ME).json()
        self.assertEqual(identity["user"]["observer_code"], self.code)
        self.assertEqual(UUID(identity["user"]["id"]).version, 4)
        self.assertIsNone(identity["user"]["email"])
        self.assertGreater(identity["session_expires_at"], identity["server_time"])
        self.assertTrue(identity["server_time"].endswith("+01:00"))
        self.assertEqual(self.post(SET_PIN, {"setup_token": token, "new_pin": PERSONAL}).status_code, 401)
        self.assertEqual(self.sign_in(phone=Client(enforce_csrf_checks=True)).status_code, 401)
        credential = ObserverCode.objects.get(code=self.code)
        self.assertFalse(credential.setup_hash)
        self.assertNotIn(PERSONAL, credential.pin_hash)

    def test_setup_expiry_and_attempt_limit(self):
        token = self.setup_token()
        with patch("django.utils.timezone.now", return_value=timezone.now() + timedelta(minutes=10, seconds=1)):
            self.assertEqual(self.post(SET_PIN, {"setup_token": token, "new_pin": PERSONAL}).status_code, 401)
        token = self.setup_token()
        for _ in range(5):
            self.assertEqual(self.post(SET_PIN, {"setup_token": token, "new_pin": "111111"}).status_code, 422)
        self.assertEqual(self.post(SET_PIN, {"setup_token": token, "new_pin": PERSONAL}).status_code, 401)

    def test_wrong_code_and_wrong_pin_take_one_equal_cost_hash_and_have_same_response(self):
        missing = generate_code()
        while missing == self.code:
            missing = generate_code()
        from .observer_credentials import HASHER

        with patch.object(HASHER, "verify", wraps=HASHER.verify) as verifier:
            unknown = self.sign_in(code=missing, pin="99128642")
            wrong = self.sign_in(pin="99128642")
        self.assertEqual((unknown.status_code, unknown.content), (wrong.status_code, wrong.content))
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(verifier.call_count, 2)
        params = [call.args[1].split("$")[:2] for call in verifier.call_args_list]
        self.assertEqual(params[0], params[1])

    def test_temporary_and_permanent_locks_and_reset(self):
        first = timezone.now()
        for offset in (0, 16):
            with patch("django.utils.timezone.now", return_value=first + timedelta(minutes=offset)):
                for _ in range(4):
                    self.assertEqual(self.sign_in(pin="99128642").status_code, 401)
                locked = self.sign_in(pin="99128642")
                self.assertEqual(locked.status_code, 423)
                if offset == 0:
                    self.assertEqual(locked["Retry-After"], "900")
                    self.assertEqual(self.sign_in().status_code, 423)
                else:
                    self.assertNotIn("Retry-After", locked)
        with patch("django.utils.timezone.now", return_value=first + timedelta(days=2)):
            self.assertEqual(self.sign_in().status_code, 423)
        self.assertEqual(list(ObserverSecurityAlert.objects.order_by("pk").values_list("permanent", flat=True)), [False, True])
        output = StringIO()
        call_command("reset_observer_pin", self.code, stdout=output)
        replacement = output.getvalue().split()[1]
        self.assertEqual(self.sign_in(pin=replacement).json()["status"], "pin_setup_required")

    def test_ip_rate_limit_and_csrf(self):
        self.assertEqual(self.phone.post(SIGN_IN, {}, content_type="application/json").json()["error"]["code"], "csrf_failed")
        for _ in range(30):
            self.assertEqual(self.post(SIGN_IN, {}).status_code, 422)
        response = self.post(SIGN_IN, {})
        self.assertEqual(response.status_code, 429)
        self.assertIn("Retry-After", response)

    @override_settings(AUTH_TRUSTED_PROXY_IPS={"192.0.2.2"})
    def test_forwarded_ip_requires_a_trusted_immediate_peer(self):
        trusted = Client(REMOTE_ADDR="192.0.2.2", HTTP_X_FORWARDED_FOR="198.51.100.10")
        for _ in range(30):
            self.assertEqual(trusted.post(SIGN_IN, {}, content_type="application/json").status_code, 422)
        self.assertEqual(trusted.post(SIGN_IN, {}, content_type="application/json").status_code, 429)
        self.assertEqual(trusted.post(
            SIGN_IN, {}, content_type="application/json", HTTP_X_FORWARDED_FOR="198.51.100.11",
        ).status_code, 422)
        untrusted = Client(REMOTE_ADDR="192.0.2.3")
        for attempt in range(31):
            response = untrusted.post(
                SIGN_IN, {}, content_type="application/json", HTTP_X_FORWARDED_FOR=f"198.51.100.{attempt + 1}",
            )
            self.assertEqual(response.status_code, 429 if attempt == 30 else 422)

    def test_revoke_ends_two_clients_and_only_correct_pin_reveals_revocation(self):
        self.assertEqual(self.activate().status_code, 200)
        other = Client(enforce_csrf_checks=True)
        self.assertEqual(self.sign_in(PERSONAL, phone=other).status_code, 200)
        self.assertEqual(AccountSession.objects.count(), 2)
        call_command("revoke_observer_code", self.code, stdout=StringIO())
        self.assertFalse(AccountSession.objects.exists())
        self.assertFalse(self.phone.get(ME).json()["authenticated"])
        self.assertFalse(other.get(ME).json()["authenticated"])
        self.assertEqual(self.sign_in("831729").status_code, 401)
        response = self.sign_in(PERSONAL)
        self.assertEqual((response.status_code, response.json()["error"]["code"]), (403, "code_revoked"))

    def test_change_pin_rejects_wrong_current_pin_and_weak_replacement(self):
        payload = {"current_pin": PERSONAL, "new_pin": "926471"}
        self.assertEqual(self.post(CHANGE_PIN, payload).status_code, 401)
        self.assertEqual(self.activate().status_code, 200)
        result = self.post(CHANGE_PIN, {**payload, "current_pin": "831729"})
        self.assertEqual((result.status_code, result.json()["error"]["code"]), (401, "invalid_credentials"))
        for replacement, expected in (
            ("123456", "pin_too_simple"), (PERSONAL, "pin_reused"),
            (self.setup_pin[:6], "pin_same_as_setup"),
        ):
            response = self.post(CHANGE_PIN, {**payload, "new_pin": replacement})
            self.assertEqual(
                (response.status_code, response.json()["error"]["fields"]["new_pin"]["code"]),
                (422, expected),
            )

    def test_change_pin_preserves_other_sessions_and_revocation_still_ends_them(self):
        self.assertEqual(self.activate().status_code, 200)
        other = Client(enforce_csrf_checks=True)
        self.assertEqual(self.sign_in(PERSONAL, phone=other).status_code, 200)
        before = set(AccountSession.objects.values_list("key", flat=True))
        self.assertEqual(self.post(CHANGE_PIN, {"current_pin": PERSONAL, "new_pin": "926471"}).status_code, 204)
        self.assertEqual(set(AccountSession.objects.values_list("key", flat=True)), before)
        self.assertTrue(self.phone.get(ME).json()["authenticated"])
        self.assertTrue(other.get(ME).json()["authenticated"])

        third = Client(enforce_csrf_checks=True)
        self.assertEqual(self.sign_in(PERSONAL, phone=third).status_code, 401)
        self.assertEqual(self.sign_in("926471", phone=third).status_code, 200)
        call_command("revoke_observer_code", self.code, stdout=StringIO())
        self.assertFalse(other.get(ME).json()["authenticated"])

    def test_sign_out_everywhere_and_anonymous_me(self):
        self.assertEqual(self.phone.get(ME).json()["user"], None)
        self.assertEqual(self.activate().status_code, 200)
        other = Client(enforce_csrf_checks=True)
        self.assertEqual(self.sign_in(PERSONAL, phone=other).status_code, 200)
        self.assertEqual(self.post(SIGN_OUT, {"everywhere": True}).status_code, 204)
        self.assertFalse(other.get(ME).json()["authenticated"])
        self.assertEqual(self.post(SIGN_OUT, {"everywhere": True}).status_code, 204)

    def test_legacy_staff_sign_in_keeps_browser_session_and_supports_everywhere(self):
        staff = User.objects.create_user(
            "staff@fictional.example", "synthetic-staff-password", role=User.Role.REVIEWER,
        )
        old_phone = Client()
        old_phone.force_login(staff)
        token = self.phone.get("/api/auth/csrf").json()["csrfToken"]
        signed_in = self.phone.post("/api/auth/sign-in", {
            "email": staff.email, "password": "synthetic-staff-password",
        }, HTTP_X_CSRFTOKEN=token)
        self.assertEqual(signed_in.status_code, 200)
        self.assertFalse(signed_in.cookies[settings.SESSION_COOKIE_NAME]["max-age"])
        self.assertEqual(self.phone.get(ME).json()["user"]["email"], staff.email)
        self.assertEqual(self.post(SIGN_OUT, {"everywhere": True}).status_code, 204)
        self.assertFalse(old_phone.get(ME).json()["authenticated"])

    def test_idle_and_absolute_expiry(self):
        self.assertEqual(self.activate().status_code, 200)
        tracked = AccountSession.objects.get()
        session = Session.objects.get(pk=tracked.key)
        self.assertLessEqual(session.expire_date, timezone.now() + timedelta(hours=24))
        self.assertGreater(tracked.absolute_expires_at, timezone.now() + timedelta(days=6))
        Session.objects.filter(pk=tracked.key).update(expire_date=timezone.now() - timedelta(seconds=1))
        self.assertFalse(self.phone.get(ME).json()["authenticated"])
        self.assertEqual(self.sign_in(PERSONAL).status_code, 200)
        AccountSession.objects.update(absolute_expires_at=timezone.now() - timedelta(seconds=1))
        self.assertFalse(self.phone.get(ME).json()["authenticated"])

    def test_other_organisation_reports_are_invisible(self):
        self.assertEqual(self.activate().status_code, 200)
        home_user = ObserverCode.objects.get(code=self.code).user
        group = Organisation.objects.create(name="Second fictional organisation")
        output = StringIO()
        call_command("issue_observer_codes", count=1, label="Other batch", organisation=str(group.pk), stdout=output)
        code, setup_pin = output.getvalue().strip().split()
        other = Client(enforce_csrf_checks=True)
        token = self.sign_in(setup_pin, code, other).json()["setup_token"]
        self.assertEqual(self.post(SET_PIN, {"setup_token": token, "new_pin": PERSONAL}, other).status_code, 200)
        self.assertEqual(other.get(ME).json()["user"]["organisation"]["id"], str(group.pk))
        report = Report.objects.create(
            observer=home_user, submission_key=uuid4(), occurred_at=timezone.now(),
            location="Fictional venue", description="Synthetic report",
        )
        self.assertEqual(self.phone.get(f"/api/reports/{report.pk}").status_code, 200)
        self.assertEqual(other.get(f"/api/reports/{report.pk}").status_code, 404)
        self.assertEqual(other.get("/api/reports").json(), [])
        # A mismatched ownership link alone must never bypass the organisation boundary.
        Report.objects.filter(pk=report.pk).update(observer=ObserverCode.objects.get(code=code).user)
        self.assertEqual(other.get(f"/api/reports/{report.pk}").status_code, 404)
        self.assertEqual(other.get("/api/reports").json(), [])
