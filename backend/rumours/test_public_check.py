from uuid import uuid4

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from accounts.models import INITIAL_ORGANISATION, Organisation
from reports.models import Report
from rumours.models import Claim, ClaimAskHour


class PublicRumourCheckTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org, _ = Organisation.objects.get_or_create(pk=INITIAL_ORGANISATION, defaults={"name": "Public Org"})

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def test_chk01_safety_checked_fallback_and_not_checked(self):
        # Safety pattern hit comes first
        res_safety = self.client.get("/api/v1/public/check", {"q": "Armed thugs shooting at ward 2", "lang": "en"})
        self.assertEqual(res_safety.status_code, 200)
        self.assertEqual(res_safety.json(), {"result": "safety"})

        # Unapproved claim must never be returned as checked
        Claim.objects.create(
            organisation=self.org,
            text="Voting has been moved to Sunday everywhere",
            seen_on="whatsapp",
            language="en",
            harm={"score": 0.5, "level": "medium", "reasons": []},
            check_worthiness={"score": 0.5, "level": "medium", "reasons": []},
            status="new",
        )
        res_unapproved = self.client.get(
            "/api/v1/public/check", {"q": "Voting has been moved to Sunday everywhere", "lang": "en"}
        )
        self.assertEqual(res_unapproved.status_code, 200)
        self.assertEqual(res_unapproved.json(), {"result": "not_checked"})

        # Approved claim with English response (no Yoruba translation -> falls back to "en")
        approved = Claim.objects.create(
            organisation=self.org,
            text="Voting moved to Saturday in Kano",
            seen_on="whatsapp",
            language="en",
            area={"state_code": "KN", "state_name": "Kano"},
            harm={"score": 0.5, "level": "medium", "reasons": []},
            check_worthiness={"score": 0.5, "level": "medium", "reasons": []},
            status="response_approved",
            response={
                "text": "Voting remains on the scheduled date.",
                "approved_at": "2026-11-25T10:00:00+01:00",
                "translations": {"pcm": "Voting still dey on the normal day."},
            },
        )
        # 2 closed reports in KN (< 5 -> "fewer than 5")
        for i in range(2):
            Report.objects.create(
                organisation=self.org,
                submission_key=uuid4(),
                occurred_at=timezone.now(),
                status=Report.Status.CLOSED,
                description="Closed observation",
                incident_details={
                    "kind": "incident",
                    "area": {"state_code": "KN", "ward_code": f"KN-01-0{i+1}"},
                },
            )

        res_pcm = self.client.get("/api/v1/public/check", {"q": "Voting moved to Saturday in Kano", "lang": "pcm"})
        self.assertEqual(res_pcm.status_code, 200)
        body_pcm = res_pcm.json()
        self.assertEqual(body_pcm["result"], "checked")
        self.assertEqual(body_pcm["claim_ref"], str(approved.id))
        self.assertEqual(body_pcm["response"]["language"], "pcm")
        self.assertEqual(body_pcm["response"]["text"], "Voting still dey on the normal day.")
        self.assertEqual(body_pcm["response"]["observer_support"]["states"], "fewer than 5")
        self.assertEqual(body_pcm["response"]["observer_support"]["wards"], "fewer than 5")

        res_yo = self.client.get("/api/v1/public/check", {"q": "Voting moved to Saturday in Kano", "lang": "yo"})
        self.assertEqual(res_yo.status_code, 200)
        self.assertEqual(res_yo.json()["response"]["language"], "en")
        self.assertEqual(res_yo.json()["response"]["text"], "Voting remains on the scheduled date.")

    def test_chk02_redacts_matches_increments_and_rate_limits(self):
        # First submission queues a new claim and redacts PII before storing
        key1 = str(uuid4())
        res1 = self.client.post(
            "/api/v1/public/check",
            {
                "text": "Mr Chukwu 08031234567 said ballot boxes were taken away",
                "lang": "en",
                "device_token": "dev-abc-123",
            },
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=key1,
        )
        self.assertEqual(res1.status_code, 201, res1.content)
        d1 = res1.json()
        self.assertEqual(d1["result"], "queued")
        claim = Claim.objects.get(pk=d1["claim_ref"])
        self.assertEqual(claim.source, "public")
        self.assertEqual(claim.ask_count, 1)
        self.assertNotIn("08031234567", claim.text)
        self.assertNotIn("Chukwu", claim.text)
        self.assertEqual(ClaimAskHour.objects.get(claim=claim).count, 1)

        # Idempotent replay with same key returns same response without incrementing
        replay = self.client.post(
            "/api/v1/public/check",
            {
                "text": "Mr Chukwu 08031234567 said ballot boxes were taken away",
                "lang": "en",
                "device_token": "dev-abc-123",
            },
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=key1,
        )
        self.assertEqual(replay.status_code, 201)
        claim.refresh_from_db()
        self.assertEqual(claim.ask_count, 1)

        # Second distinct submission matching same claim increments ask_count and hour log
        res2 = self.client.post(
            "/api/v1/public/check",
            {
                "text": "Someone said ballot boxes were taken away",
                "lang": "en",
                "device_token": "dev-xyz-999",
            },
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(res2.status_code, 200, res2.content)
        self.assertEqual(res2.json()["result"], "matched")
        self.assertEqual(res2.json()["claim_ref"], str(claim.id))
        claim.refresh_from_db()
        self.assertEqual(claim.ask_count, 2)
        self.assertEqual(ClaimAskHour.objects.get(claim=claim).count, 2)

        # Rate limit: 10/hour per IP -> 11th request returns 429 with Retry-After
        for i in range(7):
            r = self.client.post(
                "/api/v1/public/check",
                {"text": f"Unique rumour number {i} about polling unit", "lang": "en", "device_token": f"dev-{i}"},
                content_type="application/json",
                HTTP_IDEMPOTENCY_KEY=str(uuid4()),
            )
            self.assertIn(r.status_code, (200, 201))
        limited = self.client.post(
            "/api/v1/public/check",
            {"text": "Eleventh rumour check should be rate limited", "lang": "en", "device_token": "dev-11"},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(limited.status_code, 429)
        self.assertIn("Retry-After", limited.headers)
