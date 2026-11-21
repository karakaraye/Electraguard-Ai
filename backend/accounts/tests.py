from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from rest_framework.test import APIClient

from .models import User


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

    def test_every_role_can_access_only_its_own_workspace(self):
        for role, user in self.users.items():
            with self.subTest(role=role):
                response = self.client.post(
                    self.sign_in, self.credentials(role), HTTP_X_CSRFTOKEN=self.csrf()
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(self.client.get(self.me).json(), {"email": user.email, "role": role})
                for workspace in User.Role:
                    response = self.client.get(f"/api/workspaces/{workspace}")
                    self.assertEqual(response.status_code, 200 if workspace == role else 403)
                    if workspace == role:
                        self.assertEqual(response.json()["title"], f"{role.label} Workspace")

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
