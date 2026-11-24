from django.utils import timezone

from accounts.observer_auth import wat

from .media_storage import all_keys, schedule_delete, staging_key
from .models import UploadSession


def retire_upload(upload, status):
    schedule_delete(upload.organisation_id, staging_key(upload))
    if upload.status == UploadSession.Status.OPEN:
        # Files written before a failed completion can be left under the upload's id.
        for key in all_keys(upload.organisation_id, upload.pk):
            schedule_delete(upload.organisation_id, key)
    upload.status = status
    upload.save(update_fields=["status"])


def cancel_report_uploads(report):
    pending = []
    now = timezone.now()
    for upload in report.media_uploads.filter(organisation_id=report.organisation_id, status=UploadSession.Status.OPEN):
        if upload.expires_at > now:
            pending.append({"id": str(upload.pk), "kind": upload.kind, "size_bytes": upload.size_bytes})
            retire_upload(upload, UploadSession.Status.CANCELLED)
        else:
            retire_upload(upload, UploadSession.Status.EXPIRED)
    return pending


def remove_media(media):
    for key in all_keys(media.organisation_id, media.pk):
        schedule_delete(media.organisation_id, key)
    media.delete()


remove_photo = remove_media


def describe_media(media):
    return {
        "id": str(media.pk), "kind": media.kind, "status": media.status, "size_bytes": media.size_bytes,
        "duration_ms": media.duration_ms, "blurred": media.blurred,
        "exif_removed": media.exif_removed and media.status == "ready",
        "created_at": wat(media.created_at),
    }


describe_photo = describe_media


def describe_transcript(media):
    if media.kind != "audio" or media.status != "ready":
        return None
    return {
        "status": media.transcript_status or "unavailable", "text": media.transcript,
        "language": media.transcript_language or None, "method": media.transcript_method or None,
        "machine_generated": True,
    }
