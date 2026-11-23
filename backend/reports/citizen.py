import base64
import hashlib
import logging
import re
from hmac import compare_digest
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.http import JsonResponse

from accounts.models import Organisation
from accounts.observer_auth import endpoint, error, validation
from accounts.observer_credentials import ALPHABET, check_symbol, rate_limit

from .idempotency import idempotent
from .conversation import messages, send
from .incident_input import WAT, field, incident_input
from .models import Report, ReviewEvent
from .v1_views import STATES, Status, created, missing, save_report, withdraw_report

logger = logging.getLogger(__name__)


def secret_hash(secret):
    if isinstance(secret, str) and re.fullmatch(r"[A-Za-z0-9_-]{43}", secret):
        raw = base64.urlsafe_b64decode(secret + "=")
        if base64.urlsafe_b64encode(raw).decode().rstrip("=") == secret:
            return hashlib.sha256(raw).hexdigest()
    return None


def address(request):
    return request.META.get("REMOTE_ADDR", "")


@endpoint("POST", max_body_bytes=65536)
def create_citizen(request, data):
    payload = dict(data)
    digest = secret_hash(payload.pop("receipt_secret", None))
    if not digest:
        return validation({"receipt_secret": field("invalid", "Enter a valid receipt secret.")})
    try:
        organisation = Organisation.objects.filter(pk=UUID(str(settings.PUBLIC_INTAKE_ORGANISATION_ID))).first()
    except ValueError:
        organisation = None
    if organisation is None:
        return error(503, "intake_paused", "Citizen reporting is temporarily unavailable.", retry=600)

    def perform():
        retry = rate_limit("citizen-intake", address(request), 30, 600)
        if retry is not None:
            if rate_limit("citizen-burst-signal", address(request), 1, 600) is None:
                logger.warning("intake_burst", extra={"organisation_id": str(organisation.pk)})
            return error(429, "rate_limited", "Try again later.", retry=retry)
        if organisation.intake_paused or not settings.OBSERVATION_INTAKE_ENABLED:
            return error(503, "intake_paused", "Citizen reporting is temporarily unavailable.", retry=600)
        if payload.get("kind") != "incident":
            return validation({"kind": field("not_allowed_for_kind", "Citizens can send incident reports.")})
        values, errors = incident_input(payload, request.headers.get("X-Device-Time"))
        if errors:
            return validation(errors)
        if values["incident_details"]["related_report_id"]:
            return missing()
        return created(save_report(organisation.pk, None, "incident", values, channel="citizen", receipt_secret_hash=digest))

    return idempotent(request, "REP-05", payload, perform, citizen=(organisation.pk, digest))


def normal_receipt(value):
    code = re.sub(r"[\s-]", "", value.upper()).translate(str.maketrans("OIL", "011"))
    if len(code) == 10 and code.startswith("EG") and all(char in ALPHABET for char in code[2:]):
        if check_symbol(code[2:-1]) == code[-1]:
            return f"EG-{code[2:6]}-{code[6:]}"
    return None


@endpoint("GET")
def receipt_status(request, receipt_code):
    retry = rate_limit("public-receipt", address(request), 30, 60)
    if retry is not None:
        return error(429, "rate_limited", "Try again later.", retry=retry)
    code = normal_receipt(receipt_code)
    if code is None:
        return error(422, "receipt_code_invalid", "Check the receipt code and try again.")
    report = Report.objects.filter(receipt_code=code).first()
    entries = ReviewEvent.objects.filter(report_id=report.pk if report else UUID(int=0)).order_by("-version")
    latest = entries.first()
    closure = entries.filter(action=ReviewEvent.Action.CLOSE).first()
    if report is None:
        if rate_limit("receipt-misses", "global", 999, 3600) is not None:
            if rate_limit("receipt-enumeration-signal", "global", 1, 3600) is None:
                logger.warning("receipt_enumeration")
        return missing()
    return JsonResponse({
        "receipt_code": code, "status": STATES[report.status],
        "outcome": closure.change.get("outcome") if closure else None,
        "has_open_question": report.status == Status.NEEDS_CLARIFICATION,
        "received_on": report.created_at.astimezone(WAT).date().isoformat(),
        "updated_on": (latest.created_at if latest else report.created_at).astimezone(WAT).date().isoformat(),
    })


def citizen_report(request, receipt_code, *, lock=False):
    code = normal_receipt(receipt_code)
    if code is None:
        return error(422, "receipt_code_invalid", "Check the receipt code and try again.")
    retry = rate_limit("citizen-conversation", code, 10, 60)
    if retry is not None:
        return error(429, "rate_limited", "Try again later.", retry=retry)
    supplied = secret_hash(request.headers.get("X-Receipt-Secret"))
    queryset = Report.objects.filter(receipt_code=code, channel="citizen")
    if lock:
        queryset = queryset.select_for_update(no_key=True)
    report = queryset.first()
    matched = compare_digest(supplied or "0" * 64, report.receipt_secret_hash if report else "0" * 64)
    if report is None:
        return missing()
    if not supplied or not matched:
        return error(401, "receipt_secret_invalid", "Enter the secret saved with this receipt.")
    return report


@endpoint("GET")
def read_conversation(request, receipt_code):
    report = citizen_report(request, receipt_code)
    if not isinstance(report, Report):
        return report
    return JsonResponse({"receipt_code": report.receipt_code, "status": STATES[report.status],
                         "messages": messages(report, "citizen")})


@endpoint("POST", max_body_bytes=16384)
@transaction.atomic
def reply(request, data, receipt_code):
    report = citizen_report(request, receipt_code, lock=True)
    if not isinstance(report, Report):
        return report
    return idempotent(request, "REP-07", data, lambda: send(report, None, "citizen", data),
                      citizen=(report.organisation_id, report.receipt_secret_hash))


@endpoint("POST", max_body_bytes=1024)
@transaction.atomic
def withdraw(request, data, receipt_code):
    report = citizen_report(request, receipt_code, lock=True)
    if not isinstance(report, Report):
        return report
    return idempotent(request, "REP-04-citizen", data, lambda: withdraw_report(report, None, data),
                      citizen=(report.organisation_id, report.receipt_secret_hash))
