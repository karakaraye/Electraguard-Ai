"""Background processing for video and voice notes (MED-03 worker step).

Each job is claimed with a short lock, processed with no database lock held, then
committed only if the item still exists and is still this worker's claim. A report
withdrawn or an item removed during processing leaves nothing behind.
"""

import logging
import tempfile
from datetime import timedelta
from hashlib import sha256
from pathlib import Path

from django.db import transaction
from django.utils import timezone

from ..media_storage import media_key, original_key, poster_key, review_key, schedule_delete, storage
from ..models import MediaItem
from . import transcode
from .faces import FaceDetectionUnavailable
from .probe import MediaInfo, UnreadableMedia, UnsupportedMedia, probe
from .transcribe import transcribe

MAX_ATTEMPTS = 3
CLAIM_LIFETIME = timedelta(minutes=20)
Status = MediaItem.Status
logger = logging.getLogger(__name__)


def file_digest(path):
    digest = sha256()
    with open(path, "rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


@transaction.atomic
def claim():
    now = timezone.now()
    item = MediaItem.objects.select_for_update(skip_locked=True).filter(status=Status.PROCESSING).exclude(
        claimed_at__gt=now - CLAIM_LIFETIME,
    ).order_by("created_at", "pk").first()
    if item is None:
        return None
    if item.attempts >= MAX_ATTEMPTS:
        fail(item, "processing_failed")
        return item
    item.attempts += 1
    item.claimed_at = now
    item.save(update_fields=["attempts", "claimed_at"])
    return item


def fail(item, code):
    item.status = Status.FAILED
    item.failure_code = code
    item.claimed_at = None
    item.save(update_fields=["status", "failure_code", "claimed_at"])
    # The unprocessed original keeps its metadata, so it is not kept after failure.
    schedule_delete(item.organisation_id, original_key(item.organisation_id, item.pk))


def build(item, workdir):
    """Produce cleaned files in workdir. Returns (files by storage key, field updates)."""
    org, pk = item.organisation_id, item.pk
    source = storage().path(original_key(org, pk))
    info: MediaInfo = probe(source, item.kind, item.content_type)
    if item.kind == MediaItem.Kind.VIDEO:
        result = transcode.process_video(source, info, workdir, item.blur_requested)
        files = {media_key(org, pk, "video"): result.main, poster_key(org, pk): result.main_poster}
        if result.review:
            files[review_key(org, pk, "video")] = result.review
            files[poster_key(org, pk, review=True)] = result.review_poster
        logger.info("Video processed: frames=%s with_faces=%s seconds=%s", result.frames, result.frames_with_faces, result.timings.get("seconds"))
        fields = {
            "duration_ms": result.duration_ms, "blurred": result.blurred, "review_copy": bool(result.review),
            "size_bytes": result.main.stat().st_size, "sha256": file_digest(result.main),
        }
        return files, fields

    voice, duration_ms = transcode.process_audio(source, info, workdir)
    language = item.report.incident_details.get("language", "")
    try:
        transcript = transcribe(voice, language)
    except Exception:
        # A transcript is optional. The voice note is still saved and playable.
        logger.exception("Transcription failed")
        transcript = {"status": "failed", "text": None, "language": "", "method": ""}
    fields = {
        "duration_ms": duration_ms, "size_bytes": voice.stat().st_size, "sha256": file_digest(voice),
        "transcript": transcript["text"], "transcript_status": transcript["status"],
        "transcript_language": transcript["language"], "transcript_method": transcript["method"],
    }
    return {media_key(org, pk, "audio"): voice}, fields


def process(item):
    with tempfile.TemporaryDirectory(prefix="electraguard-media-") as workdir:
        try:
            files, fields = build(item, Path(workdir))
        except (UnsupportedMedia, UnreadableMedia) as exc:
            # Retrying cannot help: the file itself is unsupported, unreadable, too long or too large.
            with transaction.atomic():
                current = MediaItem.objects.select_for_update().filter(pk=item.pk, claimed_at=item.claimed_at).first()
                if current:
                    fail(current, getattr(exc, "code", "media_unreadable"))
            return Status.FAILED
        except (transcode.ProcessingFailed, FaceDetectionUnavailable, OSError):
            logger.exception("Media processing attempt %s failed", item.attempts)
            with transaction.atomic():
                MediaItem.objects.filter(pk=item.pk, claimed_at=item.claimed_at).update(claimed_at=None)
            return "retry"

        with transaction.atomic():
            current = MediaItem.objects.select_for_update().filter(
                pk=item.pk, status=Status.PROCESSING, claimed_at=item.claimed_at,
            ).first()
            if current is None:
                # Removed, withdrawn or reclaimed while processing; nothing is kept.
                return None
            for key, path in files.items():
                storage().write_file(key, path)
            for name, value in fields.items():
                setattr(current, name, value)
            current.status = Status.READY
            current.exif_removed = True
            current.claimed_at = None
            current.content_type = ""
            current.save()
            schedule_delete(current.organisation_id, original_key(current.organisation_id, current.pk))
    return Status.READY


def process_next():
    item = claim()
    if item is None:
        return None
    if item.status == Status.FAILED:
        return Status.FAILED
    return process(item)
