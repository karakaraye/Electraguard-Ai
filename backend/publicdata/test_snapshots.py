from datetime import timedelta
from uuid import uuid4

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import Organisation, User
from accounts.staff_sessions import VERIFIED
from staff.test_support import bind_staff_session
from reports.models import Report, ReviewEvent

from .models import Snapshot


class SnapshotTests(TestCase):
    url = "/api/v1/publish/snapshots"
    results = "/api/v1/public/results"

    def setUp(self):
        self.actor = User.objects.create_user("coordinator@example.org", role="coordinator")
        self.client.force_login(self.actor)
        session = self.client.session
        session[VERIFIED] = True
        session.save()
        bind_staff_session(session, self.actor)

    def write(self, url, data, *, key=None, method="post"):
        return getattr(self.client, method)(
            url, data, content_type="application/json", HTTP_IDEMPOTENCY_KEY=str(key or uuid4()),
        )

    def observations(self, count, category, *, ago=120):
        for _ in range(count):
            report = Report.objects.create(
                observer=self.actor, submission_key=uuid4(), description="Private observation",
                status=Report.Status.CLOSED, occurred_at=timezone.now() - timedelta(minutes=ago),
                incident_details={
                    "category": category, "area": {"state_code": "KN", "state_name": "Kano", "ward_code": "private"},
                },
            )
            ReviewEvent.objects.create(
                report=report, actor=self.actor, action=ReviewEvent.Action.CLOSE, version=1,
                change={"outcome": "corroborated"},
            )

    def test_publish_suppression_delay_replay_and_etag(self):
        self.observations(6, "good_practice")
        self.observations(1, "late_materials")
        self.observations(1, "good_practice", ago=15)
        key = uuid4()
        response = self.write(self.url, {}, key=key)
        self.assertEqual(response.status_code, 201)
        draft = response.json()
        self.assertEqual(self.write(self.url, {}, key=key)["Idempotent-Replayed"], "true")
        self.assertEqual(draft["excluded"]["after_cutoff"], 1)
        self.assertEqual(self.client.get(self.results).json()["snapshots"], [])
        # A lone hidden state/category count must hide the next smallest value.
        cells = draft["preview"]["by_state"][0]["by_category"]
        self.assertTrue(cells["late_materials"]["suppressed"])
        self.assertTrue(cells["good_practice"]["suppressed"])
        approve = f'{self.url}/{draft["id"]}/approve'
        self.assertEqual(self.write(approve, {"version": 1}).json()["error"]["code"], "stale_version")
        self.assertEqual(self.write(approve, {"version": 0}).status_code, 200)
        result = self.client.get(self.results)
        self.assertEqual(result.json()["snapshots"][0]["total"]["count"], 7)
        self.assertNotContains(result, "ward_code")
        self.assertNotContains(result, "Private observation")
        self.assertEqual(self.client.get(self.results, HTTP_IF_NONE_MATCH=result["ETag"]).status_code, 304)
        self.assertEqual(
            self.write(self.url, {"cutoff": timezone.now().isoformat()}).status_code, 422,
        )

    def test_discard_and_scope(self):
        draft = self.write(self.url, {}).json()
        other = Organisation.objects.create(name="Other")
        Snapshot.objects.filter(pk=draft["id"]).update(organisation=other)
        self.assertEqual(self.client.get(f'{self.url}/{draft["id"]}').status_code, 404)
        Snapshot.objects.filter(pk=draft["id"]).update(organisation=self.actor.organisation)
        self.assertEqual(self.write(f'{self.url}/{draft["id"]}/discard', {"version": 0}).status_code, 200)
        self.assertEqual(
            self.write(f'{self.url}/{draft["id"]}/approve', {"version": 1}).json()["error"]["code"],
            "invalid_transition",
        )

    def test_schedule_publishes_hourly(self):
        response = self.write("/api/v1/publish/schedule", {"version": 0, "hourly": True}, method="put")
        self.assertEqual(response.status_code, 200)
        call_command("publish_hourly_snapshots")
        call_command("publish_hourly_snapshots")
        self.assertEqual(Snapshot.objects.count(), 1)
        self.assertEqual(Snapshot.objects.get().approved_by, self.actor)
