import json
from datetime import timedelta
from uuid import uuid4

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import INITIAL_ORGANISATION, ObserverCode, Organisation, User
from ops.models import ClusterWarning
from reference.models import AreaDataset, KnownPollingUnit
from reports.models import Report

from .models import Notice, NoticeAnswer, Question


class NoticesTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org, _ = Organisation.objects.get_or_create(
            pk=INITIAL_ORGANISATION, defaults={"name": "Test Org"}
        )
        cls.coord1 = User.objects.create_user(
            "coord1@example.test", "pass12345678",
            organisation=cls.org, role=User.Role.COORDINATOR,
        )
        cls.coord2 = User.objects.create_user(
            "coord2@example.test", "pass12345678",
            organisation=cls.org, role=User.Role.COORDINATOR,
        )
        cls.observer1 = User.objects.create_user(
            "obs1@example.test", "pass12345678",
            organisation=cls.org, role=User.Role.OBSERVER,
        )
        cls.obs1_code = ObserverCode.objects.create(
            user=cls.observer1, organisation=cls.org, code="OBS-0001",
            label="Observer 1", status=ObserverCode.Status.ACTIVE,
        )
        cls.observer2 = User.objects.create_user(
            "obs2@example.test", "pass12345678",
            organisation=cls.org, role=User.Role.OBSERVER,
        )
        cls.obs2_code = ObserverCode.objects.create(
            user=cls.observer2, organisation=cls.org, code="OBS-0002",
            label="Observer 2", status=ObserverCode.Status.ACTIVE,
        )
        cls.observer3 = User.objects.create_user(
            "obs3@example.test", "pass12345678",
            organisation=cls.org, role=User.Role.OBSERVER,
        )
        cls.obs3_code = ObserverCode.objects.create(
            user=cls.observer3, organisation=cls.org, code="OBS-0003",
            label="Observer 3", status=ObserverCode.Status.ACTIVE,
        )

        # Seed reference area
        call_command("load_reference_areas", verbosity=0)

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def test_not06_questions_list(self):
        res = self.client.get("/api/v1/notices/questions")
        self.assertEqual(res.status_code, 200)
        items = res.json()["items"]
        self.assertGreaterEqual(len(items), 6)
        ids = [it["id"] for it in items]
        self.assertIn("materials_arrived", ids)
        self.assertIn("unit_calm", ids)
        self.assertIn("voting_started", ids)

    def test_not01_5d_content_filters_return_all_reasons(self):
        self.client.force_login(self.coord1)
        # Multiple violations in text: PU code, phone, email, link, party name, candidate
        bad_text = "Call 08031234567 or email vote@example.com for SYN-KN-01-01-001 at http://vote.org. Vote APC and Tinubu"
        res = self.client.post(
            "/api/v1/notices",
            {
                "scope": {"kind": "lga", "code": "SYN-KN-01"},
                "type": "logistics",
                "text": bad_text,
                "question_id": "materials_arrived",
            },
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(res.status_code, 400)
        err = res.json()["error"]
        self.assertEqual(err["code"], "blocked_content")
        reasons = err["reasons"]
        self.assertIn("contains_polling_unit_code", reasons)
        self.assertIn("contains_phone_number", reasons)
        self.assertIn("contains_email", reasons)
        self.assertIn("contains_link", reasons)
        self.assertIn("contains_political_term", reasons)

    def test_not01_create_safety_starts_pending_others_start_sent(self):
        self.client.force_login(self.coord1)
        key_logistics = str(uuid4())
        res_log = self.client.post(
            "/api/v1/notices",
            {
                "scope": {"kind": "lga", "code": "SYN-KN-01"},
                "type": "logistics",
                "text": "Check if materials have arrived at your polling units today.",
                "question_id": "materials_arrived",
            },
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=key_logistics,
        )
        self.assertEqual(res_log.status_code, 201)
        self.assertEqual(res_log.json()["status"], "sent")

        # Idempotency replay
        replay = self.client.post(
            "/api/v1/notices",
            {
                "scope": {"kind": "lga", "code": "SYN-KN-01"},
                "type": "logistics",
                "text": "Check if materials have arrived at your polling units today.",
                "question_id": "materials_arrived",
            },
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=key_logistics,
        )
        self.assertEqual(replay.status_code, 201)
        self.assertEqual(replay.headers.get("Idempotent-Replayed"), "true")

        # Safety notice starts pending_approval
        res_safe = self.client.post(
            "/api/v1/notices",
            {
                "scope": {"kind": "ward", "code": "SYN-KN-01-01"},
                "type": "safety",
                "text": "Stay vigilant and confirm if your unit area remains calm.",
                "question_id": "unit_calm",
            },
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(res_safe.status_code, 201)
        self.assertEqual(res_safe.json()["status"], "pending_approval")

    def test_not02_same_person_approval_guard_and_reject(self):
        self.client.force_login(self.coord1)
        res = self.client.post(
            "/api/v1/notices",
            {
                "scope": {"kind": "ward", "code": "SYN-KN-01-01"},
                "type": "safety",
                "text": "Urgent safety check for observers.",
                "question_id": "unit_calm",
            },
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        notice_id = res.json()["id"]

        # Same coordinator approving returns 403 same_person_approval
        approve_same = self.client.post(f"/api/v1/notices/{notice_id}/approve", {}, content_type="application/json")
        self.assertEqual(approve_same.status_code, 403)
        self.assertEqual(approve_same.json()["error"]["code"], "same_person_approval")

        # Different coordinator approves successfully
        self.client.force_login(self.coord2)
        approve_diff = self.client.post(f"/api/v1/notices/{notice_id}/approve", {}, content_type="application/json")
        self.assertEqual(approve_diff.status_code, 200)
        self.assertEqual(approve_diff.json()["status"], "sent")

        # Re-approving sent notice returns 409 conflict
        approve_again = self.client.post(f"/api/v1/notices/{notice_id}/approve", {}, content_type="application/json")
        self.assertEqual(approve_again.status_code, 409)

        # Rejecting another pending notice
        self.client.force_login(self.coord1)
        res2 = self.client.post(
            "/api/v1/notices",
            {
                "scope": {"kind": "lga", "code": "SYN-KN-01"},
                "type": "safety",
                "text": "Another safety check notice.",
                "question_id": "unit_calm",
            },
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        n2_id = res2.json()["id"]

        self.client.force_login(self.coord2)
        reject = self.client.post(
            f"/api/v1/notices/{n2_id}/reject",
            {"note": "Not needed right now."},
            content_type="application/json",
        )
        self.assertEqual(reject.status_code, 200)
        self.assertEqual(reject.json()["status"], "withdrawn")

    def test_not04_and_not05_observer_flow_and_isolation(self):
        # Create a sent logistics notice
        notice = Notice.objects.create(
            organisation=self.org,
            scope_kind="lga",
            scope_code="SYN-KN-01",
            type=Notice.NoticeType.LOGISTICS,
            text="Please confirm if materials have arrived.",
            question=Question.objects.get(id="materials_arrived"),
            created_by=self.coord1,
            approved_by=self.coord1,
            status=Notice.Status.SENT,
            expires_at=timezone.now() + timedelta(hours=6),
        )

        # Observer 1 views active notices (no answer yet)
        self.client.force_login(self.observer1)
        res_list1 = self.client.get("/api/v1/observer/notices?lga_code=SYN-KN-01")
        self.assertEqual(res_list1.status_code, 200)
        items = res_list1.json()["items"]
        self.assertEqual(len(items), 1)
        self.assertIsNone(items[0]["my_answer"])

        # Observer 1 answers "yes"
        now_str = timezone.now().isoformat()
        res_ans1 = self.client.post(
            f"/api/v1/observer/notices/{notice.id}/answer",
            {"answer": "yes", "answered_at": now_str},
            content_type="application/json",
        )
        self.assertEqual(res_ans1.status_code, 200)
        self.assertEqual(res_ans1.json()["status"], "recorded")

        # Observer 1 re-checks: sees their own answer
        res_list2 = self.client.get("/api/v1/observer/notices?lga_code=SYN-KN-01")
        self.assertEqual(res_list2.json()["items"][0]["my_answer"]["answer"], "yes")

        # Observer 2 logs in: must NOT see Observer 1's answer!
        self.client.force_login(self.observer2)
        res_obs2 = self.client.get("/api/v1/observer/notices?lga_code=SYN-KN-01")
        self.assertEqual(res_obs2.status_code, 200)
        self.assertIsNone(res_obs2.json()["items"][0]["my_answer"])

        # Observer 2 answers "no"
        res_ans2 = self.client.post(
            f"/api/v1/observer/notices/{notice.id}/answer",
            {"answer": "no", "answered_at": timezone.now().isoformat()},
            content_type="application/json",
        )
        self.assertEqual(res_ans2.status_code, 200)
        self.assertEqual(res_ans2.json()["status"], "recorded")

        # Second answer from Observer 2 replaces the first
        res_ans2_replace = self.client.post(
            f"/api/v1/observer/notices/{notice.id}/answer",
            {"answer": "yes", "answered_at": timezone.now().isoformat()},
            content_type="application/json",
        )
        self.assertEqual(res_ans2_replace.status_code, 200)
        ans2 = NoticeAnswer.objects.get(notice=notice, observer_code=self.obs2_code.code)
        self.assertEqual(ans2.answer, "yes")
        self.assertEqual(ans2.version, 2)

        # Clock skew rejection (> 5 min future)
        future_str = (timezone.now() + timedelta(minutes=10)).isoformat()
        res_skew = self.client.post(
            f"/api/v1/observer/notices/{notice.id}/answer",
            {"answer": "yes", "answered_at": future_str},
            content_type="application/json",
        )
        self.assertEqual(res_skew.status_code, 400)
        self.assertEqual(res_skew.json()["error"]["code"], "invalid_timestamp")

    def test_b8_checkin_cluster_hook(self):
        # Setup notice in LGA SYN-KN-01
        notice = Notice.objects.create(
            organisation=self.org,
            scope_kind="lga",
            scope_code="SYN-KN-01",
            type=Notice.NoticeType.LOGISTICS,
            text="Have materials arrived?",
            question=Question.objects.get(id="materials_arrived"),
            created_by=self.coord1,
            approved_by=self.coord1,
            status=Notice.Status.SENT,
            expires_at=timezone.now() + timedelta(hours=6),
        )

        # Observers tied to reports in different wards
        # Observer 1 in ward SYN-KN-01-01
        Report.objects.create(
            organisation=self.org,
            observer=self.observer1,
            submission_key=uuid4(),
            occurred_at=timezone.now(),
            status=Report.Status.SUBMITTED,
            description="Open observation in Kantudu",
            incident_details={"kind": "incident", "category": "late_materials", "area": {"ward_code": "SYN-KN-01-01", "lga_code": "SYN-KN-01"}},
        )
        # Observer 2 in ward SYN-KN-01-02
        Report.objects.create(
            organisation=self.org,
            observer=self.observer2,
            submission_key=uuid4(),
            occurred_at=timezone.now(),
            status=Report.Status.SUBMITTED,
            description="Open observation in Kabuga",
            incident_details={"kind": "incident", "category": "late_materials", "area": {"ward_code": "SYN-KN-01-02", "lga_code": "SYN-KN-01"}},
        )
        # Observer 3 in ward SYN-KN-01-01
        Report.objects.create(
            organisation=self.org,
            observer=self.observer3,
            submission_key=uuid4(),
            occurred_at=timezone.now(),
            status=Report.Status.SUBMITTED,
            description="Open observation 2 in Kantudu",
            incident_details={"kind": "incident", "category": "late_materials", "area": {"ward_code": "SYN-KN-01-01", "lga_code": "SYN-KN-01"}},
        )

        # 3 "no" answers across 2 wards
        now_str = timezone.now().isoformat()
        self.client.force_login(self.observer1)
        self.client.post(f"/api/v1/observer/notices/{notice.id}/answer", {"answer": "no", "answered_at": now_str}, content_type="application/json")

        self.client.force_login(self.observer2)
        self.client.post(f"/api/v1/observer/notices/{notice.id}/answer", {"answer": "no", "answered_at": now_str}, content_type="application/json")

        self.client.force_login(self.observer3)
        self.client.post(f"/api/v1/observer/notices/{notice.id}/answer", {"answer": "no", "answered_at": now_str}, content_type="application/json")

        # ClusterWarning should be created with trigger="checkins"
        cw = ClusterWarning.objects.filter(organisation=self.org, lga_code="SYN-KN-01", trigger="checkins").first()
        self.assertIsNotNone(cw)
        self.assertEqual(cw.trigger, "checkins")
        self.assertEqual(cw.observed, 3)

        # Related open reports in those wards got triage priority boost
        rep1 = Report.objects.filter(observer=self.observer1).first()
        self.assertEqual(rep1.review_suggestions["urgency"]["value"], "urgent")
        self.assertIn("checkin_cluster_boost", rep1.review_suggestions["urgency"]["reasons"])
