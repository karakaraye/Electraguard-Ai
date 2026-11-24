from datetime import timedelta
from hashlib import sha256
from io import BytesIO, StringIO
from unittest.mock import patch
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from PIL import Image

from . import test_v1_reports
from .media_storage import photo_key, storage
from .models import MediaItem, OcrRead, Report
from .result_ocr import OcrUnavailable, parse_lines
from .test_media import body

URL = "/api/v1/result-sheets/ocr"
LINES = [
    ("Registered voters 742", 0.94), ("Accredited voters: 391", 0.88), ("A 120", 0.91), ("B 98", 0.62),
    ("Party C - 77", 0.90), ("D 51", 0.86), ("Rejected ballots 12", 0.80), ("Signature of the presiding officer", 0.9),
]


def png(width=1):
    output = BytesIO()
    Image.new("L", (width, 1), 128).save(output, "PNG")
    return output.getvalue()


class OcrParsingTests(TestCase):
    def test_fields_confidence_and_unread_values(self):
        fields = parse_lines(LINES, ["A", "B", "C", "D", "E"])
        self.assertEqual(fields["registered"], {"value": 742, "confidence": 0.94})
        self.assertEqual(fields["votes"]["C"], {"value": 77, "confidence": 0.9})
        self.assertEqual(fields["rejected"]["value"], 12)
        self.assertEqual(fields["votes"]["E"], {"value": None, "confidence": 0.0})

    def test_out_of_range_and_unlabelled_numbers_are_ignored(self):
        fields = parse_lines([("Registered 123456", 0.9), ("Page 3", 0.9)], ["A"])
        self.assertIsNone(fields["registered"]["value"])
        self.assertIsNone(fields["votes"]["A"]["value"])


class OcrEndpointTests(TestCase):
    setUpTestData = classmethod(test_v1_reports.ObserverReportTests.setUpTestData.__func__)
    setUp = test_v1_reports.ObserverReportTests.setUp
    post = test_v1_reports.ObserverReportTests.post

    def upload(self, raw=None, key=None, **extra):
        raw = raw or png()
        csrf = self.client.get("/api/v1/auth/csrf").json()["csrf_token"]
        return self.client.post(URL, {
            "file": SimpleUploadedFile("sheet.png", raw, "image/png"), "sha256": sha256(raw).hexdigest(),
        }, HTTP_X_CSRFTOKEN=csrf, HTTP_IDEMPOTENCY_KEY=str(key or uuid4()), **extra)

    def read(self, lines=LINES, key=None):
        with patch("reports.result_ocr.recognise_lines", return_value=lines):
            return self.upload(key=key)

    def sheet(self, ocr_id, **changes):
        data = {k: self.valid[k] for k in ("language", "occurred_at", "place")}
        sheet = dict(registered=742, accredited=391, rejected=12, votes=dict(A=120, B=98, C=77, D=51, E=0),
                     confirmed_fields=[], entry_method="ocr_confirmed", ocr_id=ocr_id)
        sheet.update(changes)
        return {**data, "kind": "result_sheet", "result_sheet": sheet}

    def test_read_replay_and_key_reuse(self):
        key = uuid4()
        first = self.read(key=key)
        self.assertEqual(first.status_code, 201, first.content)
        body = first.json()
        self.assertEqual(set(body), {"ocr_id", "expires_at", "fields", "model_version", "notice_key"})
        self.assertEqual(body["fields"]["accredited"], {"value": 391, "confidence": 0.88})
        self.assertIsNone(body["notice_key"])
        replay = self.read(key=key)
        self.assertEqual((replay.status_code, replay.json()), (200, body))
        self.assertEqual(replay["Idempotent-Replayed"], "true")
        other = png(2)
        with patch("reports.result_ocr.recognise_lines", return_value=LINES):
            clash = self.upload(other, key=key)
        self.assertEqual((clash.status_code, clash.json()["error"]["code"]), (409, "idempotency_key_reused"))
        self.assertEqual(OcrRead.objects.count(), 1)

    def test_not_a_result_sheet_gets_a_notice(self):
        body = self.read([("Hello", 0.9)]).json()
        self.assertEqual(body["notice_key"], "result_sheet.not_a_result")
        self.assertIsNone(body["fields"]["registered"]["value"])

    def test_engine_failure_is_unreadable_and_missing_engine_unavailable(self):
        with patch("reports.result_ocr.recognise_lines", side_effect=RuntimeError):
            self.assertEqual(self.upload().json()["error"]["code"], "media_unreadable")
        with patch("reports.result_ocr.recognise_lines", side_effect=OcrUnavailable):
            self.assertEqual(self.upload().json()["error"]["code"], "ocr_unavailable")
        self.assertFalse(OcrRead.objects.exists())

    def test_access_is_observer_only_and_rate_limited(self):
        self.client.logout()
        self.assertEqual(self.upload().status_code, 401)
        self.client.force_login(self.observer)
        with patch("reports.result_ocr.rate_limit", return_value=30), patch(
            "reports.result_ocr.recognise_lines", return_value=LINES,
        ):
            limited = self.upload()
        self.assertEqual((limited.status_code, limited.headers["Retry-After"]), (429, "30"))
        self.assertEqual(self.client.get(URL).status_code, 405)

    def test_report_attaches_photo_and_flags_disagreement(self):
        ocr_id = self.read().json()["ocr_id"]
        created = self.post(self.sheet(ocr_id, accredited=395))
        self.assertEqual(created.status_code, 201, created.content)
        report = Report.objects.get(pk=created.json()["id"])
        evidence = report.media_items.get()
        with storage().read(photo_key(report.organisation_id, evidence.pk)) as photo:
            self.assertEqual(evidence.sha256, sha256(photo.read()).hexdigest())
        disagreement = next(flag for flag in report.result_flags if flag["code"] == "ocr_disagreement")
        self.assertEqual(disagreement["fields"], ["accredited"])
        read = OcrRead.objects.get()
        self.assertEqual((read.used_by_id, bytes(read.content)), (report.pk, b""))
        detail = self.client.get(f"/api/v1/reports/{report.pk}").json()
        self.assertNotIn("result_flags", detail)
        downloaded = self.client.get(f"/api/v1/media/{evidence.pk}/content")
        downloaded_bytes = body(downloaded)
        self.assertEqual(downloaded.status_code, 200, downloaded_bytes)
        self.assertEqual(sha256(downloaded_bytes).hexdigest(), evidence.sha256)
        reuse = self.post(self.sheet(ocr_id))
        self.assertEqual(reuse.json()["error"]["fields"]["result_sheet.ocr_id"]["code"], "invalid")
        self.assertEqual(MediaItem.objects.count(), 1)

    def test_ocr_id_must_belong_to_the_observer_and_be_live(self):
        ocr_id = self.read().json()["ocr_id"]
        for bad in ("not-a-uuid", str(uuid4()), 5):
            response = self.post(self.sheet(bad))
            self.assertEqual(response.json()["error"]["fields"]["result_sheet.ocr_id"]["code"], "invalid", bad)
        self.client.force_login(self.other)
        self.assertEqual(self.post(self.sheet(ocr_id)).status_code, 422)
        self.client.force_login(self.observer)
        OcrRead.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.post(self.sheet(ocr_id)).status_code, 422)
        out = StringIO()
        call_command("purge_expired_ocr", stdout=out)
        self.assertFalse(OcrRead.objects.exists())
        self.assertIn("Deleted 1", out.getvalue())
