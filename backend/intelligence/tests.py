from datetime import timedelta
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from accounts.models import Organisation, User
from reports.models import Report, Triage, TriageMatch

from .learning import incident_models, rank_claims
from .models import ClusterSuggestion, MaterialsRisk
from .result_checks import evaluate_sheet
from .triage import burst, process_next, urgency


class IntelligenceTests(TestCase):
    def report(self, organisation, ward="AA-01-01", **details):
        report = Report.objects.create(
            organisation=organisation, submission_key=uuid4(), receipt_code=uuid4().hex[:12],
            description="The polling materials arrived late at the polling unit",
            occurred_at=timezone.now(),
            incident_details={"area": {"state_code": "AA", "lga_code": "AA-01", "ward_code": ward},
                              "category_observer": "late_materials", **details},
        )
        Triage.objects.create(report=report, organisation=organisation, method_version="test")
        return report

    def test_worker_suggests_without_changing_report_and_scopes_duplicates(self):
        org = Organisation.objects.create(name="First")
        other = Organisation.objects.create(name="Second")
        source = self.report(org, danger_now=True)
        peer = self.report(org)
        self.report(other)
        self.report(org, ward="AA-01-02")
        old = self.report(org)
        old.occurred_at -= timedelta(hours=4)
        old.save(update_fields=["occurred_at"])
        self.assertTrue(process_next())
        job = Triage.objects.get(report=source)
        self.assertEqual(job.suggestions["urgency"]["value"], "urgent")
        self.assertIn("Immediate danger reported", job.suggestions["urgency"]["reasons"])
        self.assertEqual({TriageMatch.objects.get().first_id, TriageMatch.objects.get().second_id}, {source.pk, peer.pk})
        source.refresh_from_db()
        self.assertEqual(source.version, 0)
        self.assertEqual(source.status, Report.Status.SUBMITTED)
        self.assertTrue(ClusterSuggestion.objects.filter(organisation=org).exists())

    def test_local_models_and_burst(self):
        self.assertTrue(burst(7, 16)[0])
        self.assertFalse(burst(7, 64)[0])
        self.assertEqual(urgency({}, None, False, False, 0)["value"], "low")
        self.assertEqual(len(incident_models()[3]), 80)
        ranked = rank_claims(["A claim to check", "I heard something about a voting app."])
        self.assertEqual({score["rank"] for score in ranked}, {1, 2})
        self.assertTrue(all(0 <= value <= 1 for score in ranked
                            for value in (score["harm"], score["check_worthiness"])))

    def test_result_checks_and_missing_counts(self):
        sheet = {
            "pu_id": "current", "accredited_voters": 240, "registered_voters": 230,
            "votes_A": 10, "votes_B": 20, "votes_C": 40, "votes_D": 50, "votes_E": 102,
            "rejected_votes": 0,
        }
        self.assertEqual(set(evaluate_sheet(sheet, sheet | {"pu_id": "previous"})), {
            "accredited_exceeds_registered", "sum_mismatch", "suspicious_round_numbers",
            "duplicated_from_previous_unit", "digit_transposition",
        })
        self.assertEqual(evaluate_sheet({"votes_A": None}), {})

    def test_risk_endpoint_auth_and_scope(self):
        path = "/api/v1/ops/late-materials-risk"
        self.assertEqual(self.client.get(path).status_code, 401)
        org = Organisation.objects.create(name="Scoped")
        other = Organisation.objects.create(name="Other")
        user = User.objects.create_user("risk@example.test", organisation=org, role=User.Role.REVIEWER)
        self.client.force_login(user)
        self.assertEqual(self.client.get(path).status_code, 403)
        user.role = User.Role.ADMINISTRATOR
        user.save()
        self.assertIsNone(self.client.get(path).json()["generated_at"])
        for company, code, hours in ((org, "U1", 2), (org, "U2", 4), (other, "U3", 8)):
            MaterialsRisk.objects.create(
                organisation=company, polling_unit_code=code, state_code="AA", generated_at=timezone.now(),
                prediction={"polling_unit_code": code, "predicted_transit_hours": hours}, metrics={},
            )
        rows = self.client.get(path + "?state_code=AA").json()["rows"]
        self.assertEqual([row["polling_unit_code"] for row in rows], ["U2", "U1"])
        self.assertEqual(self.client.get(path + "?limit=0").status_code, 422)
