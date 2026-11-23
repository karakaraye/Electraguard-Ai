from datetime import timedelta
from uuid import uuid4

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import Organisation, User
from accounts.staff_auth import VERIFIED
from reports.models import Evidence, Report

from .audit import record
from .models import AuditEvent


class RetentionTests(TestCase):
    url = "/api/v1/admin/settings"

    def setUp(self):
        self.admin = User.objects.create_user("admin@example.org", role="org_admin")
        self.client.force_login(self.admin)
        session = self.client.session
        session[VERIFIED] = True
        session.save()
        self.organisation = self.admin.organisation

    def patch(self, data):
        return self.client.patch(self.url, data, content_type="application/json")

    def old_report(self, organisation):
        observer = User.objects.create_user(f"{uuid4()}@example.org", organisation=organisation)
        report = Report.objects.create(
            observer=observer, organisation=organisation, submission_key=uuid4(),
            description="Private observation",
        )
        Report.objects.filter(pk=report.pk).update(created_at=timezone.now() - timedelta(days=40))
        return report

    def test_confirmation_and_version(self):
        self.old_report(self.organisation)
        response = self.patch({"retention_days": 30, "version": 0})
        self.assertEqual(response.json()["error"]["code"], "confirmation_required")
        self.assertIn("delete 1 records", response.json()["error"]["message"])
        response = self.patch({"retention_days": 30, "intake_paused": True, "version": 0, "confirm": True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], 1)
        self.assertTrue(self.client.get(self.url).json()["intake_paused"])
        self.assertEqual(self.patch({"version": 0}).json()["error"]["code"], "stale_version")
        self.assertEqual(self.patch({"version": 1, "public_delay_minutes": 59}).status_code, 422)

    def test_purge_is_scoped_and_preserves_audit_chain(self):
        other = Organisation.objects.create(name="Other")
        retained = self.old_report(other)
        expired = self.old_report(self.organisation)
        self.organisation.retention_days = 30
        self.organisation.save(update_fields=["retention_days"])
        evidence = Evidence.objects.create(
            organisation=self.organisation, report=expired, name="image.png",
            content_type="image/png", sha256="a" * 64, content=b"test",
        )
        record(
            self.organisation.pk, "create", "report", expired.pk, content=expired.description,
        )
        call_command("purge_retention", dry_run=True)
        self.assertTrue(Report.objects.filter(pk=expired.pk).exists())
        call_command("purge_retention")
        self.assertFalse(Report.objects.filter(pk=expired.pk).exists())
        self.assertFalse(Evidence.objects.filter(pk=evidence.pk).exists())
        self.assertTrue(Report.objects.filter(pk=retained.pk).exists())
        self.assertTrue(self.client.get("/api/v1/audit/verify").json()["intact"])
        self.assertEqual(AuditEvent.objects.filter(organisation=self.organisation).count(), 2)
