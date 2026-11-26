"""Comprehensive tests for community features (C1, C2, C3, and D1/D2 red-lines)."""

import json
from datetime import timedelta
from uuid import uuid4

from django.core.cache import cache
from django.core.management import call_command
from django.test import Client, TestCase
from django.utils import timezone

from accounts.models import INITIAL_ORGANISATION, ObserverCode, Organisation, User
from accounts.staff_sessions import VERIFIED
from reference.models import AreaDataset
from reports.models import Report
from rumours.models import Claim, ClaimAskHour
from staff.test_support import bind_staff_session
from notices.models import Notice, NoticeAnswer, Question


class CommunityFeaturesTests(TestCase):
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

        call_command("load_reference_areas", verbosity=0)

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def coordinator_client(self, user):
        client = Client()
        client.force_login(user)
        session = client.session
        session[VERIFIED] = True
        session.save()
        bind_staff_session(session, user)
        return client

    # -----------------------------------------------------------------------
    # C1: Rumour Desk Demand Ranking & Source Filter
    # -----------------------------------------------------------------------
    def test_c1_rumour_desk_demand_ranking_and_source_filter(self):
        client = self.coordinator_client(self.coord1)

        c_low = Claim.objects.create(
            organisation=self.org,
            text="Low demand desk claim",
            seen_on="radio",
            language="en",
            source="desk",
            ask_count=2,
            harm={"level": "low", "score": 0.2},
            check_worthiness={"level": "low", "score": 0.2},
        )
        c_high = Claim.objects.create(
            organisation=self.org,
            text="High demand viral claim",
            seen_on="public",
            language="en",
            source="public",
            ask_count=50,
            harm={"level": "high", "score": 0.8},
            check_worthiness={"level": "high", "score": 0.8},
        )

        # Default sort (-created_at)
        res_default = client.get("/api/v1/rumours/claims")
        self.assertEqual(res_default.status_code, 200)
        items_default = res_default.json()["items"]
        self.assertGreaterEqual(len(items_default), 2)

        # Demand sort (?sort=demand) -> c_high first
        res_demand = client.get("/api/v1/rumours/claims?sort=demand")
        self.assertEqual(res_demand.status_code, 200)
        items_demand = res_demand.json()["items"]
        self.assertEqual(items_demand[0]["id"], str(c_high.id))
        self.assertEqual(items_demand[0]["ask_count"], 50)
        self.assertEqual(items_demand[0]["source"], "public")

        # Source filter (?source=public)
        res_source = client.get("/api/v1/rumours/claims?source=public")
        self.assertEqual(res_source.status_code, 200)
        items_source = res_source.json()["items"]
        for it in items_source:
            self.assertEqual(it["source"], "public")

    # -----------------------------------------------------------------------
    # C2: Check-in Evidence on Rumour Detail
    # -----------------------------------------------------------------------
    def test_c2_checkin_evidence_on_rumour_detail(self):
        client = self.coordinator_client(self.coord1)

        q = Question.objects.get(id="materials_arrived")
        notice = Notice.objects.create(
            organisation=self.org,
            scope_kind=Notice.ScopeKind.LGA,
            scope_code="SYN-KN-01",
            type=Notice.NoticeType.LOGISTICS,
            text="Have election materials arrived at your unit?",
            question=q,
            created_by=self.coord1,
            status=Notice.Status.SENT,
            expires_at=timezone.now() + timedelta(hours=5),
        )

        # 3 Yes answers (under 5 -> suppressed)
        for i in range(3):
            NoticeAnswer.objects.create(
                organisation=self.org,
                notice=notice,
                observer_code=f"OBS-TEST-{i}",
                answer=NoticeAnswer.AnswerChoice.YES,
                answered_at_device=timezone.now(),
            )

        claim = Claim.objects.create(
            organisation=self.org,
            text="Materials have not arrived in Kano",
            seen_on="facebook",
            language="en",
            area={"state_code": "SYN-KN", "lga_code": "SYN-KN-01"},
            harm={"level": "medium", "score": 0.5},
            check_worthiness={"level": "medium", "score": 0.5},
            response={"category": "late_materials"},
        )

        res = client.get(f"/api/v1/rumours/claims/{claim.id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("checkin_evidence", data)
        evidence = data["checkin_evidence"]
        self.assertEqual(len(evidence), 1)
        self.assertEqual(evidence[0]["area"], "SYN-KN-01")
        self.assertEqual(evidence[0]["yes"], "fewer than 5")
        self.assertEqual(evidence[0]["no"], "fewer than 5")

    # -----------------------------------------------------------------------
    # C3: Area Today (AREA-01)
    # -----------------------------------------------------------------------
    def test_c3_area_today_observer_endpoint(self):
        # 1. Unauthenticated gets 401
        res_anon = self.client.get("/api/v1/observer/area-today?lga_code=SYN-KN-01")
        self.assertEqual(res_anon.status_code, 401)

        # 2. Coordinator without observer role gets 403
        self.client.force_login(self.coord1)
        res_coord = self.client.get("/api/v1/observer/area-today?lga_code=SYN-KN-01")
        self.assertEqual(res_coord.status_code, 403)

        # 3. Observer can access
        self.client.force_login(self.observer1)

        # Create closed reports in SYN-KN-01 older than 60 mins
        now = timezone.now()
        past = now - timedelta(minutes=90)
        recent = now - timedelta(minutes=15)

        for i in range(6):
            Report.objects.create(
                organisation=self.org,
                observer=self.observer1,
                submission_key=uuid4(),
                status=Report.Status.CLOSED,
                occurred_at=past,
                incident_details={
                    "category": "late_materials",
                    "area": {"state_code": "SYN-KN", "lga_code": "SYN-KN-01"},
                },
            )

        # Create 1 report under 60 mins (should be excluded by 60-min delay)
        Report.objects.create(
            organisation=self.org,
            observer=self.observer1,
            submission_key=uuid4(),
            status=Report.Status.CLOSED,
            occurred_at=recent,
            incident_details={
                "category": "late_materials",
                "area": {"state_code": "SYN-KN", "lga_code": "SYN-KN-01"},
            },
        )

        res_obs = self.client.get("/api/v1/observer/area-today?lga_code=SYN-KN-01")
        self.assertEqual(res_obs.status_code, 200)
        data = res_obs.json()
        self.assertEqual(data["lga_code"], "SYN-KN-01")
        self.assertIn("by_category", data)
        categories = {item["category"]: item["count"] for item in data["by_category"]}
        # Late materials has 6 past reports (>= 5), so it is visible
        self.assertEqual(categories["late_materials"], 6)
        # Other categories with 0 reports show "fewer than 5"
        self.assertEqual(categories["intimidation_violence"], "fewer than 5")

    # -----------------------------------------------------------------------
    # D1 & D2: Red-Line & Security Tests
    # -----------------------------------------------------------------------
    def test_d1_chk01_never_returns_report_text_or_polling_unit_codes(self):
        claim = Claim.objects.create(
            organisation=self.org,
            text="Voting has been postponed across all units",
            seen_on="sms",
            language="en",
            status="response_approved",
            harm={"level": "high", "score": 0.8},
            check_worthiness={"level": "high", "score": 0.8},
            response={
                "text": "INEC has confirmed voting is proceeding as scheduled.",
                "approved_at": timezone.now().isoformat(),
                "approved_by": "Coordinator",
            },
        )

        res = self.client.get("/api/v1/public/check?q=Voting+has+been+postponed+across+all+units")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["result"], "checked")
        resp_obj = data["response"]
        # Must not contain any report text or polling unit codes
        serialized = json.dumps(resp_obj)
        self.assertNotIn("SYN-KN-01-01-001", serialized)
        self.assertNotIn("polling_unit", serialized)
        support = resp_obj["observer_support"]
        self.assertIn("states", support)
        self.assertIn("wards", support)

    def test_d1_unapproved_rumour_never_returned(self):
        Claim.objects.create(
            organisation=self.org,
            text="Unapproved draft rumour response",
            seen_on="desk",
            language="en",
            status="response_draft",
            harm={"level": "low", "score": 0.2},
            check_worthiness={"level": "low", "score": 0.2},
            response={"text": "Draft reply pending approval"},
        )
        res = self.client.get("/api/v1/public/check?q=Unapproved+draft+rumour+response")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["result"], "not_checked")

    def test_d1_observer_cannot_read_other_observers_answers(self):
        q = Question.objects.get(id="materials_arrived")
        notice = Notice.objects.create(
            organisation=self.org,
            scope_kind=Notice.ScopeKind.LGA,
            scope_code="SYN-KN-01",
            type=Notice.NoticeType.LOGISTICS,
            text="Have election materials arrived?",
            question=q,
            created_by=self.coord1,
            status=Notice.Status.SENT,
            expires_at=timezone.now() + timedelta(hours=5),
        )
        # Observer 2 answers "no"
        NoticeAnswer.objects.create(
            organisation=self.org,
            notice=notice,
            observer_code="OBS-0002",
            answer=NoticeAnswer.AnswerChoice.NO,
            answered_at_device=timezone.now(),
        )

        # Observer 1 logs in and views notices
        self.client.force_login(self.observer1)
        res = self.client.get("/api/v1/observer/notices?lga_code=SYN-KN-01")
        self.assertEqual(res.status_code, 200)
        items = res.json()["items"]
        self.assertEqual(len(items), 1)
        notice_data = items[0]
        # Observer 1 has not answered, my_answer should be None
        self.assertIsNone(notice_data["my_answer"])
        # No other observer answers or lists exposed
        self.assertNotIn("answers", notice_data)
        self.assertNotIn("OBS-0002", json.dumps(notice_data))

    def test_d1_public_results_stays_strictly_at_state_level(self):
        res = self.client.get("/api/v1/public/results")
        self.assertEqual(res.status_code, 200)
        content = res.content.decode("utf-8")
        # Ensure no LGA code or PU code is present
        self.assertNotIn("SYN-KN-01", content)
        self.assertNotIn("SYN-KN-01-01", content)
        self.assertNotIn("SYN-KN-01-01-001", content)

    def test_d2_expired_notice_rejects_answers(self):
        notice = Notice.objects.create(
            organisation=self.org,
            scope_kind=Notice.ScopeKind.LGA,
            scope_code="SYN-KN-01",
            type=Notice.NoticeType.LOGISTICS,
            text="Notice that has expired.",
            created_by=self.coord1,
            status=Notice.Status.SENT,
            expires_at=timezone.now() - timedelta(minutes=10),
        )
        self.client.force_login(self.observer1)
        res = self.client.post(
            f"/api/v1/observer/notices/{notice.id}/answer",
            {"answer": "yes", "answered_at": timezone.now().isoformat()},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json()["error"]["code"], "notice_expired")

    def test_d2_chk02_rate_limit(self):
        token = str(uuid4())
        # First 10 requests within hour pass
        for i in range(10):
            res = self.client.post(
                "/api/v1/public/check",
                {"text": f"Valid rumour check number {i}", "lang": "en", "device_token": token},
                content_type="application/json",
                HTTP_IDEMPOTENCY_KEY=str(uuid4()),
            )
            self.assertIn(res.status_code, (200, 201))

        # 11th request triggers rate limit 429
        res_limit = self.client.post(
            "/api/v1/public/check",
            {"text": "Exceeding rate limit query", "lang": "en", "device_token": token},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(res_limit.status_code, 429)
        self.assertEqual(res_limit.json()["error"]["code"], "rate_limited")
        self.assertTrue(res_limit.headers.get("Retry-After"))

    def test_d1_stored_public_submission_is_redacted(self):
        # Submit text containing PII: phone number and name
        raw_submission = "Call Mrs Ngozi Adeleke at 0802 345 6789 about the fake results"
        res = self.client.post(
            "/api/v1/public/check",
            {"text": raw_submission, "lang": "en", "device_token": str(uuid4())},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertIn(res.status_code, (200, 201))
        claim_ref = res.json()["claim_ref"]
        claim = Claim.objects.get(id=claim_ref)
        # Neither phone number nor personal name should be present in stored text
        self.assertNotIn("0802 345 6789", claim.text)
        self.assertNotIn("08023456789", claim.text)
        self.assertNotIn("Mrs Ngozi Adeleke", claim.text)
        self.assertIn("[PHONE_", claim.text)
        self.assertIn("[NAME_", claim.text)

