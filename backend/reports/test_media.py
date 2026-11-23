from datetime import timedelta
from hashlib import sha256
from io import BytesIO, StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from django.core.management import call_command
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from PIL import Image, PngImagePlugin

from accounts.models import Organisation, User

from .media_storage import photo_key, staging_key, storage
from .media_views import CHUNK, MAX_PHOTO
from .models import MediaAccess, MediaItem, Report, ReviewEvent, UploadSession


def sample_photo():
    exif = Image.Exif()
    exif[270] = "private-camera-note"
    exif[34853] = {1: "N", 2: (4.0, 50.0, 0.0)}
    result = BytesIO()
    Image.new("RGB", (12, 12), "blue").save(result, format="JPEG", exif=exif)
    return result.getvalue()


class PhotoUploadTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.observer = User.objects.create_user("owner@media-test.example", role=User.Role.OBSERVER)
        cls.other = User.objects.create_user("other@media-test.example", role=User.Role.OBSERVER)
        cls.reviewer = User.objects.create_user("reviewer@media-test.example", role=User.Role.REVIEWER)
        organisation = Organisation.objects.create(name="Fictional foreign organisation")
        cls.foreign = User.objects.create_user(
            "foreign@media-test.example", role=User.Role.OBSERVER, organisation=organisation,
        )
        cls.report = Report.objects.create(
            observer=cls.observer, submission_key=uuid4(), occurred_at=timezone.now(),
            location="Fictional venue", description="Synthetic media test.",
            receipt_code="EG-0000-0000",
        )

    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        setting = override_settings(PRIVATE_MEDIA_ROOT=Path(directory.name))
        setting.enable()
        self.addCleanup(setting.disable)
        self.root = Path(directory.name)
        self.client = Client(enforce_csrf_checks=True)
        self.client.force_login(self.observer)
        self.raw = sample_photo()
        self.report_path = f"/api/v1/reports/{self.report.pk}"

    def csrf(self):
        return self.client.get("/api/v1/auth/csrf").json()["csrf_token"]

    def start(self, raw=None, key=None, **options):
        raw = raw if raw is not None else self.raw
        body = {
            "kind": "photo", "purpose": "evidence", "content_type": "image/jpeg",
            "size_bytes": len(raw), "sha256": sha256(raw).hexdigest(),
            "client_attachment_id": "queued-photo", "blur_faces": True, **options,
        }
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(
                self.report_path + "/uploads", body, content_type="application/json",
                HTTP_IDEMPOTENCY_KEY=str(key or uuid4()), HTTP_X_CSRFTOKEN=self.csrf(),
            )

    def upload(self, url, data=None, offset=0, **headers):
        return self.client.patch(
            url, self.raw if data is None else data, content_type="application/offset+octet-stream",
            HTTP_UPLOAD_OFFSET=str(offset), HTTP_X_CSRFTOKEN=self.csrf(), **headers,
        )

    def complete(self, url, key=None):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(
                url + "/complete", {}, content_type="application/json",
                HTTP_IDEMPOTENCY_KEY=str(key or uuid4()), HTTP_X_CSRFTOKEN=self.csrf(),
            )

    def upload_url(self, **kwargs):
        response = self.start(**kwargs)
        self.assertEqual(response.status_code, 201, response.content)
        return f"/api/v1/uploads/{response.json()['upload']['id']}"

    def test_dropped_chunk_offset_and_progress(self):
        key = uuid4()
        url = self.upload_url(key=key)
        self.assertEqual(self.upload(url, self.raw[:32], offset=32).json()["error"]["code"], "offset_mismatch")
        self.assertEqual(self.upload(url, self.raw[:32], HTTP_UPLOAD_CHUNK_SHA256="0" * 64).status_code, 422)
        self.assertEqual(self.upload(url, self.raw[:32]).json()["received_bytes"], 32)
        self.assertEqual(self.upload(url, self.raw[:32]).status_code, 409)
        progress = self.client.get(url).json()
        self.assertEqual((progress["received_bytes"], progress["chunk_bytes"]), (32, CHUNK))
        repeated = self.start(key=key)
        self.assertEqual((repeated.status_code, repeated.json()["upload"]["received_bytes"]), (200, 32))
        self.assertEqual(self.complete(url).json()["error"]["code"], "offset_mismatch")
        self.assertEqual(self.upload(url, self.raw[32:], offset=32).status_code, 200)
        self.assertEqual(self.complete(url).status_code, 201)

    def test_expired_session_replay_uses_a_fresh_session_and_cleans_prior_bytes(self):
        key = uuid4()
        url = self.upload_url(key=key)
        self.assertEqual(self.upload(url, self.raw[:16]).status_code, 200)
        session = UploadSession.objects.get()
        key_on_disk = staging_key(session)
        UploadSession.objects.filter(pk=session.pk).update(expires_at=timezone.now() - timedelta(seconds=2))
        response = self.start(key=key)
        self.assertEqual(response.status_code, 200)
        new = response.json()["upload"]
        self.assertNotEqual(new["id"], str(session.pk))
        self.assertEqual(new["received_bytes"], 0)
        self.assertFalse(storage().path(key_on_disk).exists())
        self.assertEqual(self.client.get(url).json()["error"]["code"], "upload_expired")

    def test_hash_and_size_mismatches_and_unsupported_kinds(self):
        self.assertEqual(self.start(kind="video").json()["error"]["fields"]["kind"]["code"], "not_supported_yet")
        self.assertEqual(self.start(kind="audio").json()["error"]["fields"]["kind"]["code"], "not_supported_yet")
        self.assertEqual(self.start(size_bytes=MAX_PHOTO + 1).status_code, 413)
        url = self.upload_url()
        self.assertEqual(self.upload(url, self.raw + b"x").status_code, 413)
        changed = b"x" + self.raw[1:]
        self.assertEqual(self.upload(url, changed).status_code, 200)
        response = self.complete(url)
        self.assertEqual((response.status_code, response.json()["error"]["code"]), (422, "hash_mismatch"))
        self.assertEqual(self.client.get(url).json()["received_bytes"], 0)
        self.assertFalse(MediaItem.objects.exists())
        self.assertEqual(self.upload(url).status_code, 200)
        self.assertEqual(self.complete(url).status_code, 201)

    def test_exact_two_mib_gps_is_removed_original_deleted_and_hashes_kept(self):
        incoming = self.raw + b"\0" * (MAX_PHOTO - len(self.raw))
        with Image.open(BytesIO(incoming)) as image:
            self.assertTrue(image.getexif().get_ifd(34853))
        url = self.upload_url(raw=incoming)
        for offset in range(0, len(incoming), CHUNK):
            self.assertEqual(self.upload(url, incoming[offset:offset + CHUNK], offset).status_code, 200)
        session = UploadSession.objects.get()
        original_key = staging_key(session)
        key = uuid4()
        response = self.complete(url, key=key)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(self.complete(url, key=key).json(), response.json())
        self.assertFalse(storage().path(original_key).exists())

        photo = MediaItem.objects.get()
        info = response.json()["media"]
        self.assertTrue(info["exif_removed"])
        self.assertFalse(info["blurred"])
        self.assertEqual(photo.original_sha256, sha256(incoming).hexdigest())
        self.assertTrue(photo_key(photo.organisation_id, photo.pk).startswith(str(self.report.organisation_id)))
        content_url = f"/api/v1/media/{photo.pk}/content"
        download = self.client.get(content_url)
        self.assertEqual(download.status_code, 200)
        self.assertIn("private", download["Cache-Control"])
        self.assertIn("no-store", download["Cache-Control"])
        self.assertEqual(download["X-Content-Type-Options"], "nosniff")
        self.assertEqual(photo.sha256, sha256(download.content).hexdigest())
        self.assertNotIn(b"private-camera-note", download.content)
        with Image.open(BytesIO(download.content)) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertFalse(image.getexif())
        detail = self.client.get(self.report_path).json()
        self.assertEqual(detail["media"], [info])

    def test_png_reencoding_and_hash_dedupe(self):
        raw = BytesIO()
        metadata = PngImagePlugin.PngInfo()
        metadata.add_text("private-location", "synthetic note")
        Image.new("RGBA", (3, 3)).save(raw, format="PNG", pnginfo=metadata)
        original = raw.getvalue()
        url = self.upload_url(raw=original, content_type="image/png")
        self.assertEqual(self.upload(url, original).status_code, 200)
        result = self.complete(url)
        self.assertEqual(result.status_code, 201, result.content)
        response = self.start(raw=original, content_type="image/png", client_attachment_id="from-other-tab")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["upload"])
        self.assertEqual(response.json()["media"], result.json()["media"])
        content = self.client.get(f"/api/v1/media/{result.json()['media']['id']}/content").content
        self.assertNotIn(b"private-location", content)

    def test_access_scope_review_and_removal(self):
        url = self.upload_url()
        self.assertEqual(self.upload(url).status_code, 200)
        item_id = self.complete(url).json()["media"]["id"]
        content_url = f"/api/v1/media/{item_id}/content"
        remove_url = f"{self.report_path}/media/{item_id}"
        for user in (self.other, self.foreign):
            self.client.force_login(user)
            self.assertEqual(self.client.get(content_url).status_code, 404)
            self.assertEqual(self.client.get(url).status_code, 404)
            self.assertEqual(self.start().status_code, 404)
            self.assertEqual(self.client.delete(remove_url, HTTP_X_CSRFTOKEN=self.csrf()).status_code, 404)
        self.client.force_login(self.reviewer)
        self.assertEqual(self.client.get(content_url).status_code, 404)
        Report.objects.filter(pk=self.report.pk).update(assigned_reviewer=self.reviewer, status=Report.Status.IN_REVIEW)
        part = self.client.get(content_url, HTTP_RANGE="bytes=0-7")
        self.assertEqual((part.status_code, len(part.content)), (206, 8))
        self.assertEqual(self.client.get(content_url).status_code, 200)
        self.assertEqual(MediaAccess.objects.count(), 1)
        Report.objects.filter(pk=self.report.pk).update(assigned_reviewer=None)
        self.assertEqual(self.client.get(content_url).status_code, 404)

        self.client.force_login(self.observer)
        self.assertEqual(self.client.delete(remove_url, HTTP_X_CSRFTOKEN=self.csrf()).status_code, 409)
        Report.objects.filter(pk=self.report.pk).update(status=Report.Status.SUBMITTED)
        photo = MediaItem.objects.get()
        disk = storage().path(photo_key(photo.organisation_id, photo.pk))
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client.delete(remove_url, HTTP_X_CSRFTOKEN=self.csrf()).status_code, 204)
        self.assertFalse(disk.exists())
        self.assertEqual(self.client.get(content_url).status_code, 404)
        self.assertEqual(self.client.delete(remove_url, HTTP_X_CSRFTOKEN=self.csrf()).status_code, 204)
        self.assertEqual(ReviewEvent.objects.get(action="remove_media").change, {"sha256": photo.sha256})

    def test_maintenance_expires_partial_upload(self):
        url = self.upload_url()
        self.assertEqual(self.upload(url, self.raw[:16]).status_code, 200)
        key = staging_key(UploadSession.objects.get())
        UploadSession.objects.update(expires_at=timezone.now() - timedelta(seconds=2))
        with self.captureOnCommitCallbacks(execute=True):
            call_command("prune_private_media", stdout=StringIO())
        self.assertFalse(storage().path(key).exists())
        self.assertEqual(self.client.get(url).json()["error"]["code"], "upload_expired")

    def test_closure_snapshots_cleaned_photos_and_cancels_pending_original(self):
        first = self.upload_url()
        self.assertEqual(self.upload(first).status_code, 200)
        media = self.complete(first).json()["media"]
        pending = self.upload_url(raw=self.raw + b"x", client_attachment_id="pending-photo")
        self.assertEqual(self.upload(pending, self.raw[:16]).status_code, 200)
        upload = UploadSession.objects.get(pk=pending.rsplit("/", 1)[1])
        pending_key = staging_key(upload)

        Report.objects.filter(pk=self.report.pk).update(
            assigned_reviewer=self.reviewer, status=Report.Status.IN_REVIEW,
        )
        self.client.force_login(self.reviewer)
        with self.captureOnCommitCallbacks(execute=True):
            closed = self.client.post(
                f"/api/review/{self.report.pk}/actions",
                {"action": "close", "version": 0, "outcome": "corroborated", "note": "Synthetic evidence reviewed."},
                content_type="application/json", HTTP_X_CSRFTOKEN=self.csrf(),
            )
        self.assertEqual(closed.status_code, 200, closed.content)
        snapshot = ReviewEvent.objects.get(report=self.report, action="close").change
        self.assertEqual(snapshot["media_ids"], [{"id": media["id"], "sha256": MediaItem.objects.get().sha256}])
        self.assertEqual(snapshot["pending_uploads"], [
            {"id": str(upload.pk), "kind": "photo", "size_bytes": len(self.raw) + 1},
        ])
        self.assertFalse(storage().path(pending_key).exists())
        self.client.force_login(self.observer)
        self.assertEqual(self.complete(pending).json()["error"]["code"], "report_closed")
        self.assertEqual(self.client.get(f"/api/v1/media/{media['id']}/content").status_code, 200)

    def test_withdrawal_removes_clean_and_pending_files(self):
        first = self.upload_url()
        self.assertEqual(self.upload(first).status_code, 200)
        key = uuid4()
        media_id = self.complete(first, key=key).json()["media"]["id"]
        pending = self.upload_url(raw=self.raw + b"x", client_attachment_id="pending-photo")
        self.assertEqual(self.upload(pending, self.raw[:16]).status_code, 200)
        pending_key = staging_key(UploadSession.objects.get(pk=pending.rsplit("/", 1)[1]))
        cleaned_key = photo_key(self.report.organisation_id, media_id)
        with self.captureOnCommitCallbacks(execute=True):
            result = self.client.post(
                self.report_path + "/withdraw", {"confirm": True}, content_type="application/json",
                HTTP_IDEMPOTENCY_KEY=str(uuid4()), HTTP_X_CSRFTOKEN=self.csrf(),
            )
        self.assertEqual(result.status_code, 200, result.content)
        self.assertFalse(MediaItem.objects.exists())
        self.assertFalse(UploadSession.objects.exists())
        self.assertFalse(storage().path(pending_key).exists())
        self.assertFalse(storage().path(cleaned_key).exists())
        self.assertEqual(self.complete(first, key=key).status_code, 404)
