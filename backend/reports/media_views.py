import os
import re
from datetime import timedelta
from functools import wraps
from hashlib import sha256
from io import BytesIO
from unicodedata import category
from uuid import uuid4

from django.core.exceptions import RequestDataTooBig
from django.db import OperationalError, transaction
from django.db.models import Q, Sum
from django.db.models.functions import Length
from django.http import HttpResponse, JsonResponse, StreamingHttpResponse
from django.utils import timezone
from django.views.decorators.cache import never_cache
from PIL import Image

from accounts.models import User
from accounts.observer_auth import endpoint, error, validation, wat
from accounts.observer_credentials import rate_limit
from accounts.organisations import org_scope

from .idempotency import idempotent, lock_key
from .incident_input import field
from .media_av.probe import CONTAINERS, DURATION_TOLERANCE_MS, UnreadableMedia, UnsupportedMedia, limit_ms, probe
from .media_lifecycle import describe_media, remove_media, retire_upload
from .media_storage import (
    media_key, original_key, photo_key, poster_key, review_key, schedule_delete, staging_key, storage,
)
from .models import Evidence, MediaAccess, MediaItem, Report, ReviewEvent, UploadSession
from .photo_processing import UnsupportedPhoto, clean_photo, review_copy
from .v1_views import missing, owned, observer_required
from .workflow import record_change

CHUNK = 256 * 1024
MAX_CHUNK = 1024 * 1024
MAX_PHOTO = 2 * 1024 * 1024
MAX_SIZE = {"photo": MAX_PHOTO, "video": 25 * 1024 * 1024, "audio": 4 * 1024 * 1024}
TYPES = {
    "photo": ("image/jpeg", "image/png"),
    "video": tuple(t for t in CONTAINERS if t.startswith("video/")),
    "audio": tuple(t for t in CONTAINERS if t.startswith("audio/")),
}
TYPE_MESSAGES = {
    "photo": "Choose a JPEG or PNG photo.",
    "video": "Choose an MP4 or WebM video.",
    "audio": "Choose a WebM, Ogg, M4A or MP3 voice note.",
}
SIZE_MESSAGES = {"photo": "Photos can be up to 2 MiB.", "video": "Videos can be up to 25 MiB.", "audio": "Voice notes can be up to 4 MiB."}
UPLOAD_LIFE = timedelta(hours=24)
Status = UploadSession.Status


def storage_errors(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        try:
            return view(*args, **kwargs)
        except (OSError, OperationalError):
            return error(503, "service_unavailable", "Private media is temporarily unavailable.")
    return wrapped


def describe_upload(upload):
    return {
        "id": str(upload.pk), "report_id": str(upload.report_id),
        "client_media_id": upload.client_attachment_id, "kind": upload.kind,
        "size_bytes": upload.size_bytes, "received_bytes": upload.received_bytes,
        "chunk_bytes": CHUNK, "status": upload.status, "expires_at": wat(upload.expires_at),
    }


def unavailable(report):
    if report.status == Report.Status.CLOSED:
        return error(409, "report_closed", "This case is closed, so new evidence cannot be added.")
    if report.status == Report.Status.WITHDRAWN:
        return error(409, "report_withdrawn", "This report has been withdrawn.")
    return None


def expired(upload, now):
    return upload.status == Status.EXPIRED or (upload.status == Status.OPEN and upload.expires_at <= now)


def upload_state_error(upload, now):
    if expired(upload, now):
        if upload.status == Status.OPEN:
            retire_upload(upload, Status.EXPIRED)
        return error(409, "upload_expired", "Start a new session for this upload.")
    if upload.status == Status.COMPLETED:
        return error(409, "upload_completed", "This upload is already complete.")
    if upload.status == Status.CANCELLED:
        return missing()
    return None


def start_fields(data):
    kind = data.get("kind")
    if kind not in MAX_SIZE:
        return validation({"kind": field("invalid_choice", "Choose photo, video or audio.")})
    mime = data.get("content_type")
    if mime not in TYPES[kind]:
        return error(415, "unsupported_media_type", TYPE_MESSAGES[kind])
    size = data.get("size_bytes")
    if type(size) is int and size > MAX_SIZE[kind]:
        return error(413, "payload_too_large", SIZE_MESSAGES[kind])

    client_id = data.get("client_attachment_id", data.get("client_media_id"))
    digest = data.get("sha256")
    blur = data.get("blur_faces", False)
    purpose = data.get("purpose")
    errors = {}
    if not isinstance(client_id, str) or not 1 <= len(client_id) <= 64 or not client_id.isprintable():
        errors["client_media_id"] = field("invalid", "Enter the attachment identifier.")
    if "client_media_id" in data and "client_attachment_id" in data and data["client_media_id"] != client_id:
        errors["client_media_id"] = field("invalid", "Use the same identifier for this attachment.")
    if type(size) is not int or size < 1:
        errors["size_bytes"] = field("min_value", "Enter a positive size.", limit=1)
    if not isinstance(digest, str) or not re.fullmatch("[0-9a-f]{64}", digest):
        errors["sha256"] = field("invalid", "Enter a lower-case SHA-256 digest.")
    if not isinstance(blur, bool):
        errors["blur_faces"] = field("invalid", "Choose true or false.")
    if purpose not in ("evidence", "message"):
        errors["purpose"] = field("invalid_choice", "Choose an upload purpose.")
    duration = data.get("duration_ms")
    if kind == "photo" and duration is not None:
        errors["duration_ms"] = field("not_allowed_for_kind", "Photos do not have a duration.")
    elif kind != "photo" and (type(duration) is not int or duration < 1):
        errors["duration_ms"] = field("required", "Enter the length in milliseconds.")
    elif kind != "photo" and duration > limit_ms(kind):
        errors["duration_ms"] = field("max_value", "This recording is too long.", limit=limit_ms(kind))
    if kind == "audio" and blur is True:
        errors["blur_faces"] = field("not_allowed_for_kind", "Voice notes cannot be blurred.")
    if errors:
        return validation(errors)
    return {
        "client_attachment_id": client_id, "kind": kind, "content_type": mime, "purpose": purpose,
        "size_bytes": size, "sha256": digest, "blur_faces": blur, "duration_ms": duration,
    }


def capacity(request, report, size, *, reserve=None):
    photos = org_scope(request, MediaItem).filter(report=report)
    legacy = org_scope(request, Evidence).filter(report=report)
    open_uploads = org_scope(request, UploadSession).filter(
        report=report, status=Status.OPEN, expires_at__gt=timezone.now(),
    ).exclude(pk=reserve)
    count = photos.count() + legacy.count() + open_uploads.count()
    combined = sum((
        photos.aggregate(total=Sum("size_bytes"))["total"] or 0,
        legacy.aggregate(total=Sum(Length("content")))["total"] or 0,
        open_uploads.aggregate(total=Sum("size_bytes"))["total"] or 0,
        size,
    ))
    if count >= 6 or combined > 60 * 1024 * 1024:
        return error(409, "media_limit_reached", "This report already has 6 attachments or 60 MiB.")


def start_upload(request, reference, data):
    report = owned(request).select_for_update(no_key=True).filter(pk=reference).first()
    if report is None:
        return missing()
    problem = unavailable(report)
    if problem is not None:
        return problem
    fields = start_fields(data)
    if not isinstance(fields, dict):
        return fields

    sessions = org_scope(request, UploadSession).filter(report=report)
    previous = sessions.filter(client_attachment_id=fields["client_attachment_id"]).first()
    now = timezone.now()
    if previous and previous.status != Status.CANCELLED:
        if any(getattr(previous, key) != value for key, value in fields.items()):
            return error(409, "idempotency_key_reused", "This attachment identifier belongs to different bytes or options.")
        if previous.status == Status.OPEN and not expired(previous, now):
            return 200, {"upload": describe_upload(previous), "media": None}, report
        if previous.status == Status.OPEN:
            retire_upload(previous, Status.EXPIRED)

    existing = org_scope(request, MediaItem).filter(report=report, original_sha256=fields["sha256"]).first()
    if existing:
        return 200, {"upload": None, "media": describe_media(existing)}, report
    problem = capacity(request, report, fields["size_bytes"])
    if problem is not None:
        return problem
    retry = rate_limit("new-media-upload", str(request.user.public_id), 30, 3600)
    if retry is not None:
        return error(429, "rate_limited", "Too many uploads. Try again later.", retry=retry)
    upload = sessions.create(report=report, organisation_id=report.organisation_id, expires_at=now + UPLOAD_LIFE, **fields)
    return 201, {"upload": describe_upload(upload), "media": None}, report


@endpoint("POST", max_body_bytes=65536)
@storage_errors
def start(request, data, reference):
    blocked = observer_required(request)
    if blocked is not None:
        return blocked

    def replay(record):
        prior = record.body.get("upload")
        if prior and org_scope(request, UploadSession).filter(pk=prior["id"]).filter(
            Q(status=Status.CANCELLED) | Q(status=Status.COMPLETED, media__isnull=True)
        ).exists():
            return missing()
        if record.body.get("media") and not org_scope(request, MediaItem).filter(pk=record.body["media"]["id"]).exists():
            return missing()
        return start_upload(request, reference, data)

    return idempotent(request, "MED-01", data, lambda: start_upload(request, reference, data), replay=replay)


def locked_upload(request, reference):
    sessions = org_scope(request, UploadSession).filter(pk=reference, report__observer=request.user)
    report_id = sessions.values_list("report_id", flat=True).first()
    report = owned(request).select_for_update(no_key=True).filter(pk=report_id).first() if report_id else None
    if report is None:
        return None, None
    return sessions.first(), report


@transaction.atomic
def upload_request(request, reference):
    upload, report = locked_upload(request, reference)
    if upload is None:
        return missing()
    if request.method == "DELETE":
        return cancel(request, report, upload)
    now = timezone.now()
    problem = unavailable(report) if request.method == "PATCH" else None
    if problem is None:
        problem = upload_state_error(upload, now)
    if problem is not None:
        if request.method == "GET" and upload.status == Status.COMPLETED:
            return JsonResponse(describe_upload(upload))
        return problem
    if request.method == "GET":
        return JsonResponse(describe_upload(upload))

    if request.content_type != "application/offset+octet-stream":
        return error(400, "bad_request", "Send an application/offset+octet-stream chunk.")
    header = request.headers.get("Upload-Offset", "")
    if not re.fullmatch(r"[0-9]{1,10}", header):
        return error(400, "bad_request", "Send a valid Upload-Offset.")
    offset = int(header)
    if offset != upload.received_bytes:
        return error(409, "offset_mismatch", "The upload position changed. Continue from the saved position.")
    try:
        content = request.body
    except RequestDataTooBig:
        return error(413, "payload_too_large", "The chunk exceeds the allowed size.")
    if not content:
        return error(400, "bad_request", "Send a nonempty chunk.")
    if len(content) > MAX_CHUNK or offset + len(content) > upload.size_bytes:
        return error(413, "payload_too_large", "The chunk exceeds the upload's allowed size.")
    expected = request.headers.get("Upload-Chunk-Sha256")
    if expected is not None and expected != sha256(content).hexdigest():
        return error(422, "hash_mismatch", "The chunk did not arrive intact.")
    storage().append(staging_key(upload), offset, content)
    upload.received_bytes += len(content)
    upload.expires_at = now + UPLOAD_LIFE
    upload.save(update_fields=["received_bytes", "expires_at"])
    return JsonResponse({
        "id": str(upload.pk), "received_bytes": upload.received_bytes,
        "size_bytes": upload.size_bytes, "status": upload.status,
    })


@never_cache
@storage_errors
def upload_endpoint(request, reference):
    if request.method not in ("GET", "PATCH", "DELETE"):
        response = error(405, "method_not_allowed", "This method is not available.")
        response["Allow"] = "GET, PATCH, DELETE"
        return response
    blocked = observer_required(request)
    return blocked if blocked is not None else upload_request(request, reference)


def completed(upload, report, photo, status):
    schedule_delete(upload.organisation_id, staging_key(upload))
    upload.status = Status.COMPLETED
    upload.media = photo
    upload.save(update_fields=["status", "media"])
    return status, {"media": describe_media(photo), "client_media_id": upload.client_attachment_id}, report


def finish_upload(request, reference):
    upload, report = locked_upload(request, reference)
    if upload is None:
        return missing()
    problem = unavailable(report)
    if problem is not None:
        return problem
    if upload.status == Status.COMPLETED and upload.media_id:
        photo = org_scope(request, MediaItem).get(pk=upload.media_id)
        return 200, {"media": describe_media(photo), "client_media_id": upload.client_attachment_id}, report
    problem = upload_state_error(upload, timezone.now())
    if problem is not None:
        return problem
    if upload.received_bytes != upload.size_bytes:
        return error(409, "offset_mismatch", "Some of the file has not arrived yet.")

    if staged_digest(upload) != (upload.size_bytes, upload.sha256):
        schedule_delete(upload.organisation_id, staging_key(upload))
        upload.staging_id = uuid4()
        upload.received_bytes = 0
        upload.save(update_fields=["staging_id", "received_bytes"])
        return error(422, "hash_mismatch", "The file did not arrive intact. Sending it again.")
    if upload.kind == "photo":
        return finish_photo(request, upload, report)
    return finish_recording(request, upload, report)


def staged_digest(upload):
    digest, size = sha256(), 0
    try:
        with storage().read(staging_key(upload)) as staged:
            for block in iter(lambda: staged.read(1024 * 1024), b""):
                size += len(block)
                if size > upload.size_bytes:
                    break
                digest.update(block)
    except FileNotFoundError:
        return 0, ""
    return size, digest.hexdigest()


def finish_photo(request, upload, report):
    with storage().read(staging_key(upload)) as staged:
        raw = staged.read(MAX_PHOTO + 1)
    try:
        cleaned, blurred = clean_photo(raw, upload.content_type, upload.blur_faces)
        # Reviewers see faces blurred by default; the unblurred photo needs a recorded reason.
        reviewer_copy = None if blurred else review_copy(cleaned)
    except UnsupportedPhoto:
        retire_upload(upload, Status.CANCELLED)
        return error(415, "unsupported_media_type", "The photo must match its declared JPEG or PNG format.")
    except ValueError:
        retire_upload(upload, Status.CANCELLED)
        return error(422, "media_unreadable", "The photo could not be decoded.")

    queryset = org_scope(request, MediaItem).filter(report=report)
    existing = queryset.filter(original_sha256=upload.sha256).first()
    if existing:
        return completed(upload, report, existing, 200)
    problem = capacity(request, report, len(cleaned), reserve=upload.pk)
    if problem is not None:
        return problem

    storage().write(photo_key(upload.organisation_id, upload.pk), cleaned)
    if reviewer_copy is not None:
        storage().write(review_key(upload.organisation_id, upload.pk, "photo"), reviewer_copy)
    photo = queryset.create(
        id=upload.pk, report=report, organisation_id=upload.organisation_id, purpose=upload.purpose,
        size_bytes=len(cleaned), original_sha256=upload.sha256, sha256=sha256(cleaned).hexdigest(),
        blur_requested=upload.blur_faces, blurred=blurred, review_copy=reviewer_copy is not None,
    )
    return completed(upload, report, photo, 201)


def finish_recording(request, upload, report):
    """Verify a video or voice note and queue it. The worker cleans it and sets it ready."""
    staged = storage().path(staging_key(upload))
    try:
        info = probe(staged, upload.kind, upload.content_type)
    except UnsupportedMedia:
        retire_upload(upload, Status.CANCELLED)
        return error(415, "unsupported_media_type", TYPE_MESSAGES[upload.kind])
    except UnreadableMedia:
        retire_upload(upload, Status.CANCELLED)
        return error(422, "media_unreadable", "The recording could not be decoded.")
    if info.duration_ms > limit_ms(upload.kind) + DURATION_TOLERANCE_MS:
        retire_upload(upload, Status.CANCELLED)
        return validation({"duration_ms": field("max_value", "This recording is too long.", limit=limit_ms(upload.kind))})

    queryset = org_scope(request, MediaItem).filter(report=report)
    existing = queryset.filter(original_sha256=upload.sha256).first()
    if existing:
        return completed(upload, report, existing, 200)
    problem = capacity(request, report, upload.size_bytes, reserve=upload.pk)
    if problem is not None:
        return problem

    storage().write_file(original_key(upload.organisation_id, upload.pk), staged)
    item = queryset.create(
        id=upload.pk, report=report, organisation_id=upload.organisation_id, purpose=upload.purpose,
        kind=upload.kind, status=MediaItem.Status.PROCESSING, content_type=upload.content_type,
        size_bytes=upload.size_bytes, duration_ms=min(info.duration_ms, limit_ms(upload.kind)),
        original_sha256=upload.sha256, sha256="", blur_requested=upload.blur_faces, exif_removed=False,
    )
    return completed(upload, report, item, 201)


@endpoint("POST", max_body_bytes=65536)
@storage_errors
def complete(request, data, reference):
    blocked = observer_required(request)
    if blocked is not None:
        return blocked

    def replay(record):
        upload, report = locked_upload(request, reference)
        if report is None or report.status == Report.Status.WITHDRAWN or not upload.media_id:
            return missing()
        photo = org_scope(request, MediaItem).filter(pk=upload.media_id, report=report).first()
        if photo is None:
            return missing()
        return 200, {"media": describe_media(photo), "client_media_id": upload.client_attachment_id}, report

    return idempotent(request, "MED-03", data, lambda: finish_upload(request, reference), replay=replay)


def removal_error(report, purpose):
    if report.status != Report.Status.SUBMITTED or purpose == "message":
        return error(409, "invalid_transition", "This attachment can no longer be removed.")


def cancel(request, report, upload):
    if upload.status in (Status.CANCELLED, Status.EXPIRED):
        return HttpResponse(status=204)
    problem = removal_error(report, upload.purpose)
    if problem is not None:
        return problem
    if upload.status == Status.COMPLETED:
        return error(409, "upload_completed", "This upload is already complete.")
    retire_upload(upload, Status.CANCELLED)
    record_change(report, request.user, ReviewEvent.Action.REMOVE_MEDIA, {"sha256": upload.sha256})
    return HttpResponse(status=204)


@never_cache
@storage_errors
@transaction.atomic
def remove(request, reference, media_id):
    if request.method != "DELETE":
        response = error(405, "method_not_allowed", "This method is not available.")
        response["Allow"] = "DELETE"
        return response
    blocked = observer_required(request)
    if blocked is not None:
        return blocked
    report = owned(request).select_for_update(no_key=True).filter(pk=reference).first()
    if report is None:
        return missing()
    photo = org_scope(request, MediaItem).filter(report=report, pk=media_id).first()
    if photo is None:
        return HttpResponse(status=204)
    problem = removal_error(report, photo.purpose)
    if problem is not None:
        return problem
    digest = photo.sha256
    remove_media(photo)
    record_change(report, request.user, ReviewEvent.Action.REMOVE_MEDIA, {"sha256": digest})
    return HttpResponse(status=204)


RANGE = re.compile(r"bytes=([0-9]{0,12})-([0-9]{0,12})")
TYPES_OUT = {"photo": "image/jpeg", "video": "video/mp4", "audio": "audio/ogg"}
NAMES = {"photo": "photo.jpg", "video": "video.mp4", "audio": "voice-note.ogg", "poster": "poster.jpg"}


def byte_range(header, size):
    """Return (first, last) for a satisfiable single range, None for no range, or False."""
    if not header:
        return None
    match = RANGE.fullmatch(header)
    if match:
        left, right = match.groups()
        if left or right:
            first = int(left) if left else max(0, size - int(right))
            last = min(size - 1, int(right)) if left and right else size - 1
            if 0 <= first <= last < size:
                return first, last
    return False


def unsatisfiable(size):
    response = error(416, "invalid_range", "The requested byte range is unavailable.")
    response["Content-Range"] = f"bytes */{size}"
    return response


def partial_response(raw, header, content_type="image/jpeg"):
    span = byte_range(header, len(raw))
    if span is None:
        return HttpResponse(raw, content_type=content_type)
    if span is False:
        return unsatisfiable(len(raw))
    first, last = span
    response = HttpResponse(raw[first:last + 1], status=206, content_type=content_type)
    response["Content-Range"] = f"bytes {first}-{last}/{len(raw)}"
    return response


def file_response(key, header, content_type):
    """Stream a stored file, or one byte range of it, without loading it into memory."""
    try:
        handle = storage().read(key)
    except FileNotFoundError:
        return error(503, "service_unavailable", "Private media is temporarily unavailable.")
    size = os.fstat(handle.fileno()).st_size
    span = byte_range(header, size)
    if span is False:
        handle.close()
        return unsatisfiable(size)
    first, last = span or (0, size - 1)
    handle.seek(first)

    def chunks(remaining=last - first + 1):
        with handle:
            while remaining > 0:
                block = handle.read(min(256 * 1024, remaining))
                if not block:
                    return
                remaining -= len(block)
                yield block

    response = StreamingHttpResponse(chunks(), status=206 if span else 200, content_type=content_type)
    response["Content-Length"] = last - first + 1
    if span:
        response["Content-Range"] = f"bytes {first}-{last}/{size}"
    return response


def log_download(request, photo, download, reason=""):
    action = "download_original" if reason else ("download_media" if download else "view_media")
    access = org_scope(request, MediaAccess).filter(actor=request.user, media_id=photo.pk, action=action)
    # MED-04: at most one event per user, item and action every 10 minutes, so a video
    # player's many range requests do not flood the audit log. A new reason is always logged.
    recent = access.filter(created_at__gt=timezone.now() - timedelta(minutes=10))
    if reason:
        recent = recent.filter(reason=reason)
    with transaction.atomic():
        if not lock_key(f"media-access:{request.user.pk}:{photo.pk}:{action}"):
            return False
        if not recent.exists():
            access.create(
                organisation_id=photo.organisation_id, report=photo.report,
                actor=request.user, media_id=photo.pk, action=action, reason=reason,
            )
    return True


VARIANTS = {"photo": ("display", "thumb", "original"), "video": ("display", "poster", "original"), "audio": ("display", "original")}


def access_reason(request):
    reason = request.headers.get("X-Media-Access-Reason", "").strip()
    if not reason or len(reason) > 500 or any(category(char) in {"Cc", "Cs"} for char in reason):
        return None
    return reason


def stored_source(item, variant, reviewer):
    """Choose (storage key, content type, file name) for a ready item, or an error response."""
    org, kind = item.organisation_id, item.kind
    if variant == "original":
        # Reviewers reach the unblurred cleaned file only with a recorded reason. Media blurred
        # at the observer's request keeps no unblurred copy.
        if item.blurred or kind == "audio":
            return missing()
        return media_key(org, item.pk, kind), TYPES_OUT[kind], NAMES[kind]
    # Reviewers see faces blurred: the stored file when blurred, else the review copy.
    face_safe = kind == "audio" or item.blurred
    if reviewer and not face_safe and not item.review_copy:
        return error(409, "invalid_transition", "A blurred copy of this file is unavailable.")
    use_review = reviewer and not face_safe
    if variant == "poster":
        return poster_key(org, item.pk, review=use_review), "image/jpeg", NAMES["poster"]
    key = review_key(org, item.pk, kind) if use_review else media_key(org, item.pk, kind)
    return key, TYPES_OUT[kind], NAMES[kind]


def thumbnail(raw):
    with Image.open(BytesIO(raw)) as image:
        image.thumbnail((320, 320))
        output = BytesIO()
        image.save(output, format="JPEG", quality=85)
        return output.getvalue()


@endpoint("GET")
@storage_errors
@transaction.atomic
def download(request, reference):
    if not request.user.is_authenticated:
        return missing()
    actor = request.user
    items = org_scope(request, MediaItem).filter(
        pk=reference, report__organisation_id=actor.organisation_id,
    ).exclude(report__status=Report.Status.WITHDRAWN)
    if actor.role == User.Role.OBSERVER:
        items = items.filter(report__observer=actor)
    elif actor.role == User.Role.REVIEWER:
        items = items.filter(report__assigned_reviewer=actor)
    else:
        return missing()
    item = items.first()
    variant = request.GET.get("variant", "display")
    reviewer = actor.role == User.Role.REVIEWER
    legacy = None
    if item is None and reviewer and variant == "original":
        legacy = org_scope(request, Evidence).filter(
            pk=reference, report__organisation_id=actor.organisation_id,
            report__assigned_reviewer=actor,
        ).exclude(report__status=Report.Status.WITHDRAWN).defer("content").first()
    if legacy is None and (item is None or variant not in VARIANTS[item.kind]):
        return missing()
    if reviewer:
        assigned = org_scope(request, Report).select_for_update(no_key=True).filter(
            pk=(item or legacy).report_id, assigned_reviewer=actor,
        ).exclude(status=Report.Status.WITHDRAWN).first()
        if assigned is None:
            return missing()
    if variant == "original" and not reviewer:
        return missing()

    reason = ""
    if variant == "original":
        reason = access_reason(request)
        if reason is None:
            return validation({"reason": field("invalid", "Provide a reason of 1 to 500 printable characters.")})
    as_attachment = request.GET.get("download") == "1"
    header = request.headers.get("Range")

    if legacy:
        try:
            raw, _ = clean_photo(bytes(legacy.content), legacy.content_type, False)
        except ValueError:
            return error(422, "media_unreadable", "The photo could not be decoded.")
        response, name = partial_response(raw, header), NAMES["photo"]
    elif item.status == MediaItem.Status.FAILED:
        return error(409, "invalid_transition", "This file could not be prepared.")
    elif item.status == MediaItem.Status.PROCESSING:
        # The contract allows the assigned reviewer the verified original while processing,
        # so an urgent case is not held up by the worker. Every such access is logged.
        # Media the observer asked to blur is never shown unblurred, even while waiting.
        if variant != "original" or item.blur_requested:
            return error(409, "invalid_transition", "This file is still being prepared.")
        response = file_response(original_key(item.organisation_id, item.pk), header, item.content_type)
        # The unprocessed upload still carries camera metadata; never render it inline.
        name, as_attachment = "original", True
    else:
        source = stored_source(item, variant, reviewer)
        if not isinstance(source, tuple):
            return source
        key, content_type, name = source
        if variant == "thumb":
            try:
                with storage().read(key) as file:
                    raw = file.read()
            except FileNotFoundError:
                return error(503, "service_unavailable", "Private media is temporarily unavailable.")
            response = partial_response(thumbnail(raw), header)
        else:
            response = file_response(key, header, content_type)

    if response.status_code in (200, 206):
        if reviewer and not log_download(request, item or legacy, as_attachment, reason):
            return error(503, "service_unavailable", "Private media is temporarily unavailable.")
        response["Content-Disposition"] = f'{"attachment" if as_attachment else "inline"}; filename="{name}"'
        if not response.streaming:
            response["Content-Length"] = len(response.content)
        response["Accept-Ranges"] = "bytes"
    response["Cache-Control"] = "private, no-store, max-age=0"
    response["X-Content-Type-Options"] = "nosniff"
    return response
