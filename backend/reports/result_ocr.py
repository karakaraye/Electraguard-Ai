import hashlib
import re
from datetime import timedelta
from io import BytesIO
from uuid import UUID

from django.core.exceptions import RequestDataTooBig
from django.http.multipartparser import MultiPartParserError
from django.views.decorators.cache import never_cache
from django.http import JsonResponse
from django.utils import timezone
from PIL import Image, ImageOps

from accounts.observer_auth import error, validation
from accounts.observer_credentials import rate_limit

from .incident_input import WAT, field
from .models import OcrRead
from .v1_views import observer_required

MAX_PHOTO = 2 * 1024 * 1024
MODEL_VERSION = "ocr-tesseract-1"
HOLD = timedelta(hours=24)
REGISTERED, ACCREDITED, REJECTED = re.compile(r"regist"), re.compile(r"accredit"), re.compile(r"reject|spoil|invalid")


class OcrUnavailable(Exception):
    pass


def recognise_lines(image):
    """Return (text, confidence 0-1) for each printed line. Raises OcrUnavailable without a local engine."""
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
    except Exception as exc:
        raise OcrUnavailable from exc
    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT, config="--psm 6")
    lines = {}
    for i, word in enumerate(data["text"]):
        if word.strip():
            key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
            lines.setdefault(key, []).append((word, max(float(data["conf"][i]), 0) / 100))
    return [(" ".join(w for w, _ in words), min(c for _, c in words)) for words in lines.values()]


def parse_lines(lines, labels):
    """Map recognised lines to sheet fields. A field that was not found stays null with zero confidence."""
    unread = lambda: {"value": None, "confidence": 0.0}
    fields = {"registered": unread(), "accredited": unread(), "rejected": unread(),
              "votes": {label: unread() for label in labels}}
    for text, confidence in lines:
        numbers = re.findall(r"\d[\d,]*", text)
        if not numbers:
            continue
        value = int(numbers[-1].replace(",", ""))
        lowered = text.lower()
        target = None
        for name, pattern in (("registered", REGISTERED), ("accredited", ACCREDITED), ("rejected", REJECTED)):
            if pattern.search(lowered):
                target = fields[name]
        if target is None:
            match = re.match(r"(?i)\s*(?:party\s+)?([A-Za-z0-9]+)\b", text)
            if match and match.group(1).upper() in fields["votes"]:
                target = fields["votes"][match.group(1).upper()]
        if target is not None and 0 <= value <= 99999 and target["value"] is None:
            target.update(value=value, confidence=round(confidence, 2))
    return fields


def clean_photo(raw):
    """Re-encode the photo without metadata. Returns (bytes, content type)."""
    with Image.open(BytesIO(raw)) as photo:
        photo = ImageOps.exif_transpose(photo)
        output = BytesIO()
        if photo.format == "PNG" or photo.mode in ("RGBA", "LA", "P"):
            photo.save(output, "PNG")
            return output.getvalue(), "image/png"
        photo.convert("RGB").save(output, "JPEG", quality=90)
        return output.getvalue(), "image/jpeg"


def body(read):
    return {"ocr_id": str(read.pk), "expires_at": read.expires_at.astimezone(WAT).isoformat(), "fields": read.fields,
            "model_version": read.model_version, "notice_key": read.notice_key}




@never_cache
def read_photo(request):
    if request.method != "POST":
        response = error(405, "method_not_allowed", "This method is not available.")
        response["Allow"] = "POST"
        return response
    blocked = observer_required(request)
    if blocked is not None:
        return blocked
    try:
        if UUID(request.headers.get("Idempotency-Key", "")).version != 4:
            raise ValueError
    except ValueError:
        return error(400, "idempotency_key_required", "Send a UUID v4 Idempotency-Key.")
    if request.content_type != "multipart/form-data":
        return error(415, "unsupported_media_type", "Send a multipart photo.")
    key = UUID(request.headers["Idempotency-Key"])
    try:
        if int(request.META.get("CONTENT_LENGTH") or 0) > MAX_PHOTO + 16384:
            raise RequestDataTooBig
        image = request.FILES.get("file")
        digest = request.POST.get("sha256", "")
    except RequestDataTooBig:
        return error(413, "payload_too_large", "Use a photo of 2 MiB or less.")
    except (MultiPartParserError, ValueError):
        return error(400, "bad_request", "Send valid multipart data.")
    if image is None or not re.fullmatch(r"[a-f0-9]{64}", digest):
        return validation({"file" if image is None else "sha256": field("invalid", "Send a photo and its SHA-256.")})
    if image.size > MAX_PHOTO:
        return error(413, "payload_too_large", "Use a photo of 2 MiB or less.")
    raw = image.read()
    if hashlib.sha256(raw).hexdigest() != digest:
        return error(422, "hash_mismatch", "The photo did not match its SHA-256.")
    if not (raw.startswith((b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n")) or raw.startswith(b"RIFF") and raw[8:12] == b"WEBP"):
        return error(415, "unsupported_media_type", "Choose a JPEG, PNG or WebP photo.")
    try:
        with Image.open(BytesIO(raw)) as photo:
            if photo.width * photo.height > 16000000:
                return error(413, "payload_too_large", "Use a photo of 16 megapixels or less.")
            photo.verify()
    except Image.DecompressionBombError:
        return error(413, "payload_too_large", "Use a photo of 16 megapixels or less.")
    except (OSError, SyntaxError, ValueError):
        return error(422, "media_unreadable", "We could not read this photo. Try again in better light, or type the numbers.")
    cleaned, content_type = clean_photo(raw)
    previous = OcrRead.objects.filter(observer=request.user, key=key).first()
    if previous is not None:
        if previous.photo_sha256 != hashlib.sha256(cleaned).hexdigest():
            return error(409, "idempotency_key_reused", "This send key belongs to a different request.")
        response = JsonResponse(body(previous))
        response["Idempotent-Replayed"] = "true"
        return response
    retry = rate_limit("result-ocr", str(request.user.public_id), 20, 3600)
    if retry is not None:
        return error(429, "rate_limited", "Try again later.", retry=retry)
    try:
        with Image.open(BytesIO(cleaned)) as photo:
            lines = recognise_lines(photo.convert("L"))
    except OcrUnavailable:
        return error(503, "ocr_unavailable", "Photo reading is unavailable. Type the numbers instead.")
    except Exception:
        return error(422, "media_unreadable", "We could not read this photo. Try again in better light, or type the numbers.")
    fields = parse_lines(lines, sorted(request.user.organisation.party_labels))
    found = any(fields[k]["value"] is not None for k in ("registered", "accredited", "rejected")) or any(
        v["value"] is not None for v in fields["votes"].values())
    read = OcrRead.objects.create(
        organisation_id=request.user.organisation_id, observer=request.user, key=key, photo_sha256=hashlib.sha256(cleaned).hexdigest(),
        content_type=content_type, content=cleaned, fields=fields, model_version=MODEL_VERSION,
        notice_key=None if found else "result_sheet.not_a_result", expires_at=timezone.now() + HOLD)
    return JsonResponse(body(read), status=201)
