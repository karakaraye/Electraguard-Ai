from datetime import date, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import ObserverCode, Organisation, User
from accounts.staff_sessions import VERIFIED
from clocks.calculator import (
    clock_json,
    create_initial_clock,
    start_question_reply_clock,
    stop_open_clocks,
)
from clocks.models import ReviewClock
from clocks.sweep import sweep_review_clocks
from reference.models import AreaDataset
from reports.models import Report, ReviewEvent, Triage
from security.models import Alert
from staff.audit import AuditEvent
from staff.test_support import bind_staff_session


class ReviewClocksTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Citizen Election Watch")
        self.other_org = Organisation.objects.create(name="Other Org")
        self.observer = User.objects.create_user(
            "obs@cew.org",
            role=User.Role.OBSERVER,
            organisation=self.org,
        )
        ObserverCode.objects.create(
            organisation=self.org,
            user=self.observer,
            code="OBS-CLOCK1",
            pin_hash="mock",
            status="active",
        )
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
        if not AreaDataset.objects.exists():
            AreaDataset.objects.create(
                version="2026.1",
                released_on=date(2026, 11, 20),
                revision=1,
                source=AreaDataset.Source.SYNTHETIC,
                index={},
                states={
                    "KN": {
                        "state_code": "KN", "name": "Kano",
                        "lgas": [{
                            "lga_code": "KN-04", "name": "Dala",
                            "wards": [{
                                "ward_code": "KN-04-01", "name": "Ward 1",
                                "units": [["KN-04-01-001", "PU 001"]],
                            }],
                        }],
                    }
                },
            )
        self.login_as(self.reviewer)

    def login_as(self, user):
        self.client.force_login(user)
        if user.role != User.Role.OBSERVER:
            session = self.client.session
            session[VERIFIED] = True
            session.save()
            bind_staff_session(session, user)

    def create_case(self, urgency="normal", danger_now=False, created_at=None, status=Report.Status.SUBMITTED, org=None):
        if created_at is None:
            created_at = timezone.now()
        target_org = org or self.org
        is_danger = danger_now or (urgency == "urgent")
        cat_obs = "intimidation_violence" if urgency == "high" else ("other" if urgency == "normal" else "intimidation_violence")
        report = Report.objects.create(
            organisation=target_org,
            observer=self.observer if target_org == self.org else None,
            assigned_reviewer=self.reviewer if target_org == self.org else None,
            receipt_code=f"EG-{uuid4().hex[:8].upper()}",
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
        create_initial_clock(report, now=created_at)
        return report

    def test_clock_created_on_intake_and_negative_minutes_left_when_overdue(self):
        self.login_as(self.observer)
        res = self.client.post(
            "/api/v1/reports",
            {
                "submission_key": str(uuid4()),
                "occurred_at": timezone.now().isoformat(),
                "description": "Urgent incident at unit.",
                "kind": "incident",
                "language": "en",
                "danger_now": True,
                "firsthand": True,
                "place": {"polling_unit_code": "KN-04-01-001", "ward_code": "KN-04-01"},
                "category_observer": "intimidation_violence",
            },
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(res.status_code, 201, res.content)
        report = Report.objects.get(pk=res.json()["id"])
        clock = ReviewClock.objects.filter(report=report, kind=ReviewClock.Kind.FIRST_ACTION).first()
        self.assertIsNotNone(clock)
        self.assertEqual(clock.target_minutes, 15)

        # Simulate 35 minutes elapsed -> overdue with negative minutes_left (-20)
        future = clock.started_at + timedelta(minutes=35)
        info = clock_json(report, now=future)
        self.assertEqual(info["state"], "overdue")
        self.assertEqual(info["minutes_left"], -20)
        self.assertTrue(info["due_at"].endswith("+01:00"))

    def test_case_01_and_q_01_clock_and_due_at_sort_and_stopped_exclusion(self):
        now = timezone.now()
        overdue_older = self.create_case(urgency="urgent", created_at=now - timedelta(minutes=60))
        overdue_newer = self.create_case(urgency="urgent", created_at=now - timedelta(minutes=30))
        ontime_case = self.create_case(urgency="normal", created_at=now - timedelta(minutes=5))
        stopped_case = self.create_case(urgency="urgent", created_at=now - timedelta(minutes=90), status=Report.Status.IN_REVIEW)

        self.login_as(self.reviewer)
        # CASE-01 includes clock
        case_res = self.client.get(f"/api/v1/review/cases/{overdue_newer.pk}")
        self.assertEqual(case_res.status_code, 200)
        case_data = case_res.json()
        self.assertIn("clock", case_data)
        self.assertEqual(case_data["clock"]["state"], "overdue")
        self.assertLess(case_data["clock"]["minutes_left"], 0)
        self.assertTrue(case_data["clock"]["due_at"].endswith("+01:00"))

        # Stopped clock reports state="stopped" and is excluded from clock_state=overdue
        stopped_res = self.client.get(f"/api/v1/review/cases/{stopped_case.pk}").json()
        self.assertEqual(stopped_res["clock"]["state"], "stopped")

        # Q-01 clock_state=overdue returns only running overdue cases, sorted by due_at ascending
        q_res = self.client.get("/api/v1/review/queue?clock_state=overdue")
        self.assertEqual(q_res.status_code, 200)
        items = q_res.json()["items"]
        self.assertEqual([i["id"] for i in items], [str(overdue_older.pk), str(overdue_newer.pk)])

    def test_urgency_correction_recomputes_due_at_from_started_at(self):
        now = timezone.now()
        case = self.create_case(urgency="normal", created_at=now - timedelta(minutes=10))
        Triage.objects.create(
            report=case, organisation=self.org, status=Triage.Status.READY, method_version="v1",
            suggestions={"urgency": {"value": "normal", "reasons": []}, "category": {"value": "other", "reasons": []}},
        )

        self.login_as(self.reviewer)
        res = self.client.post(
            f"/api/v1/review/cases/{case.pk}/suggestions/urgency",
            {"decision": "correct", "value": "urgent", "version": case.version},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(res.status_code, 200, res.content)
        clock = ReviewClock.objects.get(report=case, kind=ReviewClock.Kind.FIRST_ACTION)
        self.assertEqual(clock.target_minutes, 15)
        self.assertEqual(clock.due_at, clock.started_at + timedelta(minutes=15))

    def test_question_reply_clock_lifecycle_via_api(self):
        case = self.create_case(urgency="normal")
        self.login_as(self.reviewer)

        # 1. Reviewer starts review -> first_action clock stops
        r1 = self.client.post(
            f"/api/v1/review/cases/{case.pk}/actions",
            {"action": "start", "version": case.version},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(r1.status_code, 200, r1.content)
        first_clock = ReviewClock.objects.get(report=case, kind=ReviewClock.Kind.FIRST_ACTION)
        self.assertIsNotNone(first_clock.stopped_at)
        self.assertEqual(first_clock.state, "stopped")

        # 2. Reviewer asks formal question
        case.refresh_from_db()
        r2 = self.client.post(
            f"/api/v1/review/cases/{case.pk}/actions",
            {"action": "ask", "question": "Which gate?", "version": case.version},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(r2.status_code, 200, r2.content)
        case_data = self.client.get(f"/api/v1/review/cases/{case.pk}").json()
        q_id = case_data["open_question"]["id"]

        # 3. Observer replies -> starts question_reply clock (120 min)
        self.login_as(self.observer)
        r3 = self.client.post(
            f"/api/v1/reports/{case.pk}/messages",
            {"kind": "reply", "question_id": q_id, "body": "North gate."},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(r3.status_code, 201, r3.content)
        qr_clock = ReviewClock.objects.filter(report=case, kind=ReviewClock.Kind.QUESTION_REPLY).first()
        self.assertIsNotNone(qr_clock)
        self.assertEqual(qr_clock.target_minutes, 120)
        self.assertIsNone(qr_clock.stopped_at)

        # 4. Staff responds -> stops question_reply clock
        self.login_as(self.reviewer)
        case.refresh_from_db()
        r4 = self.client.post(
            f"/api/v1/reports/{case.pk}/messages",
            {"kind": "message", "body": "Thank you, noted.", "version": case.version},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(r4.status_code, 201, r4.content)
        qr_clock.refresh_from_db()
        self.assertIsNotNone(qr_clock.stopped_at)
        self.assertEqual(qr_clock.state, "stopped")

    def test_withdrawal_stops_clock(self):
        case = self.create_case(urgency="urgent")
        self.login_as(self.observer)
        res = self.client.post(
            f"/api/v1/reports/{case.pk}/withdraw",
            {"version": case.version, "confirm": True},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(res.status_code, 200, res.content)
        clock = ReviewClock.objects.get(report=case, kind=ReviewClock.Kind.FIRST_ACTION)
        self.assertIsNotNone(clock.stopped_at)
        self.assertEqual(clock.state, "stopped")

    def test_concurrent_sweeps_notify_once_and_org_isolation(self):
        now = timezone.now()
        c_org1 = self.create_case(urgency="urgent", created_at=now - timedelta(hours=1), org=self.org)
        c_org2 = self.create_case(urgency="urgent", created_at=now - timedelta(hours=1), org=self.other_org)

        res1 = sweep_review_clocks(now=now)
        res2 = sweep_review_clocks(now=now)
        self.assertEqual(res1["newly_overdue"], 2)
        self.assertEqual(res2["newly_overdue"], 0)

        self.assertEqual(Alert.objects.filter(organisation=self.org, rule="review_clock_overdue").count(), 1)
        self.assertEqual(Alert.objects.filter(organisation=self.other_org, rule="review_clock_overdue").count(), 1)
        self.assertEqual(AuditEvent.objects.filter(organisation=self.org, action="case.overdue").count(), 1)

        # OPS-01 overview is org-scoped and excludes stopped clocks
        self.login_as(self.coordinator)
        from_date = (now - timedelta(hours=1)).astimezone(timezone.get_current_timezone()).date().isoformat()
        to_date = now.astimezone(timezone.get_current_timezone()).date().isoformat()
        ov = self.client.get(f"/api/v1/ops/overview?from={from_date}&to={to_date}").json()
        self.assertEqual(ov["overdue"]["urgent"], 1)

    def test_backfill_creates_already_acted_cases_stopped(self):
        now = timezone.now()
        acted = Report.objects.create(
            organisation=self.org, observer=self.observer, submission_key=uuid4(),
            occurred_at=now - timedelta(hours=5), status=Report.Status.IN_REVIEW,
            description="Pre-deploy active case",
        )
        ReviewEvent.objects.create(
            report=acted, organisation=self.org, actor=self.reviewer,
            version=1, action=ReviewEvent.Action.START, change={"to_status": "in_review"},
        )
        call_command("backfill_review_clocks")
        clock = ReviewClock.objects.get(report=acted)
        self.assertIsNotNone(clock.stopped_at)
        self.assertEqual(clock.state, "stopped")

    def test_adm_04_partial_review_targets_and_recomputes_open_clocks(self):
        open_urgent = self.create_case(urgency="urgent")
        self.login_as(self.org_admin)
        settings = self.client.get("/api/v1/admin/settings").json()

        # Partial update of urgent target only
        patch = self.client.patch(
            "/api/v1/admin/settings",
            {"version": settings["version"], "review_targets": {"urgent": 30}},
            content_type="application/json",
        )
        self.assertEqual(patch.status_code, 200, patch.content)
        self.assertEqual(patch.json()["review_targets"]["urgent"], 30)
        self.assertEqual(patch.json()["review_targets"]["high"], 60)

        clock = ReviewClock.objects.get(report=open_urgent)
        self.assertEqual(clock.target_minutes, 30)
        self.assertEqual(clock.due_at, clock.started_at + timedelta(minutes=30))

        # Invalid value returns field_invalid
        bad = self.client.patch(
            "/api/v1/admin/settings",
            {"version": patch.json()["version"], "review_targets": {"urgent": 2}},
            content_type="application/json",
        )
        self.assertEqual(bad.status_code, 422)
        self.assertEqual(bad.json()["error"]["fields"]["review_targets"]["code"], "field_invalid")

    def test_q01_clock_state_paging_with_cursor(self):
        now = timezone.now()
        c1 = self.create_case(urgency="urgent", created_at=now - timedelta(hours=3))
        c2 = self.create_case(urgency="urgent", created_at=now - timedelta(hours=2))
        c3 = self.create_case(urgency="urgent", created_at=now - timedelta(hours=1))

        self.login_as(self.reviewer)
        page1 = self.client.get("/api/v1/review/queue?clock_state=overdue&limit=2")
        self.assertEqual(page1.status_code, 200, page1.content)
        d1 = page1.json()
        self.assertEqual(len(d1["items"]), 2)
        self.assertIsNotNone(d1["next_cursor"])

        page2 = self.client.get(f"/api/v1/review/queue?clock_state=overdue&limit=2&cursor={d1['next_cursor']}")
        self.assertEqual(page2.status_code, 200, page2.content)
        d2 = page2.json()
        self.assertEqual(len(d2["items"]), 1)
        self.assertIsNone(d2["next_cursor"])

        ids = [item["id"] for item in d1["items"]] + [item["id"] for item in d2["items"]]
        self.assertEqual(ids, [str(c1.pk), str(c2.pk), str(c3.pk)])

    def test_clock_follows_triage_urgency_update(self):
        from unittest.mock import MagicMock, patch
        import numpy as np
        from intelligence.triage import write_suggestions
        from reports.models import Triage

        now = timezone.now()
        report = self.create_case(urgency="normal", created_at=now - timedelta(minutes=20))
        clock = ReviewClock.objects.get(report=report, kind=ReviewClock.Kind.FIRST_ACTION)
        self.assertEqual(clock.target_minutes, 240)
        self.assertEqual(clock.urgency, "normal")

        job, _ = Triage.objects.get_or_create(report=report, organisation=self.org)
        fake_models = MagicMock()
        fake_models.category.classes_ = ["intimidation_violence"]
        fake_models.category.predict_proba.return_value = np.array([[0.95]])
        fake_models.abstain = 0.5
        fake_models.severity.predict_proba.return_value = np.array([[0.1, 0.9]])
        fake_models.urgency_threshold = 0.5

        with patch("intelligence.triage.incident_models", return_value=fake_models), \
             patch("intelligence.triage.suggest_duplicates"), \
             patch("intelligence.triage.suggest_cluster", return_value=False):
            write_suggestions(report, job)

        clock.refresh_from_db()
        self.assertEqual(clock.urgency, "urgent")
        self.assertEqual(clock.target_minutes, 15)
        self.assertEqual(clock.due_at, clock.started_at + timedelta(minutes=15))

        # OPS-01 overdue groups on the updated urgent level
        self.login_as(self.coordinator)
        from_date = (now - timedelta(hours=1)).astimezone(timezone.get_current_timezone()).date().isoformat()
        to_date = now.astimezone(timezone.get_current_timezone()).date().isoformat()
        ov = self.client.get(f"/api/v1/ops/overview?from={from_date}&to={to_date}").json()
        self.assertEqual(ov["overdue"]["urgent"], 1)
        self.assertEqual(ov["overdue"]["normal"], 0)


from django.test import TransactionTestCase


class ConcurrentSweepTests(TransactionTestCase):
    def test_concurrent_sweep_barrier_notifies_once(self):
        import threading
        from django.db import connections
        from accounts.models import Organisation
        from clocks.calculator import create_initial_clock
        from clocks.models import ReviewClock
        from clocks.sweep import sweep_review_clocks
        from reports.models import Report
        from security.models import Alert
        from staff.models import AuditEvent

        org = Organisation.objects.create(name="Concurrent Org")
        now = timezone.now()
        report = Report.objects.create(
            organisation=org,
            submission_key=uuid4(),
            occurred_at=now - timedelta(hours=2),
            description="Overdue concurrent test",
            incident_details={"kind": "incident", "danger_now": True},
        )
        Report.objects.filter(pk=report.pk).update(created_at=now - timedelta(hours=2))
        report.refresh_from_db()
        clock = create_initial_clock(report, now=now - timedelta(hours=2))

        barrier = threading.Barrier(2)
        errors = []
        results = []

        def worker():
            try:
                barrier.wait(timeout=10)
                results.append(sweep_review_clocks(now=now))
            except Exception as exc:
                errors.append(exc)
            finally:
                connections.close_all()

        t1 = threading.Thread(target=worker)
        t2 = threading.Thread(target=worker)
        t1.start()
        t2.start()
        t1.join(timeout=20)
        t2.join(timeout=20)

        self.assertEqual(errors, [])
        self.assertEqual(sum(r["newly_overdue"] for r in results), 1)
        clock.refresh_from_db()
        self.assertIsNotNone(clock.notified_at)
        self.assertEqual(Alert.objects.filter(organisation=org, rule="review_clock_overdue").count(), 1)
        self.assertEqual(AuditEvent.objects.filter(organisation=org, action="case.overdue").count(), 1)


class ReviewClockApiIntegrationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from accounts.models import Organisation, User

        call_command("load_reference_areas", verbosity=0)
        cls.org = Organisation.objects.create(name="Clock API Org")
        cls.other_org = Organisation.objects.create(name="Clock API Other Org")
        cls.reviewer = User.objects.create_user(
            email="api.rev@example.com", password="pw", organisation=cls.org, role=User.Role.REVIEWER
        )
        cls.coordinator = User.objects.create_user(
            email="api.coord@example.com", password="pw", organisation=cls.org, role=User.Role.COORDINATOR
        )

    def login_as(self, user):
        from accounts.staff_sessions import VERIFIED
        from staff.test_support import bind_staff_session

        self.client.force_login(user)
        session = self.client.session
        session[VERIFIED] = True
        session.save()
        bind_staff_session(session, user)

    def test_sms_and_ussd_intake_create_running_clock(self):
        from phone_channels.handlers import handle_sms, handle_ussd

        handle_sms(self.org, "+2348031112222", "sms-clk-1", "1234", "REPORT 4 Kano polling unit delayed")
        sms_report = Report.objects.filter(organisation=self.org).latest("created_at")
        sms_clock = ReviewClock.objects.get(report=sms_report, kind=ReviewClock.Kind.FIRST_ACTION)
        self.assertIsNone(sms_clock.stopped_at)

        handle_ussd(self.org, "+2348033334444", "ussd-clk-1", "*347*88#", "1*4*1*1*1*Ballot papers missing")
        ussd_resp, _ = handle_ussd(self.org, "+2348033334444", "ussd-clk-1", "*347*88#", "1*4*1*1*1*Ballot papers missing*1")
        self.assertIn("Received", ussd_resp, ussd_resp)
        ussd_report = Report.objects.filter(organisation=self.org).exclude(pk=sms_report.pk).latest("created_at")
        ussd_clock = ReviewClock.objects.get(report=ussd_report, kind=ReviewClock.Kind.FIRST_ACTION)
        self.assertIsNone(ussd_clock.stopped_at)

    def test_citizen_form_intake_creates_running_clock(self):
        import base64
        import secrets

        secret = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode("ascii")
        res = self.client.post(
            "/api/v1/public/reports",
            data={
                "kind": "incident",
                "language": "en",
                "category_observer": "not_sure",
                "danger_now": False,
                "firsthand": True,
                "description": "Long queue at ward 3 gate",
                "occurred_at": (timezone.now() - timedelta(minutes=10)).isoformat(),
                "receipt_secret": secret,
                "place": {"ward_code": "SYN-KN-01-01"},
            },
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(res.status_code, 201, res.content)
        report = Report.objects.get(pk=res.json()["id"])
        clock = ReviewClock.objects.get(report=report, kind=ReviewClock.Kind.FIRST_ACTION)
        self.assertIsNone(clock.stopped_at)

    def test_citizen_reply_starts_question_reply_clock_and_staff_message_stops_it(self):
        import base64
        import secrets
        from accounts.models import User
        from reports.v1_views import question_id

        secret = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode("ascii")
        res = self.client.post(
            "/api/v1/public/reports",
            data={
                "kind": "incident",
                "language": "en",
                "category_observer": "not_sure",
                "danger_now": False,
                "firsthand": True,
                "description": "Missing ink pad",
                "occurred_at": (timezone.now() - timedelta(minutes=10)).isoformat(),
                "receipt_secret": secret,
                "place": {"ward_code": "SYN-KN-01-01"},
            },
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        report = Report.objects.get(pk=data["id"])
        receipt_code = data["receipt_code"]

        pub_reviewer = User.objects.create_user(
            email="pub.rev@example.com", password="pw", organisation=report.organisation, role=User.Role.REVIEWER
        )
        report.assigned_reviewer = pub_reviewer
        report.save(update_fields=["assigned_reviewer"])
        self.login_as(pub_reviewer)
        start_res = self.client.post(
            f"/api/v1/review/cases/{report.pk}/actions",
            {"action": "start", "version": report.version},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(start_res.status_code, 200, start_res.content)
        report.refresh_from_db()
        ask_res = self.client.post(
            f"/api/v1/review/cases/{report.pk}/actions",
            {"action": "ask", "version": report.version, "question": "Which polling unit?"},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(ask_res.status_code, 200, ask_res.content)
        report.refresh_from_db()
        ev = ReviewEvent.objects.filter(report=report, action=ReviewEvent.Action.REQUEST_CLARIFICATION).latest("version")
        qid = question_id(report.pk, ev.version)

        # Citizen replies -> starts question_reply clock
        self.client.logout()
        rep_res = self.client.post(
            f"/api/v1/public/receipts/{receipt_code}/reply",
            {"question_id": qid, "body": "Unit 004 at primary school"},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
            HTTP_X_RECEIPT_SECRET=secret,
        )
        self.assertEqual(rep_res.status_code, 201, rep_res.content)
        qr_clock = ReviewClock.objects.get(report=report, kind=ReviewClock.Kind.QUESTION_REPLY)
        self.assertIsNone(qr_clock.stopped_at)

        # Staff sends message -> stops question_reply clock
        self.login_as(pub_reviewer)
        report.refresh_from_db()
        msg_res = self.client.post(
            f"/api/v1/reports/{report.pk}/messages",
            {"kind": "message", "version": report.version, "body": "Thank you, noted."},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(msg_res.status_code, 201, msg_res.content)
        qr_clock.refresh_from_db()
        self.assertIsNotNone(qr_clock.stopped_at)
        self.assertEqual(qr_clock.state, ReviewClock.State.STOPPED)

    def test_organisation_isolation_for_clocks(self):
        from accounts.models import User
        from clocks.calculator import create_initial_clock
        now = timezone.now()
        case_a = Report.objects.create(
            organisation=self.org,
            submission_key=uuid4(),
            occurred_at=now - timedelta(hours=1),
            description="Org A urgent case",
            incident_details={"kind": "incident", "danger_now": True},
        )
        Report.objects.filter(pk=case_a.pk).update(created_at=now - timedelta(hours=1))
        case_a.refresh_from_db()
        create_initial_clock(case_a, now=now - timedelta(hours=1))
        other_reviewer = User.objects.create_user(
            email="rev.b@example.com", password="pw", organisation=self.other_org, role=User.Role.REVIEWER
        )
        other_coord = User.objects.create_user(
            email="coord.b@example.com", password="pw", organisation=self.other_org, role=User.Role.COORDINATOR
        )

        self.login_as(other_reviewer)
        q_res = self.client.get("/api/v1/review/queue")
        self.assertEqual(q_res.status_code, 200)
        self.assertNotIn(str(case_a.pk), [item["id"] for item in q_res.json()["items"]])
        c_res = self.client.get(f"/api/v1/review/cases/{case_a.pk}")
        self.assertEqual(c_res.status_code, 404)

        self.login_as(other_coord)
        from_date = (now - timedelta(hours=1)).astimezone(timezone.get_current_timezone()).date().isoformat()
        to_date = now.astimezone(timezone.get_current_timezone()).date().isoformat()
        ov = self.client.get(f"/api/v1/ops/overview?from={from_date}&to={to_date}").json()
        self.assertEqual(ov["overdue"]["urgent"], 0)

    def test_persist_report_atomic_rolls_back_on_clock_failure(self):
        from unittest.mock import patch
        from reports.v1_views import persist_report
        initial_count = Report.objects.count()
        values = {
            "incident_details": {
                "kind": "incident",
                "area": {"polling_unit_name": "Test PU"},
            },
            "description": "Atomic test rollback description",
        }
        with patch("clocks.calculator.create_initial_clock", side_effect=RuntimeError("Simulated clock creation failure")):
            with self.assertRaises(RuntimeError):
                persist_report(None, self.org.pk, values)
        self.assertEqual(Report.objects.count(), initial_count)
        self.assertFalse(Report.objects.filter(description="Atomic test rollback description").exists())

    def test_notified_at_reset_when_clock_no_longer_overdue(self):
        from clocks.calculator import update_clock_urgency, recompute_org_open_clocks, create_initial_clock
        now = timezone.now()
        case = Report.objects.create(
            organisation=self.org,
            submission_key=uuid4(),
            occurred_at=now - timedelta(minutes=30),
            description="Urgent test case",
            incident_details={"kind": "incident", "danger_now": True},
        )
        Report.objects.filter(pk=case.pk).update(created_at=now - timedelta(minutes=30))
        case.refresh_from_db()
        clock = create_initial_clock(case, now=now - timedelta(minutes=30))
        clock.state = ReviewClock.State.OVERDUE
        clock.notified_at = now - timedelta(minutes=10)
        clock.save()

        # Downgrade urgency from urgent (15m target) to low (480m target)
        update_clock_urgency(case, "low", now=now)
        clock.refresh_from_db()
        self.assertEqual(clock.urgency, "low")
        self.assertNotEqual(clock.state, ReviewClock.State.OVERDUE)
        self.assertIsNone(clock.notified_at)

        # Make it overdue again and test recompute_org_open_clocks
        clock.state = ReviewClock.State.OVERDUE
        clock.notified_at = now
        clock.save()
        self.org.review_targets = {"low": 1440}
        self.org.save()
        recompute_org_open_clocks(self.org, now=now)
        clock.refresh_from_db()
        self.assertNotEqual(clock.state, ReviewClock.State.OVERDUE)
        self.assertIsNone(clock.notified_at)

    def test_decide_suggestion_rejects_null_or_none_urgency(self):
        from clocks.calculator import create_initial_clock
        now = timezone.now()
        case = Report.objects.create(
            organisation=self.org,
            assigned_reviewer=self.reviewer,
            submission_key=uuid4(),
            occurred_at=now,
            description="Normal test case",
            incident_details={"kind": "incident", "area": {"state_code": "KN", "lga_code": "KN-04"}},
        )
        create_initial_clock(case, now=now)
        self.login_as(self.reviewer)
        path = f"/api/v1/review/cases/{case.pk}/suggestions/urgency"

        # Correct with null value -> 422
        res1 = self.client.post(
            path,
            {"decision": "correct", "value": None, "version": case.version},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(res1.status_code, 422, res1.content)

        # Correct with "none" -> 422
        res2 = self.client.post(
            path,
            {"decision": "correct", "value": "none", "version": case.version},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(res2.status_code, 422, res2.content)
