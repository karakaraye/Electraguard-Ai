import base64
import logging
import re
import time
from hashlib import sha256
from hmac import compare_digest
from ipaddress import ip_address
from math import ceil
from threading import Lock
from unicodedata import category, normalize

from django.conf import settings
from django.core.cache.backends.locmem import LocMemCache
from django.db.models import DateTimeField, OuterRef, Subquery
from django.db.models.functions import Coalesce
from django.http import JsonResponse

from accounts.observer_auth import endpoint, error, validation, wat
from accounts.observer_credentials import ALPHABET, check_symbol
from accounts.organisations import org_scope

from .idempotency import idempotent
from .incident_input import field, incident_input
from .models import CitizenReply, Report, ReviewEvent
from .v1_views import STATES, missing, persist_report, question_id, withdraw_report
from .workflow import record_change
from privacy.redactor import redact

Status = Report.Status
Action = ReviewEvent.Action
CACHE = LocMemCache("citizen-report-limits", {"OPTIONS": {"MAX_ENTRIES": 10000}})
CACHE_LOCK = Lock()
LOG = logging.getLogger(__name__)


def limit(key, count, window):
    with CACHE_LOCK:
        now = time.monotonic()
        hits = [stamp for stamp in CACHE.get(key, []) if stamp > now - window]
        if len(hits) >= count:
            return max(1, ceil(hits[0] + window - now))
        hits.append(now)
        CACHE.set(key, hits, timeout=window)


def rate_error(retry):
    if retry is not None:
        return error(429, "rate_limited", "Too many requests. Try again later.", retry=retry)


def client_key(request):
    peer = request.META.get("REMOTE_ADDR") or "unknown"
    if peer in settings.AUTH_TRUSTED_PROXY_IPS:
        try:
            peer = str(ip_address(request.META.get("HTTP_X_FORWARDED_FOR", "")))
        except ValueError:
            pass
    return sha256(peer.encode()).hexdigest()


def secret_hash(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}", value):
        return None
    decoded = base64.urlsafe_b64decode(value + "=")
    if base64.urlsafe_b64encode(decoded).decode().rstrip("=") != value:
        return None
    return sha256(value.encode()).hexdigest()


def normalize_receipt(value):
    if len(value) > 64 or not value.isascii():
        return None
    compact = re.sub(r"[\s-]+", "", value.upper())
    code = compact[2:].translate(str.maketrans("OIL", "011"))
    if not compact.startswith("EG") or len(code) != 8 or any(char not in ALPHABET for char in code):
        return None
    if check_symbol(code[:7]) == code[-1]:
        return f"EG-{code[:4]}-{code[4:]}"


def invalid_code():
    return error(422, "receipt_code_invalid", "Check the code. It looks like EG-4H7Q-92KD.")


def public_reports(request):
    return org_scope(request, Report, public=True)


def lookup(request, code):
    digest = secret_hash(request.headers.get("X-Receipt-Secret"))
    report = public_reports(request).filter(receipt_code=code, observer__isnull=True).first()
    stored = report.receipt_secret_digest if report else "0" * 64
    if not compare_digest(digest or "", stored) or report is None or not report.receipt_secret_digest:
        return None, None
    return report, digest


def create_citizen(request, data, digest):
    limited = rate_error(limit("submit:" + client_key(request), 30, 600))
    if limited is not None:
        return limited
    group = org_scope(request, public=True).first()
    if group is None or not settings.OBSERVATION_INTAKE_ENABLED or group.intake_paused:
        return error(503, "intake_paused", "New reports are paused by your organisation.", retry=600)
    if data.get("kind") in ("checklist", "result_sheet"):
        return validation({"kind": field("not_allowed_for_kind", "Choose an incident report.")})
    values, errors = incident_input(data, request.headers.get("X-Device-Time"))
    for name in ("related_report_id", "from_checklist_question"):
        if data.get(name) is not None:
            errors[name] = field("not_allowed_for_kind", "This field is available for observer reports.")
    if errors:
        return validation(errors)
    return persist_report(None, group.pk, values, secret_digest=digest)


@endpoint("POST", max_body_bytes=65536)
def submit(request, data):
    digest = secret_hash(data.get("receipt_secret"))
    if digest is None:
        return validation({"receipt_secret": field("invalid", "Send a base64url receipt secret.")})
    return idempotent(
        request, "REP-05", data, lambda: create_citizen(request, data, digest), citizen_digest=digest,
    )


@endpoint("GET")
def receipt_status(request, receipt_code):
    limited = rate_error(limit("status:" + client_key(request), 30, 60))
    if limited is not None:
        return limited
    code = normalize_receipt(receipt_code)
    if code is None:
        return invalid_code()
    events = org_scope(request, ReviewEvent, public=True).filter(report_id=OuterRef("pk")).order_by("-version")
    closed = events.filter(action=Action.CLOSE)
    report = public_reports(request).filter(receipt_code=code).annotate(
        last_change=Coalesce(Subquery(events.values("created_at")[:1], output_field=DateTimeField()), "created_at"),
        outcome=Subquery(closed.values("change__outcome")[:1]),
    ).first()
    if report is None:
        if limit("enumeration-misses", 999, 3600) is not None and limit("enumeration-alert", 1, 3600) is None:
            LOG.warning("receipt_enumeration")
        return missing()
    return JsonResponse({
        "receipt_code": code, "status": STATES[report.status],
        "outcome": report.outcome if report.status == Status.CLOSED else None,
        "has_open_question": report.status == Status.NEEDS_CLARIFICATION,
        "received_on": wat(report.created_at)[:10], "updated_on": wat(report.last_change)[:10],
    })


def reply_message(reply, viewer=None):
    display_body = reply.body if viewer != "reviewer" else (getattr(reply, "auto_redacted_body", None) or reply.body)
    return {
        "id": str(reply.pk), "kind": "reply", "author": "citizen", "author_label": "Citizen",
        "body": display_body, "attachment": None, "question_state": None,
        "reply_to": str(reply.question_id), "created_at": wat(reply.created_at), "read": True,
    }


def proved(request, receipt_code):
    code = normalize_receipt(receipt_code)
    if code is None:
        return None, None, invalid_code()
    report, digest = lookup(request, code)
    if report is None:
        limited = rate_error(limit("proof:" + client_key(request), 10, 60))
        if limited is not None:
            return None, None, limited
        return None, None, error(401, "receipt_secret_invalid", "The receipt secret does not match.")
    return report, digest, None


@endpoint("GET")
def conversation(request, receipt_code):
    report, _, problem = proved(request, receipt_code)
    if problem is not None:
        return problem
    limited = rate_error(limit("receipt:" + report.receipt_code, 10, 60))
    if limited is not None:
        return limited
    events = org_scope(request, ReviewEvent, public=True).filter(
        report=report, action=Action.REQUEST_CLARIFICATION,
    ).order_by("version")
    replies = {
        str(reply.question_id): reply for reply in org_scope(request, CitizenReply, public=True).filter(report=report)
    }
    questions = list(events)
    messages = []
    for event in questions:
        identifier = question_id(report.pk, event.version)
        reply = replies.get(identifier)
        state = "answered" if reply else "closed_unanswered"
        if not reply and report.status == Status.NEEDS_CLARIFICATION and event == questions[-1]:
            state = "open"
        messages.append({
            "id": identifier, "kind": "formal_question", "author": "reviewer", "author_label": "Reviewer",
            "body": event.change["note"], "attachment": None, "question_state": state,
            "reply_to": None, "created_at": wat(event.created_at), "read": True,
        })
        if reply:
            messages.append(reply_message(reply))
    return JsonResponse({"receipt_code": report.receipt_code, "status": STATES[report.status], "messages": messages})


def reply_to_question(request, report_id, data):
    report = public_reports(request).select_for_update(no_key=True).get(pk=report_id)
    limited = rate_error(limit("receipt:" + report.receipt_code, 10, 60))
    if limited is not None:
        return limited
    if report.status in (Status.WITHDRAWN, Status.CLOSED):
        return error(409, f"report_{report.status}", "This report no longer accepts replies.")
    return persist_reply(report, data)


def persist_reply(report, data):
    event = ReviewEvent.objects.filter(
        report=report, organisation_id=report.organisation_id, action=Action.REQUEST_CLARIFICATION,
    ).order_by("-version").first()
    expected = question_id(report.pk, event.version) if event else None
    if report.status != Status.NEEDS_CLARIFICATION or expected is None or data.get("question_id") != expected:
        return error(409, "question_closed", "This question was already answered or closed.")
    raw = data.get("body")
    body = normalize("NFC", raw.strip()) if isinstance(raw, str) else ""
    if not body:
        return validation({"body": field("required", "Enter a reply.")})
    if len(body) > 2000:
        return validation({"body": field("max_length", "Use 2000 characters or fewer.", limit=2000)})
    if any(category(char) in {"Cc", "Cs"} and char != "\n" for char in body):
        return validation({"body": field("invalid", "Enter text without control characters.")})
    report.status = Status.IN_REVIEW
    record_change(report, None, Action.RESPOND, {
        "question_id": expected, "from_status": "needs_clarification", "to_status": "in_review",
        "body_sha256": sha256(body.encode()).hexdigest(),
    }, "status")
    res = redact(body, report.organisation_id)
    reply = CitizenReply.objects.create(
        report=report, organisation_id=report.organisation_id, question_id=expected,
        event=ReviewEvent.objects.get(report=report, version=report.version), body=body,
        auto_redacted_body=res.text, auto_redactions=res.spans,
    )
    return 201, {"message": reply_message(reply), "status": "in_review", "version": report.version}, report


@endpoint("POST", max_body_bytes=65536)
def reply(request, data, receipt_code):
    report, digest, problem = proved(request, receipt_code)
    if problem is not None:
        return problem
    return idempotent(
        request, "REP-07", data, lambda: reply_to_question(request, report.pk, data), citizen_digest=digest,
    )


@endpoint("POST", max_body_bytes=65536)
def withdraw(request, data, receipt_code):
    report, digest, problem = proved(request, receipt_code)
    if problem is not None:
        return problem

    def perform():
        limited = rate_error(limit("receipt:" + report.receipt_code, 10, 60))
        if limited is not None:
            return limited
        locked = public_reports(request).select_for_update(no_key=True).get(pk=report.pk)
        return withdraw_report(request, locked, data, public=True)

    return idempotent(request, "REP-04", data, perform, citizen_digest=digest)
