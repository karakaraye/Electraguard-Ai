"""C12: video and voice notes, face blur and transcripts, against real ffmpeg output."""

import json
import os
import shutil
import socket
import subprocess
import tempfile
from hashlib import sha256
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock, skipUnless
from uuid import uuid4

import cv2
import numpy as np
from django.core.management import call_command
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from accounts.models import Organisation, User

from .media_av import faces, transcode
from .media_av.transcribe import Transcript
from .media_storage import original_key, storage
from .models import Evidence, MediaAccess, MediaItem, Report, ReviewEvent, UploadSession

FACE = Path(__file__).with_name("test_data") / "astronaut.jpg"
CALLS = []


def fake_transcriber(path, language):
    CALLS.append(language)
    return Transcript(status="ready", text="Synthetic transcript of the voice note.", language="en", method="test-double")


def ffmpeg(*arguments):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", *arguments], check=True, capture_output=True)


def body(response):
    return b"".join(response.streaming_content) if response.streaming else response.content


def faces_in(jpeg):
    frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
    return len(faces.detect(frame))


def ffprobe(raw):
    with TemporaryDirectory() as directory:
        path = Path(directory) / "probe"
        path.write_bytes(raw)
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
            capture_output=True, check=True,
        )
    return json.loads(result.stdout)


@override_settings(TRANSCRIBER="reports.test_media_av.fake_transcriber")
class RecordingTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.fixtures = TemporaryDirectory()
        folder = Path(cls.fixtures.name)
        tags = [
            "-metadata", "comment=private-camera-note", "-metadata", "location=+04.5000+007.0000/",
            "-metadata:s:v:0", "title=private-stream-title", "-metadata:s:v:0", "language=yor",
            "-metadata:s:a:0", "handler_name=private-handler",
        ]
        ffmpeg(
            "-loop", "1", "-i", str(FACE), "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-t", "2",
            "-vf", "scale=480:480,format=yuv420p", "-r", "15", "-c:v", "libx264", "-c:a", "aac", *tags,
            "-shortest", str(folder / "face.mp4"),
        )
        ffmpeg("-loop", "1", "-i", str(FACE), "-t", "1", "-vf", "scale=320:320", "-r", "10", "-c:v", "libvpx",
               str(folder / "face.webm"))
        ffmpeg("-f", "lavfi", "-i", "sine=frequency=300:duration=2", "-c:a", "libopus", "-b:a", "32k",
               "-metadata", "title=private-voice-title", "-metadata:s:a:0", "ARTIST=private-artist", str(folder / "voice.ogg"))
        cls.video = (folder / "face.mp4").read_bytes()
        cls.webm = (folder / "face.webm").read_bytes()
        cls.voice = (folder / "voice.ogg").read_bytes()

    @classmethod
    def tearDownClass(cls):
        cls.fixtures.cleanup()
        super().tearDownClass()

    @classmethod
    def setUpTestData(cls):
        cls.observer = User.objects.create_user("owner@av-test.example", role=User.Role.OBSERVER)
        cls.reviewer = User.objects.create_user("reviewer@av-test.example", role=User.Role.REVIEWER)
        cls.report = Report.objects.create(
            observer=cls.observer, submission_key=uuid4(), occurred_at=timezone.now(),
            location="Fictional venue", description="Synthetic recording test.", receipt_code="EG-0000-0001",
            incident_details={"language": "ha"},
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
        CALLS.clear()

    def csrf(self):
        return self.client.get("/api/v1/auth/csrf").json()["csrf_token"]

    def start(self, raw, **options):
        body_ = {
            "kind": "video", "purpose": "evidence", "content_type": "video/mp4", "size_bytes": len(raw),
            "sha256": sha256(raw).hexdigest(), "client_media_id": f"local-{uuid4().hex[:8]}",
            "blur_faces": False, "duration_ms": 2000, **options,
        }
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(
                f"/api/v1/reports/{self.report.pk}/uploads", body_, content_type="application/json",
                HTTP_IDEMPOTENCY_KEY=str(uuid4()), HTTP_X_CSRFTOKEN=self.csrf(),
            )

    def send(self, raw, **options):
        """Start, upload in 256 KiB chunks and complete. Returns the completion response."""
        started = self.start(raw, **options)
        self.assertEqual(started.status_code, 201, started.content)
        upload = started.json()["upload"]
        self.assertEqual(upload["kind"], options.get("kind", "video"))
        url = f"/api/v1/uploads/{upload['id']}"
        for offset in range(0, len(raw), upload["chunk_bytes"]):
            chunk = raw[offset:offset + upload["chunk_bytes"]]
            sent = self.client.patch(url, chunk, content_type="application/offset+octet-stream",
                                     HTTP_UPLOAD_OFFSET=str(offset), HTTP_X_CSRFTOKEN=self.csrf())
            self.assertEqual(sent.status_code, 200, sent.content)
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(url + "/complete", {}, content_type="application/json",
                                    HTTP_IDEMPOTENCY_KEY=str(uuid4()), HTTP_X_CSRFTOKEN=self.csrf())

    def work(self):
        with self.captureOnCommitCallbacks(execute=True):
            call_command("run_media", "--once", stdout=StringIO(), stderr=StringIO())

    def assign(self):
        Report.objects.filter(pk=self.report.pk).update(assigned_reviewer=self.reviewer, status=Report.Status.IN_REVIEW)
        self.client.force_login(self.reviewer)

    def stored_files(self):
        return sorted(str(path.relative_to(self.root)) for path in self.root.rglob("*") if path.is_file())

    def test_video_is_cleaned_streamed_and_blurred_for_reviewers(self):
        completed = self.send(self.video)
        self.assertEqual(completed.status_code, 201, completed.content)
        media = completed.json()["media"]
        self.assertEqual((media["kind"], media["status"], media["blurred"], media["exif_removed"]),
                         ("video", "processing", False, False))
        url = f"/api/v1/media/{media['id']}/content"
        self.assertEqual(self.client.get(url).json()["error"]["code"], "invalid_transition")

        # While processing, only the assigned reviewer may open the verified original, with a reason.
        self.assign()
        original = url + "?variant=original"
        self.assertEqual(self.client.get(original).status_code, 422)
        early = self.client.get(original, HTTP_X_MEDIA_ACCESS_REASON="Urgent synthetic case")
        self.assertEqual((early.status_code, early["Content-Type"]), (200, "video/mp4"))
        self.assertEqual(body(early), self.video)
        self.assertTrue(early["Content-Disposition"].startswith("attachment"))
        self.assertEqual(MediaAccess.objects.get().action, "download_original")

        self.work()
        item = MediaItem.objects.get()
        self.assertEqual((item.status, item.blurred, item.review_copy), ("ready", False, True))
        self.assertFalse(storage().path(original_key(item.organisation_id, item.pk)).exists())

        self.client.force_login(self.observer)
        own = body(self.client.get(url))
        self.assertEqual(sha256(own).hexdigest(), item.sha256)
        self.assertNotIn(b"private-camera-note", own)
        self.assertNotIn(b"+04.5000", own)
        probed = ffprobe(own)
        self.assertNotIn("comment", probed["format"].get("tags", {}))
        self.assertNotIn("location", probed["format"].get("tags", {}))
        self.assertEqual([s["codec_name"] for s in probed["streams"]], ["h264", "aac"])
        stream_tags = json.dumps([stream.get("tags", {}) for stream in probed["streams"]])
        for planted in ("private", "yor"):
            self.assertNotIn(planted, stream_tags)
        own_poster = self.client.get(url + "?variant=poster")
        self.assertEqual(own_poster["Content-Type"], "image/jpeg")
        self.assertGreater(faces_in(body(own_poster)), 0)
        detail = self.client.get(f"/api/v1/reports/{self.report.pk}").json()["media"][0]
        self.assertEqual((detail["kind"], detail["status"], detail["exif_removed"]), ("video", "ready", True))

        self.client.force_login(self.reviewer)
        reviewed = self.client.get(url)
        self.assertNotEqual(body(reviewed), own)
        self.assertEqual(faces_in(body(self.client.get(url + "?variant=poster"))), 0)
        part = self.client.get(url, HTTP_RANGE="bytes=10-109")
        self.assertEqual((part.status_code, len(body(part)), part["Content-Range"].split("/")[0]), (206, 100, "bytes 10-109"))
        self.assertEqual(self.client.get(url, HTTP_RANGE="bytes=999999999-").status_code, 416)
        # MED-04: once processing has finished, the unblurred file is not served to reviewers.
        self.assertEqual(self.client.get(original, HTTP_X_MEDIA_ACCESS_REASON="Compare with the account").status_code, 404)
        queue = self.client.get("/api/v1/review/queue").json()["items"][0]
        self.assertEqual(queue["media_counts"], {"photo": 0, "video": 1, "audio": 0})
        self.assertIn("video", queue["urgency"]["reasons"])

    def test_blur_on_request_keeps_no_unblurred_copy(self):
        media = self.send(self.webm, content_type="video/webm", blur_faces=True, duration_ms=1000).json()["media"]
        url = f"/api/v1/media/{media['id']}/content"
        self.assign()
        reason = {"HTTP_X_MEDIA_ACCESS_REASON": "Synthetic check"}
        self.assertEqual(self.client.get(url + "?variant=original", **reason).status_code, 409)
        self.work()
        item = MediaItem.objects.get()
        self.assertEqual((item.status, item.blurred, item.review_copy), ("ready", True, False))
        self.assertEqual(self.client.get(url + "?variant=original", **reason).status_code, 404)
        self.assertEqual(faces_in(body(self.client.get(url + "?variant=poster"))), 0)
        self.client.force_login(self.observer)
        self.assertEqual(faces_in(body(self.client.get(url + "?variant=poster"))), 0)
        self.assertTrue(self.client.get(f"/api/v1/reports/{self.report.pk}").json()["media"][0]["blurred"])

    def test_voice_note_is_reencoded_and_transcribed_for_the_reviewer_only(self):
        media = self.send(self.voice, kind="audio", content_type="audio/ogg", duration_ms=2000).json()["media"]
        self.assertEqual((media["kind"], media["status"]), ("audio", "processing"))
        self.work()
        self.assertEqual(CALLS, ["ha"])
        url = f"/api/v1/media/{media['id']}/content"
        own = self.client.get(url)
        self.assertEqual(own["Content-Type"], "audio/ogg")
        voice = body(own)
        self.assertNotIn(b"private-voice-title", voice)
        self.assertNotIn(b"private-artist", voice)
        self.assertEqual(ffprobe(voice)["streams"][0]["codec_name"], "opus")
        self.assertNotIn("transcript", self.client.get(f"/api/v1/reports/{self.report.pk}").json()["media"][0])

        self.assign()
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.get(url + "?variant=original", HTTP_X_MEDIA_ACCESS_REASON="x").status_code, 404)
        case = self.client.get(f"/api/v1/review/cases/{self.report.pk}").json()
        self.assertEqual(case["media"][0]["transcript"], {
            "status": "ready", "text": "Synthetic transcript of the voice note.", "language": "en",
            "method": "test-double", "machine_generated": True,
        })

    def test_transcription_failure_never_blocks_the_voice_note(self):
        with mock.patch("reports.media_av.worker.transcribe", side_effect=RuntimeError("model crashed")):
            media = self.send(self.voice, kind="audio", content_type="audio/ogg", duration_ms=2000).json()["media"]
            self.work()
        item = MediaItem.objects.get(pk=media["id"])
        self.assertEqual((item.status, item.transcript_status, item.transcript), ("ready", "failed", None))

    def test_declared_type_length_and_options_are_checked(self):
        self.assertEqual(self.start(self.video, duration_ms=None).json()["error"]["fields"]["duration_ms"]["code"], "required")
        too_long = self.start(self.video, duration_ms=60_001).json()["error"]["fields"]["duration_ms"]
        self.assertEqual((too_long["code"], too_long["limit"]), ("max_value", 60_000))
        self.assertEqual(self.start(self.voice, kind="audio", content_type="audio/ogg", blur_faces=True)
                         .json()["error"]["fields"]["blur_faces"]["code"], "not_allowed_for_kind")
        self.assertEqual(self.start(self.video, content_type="video/quicktime").status_code, 415)
        self.assertEqual(self.start(self.video, size_bytes=25 * 1024 * 1024 + 1).status_code, 413)
        self.assertEqual(self.start(self.voice, kind="audio", content_type="audio/ogg", size_bytes=4 * 1024 * 1024 + 1).status_code, 413)

        mismatch = self.send(self.video, content_type="video/webm")
        self.assertEqual((mismatch.status_code, mismatch.json()["error"]["code"]), (415, "unsupported_media_type"))
        disguised = self.send(FACE.read_bytes())
        self.assertEqual(disguised.status_code, 415)
        self.assertFalse(MediaItem.objects.exists())
        self.assertEqual(set(UploadSession.objects.values_list("status", flat=True)), {"cancelled"})

    def test_withdrawal_while_processing_leaves_no_files(self):
        media = self.send(self.video).json()["media"]
        with self.captureOnCommitCallbacks(execute=True):
            withdrawn = self.client.post(
                f"/api/v1/reports/{self.report.pk}/withdraw", {"confirm": True}, content_type="application/json",
                HTTP_IDEMPOTENCY_KEY=str(uuid4()), HTTP_X_CSRFTOKEN=self.csrf(),
            )
        self.assertEqual(withdrawn.status_code, 200, withdrawn.content)
        self.work()
        self.assertFalse(MediaItem.objects.filter(pk=media["id"]).exists())
        self.assertEqual(self.stored_files(), [])

    def test_removed_during_processing_discards_the_output(self):
        media = self.send(self.video).json()["media"]
        real = transcode.process_video

        def remove_mid_way(*args, **kwargs):
            result = real(*args, **kwargs)
            with self.captureOnCommitCallbacks(execute=True):
                self.client.delete(f"/api/v1/reports/{self.report.pk}/media/{media['id']}", HTTP_X_CSRFTOKEN=self.csrf())
            return result

        with mock.patch("reports.media_av.worker.transcode.process_video", side_effect=remove_mid_way):
            self.work()
        self.assertFalse(MediaItem.objects.exists())
        self.assertEqual(self.stored_files(), [])

    def test_failures_retry_then_fail_and_unreadable_fails_at_once(self):
        media = self.send(self.video).json()["media"]
        with mock.patch("reports.media_av.worker.transcode.process_video", side_effect=transcode.ProcessingFailed("boom")):
            self.work()
        item = MediaItem.objects.get()
        self.assertEqual((item.status, item.attempts, item.failure_code), ("failed", 3, "processing_failed"))
        self.assertEqual(self.stored_files(), [])
        self.assign()
        self.assertEqual(self.client.get(f"/api/v1/media/{media['id']}/content").json()["error"]["code"], "invalid_transition")

        MediaItem.objects.all().delete()
        self.client.force_login(self.observer)
        Report.objects.filter(pk=self.report.pk).update(status=Report.Status.SUBMITTED)
        self.send(self.webm, content_type="video/webm", duration_ms=1000)
        item = MediaItem.objects.get()
        storage().write(original_key(item.organisation_id, item.pk), b"not a video any more")
        self.work()
        item.refresh_from_db()
        self.assertEqual((item.status, item.attempts, item.failure_code), ("failed", 1, "media_unreadable"))

    def test_closing_while_processing_records_the_verified_upload(self):
        media = self.send(self.video).json()["media"]
        self.assign()
        with self.captureOnCommitCallbacks(execute=True):
            closed = self.client.post(
                f"/api/review/{self.report.pk}/actions",
                {"action": "close", "version": 0, "outcome": "corroborated", "note": "Synthetic evidence reviewed."},
                content_type="application/json", HTTP_X_CSRFTOKEN=self.csrf(),
            )
        self.assertEqual(closed.status_code, 200, closed.content)
        snapshot = ReviewEvent.objects.get(report=self.report, action="close").change
        self.assertEqual(snapshot["media_ids"], [
            {"id": media["id"], "original_sha256": sha256(self.video).hexdigest(), "status": "processing"},
        ])
        self.work()
        self.assertEqual(MediaItem.objects.get().status, "ready")

    def test_photo_without_requested_blur_gets_a_blurred_review_copy(self):
        raw = FACE.read_bytes()
        media = self.send(raw, kind="photo", content_type="image/jpeg", duration_ms=None).json()["media"]
        self.assertEqual((media["status"], media["blurred"]), ("ready", False))
        url = f"/api/v1/media/{media['id']}/content"
        self.assertEqual(faces_in(body(self.client.get(url))), 1)
        self.assign()
        self.assertEqual(faces_in(body(self.client.get(url))), 0)
        self.assertEqual(faces_in(body(self.client.get(url + "?variant=thumb"))), 0)
        # MED-04: photos are ready at once, so there is never an unblurred original for reviewers.
        self.assertEqual(self.client.get(url + "?variant=original").status_code, 404)
        self.assertEqual(self.client.get(url + "?variant=original", HTTP_X_MEDIA_ACCESS_REASON="Identify the uniform").status_code, 404)
        self.assertFalse(MediaAccess.objects.filter(action="download_original").exists())

    def test_pre_v1_photos_are_shown_to_reviewers_blurred_only(self):
        raw = FACE.read_bytes()
        evidence = Evidence.objects.create(
            report=self.report, organisation_id=self.report.organisation_id, name="face.jpg",
            content_type="image/jpeg", sha256=sha256(raw).hexdigest(), content=raw,
        )
        url = f"/api/v1/media/{evidence.pk}/content"
        self.assign()
        self.assertEqual(faces_in(body(self.client.get(url))), 0)
        self.assertEqual(faces_in(body(self.client.get(url + "?variant=thumb"))), 0)
        self.assertEqual(self.client.get(url + "?variant=original", HTTP_X_MEDIA_ACCESS_REASON="Identify").status_code, 404)
        self.assertEqual(MediaAccess.objects.get().action, "view_media")


    # ---- hardening (review of #18) ------------------------------------------------

    def hostile(self, raw, content_type="video/mp4", kind="video"):
        response = self.send(raw, kind=kind, content_type=content_type, duration_ms=1000)
        self.assertIn(response.status_code, (415, 422), response.content)
        return response

    def test_playlists_and_references_are_rejected_without_network_or_file_access(self):
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        listener.settimeout(0.5)
        self.addCleanup(listener.close)
        url = f"http://127.0.0.1:{listener.getsockname()[1]}/clip.ts"
        playlists = {
            "video/mp4": f"#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\n{url}\n#EXT-X-ENDLIST\n".encode(),
            "video/webm": b"ffconcat version 1.0\nfile '/etc/passwd'\nfile 'file:/etc/hostname'\n",
            "audio/ogg": f"ffconcat version 1.0\nfile '{url}'\n".encode(),
        }
        for content_type, raw in playlists.items():
            with self.subTest(content_type):
                self.hostile(raw, content_type, "audio" if content_type.startswith("audio/") else "video")
        with self.assertRaises(socket.timeout):
            listener.accept()
        self.assertFalse(MediaItem.objects.exists())

    def test_truncated_empty_and_many_stream_files_are_rejected(self):
        folder = Path(self.fixtures.name)
        self.hostile(self.video[: len(self.video) // 2])
        ffmpeg("-f", "lavfi", "-i", "color=size=64x64", "-frames:v", "0", "-c:v", "libvpx", str(folder / "empty.webm"))
        self.hostile((folder / "empty.webm").read_bytes(), "video/webm")
        ffmpeg("-f", "lavfi", "-i", "color=size=64x64:duration=1", "-f", "lavfi", "-i", "sine=duration=1",
               "-map", "0:v", *["-map", "1:a"] * 5, "-c:v", "libvpx", "-c:a", "libopus", str(folder / "streams.webm"))
        self.hostile((folder / "streams.webm").read_bytes(), "video/webm")
        self.assertFalse(MediaItem.objects.exists())

    def test_truncated_file_that_still_probes_never_stays_processing(self):
        folder = Path(self.fixtures.name)
        ffmpeg("-i", str(folder / "face.mp4"), "-c", "copy", "-movflags", "+faststart", str(folder / "fast.mp4"))
        raw = (folder / "fast.mp4").read_bytes()
        cut = raw[: int(len(raw) * 0.6)]
        response = self.send(cut)
        if response.status_code == 201:
            self.work()
            item = MediaItem.objects.get()
            self.assertIn(item.status, ("ready", "failed"))
            self.assertFalse(storage().path(original_key(item.organisation_id, item.pk)).exists())
        else:
            self.assertIn(response.status_code, (415, 422))

    def test_decoding_ignores_the_declared_length(self):
        # A container can claim to be short and hold far more frames. The decoder counts
        # frames itself; here the limit is lowered so the 2 s fixture is "too long".
        media = self.send(self.video).json()["media"]
        with mock.patch("reports.media_av.transcode.max_frames", return_value=10):
            self.work()
        item = MediaItem.objects.get(pk=media["id"])
        self.assertEqual((item.status, item.failure_code, item.attempts), ("failed", "media_too_long", 1))
        self.assertEqual(self.stored_files(), [])

    def test_voice_note_longer_than_the_limit_fails(self):
        self.send(self.voice, kind="audio", content_type="audio/ogg", duration_ms=2000)
        with mock.patch("reports.media_av.transcode.AUDIO_LIMIT_MS", 500):
            self.work()
        self.assertEqual(MediaItem.objects.get().failure_code, "media_too_long")

    def test_output_size_is_capped(self):
        self.send(self.video)
        with mock.patch("reports.media_av.transcode.MAX_VIDEO_BYTES", 2_000):
            self.work()
        item = MediaItem.objects.get()
        self.assertEqual((item.status, item.failure_code), ("failed", "media_too_large"))
        self.assertEqual(self.stored_files(), [])

    def test_timeout_kills_ffmpeg_and_removes_temporary_files(self):
        media = self.send(self.video).json()["media"]
        before = set(Path(tempfile.gettempdir()).glob("electraguard-media-*"))
        with mock.patch("reports.media_av.transcode.TIMEOUT_SECONDS", -1):
            self.work()
        item = MediaItem.objects.get(pk=media["id"])
        self.assertEqual((item.status, item.attempts), ("failed", 3))
        self.assertEqual(set(Path(tempfile.gettempdir()).glob("electraguard-media-*")), before)
        running = []
        for status in Path("/proc").glob("[0-9]*/cmdline"):
            try:
                command = status.read_bytes()
            except OSError:
                continue
            if media["id"].encode() in command:
                running.append(command)
        self.assertEqual(running, [])

    def test_only_owner_and_assigned_reviewer_reach_recordings(self):
        video = self.send(self.video).json()["media"]["id"]
        voice = self.send(self.voice, kind="audio", content_type="audio/ogg", duration_ms=2000).json()["media"]["id"]
        organisation = Organisation.objects.create(name="Other synthetic organisation")
        outsiders = [
            User.objects.create_user("other-observer@av-test.example", role=User.Role.OBSERVER),
            User.objects.create_user("other-reviewer@av-test.example", role=User.Role.REVIEWER),
            User.objects.create_user("foreign-observer@av-test.example", role=User.Role.OBSERVER, organisation=organisation),
            User.objects.create_user("foreign-reviewer@av-test.example", role=User.Role.REVIEWER, organisation=organisation),
        ]
        Report.objects.filter(pk=self.report.pk).update(assigned_reviewer=self.reviewer, status=Report.Status.IN_REVIEW)
        reason = {"HTTP_X_MEDIA_ACCESS_REASON": "Synthetic check"}

        def check(stage):
            for user in outsiders:
                self.client.force_login(user)
                for media_id in (video, voice):
                    for variant in ("display", "poster", "original"):
                        with self.subTest(stage=stage, user=user.email, media=media_id, variant=variant):
                            response = self.client.get(f"/api/v1/media/{media_id}/content?variant={variant}", **reason)
                            self.assertEqual(response.status_code, 404)

        check("processing")
        self.work()
        check("ready")
        self.assertFalse(MediaAccess.objects.exclude(actor=self.reviewer).exists())

    def test_range_requests_write_one_audit_event_per_reason(self):
        media = self.send(self.video).json()["media"]
        self.assign()
        url = f"/api/v1/media/{media['id']}/content"
        # While processing: the original, logged once per reason.
        for reason in ("Check the uniform", "Check the uniform", "Compare the timing"):
            part = self.client.get(url + "?variant=original", HTTP_RANGE="bytes=0-99", HTTP_X_MEDIA_ACCESS_REASON=reason)
            self.assertEqual(part.status_code, 206)
        self.assertEqual(
            list(MediaAccess.objects.filter(action="download_original").order_by("created_at").values_list("reason", flat=True)),
            ["Check the uniform", "Compare the timing"],
        )
        # When ready: the blurred copy, logged once for many range requests.
        self.work()
        for first in (0, 100, 200):
            self.assertEqual(self.client.get(url, HTTP_RANGE=f"bytes={first}-{first + 99}").status_code, 206)
        self.assertEqual(MediaAccess.objects.filter(action="view_media").count(), 1)


@skipUnless(os.getenv("TRANSCRIPTION_MODEL") and shutil.which("espeak-ng"), "needs a local Whisper model and espeak-ng")
class WhisperTranscriptionTests(TestCase):
    def test_spoken_english_sentence_is_transcribed(self):
        from .media_av.transcribe import whisper_transcribe

        with TemporaryDirectory() as directory, override_settings(TRANSCRIPTION_MODEL=os.environ["TRANSCRIPTION_MODEL"]):
            wav, ogg = Path(directory) / "speech.wav", Path(directory) / "speech.ogg"
            subprocess.run(["espeak-ng", "-w", str(wav), "The ballot box was taken away before counting."], check=True)
            ffmpeg("-i", str(wav), "-c:a", "libopus", "-b:a", "32k", str(ogg))
            result = whisper_transcribe(ogg, "pcm")
            self.assertEqual((result["status"], result["language"]), ("ready", "en"))
            self.assertIn("ballot box", result["text"].lower())
            self.assertEqual(whisper_transcribe(ogg, "ig")["status"], "unsupported_language")
