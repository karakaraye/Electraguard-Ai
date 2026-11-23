from uuid import uuid4

from django.test import TestCase

from accounts.models import Organisation, User
from accounts.staff_auth import VERIFIED
from reports.models import Report


class AssignmentTests(TestCase):
    url = "/api/v1/assignments"

    def test_list_suggests_reviewer_and_bulk_is_scoped_and_replayable(self):
        coordinator = User.objects.create_user("coordinator@example.org", role="coordinator")
        reviewer = User.objects.create_user("reviewer@example.org", role="reviewer")
        org = Organisation.objects.create(name="Other")
        local = Report.objects.create(
            observer=coordinator, submission_key=uuid4(), description="Private report",
        )
        external = Report.objects.create(observer=coordinator, organisation=org, submission_key=uuid4())
        self.client.force_login(coordinator)
        session = self.client.session
        session[VERIFIED] = True
        session.save()
        listed = self.client.get(self.url, {"assigned": "none"})
        self.assertNotContains(listed, "Private report")
        self.assertEqual(listed.json()["items"][0]["suggested_reviewer"]["id"], str(reviewer.public_id))
        body = {"items": [
            {"report_id": str(local.pk), "reviewer_id": "suggested", "version": 0},
            {"report_id": str(external.pk), "reviewer_id": str(reviewer.public_id), "version": 0},
        ]}
        key = str(uuid4())
        response = self.client.post(self.url, body, content_type="application/json", HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["results"][0]["ok"])
        self.assertEqual(response.json()["results"][1]["error"]["code"], "not_found")
        replay = self.client.post(self.url, body, content_type="application/json", HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(replay["Idempotent-Replayed"], "true")
        self.assertEqual(replay.json(), response.json())
