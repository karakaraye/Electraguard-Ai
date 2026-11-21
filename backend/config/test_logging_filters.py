from logging import ERROR, LogRecord
from unittest import TestCase

from .logging_filters import PrivateRequestFilter


class PrivateRequestFilterTests(TestCase):
    def test_private_request_record_drops_path_user_data_and_exception(self):
        original = LogRecord(
            "django.request", ERROR, "private path", 2, "Request failed: %s",
            ("/api/reports/sensitive-reference",), (ValueError, ValueError("sensitive data"), None),
        )
        original.status_code = 500
        original.request = object()
        filtered = PrivateRequestFilter().filter(original)
        self.assertEqual(filtered.getMessage(), "HTTP event status=500")
        self.assertEqual(filtered.levelno, ERROR)
        self.assertIsNone(filtered.exc_info)
        self.assertFalse(hasattr(filtered, "request"))
