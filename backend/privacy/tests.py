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
        # Capture ALL loggers (root logger) during full REP-01 create and MSG-02 send
        root_logger = logging.getLogger()
        log_stream = io.StringIO()
        handler = logging.StreamHandler(log_stream)
        old_level = root_logger.level
        root_logger.addHandler(handler)
        root_logger.setLevel(logging.DEBUG)
        try:
            self.client.force_login(self.observer)
            from datetime import date
            from reference.models import AreaDataset
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
            place_val = {"polling_unit_code": "KN-04-01-001", "ward_code": "KN-04-01"}
            res = self.client.post(
                "/api/v1/reports",
                {
                    "submission_key": str(uuid4()),
                    "occurred_at": timezone.now().isoformat(),
                    "description": "Voter Abubakar Sani, phone 08091112222, NIN 11223344556.",
                    "kind": "incident",
                    "language": "en",
                    "danger_now": False,
                    "firsthand": True,
                    "place": place_val,
                    "category_observer": "intimidation_violence",
                },
                content_type="application/json",
                HTTP_IDEMPOTENCY_KEY=str(uuid4()),
            )
            self.assertEqual(res.status_code, 201, res.content)
            report_id = res.json()["id"]

            res_msg = self.client.post(
                f"/api/v1/reports/{report_id}/messages",
                {"kind": "message", "body": "Follow up call 08091112222 from Abubakar Sani."},
                content_type="application/json",
                HTTP_IDEMPOTENCY_KEY=str(uuid4()),
            )
            self.assertEqual(res_msg.status_code, 201, res_msg.content)
        finally:
            handler.flush()
            root_logger.removeHandler(handler)
            root_logger.setLevel(old_level)

        log_content = log_stream.getvalue()
        self.assertNotIn("08091112222", log_content)
        self.assertNotIn("Abubakar Sani", log_content)
        self.assertNotIn("11223344556", log_content)

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

        # 6. Verify Cache-Control: no-store, exact response shape, and OriginalAccess reason
        self.assertIn("no-store", res.headers.get("Cache-Control", ""))
        self.assertEqual(set(body.keys()), {"description"})
        from privacy.models import OriginalAccess
        access_row = OriginalAccess.objects.filter(report=report, actor=self.reviewer_a).last()
        self.assertIsNotNone(access_row)
        self.assertEqual(access_row.reason, "Verifying witness identity for corroboration")

        # 7. Cross-organisation reviewer gets 403/404
        other_reviewer = User.objects.create_user(
            email="other.rev@orgb.com",
            password="secure-password-123",
            organisation=self.org_b,
            role=User.Role.REVIEWER,
        )
        self.client.force_login(other_reviewer)
        res_other = self.client.post(
            f"/api/v1/cases/{report.pk}/original",
            {"reason": "Cross org probe"},
            content_type="application/json",
        )
        self.assertIn(res_other.status_code, (403, 404))

        # 8. Rate limit: 31st call returns 429 (use fresh reviewer so quota starts at 0)
        reviewer_rl = User.objects.create_user(
            email="reviewer.rl@example.com",
            password="secure-password-123",
            organisation=self.org_a,
            role=User.Role.REVIEWER,
        )
        report.assigned_reviewer = reviewer_rl
        report.save(update_fields=["assigned_reviewer"])
        self.client.force_login(reviewer_rl)
        for _ in range(30):
            r_ok = self.client.post(
                f"/api/v1/cases/{report.pk}/original",
                {"reason": "Repeated verification"},
                content_type="application/json",
            )
            self.assertEqual(r_ok.status_code, 200)
        r_429 = self.client.post(
            f"/api/v1/cases/{report.pk}/original",
            {"reason": "31st call"},
            content_type="application/json",
        )
        self.assertEqual(r_429.status_code, 429)

    def test_manual_redaction_layers_on_auto_redaction(self):
        from reports.v1_views import persist_report

        values = {
            "occurred_at": timezone.now(),
            "description": "Call 08031234567 and ask for Xyzkora at the polling unit.",
            "incident_details": {"kind": "incident", "area": {"polling_unit_name": "PU 1"}},
        }
        _, _, report = persist_report(None, self.org_a.pk, values)
        report.assigned_reviewer = self.reviewer_a
        report.save(update_fields=["assigned_reviewer"])

        # Auto redaction hid phone; Xyzkora (not in dictionary) remains in auto_redacted_description
        self.assertNotIn("08031234567", report.auto_redacted_description)
        self.assertIn("Xyzkora", report.auto_redacted_description)

        idx = report.auto_redacted_description.index("Xyzkora")
        self.client.force_login(self.reviewer_a)
        res = self.client.post(
            f"/api/v1/review/cases/{report.pk}/redaction",
            {"spans": [{"start": idx, "end": idx + len("Xyzkora")}], "version": report.version},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(res.status_code, 200, res.content)
        redacted_desc = res.json()["redacted_description"]
        self.assertNotIn("08031234567", redacted_desc)
        self.assertNotIn("Xyzkora", redacted_desc)
        self.assertIn("[PHONE_", redacted_desc)
        self.assertIn("[name removed]", redacted_desc)

        report.refresh_from_db()
        self.assertTrue(len(report.auto_redactions) >= 1)
        self.assertEqual(len(report.redactions), 1)

    def test_false_positives_and_recall_gaps_from_review(self):
        # False positives check (ordinary election text must not be redacted)
        clean_sentences = [
            "Election forms delivered to ward collation centre.",
            "Returning officer was chosen by the committee.",
            "Chief Imam prayed for peaceful voting before accreditation.",
            "Sensitive items musa not be left unattended.",
            "14 observers were on the way to the polling unit.",
            "100 voters waited on the expressway near the gate.",
            "Record serial 0012345678 account of votes cast at unit.",
            "Account of votes 0012345678 recorded at closing.",
            "Ballot boxes numbered 12345678901 arrived. NIN registration centre closed.",
            "Observers gathered at 10 Ward Road before accreditation.",
            "Polling materials at 5 Polling Street and 8 Collation Avenue.",
        ]
        for sentence in clean_sentences:
            res = redact(sentence, self.org_a)
            self.assertEqual(res.spans, [], f"False positive in: {sentence} -> {res.text}")

        # Recall gaps check
        recall_cases = [
            ("NIN of the voter is 12345678901", "12345678901", "nin"),
            ("Transfer sent to a/c 0123456789 at unit", "0123456789", "account"),
            ("Voter presented VIN AB12345678901234567 at desk", "AB12345678901234567", "vin"),
            ("Call (0803) 123 4567 immediately", "(0803) 123 4567", "phone"),
            ("Call 0803  123  4567 for backup", "0803  123  4567", "phone"),
            ("BVN: 2234 5678 901 was checked", "2234 5678 901", "bvn"),
            ("Send to account no 0123 456 789", "0123 456 789", "account"),
            ("NIN 1234-5678-901 verified", "1234-5678-901", "nin"),
            ("PVC AB12 3456 7890 1234 567", "AB12 3456 7890 1234 567", "vin"),
        ]
        for text, secret_val, expected_kind in recall_cases:
            res = redact(text, self.org_a)
            self.assertNotIn(secret_val, res.text, f"Missed {expected_kind} in: {text}")
            self.assertIn(expected_kind, [s["kind"] for s in res.spans])

    def test_original_available_false_when_nothing_redacted(self):
        from reports.v1_views import persist_report

        values = {
            "occurred_at": timezone.now(),
            "description": "Long queue at polling unit, accreditation delayed by 30 minutes.",
            "incident_details": {"kind": "incident", "area": {"polling_unit_name": "PU 1"}},
        }
        _, _, report = persist_report(None, self.org_a.pk, values)
        report.assigned_reviewer = self.reviewer_a
        report.save(update_fields=["assigned_reviewer"])

        self.client.force_login(self.reviewer_a)
        case01 = self.client.get(f"/api/v1/review/cases/{report.pk}").json()
        self.assertFalse(case01["original_available"])
        self.assertFalse(case01["redaction"]["automatic"])

    def test_withdrawal_clears_auto_redacted_fields(self):
        from reports.v1_views import persist_report

        values = {
            "occurred_at": timezone.now(),
            "description": "Witness Chinedu Okafor phone 08031234567.",
            "incident_details": {"kind": "incident", "area": {"polling_unit_name": "PU 1"}},
        }
        _, _, report = persist_report(self.observer, self.org_a.pk, values, code="OBS-123456")
        self.assertIsNotNone(report.auto_redacted_description)

        self.client.force_login(self.observer)
        res = self.client.post(
            f"/api/v1/reports/{report.pk}/withdraw",
            {"version": report.version, "confirm": True},
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        self.assertEqual(res.status_code, 200, res.content)
        report.refresh_from_db()
        self.assertIsNone(report.auto_redacted_description)
        self.assertEqual(report.auto_redactions, [])

    def test_backfill_command_1200_rows_does_not_skip(self):
        from django.core.management import call_command

        reports = [
            Report(
                organisation=self.org_a,
                observer=self.observer,
                submission_key=uuid4(),
                occurred_at=timezone.now(),
                description=f"Report {i} phone 0803{i:07d}",
                auto_redacted_description=None,
            )
            for i in range(1200)
        ]
        Report.objects.bulk_create(reports)
        call_command("redact_existing", batch_size=500)
        remaining = Report.objects.filter(organisation=self.org_a, auto_redacted_description__isnull=True).count()
        self.assertEqual(remaining, 0)

    def test_guard_no_raw_pii_across_staff_endpoints(self):
        from datetime import timedelta
        from accounts.staff_sessions import VERIFIED
        from ops.models import ClusterWarning
        from reports.models import MediaItem
        from reports.v1_views import persist_report
        from staff.test_support import bind_staff_session

        raw_phone = "0803 123 4567"
        raw_name = "Mrs Adaeze Okafor"
        raw_name_core = "Adaeze Okafor"
        values = {
            "occurred_at": timezone.now(),
            "description": f"Incident reported by {raw_name} on {raw_phone}.",
            "incident_details": {
                "kind": "incident",
                "area": {"state_code": "LA", "lga_code": "LA-01", "lga_name": "Ikeja"},
                "category_observer": "intimidation_violence",
            },
        }
        _, _, report = persist_report(self.observer, self.org_a.pk, values, code="OBS-123456")
        report.assigned_reviewer = self.reviewer_a
        report.save(update_fields=["assigned_reviewer"])

        # Observer MESSAGE
        ReviewEvent.objects.create(
            report=report,
            organisation=self.org_a,
            actor=self.observer,
            action=ReviewEvent.Action.MESSAGE,
            version=report.version + 1,
            change={"author": "observer", "note": f"Observer message from {raw_name} ({raw_phone})"},
        )
        # Formal question + Observer RESPOND
        ReviewEvent.objects.create(
            report=report,
            organisation=self.org_a,
            actor=self.reviewer_a,
            action=ReviewEvent.Action.REQUEST_CLARIFICATION,
            version=report.version + 2,
            change={"author": "reviewer", "note": "Please clarify"},
        )
        ev_resp = ReviewEvent.objects.create(
            report=report,
            organisation=self.org_a,
            actor=None,
            action=ReviewEvent.Action.RESPOND,
            version=report.version + 3,
            change={"author": "observer", "note": f"Reply from {raw_name} ({raw_phone})"},
        )
        # Citizen reply WITHOUT auto_redacted_body filled in
        CitizenReply.objects.create(
            report=report,
            organisation=self.org_a,
            question_id=str(uuid4()),
            event=ev_resp,
            body=f"Citizen reply from {raw_name} ({raw_phone})",
            auto_redacted_body="",
        )
        # Transcript
        MediaItem.objects.create(
            organisation=self.org_a,
            report=report,
            purpose="evidence",
            kind=MediaItem.Kind.AUDIO,
            status=MediaItem.Status.READY,
            size_bytes=100,
            original_sha256="a" * 64,
            sha256="b" * 64,
            transcript=f"Audio by {raw_name} phone {raw_phone}",
            transcript_status="ready",
        )
        # Discussion post (flagged so it appears in moderation list)
        disc = Discussion.objects.create(
            organisation=self.org_a,
            title="Ward 1",
            topic="Ward 1",
            area={"ward_code": "KN-04-01"},
            closes_at=timezone.now() + timedelta(hours=4),
        )
        code_obj = ObserverCode.objects.get(user=self.observer)
        member = Membership.objects.create(discussion=disc, observer=code_obj, state="member")
        post = Post.objects.create(
            discussion=disc,
            author=member,
            body=f"Discussion post by {raw_name} {raw_phone}",
            auto_redacted_body=redact(f"Discussion post by {raw_name} {raw_phone}", self.org_a).text,
            name_check=True,
        )

        coordinator = User.objects.create_user(
            email="coord.guard@example.com", password="pw", organisation=self.org_a, role=User.Role.COORDINATOR
        )
        moderator_user = User.objects.create_user(
            email="mod.guard@example.com", password="pw", organisation=self.org_a, role=User.Role.MODERATOR
        )
        org_admin = User.objects.create_user(
            email="admin.guard@example.com", password="pw", organisation=self.org_a, role=User.Role.ORG_ADMIN
        )
        ClusterWarning.objects.create(
            organisation=self.org_a, category="intimidation_violence",
            area={"state_code": "LA", "lga_code": "LA-01", "lga_name": "Ikeja"},
            lga_code="LA-01", report_ids=[str(report.pk)], baseline=0.5,
            window_start=timezone.now() - timedelta(hours=1), window_end=timezone.now(),
        )

        def login_staff(user):
            self.client.force_login(user)
            session = self.client.session
            session[VERIFIED] = True
            session.save()
            bind_staff_session(session, user)

        role_urls = [
            (self.reviewer_a, [
                "/api/v1/review/queue",
                f"/api/v1/review/cases/{report.pk}",
                f"/api/v1/reports/{report.pk}/messages",
                "/api/review",
                f"/api/review/{report.pk}",
            ]),
            (moderator_user, [
                "/api/v1/discussions",
                f"/api/v1/discussions/{disc.pk}",
                "/api/v1/moderation/flags",
            ]),
            (coordinator, [
                "/api/v1/ops/overview",
                "/api/v1/ops/clusters",
                "/api/v1/publish/snapshots",
            ]),
            (org_admin, [
                "/api/v1/audit/export",
            ]),
        ]

        for user, urls in role_urls:
            login_staff(user)
            for url in urls:
                resp = self.client.get(url)
                raw_bytes = b"".join(resp.streaming_content) if hasattr(resp, "streaming_content") else resp.content
                self.assertEqual(resp.status_code, 200, f"{url} returned {resp.status_code}: {raw_bytes[:200]}")
                text = raw_bytes.decode("utf-8")
                self.assertNotIn(raw_phone, text, f"PII phone leaked at {url}")
                self.assertNotIn(raw_name_core, text, f"PII name leaked at {url}")
