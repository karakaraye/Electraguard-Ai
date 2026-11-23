from uuid import uuid4

from django.test import Client, TestCase, override_settings

from accounts.models import User
from reports.models import Report
from staff.models import AuditEvent

from .detectors import intake, media_access, staff_network
from .models import Alert


class RequestStub:
    def __init__(self, address):
        self.META = {"REMOTE_ADDR": address}


class DetectorTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("staff@example.org", role="reviewer")
        self.org = self.user.organisation_id

    def rules(self):
        return set(Alert.objects.filter(organisation_id=self.org).values_list("rule", flat=True))

    def test_new_network_alerts_only_after_a_first_known_one(self):
        staff_network(RequestStub("10.1.2.3"), self.user)
        staff_network(RequestStub("10.1.2.99"), self.user)
        self.assertEqual(self.rules(), set())
        staff_network(RequestStub("10.9.9.9"), self.user)
        self.assertEqual(self.rules(), {"new_network_sign_in"})
        alert = Alert.objects.get()
        self.assertNotIn("10.9.9.9", str(alert.details))

    def test_intake_burst_needs_a_hundred_reports_and_deduplicates(self):
        observer = User.objects.create_user("o@example.org", role="observer")
        for _ in range(99):
            Report.objects.create(observer=observer, submission_key=uuid4())
        intake(self.org)
        self.assertEqual(self.rules(), set())
        Report.objects.create(observer=observer, submission_key=uuid4())
        intake(self.org)
        intake(self.org)
        self.assertEqual(Alert.objects.filter(rule="intake_burst").count(), 1)

    def test_download_burst_counts_distinct_items_and_records_access(self):
        for _ in range(101):
            media_access(self.user, uuid4())
        self.assertEqual(self.rules(), {"unusual_download_volume"})
        item = uuid4()
        media_access(self.user, item, download=True)
        media_access(self.user, item, download=True)
        self.assertEqual(AuditEvent.objects.filter(object_id=str(item)).count(), 1)

    @override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
    def test_repeated_failed_staff_sign_in_raises_an_alert_without_secrets(self):
        user = User.objects.create_user("locked@example.org", "correct-horse-battery-12", role="reviewer")
        for _ in range(5):
            Client().post("/api/v1/auth/staff/sign-in", {"email": user.email, "password": "wrong"},
                          content_type="application/json")
        alert = Alert.objects.get(rule="repeated_failed_staff_sign_in")
        self.assertEqual(alert.details, {"failures": 5, "window_minutes": 15})
        self.assertNotIn("wrong", str(alert.details))
