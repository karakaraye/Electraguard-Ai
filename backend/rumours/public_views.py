"""Public rumour check endpoints (CHK-01, CHK-02) and shared SMS CHECK helpers."""

import hashlib
import re
from unicodedata import category as unicode_category, normalize

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F, Sum
from django.http import JsonResponse
from django.utils import timezone

from uuid import UUID

from accounts.observer_auth import endpoint, error, validation
from accounts.observer_credentials import rate_limit
from phone_channels.intake import public_organisation
from privacy.redactor import redact
from reports.idempotency import lock_key, request_digest
from reports.models import Report
from staff.fields import category as report_category, is_incident, text_field

from .matching import match_approved, match_existing
from .models import Claim, ClaimAskHour, PublicCheckRequest
from .views import LANGUAGES, assessment

SAFETY_TERMS = {
    "violence", "attack", "attacking", "attacked", "killed", "kill", "killing",
    "shooting", "shot", "gunfire", "gunmen", "thugs", "bandits", "bomb",
    "machete", "arson", "burning", "bleeding", "injured", "danger", "emergency",
}
SAFETY_PATTERN = re.compile(
    r"\b(" + "|".join(sorted(SAFETY_TERMS)) + r")\b",
    re.IGNORECASE,
)


def has_danger_signal(text: str) -> bool:
    return bool(text and SAFETY_PATTERN.search(text))


def _salted_hash(prefix: str, value: str) -> str:
    payload = f"{settings.SECRET_KEY}:{prefix}:{value}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _client_ip(request) -> str:
    return (request.META.get("REMOTE_ADDR") or "unknown").strip()


def _suppress_under_five(count: int):
    return count if count >= 5 else "fewer than 5"


def observer_support_for(claim: Claim) -> dict:
    """Count distinct states and wards from reviewed (closed) reports matching claim area/category."""
    qs = Report.objects.filter(
        organisation_id=claim.organisation_id,
        status=Report.Status.CLOSED,
    ).only("pk", "kind", "incident_details", "review_suggestions")

    claim_area = claim.area or {}
    claim_state = claim_area.get("state_code")
    claim_lga = claim_area.get("lga_code")
    claim_cat = (claim.response or {}).get("category")

    states = set()
    wards = set()
    for report in qs.iterator():
        details = report.incident_details or {}
        if not is_incident(details, getattr(report, "kind", "incident")):
            continue
        area = details.get("area") or {}
        if claim_state and area.get("state_code") != claim_state:
            continue
        if claim_lga and area.get("lga_code") != claim_lga:
            continue
        if claim_cat and report_category(report).get("value") != claim_cat:
            continue
        if area.get("state_code"):
            states.add(area["state_code"])
        if area.get("ward_code"):
            wards.add(area["ward_code"])

    return {
        "states": _suppress_under_five(len(states)),
        "wards": _suppress_under_five(len(wards)),
    }


def _checkin_evidence_summary(claim: Claim):
    """Optional check-in evidence summary for E1 when matching recent ward check-ins."""
    try:
        from notices.models import NoticeAnswer
    except ImportError:
        return None
    cutoff = timezone.now() - timezone.timedelta(hours=6)
    claim_cat = (claim.response or {}).get("category")
    qs = NoticeAnswer.objects.filter(
        organisation_id=claim.organisation_id,
        notice__status="sent",
        notice__created_at__gte=cutoff,
        notice__question__isnull=False,
    ).select_related("notice", "notice__question")
    if claim_cat:
        qs = qs.filter(notice__question__category=claim_cat)
    claim_area = claim.area or {}
    if claim_area.get("lga_code"):
        qs = qs.filter(notice__scope_kind="lga", notice__scope_code=claim_area["lga_code"])
    elif claim_area.get("state_code"):
        qs = qs.filter(notice__scope_code__startswith=claim_area["state_code"])

    yes_count = qs.filter(answer="yes").count()
    no_count = qs.filter(answer="no").count()
    total = qs.count()
    if total == 0:
        return None
    return {
        "yes": _suppress_under_five(yes_count),
        "no": _suppress_under_five(no_count),
    }


def resolve_approved_response(claim: Claim, requested_lang: str) -> tuple[str, str]:
    resp = claim.response or {}
    translations = resp.get("translations") or resp.get("by_lang") or {}
    if requested_lang in translations and translations[requested_lang]:
        return str(translations[requested_lang]), requested_lang
    if claim.language == requested_lang and resp.get("text"):
        return str(resp["text"]), requested_lang
    return str(resp.get("text") or ""), "en"


def check_rumour(query: str, lang: str, organisation) -> dict:
    """Core CHK-01 lookup used by both GET /api/v1/public/check and SMS CHECK."""
    if has_danger_signal(query):
        return {"result": "safety"}

    claim, _score = match_approved(query, organisation.pk)
    if claim is None:
        return {"result": "not_checked"}

    resp_text, resp_lang = resolve_approved_response(claim, lang)
    support = observer_support_for(claim)
    ci_summary = _checkin_evidence_summary(claim)
    if ci_summary is not None:
        support["checkins"] = ci_summary

    return {
        "result": "checked",
        "response": {
            "text": resp_text,
            "approved_at": (claim.response or {}).get("approved_at"),
            "language": resp_lang,
            "observer_support": support,
        },
        "claim_ref": str(claim.id),
    }


@transaction.atomic
def increment_ask_count(claim: Claim, now=None):
    if now is None:
        now = timezone.now()
    hour = now.replace(minute=0, second=0, microsecond=0)
    Claim.objects.filter(pk=claim.pk).update(ask_count=F("ask_count") + 1)
    updated = ClaimAskHour.objects.filter(claim=claim, hour=hour).update(count=F("count") + 1)
    if not updated:
        try:
            with transaction.atomic():
                ClaimAskHour.objects.create(
                    organisation_id=claim.organisation_id,
                    claim=claim,
                    hour=hour,
                    count=1,
                )
        except IntegrityError:
            ClaimAskHour.objects.filter(claim=claim, hour=hour).update(count=F("count") + 1)


@transaction.atomic
def submit_rumour_check(raw_text: str, lang: str, organisation, source: str = "public") -> dict:
    """Core CHK-02 submission used by POST /api/v1/public/check and SMS CHECK."""
    redacted = redact(raw_text, organisation.pk)
    stored_text = redacted.text

    existing, _score = match_existing(stored_text, organisation.pk)
    now = timezone.now()
    if existing is not None:
        increment_ask_count(existing, now=now)
        current_hour = now.replace(minute=0, second=0, microsecond=0)
        cutoff = current_hour - timezone.timedelta(hours=1)
        total_asks = ClaimAskHour.objects.filter(claim=existing, hour__gte=cutoff).aggregate(Sum("count"))["count__sum"] or 0
        harm, check_worthiness = assessment(existing.text, existing.area, existing.seen_at, organisation, ask_trend_1h=total_asks)
        Claim.objects.filter(pk=existing.pk).update(harm=harm, check_worthiness=check_worthiness)
        return {"result": "matched", "claim_ref": str(existing.id)}

    harm, check_worthiness = assessment(stored_text, None, now, organisation)
    claim = Claim.objects.create(
        organisation=organisation,
        text=stored_text,
        seen_on=source,
        seen_at=now,
        language=lang,
        area=None,
        harm=harm,
        check_worthiness=check_worthiness,
        source=source,
        ask_count=1,
        status="new",
        created_by=None,
    )
    hour = now.replace(minute=0, second=0, microsecond=0)
    ClaimAskHour.objects.create(
        organisation=organisation,
        claim=claim,
        hour=hour,
        count=1,
    )
    return {"result": "queued", "claim_ref": str(claim.id)}


def _validate_query_text(raw):
    if not isinstance(raw, str):
        return None
    cleaned = normalize("NFC", raw.strip())
    if not 5 <= len(cleaned) <= 500:
        return None
    if any(unicode_category(ch) in {"Cc", "Cs"} and ch != "\n" for ch in cleaned):
        return None
    return cleaned


@endpoint("GET")
def check_get(request):
    organisation = public_organisation()
    if organisation is None:
        return error(404, "not_found", "Service unavailable.")

    raw_q = request.GET.get("q", "")
    query = _validate_query_text(raw_q)
    if query is None:
        return validation({"q": {"code": "invalid_length", "message": "Enter 5 to 500 characters."}})

    lang = request.GET.get("lang", "en")
    if lang not in LANGUAGES:
        lang = "en"

    return JsonResponse(check_rumour(query, lang, organisation))


def _replayable_public(request, data, organisation, dev_hash, perform):
    try:
        key = UUID(request.headers.get("Idempotency-Key", ""))
        if key.version != 4:
            raise ValueError
    except ValueError:
        return error(400, "idempotency_key_required", "Send a UUID v4 Idempotency-Key.")
    if not lock_key(f"chk2-req:{organisation.pk}:{dev_hash}:{key}"):
        return error(409, "request_in_progress", "This request is still being processed.", retry=2)
    checksum = request_digest(request, data)
    scope = PublicCheckRequest.objects.filter(organisation_id=organisation.pk, device_hash=dev_hash)
    previous = scope.filter(key=key).first()
    if previous:
        if previous.digest != checksum:
            return error(409, "idempotency_key_reused", "This send key belongs to a different request.")
        response = JsonResponse(previous.body, status=previous.status)
        response["Idempotent-Replayed"] = "true"
        return response
    status, body = perform()
    scope.create(
        organisation_id=organisation.pk, device_hash=dev_hash, key=key,
        status=status, body=body, digest=checksum,
    )
    return JsonResponse(body, status=status)


@endpoint("POST", max_body_bytes=16384)
def check_post(request, data):
    organisation = public_organisation()
    if organisation is None:
        return error(404, "not_found", "Service unavailable.")

    ip_hash = _salted_hash("chk-ip", _client_ip(request))
    retry_ip = rate_limit("chk2-ip", ip_hash, 10, 3600)
    if retry_ip is not None:
        return error(429, "rate_limited", "Too many checks. Try again later.", retry=retry_ip)

    device_token = data.get("device_token")
    if not isinstance(device_token, str) or not 1 <= len(device_token.strip()) <= 128:
        return validation({"device_token": {"code": "required", "message": "Provide a valid device token."}})
    dev_hash = _salted_hash("chk-dev", device_token.strip())
    retry_dev = rate_limit("chk2-dev", dev_hash, 10, 3600)
    if retry_dev is not None:
        return error(429, "rate_limited", "Too many checks from this device. Try again later.", retry=retry_dev)

    text = _validate_query_text(data.get("text"))
    if text is None:
        return validation({"text": {"code": "invalid_length", "message": "Enter 5 to 500 characters."}})

    lang = data.get("lang", "en")
    if lang not in LANGUAGES:
        return validation({"lang": {"code": "invalid_choice", "message": "Choose en, pcm, ha, yo or ig."}})

    def perform():
        body = submit_rumour_check(text, lang, organisation, source="public")
        return (200 if body["result"] == "matched" else 201), body

    return _replayable_public(request, data, organisation, dev_hash, perform)


def public_check_view(request):
    if request.method == "POST":
        return check_post(request)
    if request.method == "GET":
        return check_get(request)
    response = JsonResponse({"error": {"code": "method_not_allowed", "message": "Method not allowed."}}, status=405)
    response["Allow"] = "GET, POST"
    return response
