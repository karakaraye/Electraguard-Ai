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
        self.assertEqual(len(incident_models().test), 80)
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
        user.role = User.Role.COORDINATOR
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


class ModelEvaluationTests(TestCase):
    """Guards for the leakage, urgency-recall and reproducibility fixes."""

    def test_templates_collapse_once_place_names_are_removed(self):
        from .learning import csv_rows, deduplicate, normalise_description
        self.assertEqual(normalise_description("Materials arrived late at Imo L1-W2."),
                         normalise_description("materials  arrived late at Cross River L3-W1."))
        self.assertEqual(len(deduplicate(csv_rows("incident_reports_synthetic.csv"))), 7)

    def test_robustness_set_is_disjoint_from_training_text(self):
        from .learning import authored_rows
        train = {row["description"].casefold() for row in authored_rows("train") + authored_rows("calibration")}
        self.assertFalse(train & {row["description"].casefold() for row in authored_rows("robustness")})

    def test_urgency_recall_on_held_out_incidents_and_threshold_from_validation(self):
        from .learning import severe
        models = incident_models()
        self.assertGreater(models.urgency_threshold, 0)
        rows = models.test
        risks = models.severity.predict_proba([row["description"] for row in rows])[:, 1]
        names = models.category.classes_[models.category.predict_proba([row["description"] for row in rows]).argmax(axis=1)]
        flags = [urgency({}, name, False, False, risk, models.urgency_threshold)["value"] == "urgent"
                 for name, risk in zip(names, risks)]
        urgent = [flag for row, flag in zip(rows, flags) if severe(row)]
        self.assertGreaterEqual(sum(urgent) / len(urgent), .85)

    def test_rules_lift_urgency(self):
        self.assertEqual(urgency({}, "intimidation_violence", False, False, 0)["value"], "urgent")
        self.assertEqual(urgency({"danger_now": True}, None, False, False, 0)["value"], "urgent")
        self.assertEqual(urgency({}, None, False, False, .9, .4)["value"], "urgent")
        self.assertEqual(urgency({"firsthand": True}, None, True, False, 0)["value"], "high")
        self.assertEqual(urgency({"firsthand": True}, None, True, True, 0)["value"], "urgent")
        self.assertEqual(urgency({}, None, False, False, .1, .4)["value"], "low")

    def test_robustness_macro_f1_is_reported_below_the_memorised_score(self):
        from sklearn.metrics import f1_score
        models = incident_models()
        robust = models.robustness
        guesses = models.category.predict([row["description"] for row in robust])
        self.assertGreater(len(robust), 40)
        self.assertGreater(f1_score([row["category"] for row in robust], guesses, average="macro"), .7)

    def test_evaluation_report_is_deterministic(self):
        from .management.commands.evaluate_models import evaluate
        first = "\n\n".join(evaluate())
        self.assertEqual(first, "\n\n".join(evaluate()))
        for needle in ("Seed 42", "Leakage audit", "Robustness set", "Failure or abstention examples",
                       "Per slice", "Held-out test-set descriptions"):
            self.assertIn(needle, first)
