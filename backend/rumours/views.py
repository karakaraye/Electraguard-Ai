import hashlib
import json
import unicodedata
from io import BytesIO
from uuid import UUID, uuid4

from django.core import signing
from django.db import OperationalError, transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.cache import never_cache
from PIL import Image, ImageOps, UnidentifiedImageError

from accounts.observer_auth import endpoint, error, wat
from accounts.observer_credentials import rate_limit
from reference.models import AreaDataset
from reports.idempotency import lock_key, request_digest
from reports.incident_input import aware_datetime
from staff.access import COORDINATORS
from staff.audit import authorize, record
from staff.fields import invalid, text_field

from .models import Claim, ClaimRequest
from .retrieval import observations_for, similar_claims, tokens


LANGUAGES = {"en", "pcm", "ha", "yo", "ig"}
CHANNELS = {"whatsapp", "facebook", "x", "tiktok", "sms", "radio", "in_person", "other"}
STATUSES = {"new", "matched", "response_draft", "response_approved", "dismissed"}
LEVELS = {"high", "medium", "low"}
IMAGE_LIMIT = 5 * 1024 * 1024


def label(user):
    return user.get_full_name() or user.email


def claim_json(claim):
    return {
        "id": str(claim.id), "status": claim.status, "version": claim.version, "text": claim.text,
        "image": {"media_id": str(claim.image_id), **claim.image_dimensions} if claim.image_id else None,
        "seen_on": claim.seen_on, "language": claim.language,
        "seen_at": wat(claim.seen_at) if claim.seen_at else None, "area": claim.area, "harm": claim.harm,
        "check_worthiness": claim.check_worthiness, "image_check": claim.image_check,
        "response": claim.response, "created_by": label(claim.created_by), "created_at": wat(claim.created_at),
    }


def scoped(actor):
    return Claim.objects.filter(organisation_id=actor.organisation_id).defer("image").select_related("created_by")


def not_found():
    return error(404, "not_found", "We could not find that.")


def claim_area(value):
    if not isinstance(value, dict) or set(value) - {"state_code", "lga_code"}:
        return None
    state_code, lga_code = value.get("state_code"), value.get("lga_code")
    if not isinstance(state_code, str) or (lga_code is not None and not isinstance(lga_code, str)):
        return None
    for states in AreaDataset.objects.values_list("states", flat=True).iterator(chunk_size=1):
        state = states.get(state_code)
        if state is None:
            continue
        lga = next((lga for lga in state["lgas"] if lga["lga_code"] == lga_code), None)
        if lga_code and lga is None:
            continue
        return {
            "state_code": state_code, "state_name": state["state_name"], "lga_code": lga_code,
            "lga_name": lga["lga_name"] if lga else None,
        }
    return None


def assessment(text, area, seen_at, organisation):
    words = tokens(text)
    reasons = []
    score = 0
    if words & {"violence", "attack", "killed", "shooting", "thugs", "bandits"}:
        score += 0.55
        reasons.append("violence_claim")
    if area:
        score += 0.2
        reasons.append("location_specific")
    if seen_at and organisation.election_day and wat(seen_at)[:10] == organisation.election_day.isoformat():
        score += 0.15
        reasons.append("election_day")
    level = "high" if score >= 0.7 else "medium" if score >= 0.35 else "low"
    result = {"level": level, "score": round(score, 2)}
    return {**result, "reasons": reasons}, result


@endpoint("GET")
def claims(request):
    denied = authorize(request, roles=COORDINATORS)
    if denied is not None:
        return denied
    query = scoped(request.user).order_by("-created_at", "id")
    options = {"status": STATUSES, "harm": LEVELS, "language": LANGUAGES}
    scope = [str(request.user.organisation_id)]
    for field, choices in options.items():
        value = request.GET.get(field)
        scope.append(value)
        if value is None:
            continue
        if value not in choices:
            return invalid(field, "invalid_choice")
        query = query.filter(**{("harm__level" if field == "harm" else field): value})
    offset = 0
    try:
        limit = int(request.GET.get("limit", 50))
        if not 1 <= limit <= 100:
            return invalid("limit")
        if cursor := request.GET.get("cursor"):
            saved, offset = signing.loads(cursor, salt="rumour-claims")
            if saved != scope:
                raise ValueError
    except (ValueError, signing.BadSignature):
        return invalid("cursor" if request.GET.get("cursor") else "limit")
    page = list(query[offset:offset + limit + 1])
    return JsonResponse({
        "items": [claim_json(claim) for claim in page[:limit]],
        "next_cursor": signing.dumps([scope, offset + limit], salt="rumour-claims") if len(page) > limit else None,
    })


@endpoint("GET")
def detail(request, claim_id):
    denied = authorize(request, roles=COORDINATORS)
    if denied is not None:
        return denied
    claim = scoped(request.user).filter(pk=claim_id).first()
    return JsonResponse(claim_json(claim)) if claim is not None else not_found()


def replayable(request, data, perform):
    try:
        key = UUID(request.headers.get("Idempotency-Key", ""))
        if key.version != 4:
            raise ValueError
    except ValueError:
        return error(400, "idempotency_key_required", "Send a UUID v4 Idempotency-Key.")
    actor = request.user
    if not lock_key(f"rumour-request:{actor.organisation_id}:{actor.pk}:{key}"):
        return error(409, "request_in_progress", "This request is still being processed.", retry=2)
    checksum = request_digest(request, data)
    scope = ClaimRequest.objects.filter(organisation_id=actor.organisation_id, actor=actor)
    previous = scope.filter(key=key).first()
    if previous:
        if previous.digest != checksum:
            return error(409, "idempotency_key_reused", "This send key belongs to a different request.")
        response = JsonResponse(previous.body)
        response["Idempotent-Replayed"] = "true"
        return response
    result = perform()
    if not isinstance(result, tuple):
        return result
    status, body = result
    scope.create(organisation_id=actor.organisation_id, actor=actor, key=key, body=body, digest=checksum)
    return JsonResponse(body, status=status)


def cleaned_image(raw):
    try:
        with Image.open(BytesIO(raw)) as source:
            if source.format not in {"JPEG", "PNG", "WEBP"}:
                return error(415, "unsupported_media_type", "Use JPEG, PNG or WebP.")
            if source.width * source.height > 16_000_000:
                return error(413, "payload_too_large", "The image has too many pixels.")
            exif = source.getexif()
            guide = {
                "metadata": {
                    "had_metadata": bool(exif or source.info.get("xmp") or source.info.get("icc_profile")),
                    "camera_make": "redacted" if exif.get(271) else None,
                    "created_at": None, "software": None,
                },
                "prompts": ["reverse_search", "check_date_vs_claim", "look_for_edits", "check_source_account"],
                "error_level_hint": None,
            }
            image = ImageOps.exif_transpose(source).convert("RGB")
            output = BytesIO()
            image.save(output, format="JPEG", quality=85)
            return {
                "image_id": uuid4(), "image": output.getvalue(),
                "image_dimensions": {"width": image.width, "height": image.height}, "image_check": guide,
            }
    except UnidentifiedImageError:
        return error(415, "unsupported_media_type", "Use JPEG, PNG or WebP.")
    except (OSError, ValueError, Image.DecompressionBombError):
        return invalid("image", "media_unreadable")


def persist(request, data, raw):
    actor = request.user
    retry = rate_limit("rumour-create", str(actor.organisation_id), 120, 3600)
    if retry is not None:
        return error(429, "rate_limited", "Too many claims. Try again later.", retry=retry)
    text = data.get("text", "")
    if not isinstance(text, str):
        return invalid("text")
    text = unicodedata.normalize("NFC", text.strip())
    if len(text) > 4000 or any(unicodedata.category(char) in {"Cc", "Cs"} and char != "\n" for char in text):
        return invalid("text")
    if not text and not raw:
        return invalid("text", "required")
    seen_on, language = data.get("seen_on"), data.get("language")
    if not isinstance(seen_on, str) or seen_on not in CHANNELS:
        return invalid("seen_on", "invalid_choice")
    if not isinstance(language, str) or language not in LANGUAGES:
        return invalid("language", "invalid_choice")
    seen_at = aware_datetime(data.get("seen_at"))
    if data.get("seen_at") is not None and seen_at is None:
        return invalid("seen_at", "invalid_datetime")
    area = claim_area(data.get("area")) if data.get("area") is not None else None
    if data.get("area") is not None and area is None:
        return invalid("area")
    photo = cleaned_image(raw) if raw else {}
    if not isinstance(photo, dict):
        return photo
    harm, worthiness = assessment(text, area, seen_at, actor.organisation)
    claim = Claim.objects.create(
        organisation_id=actor.organisation_id, created_by=actor, text=text,
        seen_on=seen_on, language=language, seen_at=seen_at, area=area, harm=harm, check_worthiness=worthiness,
        **photo,
    )
    record(actor.organisation_id, "create_claim", "claim", claim.pk, actor=actor, version=0, content=data)
    return 201, claim_json(claim)


@endpoint("POST", max_body_bytes=16384)
@transaction.atomic
def create_text(request, data):
    denied = authorize(request, roles=COORDINATORS)
    return denied if denied is not None else replayable(request, data, lambda: persist(request, data, None))


@never_cache
def create_image(request):
    denied = authorize(request, roles=COORDINATORS)
    if denied is not None:
        return denied
    image = request.FILES.get("image")
    if image is None:
        return invalid("image", "required")
    if image.size > IMAGE_LIMIT:
        return error(413, "payload_too_large", "The image exceeds 5 MiB.")
    raw = image.read(IMAGE_LIMIT + 1)
    data = request.POST.dict()
    if "area" in data:
        try:
            data["area"] = json.loads(data["area"])
        except ValueError:
            return invalid("area")
    data["image_digest"] = hashlib.sha256(raw).hexdigest()
    try:
        with transaction.atomic():
            return replayable(request, data, lambda: persist(request, data, raw))
    except OperationalError:
        return error(503, "service_unavailable", "The service is temporarily unavailable.")


def collection(request):
    if request.method == "POST":
        return create_image(request) if request.content_type == "multipart/form-data" else create_text(request)
    return claims(request)


@endpoint("GET")
def matches(request, claim_id):
    denied = authorize(request, roles=COORDINATORS)
    if denied is not None:
        return denied
    claim = scoped(request.user).filter(pk=claim_id).first()
    if claim is None:
        return not_found()
    query = tokens(claim.text)
    return JsonResponse({
        "observations": observations_for(claim, query) if query else [],
        "past_claims": similar_claims(claim, query) if query else [], "model_version": "token-overlap-v1",
    })


def response_change(request, data, claim_id, operation):
    actor = request.user
    claim = scoped(actor).select_for_update(of=("self",)).filter(pk=claim_id).first()
    if claim is None:
        return not_found()
    version = data.get("version")
    if type(version) is not int or version < 0:
        return invalid("version")
    if version != claim.version:
        return error(409, "stale_version", "This claim has changed. Refresh before trying again.")
    if claim.status == "dismissed" or (
        operation in {"approve", "reject"} and claim.status != "response_draft"
    ):
        return error(409, "invalid_transition", "This action is unavailable for the current claim status.")
    if operation == "save":
        text = text_field(data.get("text"))
        language = data.get("language")
        if text is None or len(text) > 1500:
            return invalid("text")
        if not isinstance(language, str) or language not in LANGUAGES:
            return invalid("language", "invalid_choice")
        claim.drafted_by = actor
        claim.status = "response_draft"
        claim.response = {
            "text": text, "language": language, "drafted_by": label(actor), "drafted_at": wat(timezone.now()),
            "approved_by": None, "approved_at": None, "rejection_note": None,
        }
    elif operation == "approve":
        if claim.drafted_by_id == actor.pk:
            return error(403, "same_person_approval", "Another coordinator must approve a response you drafted.")
        claim.status = "response_approved"
        claim.response.update(approved_by=label(actor), approved_at=wat(timezone.now()))
    else:
        note = text_field(data.get("note"))
        if note is None or len(note) > 500:
            return invalid("note")
        if operation == "reject":
            claim.status = "matched"
            claim.response["rejection_note"] = note
        else:
            claim.status = "dismissed"
    claim.version += 1
    claim.save(update_fields=["version", "status", "response", "drafted_by"])
    record(
        claim.organisation_id, f"{operation}_claim_response", "claim", claim.pk,
        actor=actor, version=claim.version, content=data,
    )
    return 200, claim_json(claim)


@endpoint("PUT", max_body_bytes=16384)
@transaction.atomic
def draft(request, data, claim_id):
    denied = authorize(request, roles=COORDINATORS)
    if denied is not None:
        return denied
    result = response_change(request, data, claim_id, "save")
    return JsonResponse(result[1]) if isinstance(result, tuple) else result


@endpoint("POST", max_body_bytes=4096)
@transaction.atomic
def action(request, data, claim_id, operation):
    denied = authorize(request, roles=COORDINATORS)
    if denied is not None:
        return denied
    if operation in {"approve", "reject"}:
        return replayable(request, data, lambda: response_change(request, data, claim_id, operation))
    result = response_change(request, data, claim_id, operation)
    return JsonResponse(result[1]) if isinstance(result, tuple) else result
