import json

from django.test import TestCase

from accounts.models import Organisation, User
from accounts.staff_auth import VERIFIED

from .audit import record
from .models import AuditEvent


class AuditTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("admin@example.org", role="org_admin")
        self.client.force_login(self.user)
        session = self.client.session
        session[VERIFIED] = True
        session.save()
        self.org = self.user.organisation

    def test_audit_chain_detects_tampering_and_excludes_other_organisations(self):
        other = Organisation.objects.create(name="Other")
        record(other.pk, "external_action", "report")
        first = record(self.org.pk, "review_started", "report")
        second = record(self.org.pk, "review_closed", "report", content={"rationale": "Private"})
        self.assertEqual(second.prev_hash, first.hash)
        url = "/api/v1/audit/verify"
        self.assertEqual(self.client.get(url).json()["events_checked"], 2)
        AuditEvent.objects.filter(pk=first.pk).update(action="modified")
        result = self.client.get(url).json()
        self.assertFalse(result["intact"])
        self.assertEqual(result["first_broken_event_id"], str(first.pk))

    def test_export_streams_digests_and_records_access(self):
        event = record(self.org.pk, "review_closed", "report", content={"rationale": "Private"})
        url = "/api/v1/audit/export"
        response = self.client.get(url)
        self.assertTrue(response.streaming)
        output = b"".join(response.streaming_content)
        self.assertNotIn(b"Private", output)
        self.assertEqual(json.loads(output)["content_digest"], event.content_digest)
        self.assertEqual(AuditEvent.objects.filter(organisation=self.org).last().action, "export_audit")
        self.assertEqual(self.client.get(url, {"from": "2001-01-01"}).status_code, 422)
        self.assertEqual(self.client.get(url, {"format": "xml"}).status_code, 422)

    def test_audit_access_requires_role_and_totp(self):
        url = "/api/v1/audit/export"
        self.client.logout()
        self.assertEqual(self.client.get(url).status_code, 401)
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(url).json()["error"]["code"], "totp_required")
        self.user.role = "coordinator"
        self.user.save(update_fields=["role"])
        self.assertEqual(self.client.get(url).json()["error"]["code"], "forbidden")
