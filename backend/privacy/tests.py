import io
import logging
from uuid import uuid4

from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import ObserverCode, Organisation, User
from discussions.models import Discussion, Membership, Post
from reports.models import CitizenReply, Report, ReviewEvent
from staff.models import AuditEvent
from privacy.redactor import RedactionResult, org_secret_key, redact, safe_text


class RedactionTests(TestCase):
    def setUp(self):
        self.org_a = Organisation.objects.create(name="Observer Org A")
        self.org_b = Organisation.objects.create(name="Observer Org B")
        self.observer = User.objects.create_user(
            email="observer@example.com",
            password="secure-password-123",
            organisation=self.org_a,
            role=User.Role.OBSERVER,
        )
        ObserverCode.objects.create(
            organisation=self.org_a,
            user=self.observer,
            code="OBS-123456",
            pin_hash="mock-hash",
            status="active",
        )
        self.reviewer_a = User.objects.create_user(
            email="reviewer.a@example.com",
            password="secure-password-123",
            organisation=self.org_a,
            role=User.Role.REVIEWER,
        )
        self.reviewer_b = User.objects.create_user(
            email="reviewer.b@example.com",
            password="secure-password-123",
            organisation=self.org_a,
            role=User.Role.REVIEWER,
        )

    def test_phone_redaction_and_normalization(self):
        text = "Call me on 08031234567 or +234 803 123 4567 or 070-1234-5678."
        res = redact(text, self.org_a)
        self.assertNotIn("08031234567", res.text)
        self.assertNotIn("+234 803 123 4567", res.text)
        self.assertNotIn("070-1234-5678", res.text)
        # Verify both formats of 08031234567 produce the EXACT same stable token
        token_1 = redact("08031234567", self.org_a).text
        token_2 = redact("+234 803 123 4567", self.org_a).text
        self.assertEqual(token_1, token_2)
        self.assertTrue(token_1.startswith("[PHONE_"))
        self.assertTrue(token_1.endswith("]"))
        self.assertEqual(len(token_1), 12)  # [PHONE_xxxx] = 12 chars

    def test_email_redaction(self):
        text = "Reach out at observer.lead@election.org.ng for inquiries."
        res = redact(text, self.org_a)
        self.assertNotIn("observer.lead@election.org.ng", res.text)
        self.assertIn("[EMAIL_", res.text)

    def test_nin_and_bvn_redaction(self):
        text = "Voter BVN is 12345678901 and NIN: 98765432101 was noted."
        res = redact(text, self.org_a)
        self.assertNotIn("12345678901", res.text)
        self.assertNotIn("98765432101", res.text)
        kinds = [s["kind"] for s in res.spans]
        self.assertIn("bvn", kinds)
        self.assertIn("nin", kinds)

    def test_vin_redaction(self):
        text = "Voter card PVC 90F5B12345678901234 presented at the unit."
        res = redact(text, self.org_a)
        self.assertNotIn("90F5B12345678901234", res.text)
        self.assertIn("[VIN_", res.text)

    def test_account_redaction(self):
        text = "Inducement money sent to account 0123456789 at the polling station."
        res = redact(text, self.org_a)
        self.assertNotIn("0123456789", res.text)
        self.assertIn("[ACCOUNT_", res.text)

    def test_name_and_title_redaction(self):
        text = "Alhaji Musa Bello and Dr. Chinedu Okafor were present with Mrs. Funke Adebayo."
        res = redact(text, self.org_a)
        self.assertNotIn("Musa Bello", res.text)
        self.assertNotIn("Chinedu Okafor", res.text)
        self.assertNotIn("Funke Adebayo", res.text)
        # Titles are preserved as context while names are replaced
        self.assertIn("Alhaji [NAME_", res.text)
        self.assertIn("Dr. [NAME_", res.text)
        self.assertIn("Mrs. [NAME_", res.text)

    def test_address_redaction(self):
        text = "Incident occurred at 12 Allen Avenue and near Plot 44 Ahmadu Bello Way."
        res = redact(text, self.org_a)
        self.assertNotIn("12 Allen Avenue", res.text)
        self.assertIn("[ADDRESS_", res.text)

    def test_per_organisation_token_isolation(self):
        number = "08023334444"
        res_a = redact(number, self.org_a)
        res_b = redact(number, self.org_b)
        # Both format as [PHONE_xxxx] but with different HMAC suffixes
        self.assertTrue(res_a.text.startswith("[PHONE_"))
        self.assertTrue(res_b.text.startswith("[PHONE_"))
        self.assertNotEqual(res_a.text, res_b.text)

    def test_existing_tokens_are_not_re_redacted(self):
        already_redacted = "Report by [NAME_3f9a] calling [PHONE_12ab] about an issue."
        res = redact(already_redacted, self.org_a)
        self.assertEqual(res.text, already_redacted)
        self.assertEqual(len(res.spans), 0)

    def test_zero_leaks_in_logs(self):
        # Verify that running redaction logs zero PII
        logger = logging.getLogger("privacy")
        log_stream = io.StringIO()
        handler = logging.StreamHandler(log_stream)
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)

        sensitive_text = "Voter Abubakar Sani, phone 08091112222, NIN 11223344556, at 5 Adeola Street."
        res = redact(sensitive_text, self.org_a)

        handler.flush()
        logger.removeHandler(handler)
        log_content = log_stream.getvalue()

        # Zero leaks in logs
        self.assertNotIn("Abubakar Sani", log_content)
        self.assertNotIn("08091112222", log_content)
        self.assertNotIn("11223344556", log_content)
        self.assertNotIn("5 Adeola Street", log_content)

    def test_safe_text_helper_precedence(self):
        report = Report(
            description="Raw description",
            auto_redacted_description="Auto redacted description",
            redacted_description="Manual redacted description",
        )
        # 1. Manual redaction takes highest precedence
        self.assertEqual(safe_text(report), "Manual redacted description")

        # 2. When manual is None, auto redaction takes precedence
        report.redacted_description = None
        self.assertEqual(safe_text(report), "Auto redacted description")

        # 3. When both are None, falls back to raw description
        report.auto_redacted_description = None
        self.assertEqual(safe_text(report), "Raw description")

    def test_intake_hook_creates_auto_redactions(self):
        from reports.v1_views import persist_report

        values = {
            "occurred_at": timezone.now(),
            "description": "Party agent Mr. Babatunde called 08031234567 at 10 Broad Street.",
            "incident_details": {
                "kind": "incident",
                "area": {"polling_unit_name": "Ward 1 PU 001"},
            },
        }
        _, _, report = persist_report(None, self.org_a.pk, values)
        report.refresh_from_db()
        self.assertIsNotNone(report.auto_redacted_description)
        self.assertNotIn("08031234567", report.auto_redacted_description)
        self.assertNotIn("Babatunde", report.auto_redacted_description)
        self.assertTrue(len(report.auto_redactions) >= 2)
        kinds = {s["kind"] for s in report.auto_redactions}
        self.assertIn("phone", kinds)
        self.assertIn("name", kinds)

    def test_case_01_and_rep_03_contract_fields(self):
        from reports.v1_views import persist_report

        values = {
            "occurred_at": timezone.now(),
            "description": "Voter Mrs. Fatima Musa reported phone 08023456789.",
            "incident_details": {
                "kind": "incident",
                "area": {"polling_unit_name": "Ward 1 PU 001"},
            },
        }
        _, _, report = persist_report(self.observer, self.org_a.pk, values, code="OBS-123456")
        report.assigned_reviewer = self.reviewer_a
        report.save(update_fields=["assigned_reviewer"])

        # Observer view (REP-03): original text preserved, redaction metadata included
        self.client.force_login(self.observer)
        rep03 = self.client.get(f"/api/v1/reports/{report.pk}").json()
        self.assertEqual(rep03["description"], "Voter Mrs. Fatima Musa reported phone 08023456789.")
        self.assertTrue(rep03["redaction"]["automatic"])
        self.assertTrue(rep03["redaction"]["count"] >= 2)
        self.assertIn("phone", rep03["redaction"]["kinds"])

        # Reviewer view (CASE-01): description is redacted, original_available is true
        self.client.force_login(self.reviewer_a)
        case01 = self.client.get(f"/api/v1/review/cases/{report.pk}").json()
        self.assertNotIn("08023456789", case01["description"])
        self.assertNotIn("Fatima Musa", case01["description"])
        self.assertTrue(case01["original_available"])
        self.assertTrue(case01["redaction"]["automatic"])
        self.assertTrue(case01["redaction"]["count"] >= 2)

    def test_case_06_assigned_reviewer_access(self):
        from reports.v1_views import persist_report

        values = {
            "occurred_at": timezone.now(),
            "description": "Confidential report from Mr. Tunde at 08051234567.",
            "incident_details": {
                "kind": "incident",
                "area": {"polling_unit_name": "Ward 1 PU 001"},
            },
        }
        _, _, report = persist_report(None, self.org_a.pk, values)
        report.assigned_reviewer = self.reviewer_a
        report.save(update_fields=["assigned_reviewer"])

        # 1. Unauthenticated gets 401
        res = self.client.post(
            f"/api/v1/cases/{report.pk}/original",
            {"reason": "Verify names"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 401)

        # 2. Non-assigned reviewer gets 403
        self.client.force_login(self.reviewer_b)
        res = self.client.post(
            f"/api/v1/cases/{report.pk}/original",
            {"reason": "I am not assigned to this case"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 403)

        # 3. Assigned reviewer with valid reason gets 200 and original description
        self.client.force_login(self.reviewer_a)
        res = self.client.post(
            f"/api/v1/cases/{report.pk}/original",
            {"reason": "Verifying witness identity for corroboration"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["description"], "Confidential report from Mr. Tunde at 08051234567.")

        # 4. Audit event case.original_viewed is recorded
        audit = AuditEvent.objects.filter(
            organisation=self.org_a,
            action="case.original_viewed",
            object_id=str(report.pk),
        ).last()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor_ref, str(self.reviewer_a.public_id))
        self.assertEqual(audit.action, "case.original_viewed")

        # 5. Invalid reason (blank or >500 chars) gets 422 validation error
        res_bad = self.client.post(
            f"/api/v1/cases/{report.pk}/original",
            {"reason": ""},
            content_type="application/json",
        )
        self.assertEqual(res_bad.status_code, 422)
