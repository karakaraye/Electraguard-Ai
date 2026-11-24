from datetime import datetime, time, timedelta, timezone as dt_timezone
from unittest.mock import patch
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from accounts.staff_sessions import VERIFIED
from staff.test_support import bind_staff_session
from reports.models import Report

WAT = ZoneInfo("Africa/Lagos")


class OperationsTests(TestCase):
    def setUp(self):
        self.actor = User.objects.create_user("coordinator@example.org", role="coordinator")
        self.client.force_login(self.actor)
        session = self.client.session
        session[VERIFIED] = True
        session.save()
        bind_staff_session(session, self.actor)

    def observation(self, occurred_at=None, **details):
        return Report.objects.create(
            observer=self.actor, submission_key=uuid4(), occurred_at=occurred_at or timezone.now(),
            description="Private description",
            incident_details={
                "area": {"state_code": "KN", "lga_code": "KN-01", "lga_name": "LGA"},
                "category": "vote_buying", **details,
            },
        )

    def test_cluster_detects_threshold_and_can_be_reviewed(self):
        fixed_now = datetime(2026, 11, 24, 8, 30, tzinfo=WAT).astimezone(dt_timezone.utc)
        for _ in range(5):
            self.observation(occurred_at=fixed_now - timedelta(minutes=10))
        self.observation(occurred_at=fixed_now - timedelta(hours=3))
        with patch("django.utils.timezone.now", return_value=fixed_now):
            call_command("detect_observation_clusters")
            call_command("detect_observation_clusters")
        response = self.client.get("/api/v1/ops/clusters").json()
        self.assertEqual(len(response["items"]), 1)
        warning = response["items"][0]
        self.assertEqual(warning["report_count"], 5)
        self.assertEqual(warning["expected"], 0.14)
        self.assertIsNone(warning["baseline"])
        self.assertEqual(warning["detector"], "threshold")
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
