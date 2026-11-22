from datetime import datetime
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User

from .models import Report, ReviewEvent, Triage, TriageMatch
from .triage import METHOD_VERSION

CONFIRMED = TriageMatch.Decision.CONFIRMED
REVERSED = TriageMatch.Decision.REVERSED


class ReversalFixture(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.observer = User.objects.create_user("observer@reversal.example", role=User.Role.OBSERVER)
        cls.reviewer = User.objects.create_user("reviewer@reversal.example", role=User.Role.REVIEWER)
        cls.other = User.objects.create_user("other@reversal.example", role=User.Role.REVIEWER)
        cls.admin = User.objects.create_user("admin@reversal.example", role=User.Role.ADMINISTRATOR)

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.client.force_login(self.reviewer)
        self.admin_client = APIClient()
        self.admin_client.force_login(self.admin)

    def post(self, path, data):
        token = self.client.get("/api/auth/csrf").json()["csrfToken"]
        return self.client.post(path, data, format="json", HTTP_X_CSRFTOKEN=token)

    def report(self, reviewer=None):
        report = Report.objects.create(
            observer=self.observer, submission_key=uuid4(), assigned_reviewer=reviewer or self.reviewer,
            occurred_at=datetime.fromisoformat("2026-03-12T09:00:00+01:00"),
            location="Fictional Cedar Training Hall", description="Synthetic private report details.",
        )
        Triage.objects.create(
            report=report, method_version=METHOD_VERSION, status=Triage.Status.READY,
            category=Triage.Category.ACCESS,
        )
        return report

    def link(self, first, second, decision=CONFIRMED):
        first, second = sorted((first, second), key=lambda report: report.pk)
        return TriageMatch.objects.create(first=first, second=second, score=0.8, decision=decision)

    def reverse(self, report, candidate, version=None, reason="Synthetic reason: different incidents."):
        if version is None:
            version = Report.objects.get(pk=report.pk).version
        data = {"version": version}
        if reason is not None:
            data["reason"] = reason
        return self.post(f"/api/review/{report.pk}/triage/matches/{candidate.pk}/reverse", data)

    def incidents(self):
        result = self.admin_client.get("/api/dashboard").data
        return result["report_count"], result["incident_count"]


@patch("reports.capabilities.GROUPING_ENABLED", True)
class MatchReversalTests(ReversalFixture):
    def test_reversal_splits_two_reports_and_preserves_records(self):
        a, b = self.report(), self.report()
        self.link(a, b, TriageMatch.Decision.PENDING)
        self.assertEqual(self.post(f"/api/review/{a.pk}/triage/matches/{b.pk}", {
            "version": 0, "decision": "confirmed",
        }).status_code, 200)
        for data in ({"version": 0, "action": "start"}, {
            "version": 1, "action": "close", "outcome": "corroborated", "note": "Synthetic rationale.",
        }):
            self.assertEqual(self.post(f"/api/review/{b.pk}/actions", data).status_code, 200)
        confirmation = ReviewEvent.objects.get(report=a, action=ReviewEvent.Action.DECIDE_MATCH)
        closure = ReviewEvent.objects.get(report=b, action=ReviewEvent.Action.CLOSE)
        self.assertEqual(self.incidents(), (2, 1))

        response = self.reverse(a, b, version=1)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["version"], 2)
        self.assertEqual(self.incidents(), (2, 2))
        self.assertEqual(TriageMatch.objects.get().decision, REVERSED)
        self.assertEqual(Report.objects.count(), 2)
        self.assertEqual(Report.objects.get(pk=b.pk).status, Report.Status.CLOSED)
        self.assertEqual(ReviewEvent.objects.get(pk=closure.pk).change, closure.change)
        self.assertEqual(ReviewEvent.objects.get(pk=confirmation.pk).change, confirmation.change)

        history = self.client.get(f"/api/review/{a.pk}").data["history"]
        self.assertEqual([event["action"] for event in history], ["decide_match", "reverse_match"])
        self.assertEqual(history[1]["actor"], self.reviewer.email)
        self.assertEqual(history[1]["change"], {
            "candidate": str(b.pk), "previous_decision": "confirmed",
            "reason": "Synthetic reason: different incidents.",
        })
        matches = self.client.get(f"/api/review/{a.pk}/triage").data["matches"]
        self.assertEqual([match["decision"] for match in matches], ["reversed"])

    def test_reversed_match_cannot_be_decided_again(self):
        a, b = self.report(), self.report()
        self.link(a, b)
        self.assertEqual(self.reverse(a, b).status_code, 200)
        self.assertEqual(self.post(f"/api/review/{a.pk}/triage/matches/{b.pk}", {
            "version": 1, "decision": "confirmed",
        }).status_code, 409)
        self.assertEqual(TriageMatch.objects.get().decision, REVERSED)

    def test_reversing_a_bridge_splits_a_transitive_group(self):
        a, b, c = self.report(), self.report(), self.report()
        self.link(a, b)
        self.link(b, c)
        self.assertEqual(self.incidents(), (3, 1))
        self.assertEqual(self.reverse(c, b).status_code, 200)
        self.assertEqual(self.incidents(), (3, 2))

    def test_alternate_confirmed_path_keeps_group_intact(self):
        a, b, c = self.report(), self.report(), self.report()
        self.link(a, b)
        self.link(b, c)
        self.link(a, c)
        self.assertEqual(self.reverse(a, b).status_code, 200)
        self.assertEqual(self.incidents(), (3, 1))
        self.assertEqual(self.reverse(b, c).status_code, 200)
        self.assertEqual(self.incidents(), (3, 2))

    def test_reason_is_required_and_nonblank(self):
        a, b = self.report(), self.report()
        self.link(a, b)
        for reason in (None, "", "   "):
            self.assertEqual(self.reverse(a, b, reason=reason).status_code, 400)
        self.assertEqual(TriageMatch.objects.get().decision, CONFIRMED)
        self.assertEqual(Report.objects.get(pk=a.pk).version, 0)
        self.assertFalse(ReviewEvent.objects.exists())

    def test_repeated_and_stale_requests_do_not_duplicate_audit_entries(self):
        a, b, c = self.report(), self.report(), self.report()
        self.link(a, b)
        self.link(a, c, TriageMatch.Decision.DISMISSED)
        self.assertEqual(self.reverse(a, b, version=0).status_code, 200)
        self.assertEqual(self.reverse(a, b, version=0).status_code, 409)
        self.assertEqual(self.reverse(a, b, version=1).status_code, 409)
        self.assertEqual(self.reverse(b, a, version=0).status_code, 409)
        self.assertEqual(self.reverse(a, c, version=1).status_code, 409)
        self.assertEqual(ReviewEvent.objects.filter(action=ReviewEvent.Action.REVERSE_MATCH).count(), 1)
        self.assertEqual([Report.objects.get(pk=r.pk).version for r in (a, b, c)], [1, 0, 0])

    def test_only_a_reviewer_assigned_to_both_reports_can_reverse(self):
        a, b = self.report(), self.report(self.other)
        self.link(a, b)
        self.assertEqual(self.reverse(a, b).status_code, 404)
        self.client.force_login(self.other)
        self.assertEqual(self.reverse(b, a).status_code, 404)
        for user in (self.observer, self.admin):
            self.client.force_login(user)
            self.assertEqual(self.reverse(a, b).status_code, 403)
        self.assertEqual(TriageMatch.objects.get().decision, CONFIRMED)
        self.assertFalse(ReviewEvent.objects.exists())

    def test_reassignment_hides_reversal_history_from_former_reviewer(self):
        a, b = self.report(), self.report()
        self.link(a, b)
        self.assertEqual(self.reverse(a, b).status_code, 200)
        self.assertIn(str(b.pk), self.client.get(f"/api/review/{a.pk}").content.decode())

        self.assertEqual(self.admin_client.post(f"/api/assignments/{b.pk}", {
            "reviewer": self.other.pk, "version": 0,
        }, format="json").status_code, 200)
        for path in (f"/api/review/{a.pk}", f"/api/review/{a.pk}/triage"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertNotIn(str(b.pk), response.content.decode())
        self.assertEqual(ReviewEvent.objects.filter(report=a).count(), 1)


class ReversalWhileGroupingDisabledTests(ReversalFixture):
    """Production default: grouping stays behind the server gate."""

    def test_reversal_endpoint_is_unavailable(self):
        a, b = self.report(), self.report()
        self.link(a, b)
        self.assertEqual(self.reverse(a, b).status_code, 404)
        self.assertEqual(TriageMatch.objects.get().decision, CONFIRMED)
        self.assertFalse(ReviewEvent.objects.exists())
        self.assertNotIn("incident_count", self.admin_client.get("/api/dashboard").data)

    def test_recorded_reversal_stays_out_of_history_and_triage(self):
        a, b = self.report(), self.report()
        self.link(a, b)
        with patch("reports.capabilities.GROUPING_ENABLED", True):
            self.assertEqual(self.reverse(a, b).status_code, 200)
        for path in (f"/api/review/{a.pk}", f"/api/review/{a.pk}/triage"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertNotIn(str(b.pk), response.content.decode())
        self.assertEqual(self.client.get(f"/api/review/{a.pk}").data["history"], [])
