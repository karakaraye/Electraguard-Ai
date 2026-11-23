from django.test import TestCase
from django.utils import timezone

from accounts.models import Organisation, User
from accounts.staff_auth import VERIFIED

from .models import LateMaterialsRisk, LateMaterialsRun


class LateMaterialsTests(TestCase):
    url = "/api/v1/ops/late-materials-risk"

    def setUp(self):
        self.user = User.objects.create_user("coordinator@example.org", role="coordinator")
        self.client.force_login(self.user)
        session = self.client.session
        session[VERIFIED] = True
        session.save()

    def test_reads_organisation_model_run_with_state_filter(self):
        other = Organisation.objects.create(name="Other")
        run_data = {
            "model_version": "test", "generated_at": timezone.now(), "data_source": "synthetic",
        }
        LateMaterialsRun.objects.create(organisation=other, **run_data)
        self.assertIsNone(self.client.get(self.url).json()["generated_at"])
        run = LateMaterialsRun.objects.create(organisation=self.user.organisation, **run_data)
        LateMaterialsRisk.objects.create(
            run=run, rank=1, state_code="KN", lga_code="L", lga_name="LGA",
            ward_code="W", ward_name="Ward", polling_unit_code="P", predicted_transit_hours=9,
            risk="high", factors=["river_crossing"],
        )
        self.assertEqual(self.client.get(self.url, {"state_code": "KN"}).json()["rows"][0]["rank"], 1)
        self.assertEqual(self.client.get(self.url, {"state_code": "LA"}).json()["rows"], [])
        self.assertEqual(self.client.get(self.url, {"limit": 101}).status_code, 422)

    def test_access_requires_role_and_totp(self):
        self.user.role = "reviewer"
        self.user.save(update_fields=["role"])
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.client.logout()
        self.assertEqual(self.client.get(self.url).status_code, 401)
