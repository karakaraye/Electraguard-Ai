from datetime import datetime
from uuid import uuid4

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User

from .dashboard import incident_count
from .models import Report, ReviewEvent, Triage, TriageMatch
from .triage import METHOD_VERSION


class DashboardTests(TestCase):
    url = "/api/dashboard"

    @classmethod
    def setUpTestData(cls):
        cls.observer = User.objects.create_user("observer@dashboard.example", role=User.Role.OBSERVER)
        cls.reviewer = User.objects.create_user("reviewer@dashboard.example", role=User.Role.REVIEWER)
        cls.admin = User.objects.create_user("admin@dashboard.example", role=User.Role.ADMINISTRATOR)

    def setUp(self):
        self.client = APIClient()
        self.client.force_login(self.admin)

    def report(self, date="2026-03-12T09:00:00+01:00", **fields):
        return Report.objects.create(
            observer=self.observer, submission_key=uuid4(),
            occurred_at=datetime.fromisoformat(date), location="Fictional Cedar Hall",
            description="Synthetic private report details.", **fields,
        )

    def link(self, first, second, decision):
        first, second = sorted((first, second), key=lambda report: report.pk)
        return TriageMatch.objects.create(first=first, second=second, score=0.8, decision=decision)

    def test_only_confirmed_links_count_transitive_incidents(self):
        a, b, c = [self.report() for _ in range(3)]
        self.link(a, b, "confirmed")
        pending = self.link(b, c, "pending")
        self.link(a, c, "dismissed")
        selected = [a.pk, b.pk, c.pk]
        active = TriageMatch.objects.filter(decision="confirmed").values_list("first_id", "second_id")
        self.assertEqual(incident_count(selected, active), 2)
        pending.decision = "confirmed"
        pending.save(update_fields=["decision"])
        self.assertEqual(incident_count(selected, active.all()), 1)
        self.assertNotIn("incident_count", self.client.get(self.url).data)

    def test_report_only_wat_dates_and_closed_outcomes_reconcile(self):
        a = self.report("2026-03-11T23:00:00+00:00", status=Report.Status.CLOSED)
        b = self.report("2026-03-11T22:59:59+00:00")
        c = self.report("2026-03-12T22:59:59+00:00", status=Report.Status.IN_REVIEW)
        self.report("2026-03-12T23:00:00+00:00")
        self.link(a, b, "confirmed")
        self.link(b, c, "confirmed")
        ReviewEvent.objects.create(
            report=a, actor=self.reviewer, version=1, action=ReviewEvent.Action.CLOSE,
            change={"outcome": Report.Outcome.INSUFFICIENT_EVIDENCE, "note": "Fictional private rationale."},
        )
        Triage.objects.create(
            report=a, method_version=METHOD_VERSION, status=Triage.Status.READY,
            category=Triage.Category.ACCESS, corrected_category=Triage.Category.PROCEDURE,
        )
        response = self.client.get(self.url, {"start": "2026-03-12", "end": "2026-03-12"})
        self.assertEqual(response.status_code, 200)
        result = response.data
        self.assertEqual(result["report_count"], 2)
        self.assertNotIn("incident_count", result)
        statuses = {row["label"]: row["count"] for row in result["statuses"]}
        categories = {row["label"]: row["count"] for row in result["categories"]}
        self.assertEqual(statuses, {"Submitted": 0, "In review": 1, "Needs clarification": 0, "Closed": 1})
        self.assertEqual(categories["Process or procedure"], 1)
        self.assertEqual(categories["Access or accessibility"], 0)
        self.assertEqual(categories["Uncategorized"], 1)
        outcomes = {row["label"]: row["count"] for row in result["outcomes"]}
        self.assertEqual(outcomes["Insufficient evidence"], 1)
        self.assertEqual(sum(outcomes.values()), statuses["Closed"])
        self.assertNotIn("Fictional private rationale.", response.content.decode())
        empty = self.client.get(self.url, {"start": "2026-03-14"}).data
        self.assertEqual(empty["report_count"], 0)
        self.assertEqual(sum(row["count"] for row in empty["outcomes"]), 0)
        self.assertNotIn(self.observer.email, response.content.decode())
        self.assertNotIn(str(a.pk), response.content.decode())
        self.assertNotIn(a.description, response.content.decode())
        self.assertEqual(self.client.get(self.url, {"start": "2026-03-13", "end": "2026-03-12"}).status_code, 400)
        self.assertEqual(self.client.get(self.url, {"start": "invalid"}).status_code, 400)

    def test_access_is_administrator_only(self):
        for user in (self.observer, self.reviewer, None):
            self.client.logout()
            if user:
                self.client.force_login(user)
            self.assertEqual(self.client.get(self.url).status_code, 403)
