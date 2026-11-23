from accounts.observer_auth import wat

from .media_storage import photo_key, schedule_delete, staging_key
from .models import UploadSession


def retire_upload(upload, status):
    schedule_delete(upload.organisation_id, staging_key(upload))
    if upload.status == UploadSession.Status.OPEN:
        # A cleaned file written before a failed completion can be left here.
        schedule_delete(upload.organisation_id, photo_key(upload.organisation_id, upload.pk))
    upload.status = status
    upload.save(update_fields=["status"])


def cancel_report_uploads(report):
    pending = []
    for upload in report.media_uploads.filter(organisation_id=report.organisation_id, status=UploadSession.Status.OPEN):
        pending.append({"id": str(upload.pk), "kind": "photo", "size_bytes": upload.size_bytes})
        retire_upload(upload, UploadSession.Status.CANCELLED)
    return pending


def remove_photo(media):
    schedule_delete(media.organisation_id, photo_key(media.organisation_id, media.pk))
    media.delete()


def describe_photo(photo):
    return {
        "id": str(photo.pk), "kind": "photo", "status": "ready", "size_bytes": photo.size_bytes,
        "duration_ms": None, "blurred": photo.blurred, "exif_removed": photo.exif_removed,
        "created_at": wat(photo.created_at),
    }
