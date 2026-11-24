import math
from datetime import datetime, time, timedelta, timezone as dt_timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import Organisation, User
from accounts.staff_sessions import VERIFIED
from ops.emerging import (
    WAT,
    benjamini_hochberg,
    build_plain_explanation,
    cusum,
    detect_emerging,
    poisson_tail,
    q_values,
)
from ops.models import ClusterSettings, ClusterWarning
from reports.models import Report
from staff.test_support import bind_staff_session


class EmergingStatisticsTests(TestCase):
    def test_poisson_tail_boundary_and_known_values(self):
        self.assertEqual(poisson_tail(0, 5.0), 1.0)
        self.assertEqual(poisson_tail(5, 0.0), 0.0)
        self.assertAlmostEqual(poisson_tail(1, 1.0), 1.0 - math.exp(-1.0), places=5)
        # 14 observed with expected 3.0 should be highly significant (< 1e-5)
        p = poisson_tail(14, 3.0)
        self.assertLess(p, 1e-5)
        self.assertGreater(p, 0.0)
        # Monotonicity: P(X >= k+1) <= P(X >= k)
        self.assertLessEqual(poisson_tail(6, 3.0), poisson_tail(5, 3.0))

    def test_benjamini_hochberg_fdr_control(self):
        p_vals = [0.001, 0.008, 0.03, 0.04, 0.15, 0.40]
        # At m=6, q=0.05:
        # rank 1: 0.001 <= 0.05*1/6 = 0.0083 (True)
        # rank 2: 0.008 <= 0.05*2/6 = 0.0167 (True)
        # rank 3: 0.03 <= 0.05*3/6 = 0.025 (False)
        # Cutoff rank = 2
        rejected = benjamini_hochberg(p_vals, q=0.05)
        self.assertEqual(rejected, [True, True, False, False, False, False])

        q = q_values(p_vals)
        for i in range(len(p_vals)):
            self.assertEqual(rejected[i], q[i] <= 0.05)

    def test_cusum_drift_accumulation(self):
        # Flat constant series produces zero CUSUM statistic
        flat = [2.0, 2.0, 2.0, 2.0, 2.0]
        s_flat = cusum(flat, mean=2.0, sd=1.0, k=0.5)
        self.assertEqual(s_flat, [0.0, 0.0, 0.0, 0.0, 0.0])

        # Sharply rising series accumulates substantial CUSUM statistic
        rising = [1.0, 2.0, 5.0, 8.0, 12.0]
        s_rising = cusum(rising, mean=2.0, sd=1.0, k=0.5)
        self.assertGreater(s_rising[-1], 4.0)

    def test_plain_explanation_builder(self):
        text = build_plain_explanation("intimidation_violence", "Dala", 60, 14, 3.0)
        self.assertEqual(text, "14 intimidation violence reports in Dala LGA in the last 60 minutes; about 3 expected")


class EmergingIssueDetectionIntegrationTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Electoral Watch NGO")
        self.coordinator = User.objects.create_user(
            "coord@elecwatch.org",
            role="coordinator",
            organisation=self.org,
        )
        self.client.force_login(self.coordinator)
        session = self.client.session
        session[VERIFIED] = True
        session.save()
        bind_staff_session(session, self.coordinator)

    def create_report(self, lga_code="KN-04", lga_name="Dala", state_code="KN", category="intimidation_violence", occurred_at=None, **extra):
        if occurred_at is None:
            occurred_at = timezone.now()
        details = {
            "area": {
                "state_code": state_code,
                "state_name": "Kano",
                "lga_code": lga_code,
                "lga_name": lga_name,
            },
            "category": category,
            **extra,
        }
        return Report.objects.create(
            organisation=self.org,
            observer=self.coordinator,
            submission_key=uuid4(),
            occurred_at=occurred_at,
            description="Observer description",
            incident_details=details,
        )

    def test_fallback_threshold_before_0900_wat(self):
        # Construct time at 08:30 WAT
        wat_now = datetime.combine(datetime.now(WAT).date(), time(8, 30), tzinfo=WAT)
        utc_now = wat_now.astimezone(dt_timezone.utc)

        # Create 5 reports in current window (8:00 - 8:30 WAT)
        for _ in range(5):
            self.create_report(occurred_at=utc_now - timedelta(minutes=10))

        alerts = detect_emerging(self.org.pk, now=utc_now)
        self.assertEqual(len(alerts), 1)
        alert = alerts[0]
        self.assertEqual(alert.detector, ClusterWarning.Detector.THRESHOLD)
        self.assertEqual(alert.baseline_kind, ClusterWarning.BaselineKind.THRESHOLD)
        self.assertEqual(alert.observed, 5)

    def test_statistical_spike_after_0900_wat(self):
        # Construct time at 11:30 WAT
        wat_now = datetime.combine(datetime.now(WAT).date(), time(11, 30), tzinfo=WAT)
        utc_now = wat_now.astimezone(dt_timezone.utc)

        # Baseline earlier today (06:00 to 10:30 WAT): 2 reports over 4.5 hours
        self.create_report(occurred_at=utc_now - timedelta(hours=4))
        self.create_report(occurred_at=utc_now - timedelta(hours=2))

        # Recent surge in last 30 minutes: 8 reports
        for _ in range(8):
            self.create_report(occurred_at=utc_now - timedelta(minutes=15))

        alerts = detect_emerging(self.org.pk, now=utc_now)
        self.assertEqual(len(alerts), 1)
        alert = alerts[0]
        self.assertEqual(alert.detector, ClusterWarning.Detector.SPIKE)
        self.assertEqual(alert.observed, 8)
        self.assertLess(alert.p_value, 0.01)
        self.assertLessEqual(alert.q_value, 0.05)
        self.assertEqual(alert.baseline_kind, ClusterWarning.BaselineKind.SAME_AREA_EARLIER)
        self.assertIn("Dala LGA", alert.explanation)

    def test_peer_areas_baseline_when_no_earlier_local_reports(self):
        wat_now = datetime.combine(datetime.now(WAT).date(), time(12, 0), tzinfo=WAT)
        utc_now = wat_now.astimezone(dt_timezone.utc)

        # Peer LGA 1 and 2 in same state have 1 report each in the window
        self.create_report(lga_code="KN-01", lga_name="Fagge", state_code="KN", occurred_at=utc_now - timedelta(minutes=10))
        self.create_report(lga_code="KN-02", lga_name="Nassarawa", state_code="KN", occurred_at=utc_now - timedelta(minutes=12))

        # Target LGA (Dala) has no earlier reports today, but 7 reports in current window
        for _ in range(7):
            self.create_report(lga_code="KN-04", lga_name="Dala", state_code="KN", occurred_at=utc_now - timedelta(minutes=5))

        alerts = detect_emerging(self.org.pk, now=utc_now)
        self.assertTrue(len(alerts) >= 1)
        dala_alert = next(a for a in alerts if a.lga_code == "KN-04")
        self.assertEqual(dala_alert.baseline_kind, ClusterWarning.BaselineKind.PEER_AREAS)
        self.assertEqual(dala_alert.observed, 7)

    def test_min_three_reports_required(self):
        wat_now = datetime.combine(datetime.now(WAT).date(), time(14, 0), tzinfo=WAT)
        utc_now = wat_now.astimezone(dt_timezone.utc)

        # Only 2 reports in the window -> must not trigger statistical alert
        self.create_report(occurred_at=utc_now - timedelta(minutes=5))
        self.create_report(occurred_at=utc_now - timedelta(minutes=10))

        alerts = detect_emerging(self.org.pk, now=utc_now)
        self.assertEqual(len(alerts), 0)

    def test_withdrawn_and_simulator_reports_excluded(self):
        wat_now = datetime.combine(datetime.now(WAT).date(), time(13, 0), tzinfo=WAT)
        utc_now = wat_now.astimezone(dt_timezone.utc)

        # 6 withdrawn reports
        for _ in range(6):
            r = self.create_report(occurred_at=utc_now - timedelta(minutes=10))
            r.status = Report.Status.WITHDRAWN
            r.save()

        # 6 simulator reports using the real incident_details['simulated'] flag
        for _ in range(6):
            self.create_report(occurred_at=utc_now - timedelta(minutes=10), simulated=True)

        alerts = detect_emerging(self.org.pk, now=utc_now)
        self.assertEqual(len(alerts), 0)

    def test_join_existing_open_alert_even_if_older_than_60m_and_never_join_reviewed(self):
        wat_now = datetime.combine(datetime.now(WAT).date(), time(10, 30), tzinfo=WAT)
        utc_now = wat_now.astimezone(dt_timezone.utc)

        for _ in range(5):
            self.create_report(occurred_at=utc_now - timedelta(minutes=20))
        alerts_1 = detect_emerging(self.org.pk, now=utc_now)
        self.assertEqual(len(alerts_1), 1)
        initial_id = alerts_1[0].pk

        # Coordinator notification fires exactly once
        from security.models import Alert
        self.assertEqual(
            Alert.objects.filter(organisation=self.org, rule="emerging_volume_spike", subject_key=f"cluster:{initial_id}").count(),
            1,
        )

        # 90 minutes later (> 60m), 5 more reports arrive -> still joins the open, unreviewed warning
        utc_now_2 = utc_now + timedelta(minutes=90)
        for _ in range(5):
            self.create_report(occurred_at=utc_now_2 - timedelta(minutes=5))
        alerts_2 = detect_emerging(self.org.pk, now=utc_now_2)
        self.assertEqual(len(alerts_2), 1)
        self.assertEqual(alerts_2[0].pk, initial_id)
        self.assertEqual(alerts_2[0].observed, 10)
        # Notification still fired only once
        self.assertEqual(
            Alert.objects.filter(organisation=self.org, rule="emerging_volume_spike", subject_key=f"cluster:{initial_id}").count(),
            1,
        )

        # Now coordinator reviews the warning; subsequent spike must open a NEW warning
        self.client.post(
            f"/api/v1/ops/clusters/{initial_id}/review",
            {"note": "Reviewed"},
            content_type="application/json",
        )
        utc_now_3 = utc_now_2 + timedelta(minutes=10)
        for _ in range(6):
            self.create_report(occurred_at=utc_now_3 - timedelta(minutes=2))
        alerts_3 = detect_emerging(self.org.pk, now=utc_now_3)
        self.assertEqual(len(alerts_3), 1)
        self.assertNotEqual(alerts_3[0].pk, initial_id)
        self.assertEqual(ClusterWarning.objects.filter(organisation=self.org).count(), 2)

    def test_drift_never_opens_warning_on_its_own(self):
        wat_now = datetime.combine(datetime.now(WAT).date(), time(11, 0), tzinfo=WAT)
        utc_now = wat_now.astimezone(dt_timezone.utc)
        # Gradual counts across 06:00-10:00 WAT (not enough in 30/60m window to pass BH spike)
        for h in range(4):
            for _ in range(2):
                self.create_report(occurred_at=utc_now - timedelta(hours=4 - h, minutes=10))
        # No open warning exists -> drift must NOT open a new warning
        alerts = detect_emerging(self.org.pk, now=utc_now)
        self.assertEqual(ClusterWarning.objects.filter(organisation=self.org).count(), 0)

    def test_ops_02_contract_api_fields(self):
        wat_now = datetime.combine(datetime.now(WAT).date(), time(15, 0), tzinfo=WAT)
        utc_now = wat_now.astimezone(dt_timezone.utc)

        for _ in range(6):
            self.create_report(occurred_at=utc_now - timedelta(minutes=10))
        detect_emerging(self.org.pk, now=utc_now)

        response = self.client.get("/api/v1/ops/clusters?status=open")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["items"]), 1)
        item = data["items"][0]

        # Verify all G17 contract fields including explanation_key and explanation_params
        self.assertIn("detector", item)
        self.assertIn(item["detector"], ["threshold", "spike", "drift"])
        self.assertEqual(item["observed"], 6)
        self.assertIn("expected", item)
        self.assertIsInstance(item["expected"], float)
        self.assertIn("p_value", item)
        self.assertIn("q_value", item)
        self.assertIn("window_minutes", item)
        self.assertIn(item["baseline"], ["same_area_earlier", "peer_areas"])
        self.assertIn("explanation", item)
        self.assertIn("Dala LGA", item["explanation"])
        self.assertEqual(item["explanation_key"], f"ops.alert.{item['detector']}")
        self.assertEqual(item["explanation_params"]["count"], 6)
        self.assertEqual(item["explanation_params"]["lga_name"], "Dala")

        # Review endpoint POST /api/v1/ops/clusters/{id}/review
        review_res = self.client.post(
            f"/api/v1/ops/clusters/{item['id']}/review",
            {"note": "Investigated by field coordinator"},
            content_type="application/json",
        )
        self.assertEqual(review_res.status_code, 200)
        self.assertEqual(review_res.json()["status"], "reviewed")

        # Open list is now empty
        open_res = self.client.get("/api/v1/ops/clusters?status=open")
        self.assertEqual(open_res.json()["items"], [])
