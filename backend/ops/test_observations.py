from datetime import timedelta
from uuid import uuid4

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from accounts.staff_sessions import VERIFIED
from staff.test_support import bind_staff_session
from reports.models import Report


class OperationsTests(TestCase):
    def setUp(self):
        self.actor = User.objects.create_user("coordinator@example.org", role="coordinator")
        self.client.force_login(self.actor)
        session = self.client.session
        session[VERIFIED] = True
        session.save()
        bind_staff_session(session, self.actor)

    def observation(self, **details):
        return Report.objects.create(
            observer=self.actor, submission_key=uuid4(), occurred_at=timezone.now(),
            description="Private description",
            incident_details={
                "area": {"state_code": "KN", "lga_code": "KN-01", "lga_name": "LGA"},
                "category": "vote_buying", **details,
            },
        )

    def test_cluster_detects_threshold_and_can_be_reviewed(self):
        for _ in range(5):
            self.observation()
        old = self.observation()
        Report.objects.filter(pk=old.pk).update(occurred_at=timezone.now() - timedelta(hours=3))
        call_command("detect_observation_clusters")
        call_command("detect_observation_clusters")
        response = self.client.get("/api/v1/ops/clusters").json()
        self.assertEqual(len(response["items"]), 1)
        warning = response["items"][0]
        self.assertEqual(warning["report_count"], 5)
        self.assertEqual(warning["observed"], 5)
        self.assertIn(warning["baseline"], ["same_area_earlier", "peer_areas"])
        self.assertIn(warning["detector"], ["spike", "threshold"])
        self.assertIsNotNone(warning["expected"])
        self.assertIn("vote buying", warning["explanation"])
        result = self.client.post(
            f'/api/v1/ops/clusters/{warning["id"]}/review', {"note": "Reviewed"}, content_type="application/json",
        )
        self.assertEqual(result.json()["status"], "reviewed")
        self.assertEqual(self.client.get("/api/v1/ops/clusters").json()["items"], [])

    def test_empty_coverage_and_invalid_stage(self):
        response = self.client.get("/api/v1/ops/coverage", {"stage": "opening"})
        self.assertEqual(response.json()["rows"], [])
        self.assertEqual(self.client.get("/api/v1/ops/coverage", {"stage": "bad"}).status_code, 422)
