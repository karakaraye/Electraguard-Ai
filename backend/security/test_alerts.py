from django.test import TestCase

from accounts.models import Organisation, User
from accounts.staff_auth import VERIFIED

from .detectors import notice


class SecurityTests(TestCase):
    def test_scope_version_and_alert_deduplication(self):
        user = User.objects.create_user("coordinator@example.org", role="coordinator")
        other = Organisation.objects.create(name="Other")
        for org in [user.organisation, other, user.organisation]:
            notice(org.pk, "intake_burst", "organisation", org.pk, org.name, {"reports": 100})
        self.client.force_login(user)
        session = self.client.session
        session[VERIFIED] = True
        session.save()
        url = "/api/v1/security/alerts"
        result = self.client.get(url).json()["items"]
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["rule"], "intake_burst")
        endpoint = f'{url}/{result[0]["id"]}'
        self.assertEqual(self.client.post(endpoint, {
            "status": "acknowledged", "version": 0,
        }, content_type="application/json").json()["status"], "acknowledged")
        stale = self.client.post(endpoint, {"status": "resolved", "version": 0}, content_type="application/json")
        self.assertEqual(stale.json()["error"]["code"], "stale_version")
