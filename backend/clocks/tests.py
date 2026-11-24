from datetime import timedelta
from uuid import uuid4

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import Organisation, User
from accounts.staff_sessions import VERIFIED
from clocks.calculator import (
    clock_json,
    get_or_create_clock,
    pause_clock,
    resume_clock,
    stop_clock,
)
from clocks.models import ReviewClock
from clocks.sweep import sweep_review_clocks
from reports.models import Report, ReviewEvent
from reports.workflow import record_change
from staff.audit import AuditEvent
from staff.test_support import bind_staff_session


class ReviewClocksTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Citizen Election Watch")
        self.reviewer = User.objects.create_user(
            "reviewer@cew.org",
            role=User.Role.REVIEWER,
            organisation=self.org,
        )
        self.coordinator = User.objects.create_user(
            "coord@cew.org",
            role=User.Role.COORDINATOR,
            organisation=self.org,
        )
        self.org_admin = User.objects.create_user(
            "admin@cew.org",
            role=User.Role.ORG_ADMIN,
            organisation=self.org,
        )
        self.client.force_login(self.reviewer)
        session = self.client.session
        session[VERIFIED] = True
        session.save()
        bind_staff_session(session, self.reviewer)

    def create_case(self, urgency="normal", danger_now=False, created_at=None, status=Report.Status.SUBMITTED):
        if created_at is None:
            created_at = timezone.now()
        is_danger = danger_now or (urgency == "urgent")
        cat_obs = "intimidation_violence" if urgency == "high" else ("other" if urgency == "normal" else "intimidation_violence")
        report = Report.objects.create(
            organisation=self.org,
            observer=self.reviewer,
            assigned_reviewer=self.reviewer,
            submission_key=uuid4(),
            occurred_at=created_at,
            status=status,
            description="Case description",
            incident_details={
                "area": {"state_code": "KN", "lga_code": "KN-04", "lga_name": "Dala"},
                "category": cat_obs,
                "category_observer": cat_obs,
                "urgency": urgency,
                "danger_now": is_danger,
            },
        )
        Report.objects.filter(pk=report.pk).update(created_at=created_at)
        report.refresh_from_db()
        return report

    def test_clock_creation_and_urgency_targets(self):
        # Urgent case: 15 min default
        urgent_case = self.create_case(urgency="urgent", danger_now=True)
        clock_urgent = get_or_create_clock(urgent_case)
        self.assertEqual(clock_urgent.target_minutes, 15)
        self.assertEqual(clock_urgent.urgency, "urgent")

        # Normal case: 240 min default
        normal_case = self.create_case(urgency="normal")
        clock_normal = get_or_create_clock(normal_case)
        self.assertEqual(clock_normal.target_minutes, 240)

    def test_clock_states_on_time_due_soon_overdue(self):
        now = timezone.now()
        # 1. On time: 10 minutes elapsed of 60 min target (50 min left > 25%)
        case_ontime = self.create_case(urgency="high", created_at=now - timedelta(minutes=10))
        json_ontime = clock_json(case_ontime, now=now)
        self.assertEqual(json_ontime["state"], "on_time")
        self.assertEqual(json_ontime["target_minutes"], 60)
        self.assertAlmostEqual(json_ontime["minutes_left"], 50, delta=1)

        # 2. Due soon: 50 minutes elapsed of 60 min target (10 min left <= 15 min / 25%)
        case_duesoon = self.create_case(urgency="high", created_at=now - timedelta(minutes=50))
        json_duesoon = clock_json(case_duesoon, now=now)
        self.assertEqual(json_duesoon["state"], "due_soon")
        self.assertAlmostEqual(json_duesoon["minutes_left"], 10, delta=1)

        # 3. Overdue: 75 minutes elapsed of 60 min target
        case_overdue = self.create_case(urgency="high", created_at=now - timedelta(minutes=75))
        json_overdue = clock_json(case_overdue, now=now)
        self.assertEqual(json_overdue["state"], "overdue")
        self.assertEqual(json_overdue["minutes_left"], 0)

    def test_clock_pause_on_question_and_resume_on_reply(self):
        t0 = timezone.now()
        case = self.create_case(urgency="high", created_at=t0)
        clock = get_or_create_clock(case, now=t0)

        # 20 minutes in, reviewer asks formal question -> pause clock
        t_question = t0 + timedelta(minutes=20)
        pause_clock(case, now=t_question)
        clock.refresh_from_db()
        self.assertTrue(clock.paused)
        self.assertEqual(clock.paused_at, t_question)

        # 40 minutes pass while waiting for observer (clock is paused)
        t_during_pause = t_question + timedelta(minutes=40)
        json_during = clock_json(case, now=t_during_pause)
        self.assertTrue(json_during["paused"])
        # Minutes left should still reflect 40 minutes remaining (60 - 20)
        self.assertAlmostEqual(json_during["minutes_left"], 40, delta=1)

        # Observer replies 50 minutes after question was asked -> resume clock
        t_reply = t_question + timedelta(minutes=50)
        resume_clock(case, now=t_reply)
        clock.refresh_from_db()
        self.assertFalse(clock.paused)
        self.assertIsNone(clock.paused_at)
        self.assertEqual(clock.paused_seconds, 50 * 60)
        # Due at has been shifted by 50 minutes
        self.assertEqual(clock.due_at, clock.started_at + timedelta(minutes=60, seconds=50 * 60))

    def test_clock_stops_on_first_reviewer_action(self):
        t0 = timezone.now()
        case = self.create_case(urgency="urgent", created_at=t0)
        clock = get_or_create_clock(case, now=t0)
        self.assertIsNone(clock.stopped_at)

        # Reviewer starts review at t0 + 5 min
        t_action = t0 + timedelta(minutes=5)
        stop_clock(case, now=t_action)
        clock.refresh_from_db()
        self.assertEqual(clock.stopped_at, t_action)
        self.assertEqual(clock.state, "on_time")

    def test_sweep_escalates_overdue_and_notifies_once(self):
        now = timezone.now()
        # Case created 2 hours ago with 15 min urgent target -> overdue
        overdue_case = self.create_case(urgency="urgent", created_at=now - timedelta(hours=2))
        get_or_create_clock(overdue_case)

        # Run sweep
        res = sweep_review_clocks(now=now)
        self.assertEqual(res["newly_overdue"], 1)
        self.assertEqual(res["total_overdue"], 1)

        # Verify audit event recorded
        self.assertTrue(
            AuditEvent.objects.filter(
                organisation_id=self.org.pk,
                action="case.overdue",
                object_id=str(overdue_case.pk),
            ).exists()
        )

        # Second sweep immediately after does NOT duplicate notification
        res2 = sweep_review_clocks(now=now)
        self.assertEqual(res2["newly_overdue"], 0)
        self.assertEqual(res2["total_overdue"], 1)
        self.assertEqual(
            AuditEvent.objects.filter(organisation_id=self.org.pk, action="case.overdue").count(),
            1,
        )

    def test_q_01_queue_and_clock_state_filter(self):
        now = timezone.now()
        # 1 overdue, 1 on_time
        overdue_case = self.create_case(urgency="urgent", created_at=now - timedelta(hours=1))
        ontime_case = self.create_case(urgency="normal", created_at=now - timedelta(minutes=5))

        # Test queue endpoint
        res = self.client.get("/api/v1/review/cases")
        self.assertEqual(res.status_code, 200)
        items = res.json()["items"]
        self.assertEqual(len(items), 2)
        for item in items:
            self.assertIn("clock", item)
            clock = item["clock"]
            self.assertIn("target_minutes", clock)
            self.assertIn("due_at", clock)
            self.assertIn("state", clock)
            self.assertIn("minutes_left", clock)
            self.assertIn("paused", clock)

        # Test filter by clock_state=overdue
        res_overdue = self.client.get("/api/v1/review/cases?clock_state=overdue")
        self.assertEqual(res_overdue.status_code, 200)
        overdue_items = res_overdue.json()["items"]
        self.assertEqual(len(overdue_items), 1)
        self.assertEqual(overdue_items[0]["id"], str(overdue_case.pk))

        # Test filter by clock_state=on_time
        res_ontime = self.client.get("/api/v1/review/cases?clock_state=on_time")
        self.assertEqual(res_ontime.status_code, 200)
        ontime_items = res_ontime.json()["items"]
        self.assertEqual(len(ontime_items), 1)
        self.assertEqual(ontime_items[0]["id"], str(ontime_case.pk))

    def test_ops_01_overview_includes_overdue_breakdown(self):
        now = timezone.now()
        # 1 urgent overdue, 1 high overdue
        self.create_case(urgency="urgent", created_at=now - timedelta(hours=1))
        self.create_case(urgency="high", created_at=now - timedelta(hours=2))
        self.create_case(urgency="normal", created_at=now - timedelta(minutes=10))

        # Login as coordinator
        self.client.force_login(self.coordinator)
        session = self.client.session
        session[VERIFIED] = True
        session.save()
        bind_staff_session(session, self.coordinator)

        res = self.client.get("/api/v1/ops/overview")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("overdue", data)
        self.assertEqual(data["overdue"]["urgent"], 1)
        self.assertEqual(data["overdue"]["high"], 1)
        self.assertEqual(data["overdue"]["normal"], 0)
        self.assertEqual(data["overdue"]["low"], 0)

    def test_adm_04_review_targets_crud(self):
        # Login as org_admin
        self.client.force_login(self.org_admin)
        session = self.client.session
        session[VERIFIED] = True
        session.save()
        bind_staff_session(session, self.org_admin)

        # 1. GET settings returns review_targets
        get_res = self.client.get("/api/v1/admin/settings")
        self.assertEqual(get_res.status_code, 200)
        settings = get_res.json()
        self.assertIn("review_targets", settings)
        self.assertEqual(settings["review_targets"]["urgent"], 15)
        self.assertEqual(settings["review_targets"]["question_reply"], 120)

        # 2. PATCH settings with valid review targets
        version = settings["version"]
        new_targets = {
            "urgent": 20,
            "high": 90,
            "normal": 300,
            "low": 600,
            "question_reply": 180,
        }
        patch_res = self.client.patch(
            "/api/v1/admin/settings",
            {"version": version, "review_targets": new_targets},
            content_type="application/json",
        )
        self.assertEqual(patch_res.status_code, 200)
        updated = patch_res.json()
        self.assertEqual(updated["review_targets"]["urgent"], 20)
        self.assertEqual(updated["review_targets"]["high"], 90)

        # 3. PATCH settings with invalid target value (< 5 min) -> 422
        invalid_targets = dict(new_targets)
        invalid_targets["urgent"] = 2  # below 5 min minimum
        bad_res = self.client.patch(
            "/api/v1/admin/settings",
            {"version": updated["version"], "review_targets": invalid_targets},
            content_type="application/json",
        )
        self.assertEqual(bad_res.status_code, 422)
