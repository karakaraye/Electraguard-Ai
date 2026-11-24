from hashlib import sha256
from unittest.mock import patch
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from accounts.models import User

from .models import Report
from .result_checks import check_result_sheet
from .result_ocr import OcrUnavailable
from . import test_v1_reports


class ReportSliceTests(TestCase):
    setUpTestData = classmethod(test_v1_reports.ObserverReportTests.setUpTestData.__func__)
    setUp = test_v1_reports.ObserverReportTests.setUp
    post = test_v1_reports.ObserverReportTests.post
    create = test_v1_reports.ObserverReportTests.create

    def test_checklist_duplicate_supersedes(self):
        data = {k: self.valid[k] for k in ("language", "occurred_at", "place")}
        data.update(kind="checklist", stage="opening", answers=[{"question": "opened_on_time", "answer": "yes"}])
        first = self.post(data)
        second = self.post(data)
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(second.status_code, 201, second.content)
        report = Report.objects.get(pk=second.json()["id"])
        self.assertEqual(report.structured_details["supersedes"], first.json()["id"])
        self.assertEqual(self.client.get(f"/api/v1/reports/{report.pk}").json()["checklist"]["stage"], "opening")

    def test_result_flags_stay_private(self):
        data = {k: self.valid[k] for k in ("language", "occurred_at", "place")}
        sheet = dict(registered=20, accredited=31, rejected=0, votes=dict(A=13, B=0, C=0, D=0, E=0))
        data.update(kind="result_sheet", result_sheet={**sheet, "confirmed_fields": [], "entry_method": "manual"})
        created = self.post(data)
        self.assertEqual(created.status_code, 201, created.content)
        report = Report.objects.get(pk=created.json()["id"])
        codes = {flag["code"] for flag in report.result_flags}
        self.assertEqual(codes, {"accredited_exceeds_registered", "count_mismatch", "likely_digit_swap", "unconfirmed_fields"})
        detail = self.client.get(f"/api/v1/reports/{report.pk}").json()
        self.assertNotIn("result_flags", detail)
        self.assertNotIn("flags", detail["result_sheet"])
        self.assertIn("identical_sheet", {flag["code"] for flag in check_result_sheet(sheet, [sheet])})

    def test_result_sheet_null_support_and_wrong_kind_fields(self):
        data = {k: self.valid[k] for k in ("language", "occurred_at", "place")}
        sheet = dict(registered=None, accredited=25, rejected=0, votes=dict(A=25, B=0, C=0, D=0, E=0),
                     confirmed_fields=["accredited"], entry_method="manual")
        data.update(kind="result_sheet", result_sheet=sheet)
        self.assertEqual(self.post(data).json()["error"]["fields"]["result_sheet.registered"]["code"], "invalid")
        sheet["unreadable"] = True
        self.assertEqual(self.post(data).status_code, 201)
        data["description"] = "Wrong kind"
        self.assertEqual(self.post(data).json()["error"]["fields"]["description"]["code"], "not_allowed_for_kind")

    def test_messages_deliver_on_assignment_and_mark_read(self):
        reference = self.create()["id"]
        path = f"/api/v1/reports/{reference}/messages"
        key = uuid4()
        outgoing = {"kind": "message", "body": "An observation for the reviewer."}
        self.assertEqual(self.post(outgoing, key=key, path=path).status_code, 201)
        self.assertEqual(self.post(outgoing, key=key, path=path).status_code, 200)
        reviewer = User.objects.create_user("reviewer-slice@example.test", role=User.Role.REVIEWER)
        self.client.force_login(reviewer)
        self.assertEqual(self.client.get(path).status_code, 404)
        Report.objects.filter(pk=reference).update(assigned_reviewer=reviewer)
        self.assertEqual(self.client.get(path).json()["items"][0]["body"], outgoing["body"])
        stale = self.post({"kind": "message", "body": "Stale update.", "version": 0}, path=path)
        self.assertEqual(stale.json()["error"]["code"], "stale_version")
        sent = self.post({"kind": "message", "body": "Reviewer update.", "version": 1}, path=path)
        self.assertEqual(sent.status_code, 201, sent.content)
        self.client.force_login(self.observer)
        listing = self.client.get("/api/v1/reports?needs_attention=true").json()
        self.assertEqual(listing["counts"]["unread_messages"], 1)
        self.assertEqual(listing["items"][0]["last_message_preview"], "Reviewer update.")
        read = self.post({"up_to_message_id": sent.json()["message"]["id"]}, path=f"{path}/read")
        self.assertEqual(read.status_code, 204)
        self.assertEqual(self.client.get("/api/v1/reports?needs_attention=true").json()["items"], [])

    def test_ocr_valid_image_reports_unavailable(self):
        import struct
        import zlib

        def chunk(kind, data):
            return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 0, 0, 0, 0))
        png += chunk(b"IDAT", zlib.compress(b"\0\0")) + chunk(b"IEND", b"")
        csrf = self.client.get("/api/v1/auth/csrf").json()["csrf_token"]
        url = "/api/v1/result-sheets/ocr"

        def upload(raw, digest=None, **headers):
            return self.client.post(url, {
                "file": SimpleUploadedFile("sheet.png", raw, "image/png"),
                "sha256": digest or sha256(raw).hexdigest(),
            }, HTTP_X_CSRFTOKEN=csrf, **headers)

        headers = {"HTTP_IDEMPOTENCY_KEY": str(uuid4())}
        with patch("reports.result_ocr.recognise_lines", side_effect=OcrUnavailable):
            response = upload(png, **headers)
        self.assertEqual(response.json()["error"]["code"], "ocr_unavailable", response.content)
        self.assertEqual(upload(png).json()["error"]["code"], "idempotency_key_required")
        self.assertEqual(upload(png, "0" * 64, **headers).json()["error"]["code"], "hash_mismatch")
        self.assertEqual(upload(b"text", **headers).status_code, 415)
        self.assertEqual(upload(png[:15], **headers).json()["error"]["code"], "media_unreadable")
        self.assertEqual(upload(b"x" * (2 * 1024 * 1024 + 1), **headers).status_code, 413)
        with patch("reports.result_ocr.rate_limit", return_value=47):
            self.assertEqual(upload(png, **headers).headers["Retry-After"], "47")
