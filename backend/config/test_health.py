from unittest.mock import patch

from django.db import OperationalError
from django.test import TestCase


class HealthTests(TestCase):
    def test_readiness_checks_the_database_and_reports_generic_failure(self):
        self.assertEqual(self.client.get("/health/ready").json(), {"status": "ok"})
        with patch("config.health.connection.cursor", side_effect=OperationalError("private detail")):
            ready = self.client.get("/health/ready")
            self.assertEqual(ready.status_code, 503)
            self.assertEqual(ready.json(), {"status": "unavailable"})
            self.assertIn("no-store", ready.headers["Cache-Control"])
            self.assertEqual(self.client.get("/health/live").status_code, 200)
        self.assertEqual(self.client.post("/health/ready").status_code, 405)
