import hashlib
import re
from io import BytesIO
from uuid import UUID

from django.core.exceptions import RequestDataTooBig
from django.http.multipartparser import MultiPartParserError
from django.views.decorators.cache import never_cache
from PIL import Image

from accounts.observer_auth import error, validation
from accounts.observer_credentials import rate_limit

from .incident_input import field
from .v1_views import observer_required

MAX_PHOTO = 2 * 1024 * 1024


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
    retry = rate_limit("result-ocr", str(request.user.public_id), 20, 3600)
    if retry is not None:
        return error(429, "rate_limited", "Try again later.", retry=retry)
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
    return error(503, "ocr_unavailable", "Photo reading is unavailable. Type the numbers instead.")
