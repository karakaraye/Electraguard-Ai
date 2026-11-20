import secrets
from datetime import timedelta
from io import StringIO
from ipaddress import ip_address
from unittest.mock import patch

from django.core.management import call_command
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from .models import Report, RequestWindow


class SafeguardTests(TestCase):
    @override_settings(INTAKE_PAUSED=True)
    def test_intake_can_pause_without_disabling_status_lookup(self):
        self.assertEqual(self.client.post("/api/reports/", {}, content_type="application/json").status_code, 503)
        self.assertEqual(self.client.post("/api/receipt/", {}, content_type="application/json").status_code, 400)

    def test_public_pages_apply_csp_without_receipt_credentials(self):
        response = self.client.get("/")
        self.assertIn("frame-ancestors 'none'", response.headers["Content-Security-Policy"])
        self.assertEqual(response.headers["Referrer-Policy"], "same-origin")

    @override_settings(RECEIPT_LIFETIME_DAYS=1)
    def test_expired_receipt_is_indistinguishable_from_unknown(self):
        from uuid import uuid4
        from .views import digest

        secret = secrets.token_hex(32)
        report = Report.objects.create(
            submission_key=uuid4(), receipt_digest=digest(secret), submission_digest="0" * 64,
            area="Area 01", occurred_at=timezone.now(), category="other",
            firsthand=True, description="Authorised test record.",
        )
        Report.objects.filter(pk=report.pk).update(received_at=timezone.now() - timedelta(days=2))
        expired = self.client.post("/api/receipt/", {"receipt_secret": secret}, content_type="application/json")
        missing = self.client.post(
            "/api/receipt/", {"receipt_secret": secrets.token_hex(32)}, content_type="application/json",
        )
        self.assertEqual(expired.status_code, 404)
        self.assertEqual(expired.json(), missing.json())
        self.assertIn("no-store", expired.headers["Cache-Control"])
        self.assertTrue(Report.objects.filter(pk=report.pk).exists())

    @patch("reports.middleware.time", return_value=1000)
    def test_limit_uses_shared_database_and_ignores_untrusted_forwarded_address(self, clock):
        first = Client(REMOTE_ADDR="192.0.2.10")
        second = Client(REMOTE_ADDR="192.0.2.10", HTTP_X_FORWARDED_FOR="192.0.2.99")
        for client in (first, second):
            for _ in range(15):
                response = client.post("/api/receipt/", {}, content_type="application/json")
                self.assertEqual(response.status_code, 400)
        limited = second.post("/api/receipt/", {}, content_type="application/json")
        self.assertEqual(limited.status_code, 429)
        self.assertEqual(limited.headers["Retry-After"], "20")
        counter = RequestWindow.objects.get()
        self.assertEqual(counter.count, 30)
        self.assertNotIn("192.0.2", counter.client_digest)
        clock.return_value = 1020
        self.assertEqual(second.post("/api/receipt/", {}, content_type="application/json").status_code, 400)
        RequestWindow.objects.filter(pk=counter.pk).update(expires_at=0)
        call_command("prune_request_windows", stdout=StringIO())
        self.assertFalse(RequestWindow.objects.filter(pk=counter.pk).exists())

    @patch("reports.middleware.time", return_value=1000)
    def test_both_reviewer_sign_in_forms_share_the_same_budget(self, clock):
        for _ in range(20):
            self.assertEqual(self.client.post("/review/sign-in/", {}).status_code, 200)
        self.assertEqual(self.client.post("/admin/login/", {}).status_code, 429)

    @override_settings(TRUSTED_PROXY_IPS=frozenset({ip_address("192.0.2.4")}))
    @patch("reports.middleware.time", return_value=1000)
    def test_only_configured_proxy_can_supplant_peer_for_request_budget(self, clock):
        first = Client(REMOTE_ADDR="192.0.2.4", HTTP_X_REAL_IP="198.51.100.12")
        second = Client(REMOTE_ADDR="192.0.2.4", HTTP_X_REAL_IP="198.51.100.13")
        direct = Client(REMOTE_ADDR="192.0.2.10", HTTP_X_REAL_IP="198.51.100.12")
        invalid = Client(REMOTE_ADDR="192.0.2.4", HTTP_X_REAL_IP="198.51.100.12, 198.51.100.13")
        for _ in range(30):
            self.assertEqual(first.post("/api/receipt/", {}, content_type="application/json").status_code, 400)
        self.assertEqual(first.post("/api/receipt/", {}, content_type="application/json").status_code, 429)
        for client in (second, direct, invalid):
            self.assertEqual(client.post("/api/receipt/", {}, content_type="application/json").status_code, 400)
        self.assertEqual(RequestWindow.objects.count(), 4)
