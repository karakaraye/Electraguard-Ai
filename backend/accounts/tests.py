from concurrent.futures import ThreadPoolExecutor
from io import StringIO
from threading import Barrier
from unittest.mock import patch
from uuid import uuid4

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from reports.models import Report, ReviewEvent

from .models import AccountOffboarding, User


TEST_PASSWORD = "fictional durable field account passphrase"


def offboard(email, authorized_by):
    call_command(
        "offboard_account", "--email", email, "--authorized-by", authorized_by,
        "--reason", AccountOffboarding.Reason.ACCESS_ENDED, stdout=StringIO(),
    )


class AccountProvisioningTests(TestCase):
    command = "accounts.management.commands.provision_account"

    def provision(self, email, password, confirmation):
        with (
            patch(f"{self.command}.sys.stdin.isatty", return_value=True),
            patch(f"{self.command}.sys.stderr.isatty", return_value=True),
            patch(f"{self.command}.getpass", side_effect=[password, confirmation]),
        ):
            call_command(
                "provision_account", "--email", email, "--role", User.Role.ADMINISTRATOR,
                stdout=StringIO(),
            )

    def test_named_account_has_only_the_application_role(self):
        password = "Test-only cedar ridge weatherproof 5"
        self.provision("Operator@tests.example", password, password)
        account = User.objects.get(email="operator@tests.example")
        self.assertEqual(account.role, User.Role.ADMINISTRATOR)
        self.assertFalse(account.is_staff)
        self.assertFalse(account.is_superuser)
        self.assertTrue(account.check_password(password))
        with self.assertRaisesMessage(CommandError, "already exists"):
            self.provision(account.email, "another credential", "another credential")
        account.refresh_from_db()
        self.assertTrue(account.check_password(password))

    def test_weak_or_unconfirmed_password_creates_no_account(self):
        for password, confirmation in (("weak", "weak"), ("first input", "different input")):
            with self.subTest(password=password), self.assertRaises(CommandError):
                self.provision("operator@tests.example", password, confirmation)
        self.assertFalse(User.objects.exists())


class AccountOffboardingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user("admin@tests.example", TEST_PASSWORD, role=User.Role.ADMINISTRATOR)
        cls.reviewer = User.objects.create_user("reviewer@tests.example", TEST_PASSWORD, role=User.Role.REVIEWER)
        cls.observer = User.objects.create_user("observer@tests.example", TEST_PASSWORD, role=User.Role.OBSERVER)

    def test_offboarding_revokes_all_sessions_and_preserves_assignments_and_previous_actor(self):
        report = Report.objects.create(
            observer=self.observer, assigned_reviewer=self.reviewer, version=1,
            status=Report.Status.IN_REVIEW, submission_key=uuid4(),
            occurred_at="2026-03-12T09:00:00+01:00", location="Example hall",
            description="Example account for isolation checks.",
        )
        event = ReviewEvent.objects.create(
            report=report, actor=self.reviewer, version=1, action=ReviewEvent.Action.START,
            change={"from_status": "submitted", "to_status": "in_review"},
        )
        first, second = APIClient(), APIClient()
        for browser in (first, second):
            browser.force_login(self.reviewer)
            self.assertEqual(browser.get(f"/api/review/{report.pk}").status_code, 200)
        session_cookie = settings.SESSION_COOKIE_NAME
        old_cookies = [browser.cookies[session_cookie].value for browser in (first, second)]
        self.assertNotEqual(*old_cookies)

        offboard(self.reviewer.email.upper(), self.admin.email)

        for browser in (first, second):
            self.assertEqual(browser.get("/api/auth/me").status_code, 403)
            self.assertEqual(browser.get(f"/api/review/{report.pk}").status_code, 403)
        self.reviewer.refresh_from_db()
        self.assertFalse(self.reviewer.is_active)
        self.assertFalse(self.reviewer.has_usable_password())
        attempt = APIClient(enforce_csrf_checks=True)
        csrf = attempt.get("/api/auth/csrf").json()["csrfToken"]
        response = attempt.post(
            "/api/auth/sign-in", {"email": self.reviewer.email, "password": TEST_PASSWORD},
            HTTP_X_CSRFTOKEN=csrf,
        )
        self.assertEqual(response.status_code, 401)

        offboard(self.reviewer.email, self.admin.email)
        audit = AccountOffboarding.objects.get(account=self.reviewer)
        self.assertEqual(audit.authorized_by, self.admin)
        self.assertEqual(audit.role, User.Role.REVIEWER)
        self.assertEqual(audit.reason, AccountOffboarding.Reason.ACCESS_ENDED)
        event.refresh_from_db()
        self.assertEqual(event.actor, self.reviewer)

        admin = APIClient()
        admin.force_login(self.admin)
        assignments = admin.get("/api/assignments").json()
        self.assertEqual(assignments["reports"][0]["reviewer"], self.reviewer.email)
        self.assertEqual(assignments["reviewers"], [])
        self.assertEqual(admin.post(
            f"/api/assignments/{report.pk}", {"reviewer": self.reviewer.pk, "version": 1}, format="json",
        ).status_code, 400)
        replacement = User.objects.create_user("next@tests.example", TEST_PASSWORD, role=User.Role.REVIEWER)
        self.assertEqual(admin.post(
            f"/api/assignments/{report.pk}", {"reviewer": replacement.pk, "version": 1}, format="json",
        ).status_code, 200)
        report.refresh_from_db()
        self.assertEqual(report.assigned_reviewer, replacement)
        self.assertEqual(report.status, Report.Status.IN_REVIEW)

        self.reviewer.is_active = True
        self.reviewer.set_password("New credential from a separate lifecycle operation")
        self.reviewer.save(update_fields=["is_active", "password"])
        for cookie in old_cookies:
            browser = APIClient()
            browser.cookies[session_cookie] = cookie
            self.assertEqual(browser.get("/api/auth/me").status_code, 403)

    def test_refuses_last_administrator_and_ineligible_approver(self):
        with self.assertRaisesMessage(CommandError, "last active"):
            offboard(self.admin.email, self.admin.email)
        with self.assertRaisesMessage(CommandError, "active application Administrator"):
            offboard(self.reviewer.email, self.observer.email)
        self.assertFalse(AccountOffboarding.objects.exists())
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_audit_failure_rolls_back_deactivation(self):
        with patch("accounts.management.commands.offboard_account.AccountOffboarding.objects.create",
                   side_effect=RuntimeError("audit failure")):
            with self.assertRaisesMessage(RuntimeError, "audit failure"):
                offboard(self.reviewer.email, self.admin.email)
        self.reviewer.refresh_from_db()
        self.assertTrue(self.reviewer.is_active)
        self.assertTrue(self.reviewer.check_password(TEST_PASSWORD))
        self.assertFalse(AccountOffboarding.objects.exists())


class AccountOffboardingConcurrencyTests(TransactionTestCase):
    def test_concurrent_administrator_offboarding_leaves_one_active(self):
        if connection.vendor != "postgresql":
            self.skipTest("This check needs PostgreSQL row locks.")
        accounts = [
            User.objects.create_user(f"admin-{index}@tests.example", TEST_PASSWORD, role=User.Role.ADMINISTRATOR)
            for index in range(2)
        ]
        gate = Barrier(2, timeout=10)

        def depart(account):
            close_old_connections()
            try:
                gate.wait()
                offboard(account.email, account.email)
                return "offboarded"
            except CommandError as exc:
                return str(exc)
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(depart, accounts))
        self.assertCountEqual(results, ["offboarded", "Cannot offboard the last active application Administrator."])
        self.assertEqual(User.objects.filter(role=User.Role.ADMINISTRATOR, is_active=True).count(), 1)
        self.assertEqual(AccountOffboarding.objects.count(), 1)


class SessionAndRoleTests(TestCase):
    password = "fictional-test-password"
    me = "/api/auth/me"
    sign_in = "/api/auth/sign-in"
    sign_out = "/api/auth/sign-out"

    @classmethod
    def setUpTestData(cls):
        cls.users = {
            role: User.objects.create_user(f"{role}@tests.example", cls.password, role=role)
            for role in User.Role
        }

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)

    def csrf(self):
        return self.client.get("/api/auth/csrf").json()["csrfToken"]

    def credentials(self, role):
        return {"email": self.users[role].email.upper(), "password": self.password}

    def test_anonymous_access_is_denied(self):
        self.assertEqual(self.client.get(self.me).status_code, 403)
        self.assertEqual(self.client.post(self.sign_out).status_code, 403)
        for role in User.Role:
            self.assertEqual(self.client.get(f"/api/workspaces/{role}").status_code, 403)

    @override_settings(OBSERVATION_INTAKE_ENABLED=False)
    def test_restore_revocation_invalidates_cookie_without_disabling_user(self):
        role = User.Role.REVIEWER
        self.client.force_login(self.users[role])
        self.assertEqual(self.client.get(self.me).status_code, 200)
        args = ("revoke_restored_sessions", "--isolated-restore", "--confirm-database")
        with self.assertRaisesMessage(CommandError, "confirmation does not match"):
            call_command(*args, "wrong_database", stdout=StringIO())
        with override_settings(OBSERVATION_INTAKE_ENABLED=True):
            with self.assertRaisesMessage(CommandError, "Pause intake"):
                call_command(*args, connection.settings_dict["NAME"], stdout=StringIO())
        self.assertEqual(self.client.get(self.me).status_code, 200)

        output = StringIO()
        call_command(*args, connection.settings_dict["NAME"], stdout=output)
        self.assertIn("Revoked restored sessions: 1.", output.getvalue())
        self.assertEqual(self.client.get(self.me).status_code, 403)
        self.assertEqual(self.client.post(
            self.sign_in, self.credentials(role), HTTP_X_CSRFTOKEN=self.csrf(),
        ).status_code, 200)

    def test_every_role_can_access_only_its_own_workspace(self):
        for role, user in self.users.items():
            with self.subTest(role=role):
                response = self.client.post(
                    self.sign_in, self.credentials(role), HTTP_X_CSRFTOKEN=self.csrf()
                )
                self.assertEqual(response.status_code, 200)
                expected_role = User.Role.ADMINISTRATOR if role == User.Role.COORDINATOR else role
                self.assertEqual(self.client.get(self.me).json(), {"email": user.email, "role": expected_role})
                for workspace in User.Role:
                    response = self.client.get(f"/api/workspaces/{workspace}")
                    permitted = workspace == role or workspace == expected_role
                    self.assertEqual(response.status_code, 200 if permitted else 403)
                    if permitted:
                        self.assertEqual(response.json()["title"], f"{workspace.label} Workspace")

                self.assertEqual(self.client.post(self.sign_out).status_code, 403)
                self.assertEqual(
                    self.client.post(self.sign_out, HTTP_X_CSRFTOKEN=self.csrf()).status_code, 204
                )
                self.assertEqual(self.client.get(self.me).status_code, 403)
                self.assertEqual(self.client.get(f"/api/workspaces/{role}").status_code, 403)

    def test_sign_in_requires_csrf_and_valid_credentials(self):
        credentials = self.credentials(User.Role.OBSERVER)
        self.assertEqual(self.client.post(self.sign_in, credentials).status_code, 403)
        credentials["password"] = "incorrect"
        self.assertEqual(
            self.client.post(self.sign_in, credentials, HTTP_X_CSRFTOKEN=self.csrf()).status_code,
            401,
        )
        self.assertEqual(self.client.get(self.me).status_code, 403)

    def test_application_administrator_and_django_superuser_are_independent(self):
        administrator = self.users[User.Role.ADMINISTRATOR]
        self.assertFalse(administrator.is_staff)
        self.assertFalse(administrator.is_superuser)
        superuser = User.objects.create_superuser("superuser@tests.example", self.password)
        self.client.force_login(superuser)
        self.assertEqual(self.client.get("/api/workspaces/administrator").status_code, 403)
