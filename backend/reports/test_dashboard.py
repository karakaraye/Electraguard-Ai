from datetime import datetime
from uuid import uuid4

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User

from .models import Report, Triage, TriageMatch
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
        result = self.client.get(self.url).data
        self.assertEqual((result["report_count"], result["incident_count"]), (3, 2))
        pending.decision = "confirmed"
        pending.save(update_fields=["decision"])
        result = self.client.get(self.url).data
        self.assertEqual((result["report_count"], result["incident_count"]), (3, 1))

    def test_date_filter_uses_wat_and_keeps_confirmed_connections_across_dates(self):
        a = self.report("2026-03-11T23:00:00+00:00", status=Report.Status.CLOSED)
        b = self.report("2026-03-11T22:59:59+00:00")
        c = self.report("2026-03-12T22:59:59+00:00", status=Report.Status.IN_REVIEW)
        self.report("2026-03-12T23:00:00+00:00")
        self.link(a, b, "confirmed")
        self.link(b, c, "confirmed")
        Triage.objects.create(
            report=a, method_version=METHOD_VERSION, status=Triage.Status.READY,
            category=Triage.Category.ACCESS, corrected_category=Triage.Category.PROCEDURE,
        )
        response = self.client.get(self.url, {"start": "2026-03-12", "end": "2026-03-12"})
        self.assertEqual(response.status_code, 200)
        result = response.data
        self.assertEqual((result["report_count"], result["incident_count"]), (2, 1))
        statuses = {row["label"]: row["count"] for row in result["statuses"]}
        categories = {row["label"]: row["count"] for row in result["categories"]}
        self.assertEqual(statuses, {"Submitted": 0, "In review": 1, "Needs clarification": 0, "Closed": 1})
        self.assertEqual(categories["Process or procedure"], 1)
        self.assertEqual(categories["Access or accessibility"], 0)
        self.assertEqual(categories["Uncategorized"], 1)
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
