from uuid import uuid4

from django.test import Client, TestCase

from accounts.models import User
from accounts.staff_auth import VERIFIED
from reports.models import Report


class StaffAccountsTests(TestCase):
    url = "/api/v1/admin/staff"

    def setUp(self):
        self.admin = User.objects.create_user("admin@example.org", role="org_admin")
        self.client.force_login(self.admin)
        session = self.client.session
        session[VERIFIED] = True
        session.save()

    def test_invite_acceptance_roles_and_offboarding(self):
        invited = self.client.post(self.url, {
            "email": "reviewer@example.org", "display_name": "Ada Reviewer", "roles": ["reviewer", "moderator"],
        }, content_type="application/json", HTTP_IDEMPOTENCY_KEY=str(uuid4()))
        self.assertEqual(invited.status_code, 201)
        token = invited.json()["invite"]["url"].split("=")[1]
        accepted = Client().post("/api/v1/auth/staff/invite", {
            "token": token, "password": "whales-in-the-midnight-sea-87",
        }, content_type="application/json")
        self.assertEqual(accepted.json()["status"], "totp_enrolment_required")
        user = User.objects.get(email="reviewer@example.org")
        self.assertEqual(user.effective_roles, ["reviewer", "moderator"])
        report = Report.objects.create(observer=self.admin, assigned_reviewer=user, submission_key=uuid4())
        response = self.client.post(
            f"{self.url}/{user.public_id}/offboard", {"version": 0, "reason": "access_ended"},
            content_type="application/json",
        )
        self.assertEqual(response.json()["staff"]["status"], "offboarded")
        report.refresh_from_db()
        self.assertIsNone(report.assigned_reviewer_id)

    def test_last_admin_cannot_remove_own_role(self):
        response = self.client.patch(
            f"{self.url}/{self.admin.public_id}", {"version": 0, "roles": ["coordinator"]},
            content_type="application/json",
        )
        self.assertEqual(response.json()["error"]["code"], "last_admin")
