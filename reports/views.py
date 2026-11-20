import hashlib
import json
import re
from datetime import datetime, timezone
from hmac import compare_digest
from uuid import UUID

from django.conf import settings
from django.core.exceptions import RequestDataTooBig
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_POST

from .models import Report, ReviewEvent

RECEIPT_PATTERN = re.compile(r"[0-9a-f]{64}")
CLOSURE_REASONS = {"corroborated", "insufficient_information", "out_of_scope"}


def error(message, status):
    return JsonResponse({"error": message}, status=status)


def read_object(request):
    if request.content_type != "application/json":
        raise ValueError("Send application/json.")
    try:
        value = json.loads(request.body)
    except (ValueError, RequestDataTooBig) as failure:
        raise ValueError("Send a valid JSON object within the size limit.") from failure
    if not isinstance(value, dict):
        raise ValueError("Send a JSON object.")
    return value


def text(data, field, limit):
    value = data.get(field)
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
        raise ValueError(f"{field} must contain 1–{limit} characters.")
    value = value.strip()
    if "\x00" in value:
        raise ValueError(f"{field} contains an unsupported character.")
    value.encode("utf-8")
    return value


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def receipt_digest(data):
    secret = data.get("receipt_secret")
    if not isinstance(secret, str) or not RECEIPT_PATTERN.fullmatch(secret):
        raise ValueError("Provide a valid receipt secret.")
    return digest(secret)


def report_fields(data):
    if set(data) != {"receipt_secret", "area", "occurred_at", "category", "firsthand", "description"}:
        raise ValueError("Provide only the supported report fields.")
    occurred = datetime.fromisoformat(text(data, "occurred_at", 40))
    if occurred.tzinfo is None:
        raise ValueError("The incident time needs a UTC offset.")
    category = text(data, "category", 16)
    if category not in Report.Category.values:
        raise ValueError("Choose a supported category.")
    if type(data.get("firsthand")) is not bool:
        raise ValueError("Indicate whether the incident was observed firsthand.")
    return {
        "area": text(data, "area", 120),
        "occurred_at": occurred.astimezone(timezone.utc),
        "category": category,
        "firsthand": data["firsthand"],
        "description": text(data, "description", 1000),
    }


def acknowledgement(report):
    return {
        "reference": str(report.reference),
        "status": report.status,
        "received_at": report.received_at.isoformat(),
    }


@never_cache
@require_GET
def csrf(request):
    return JsonResponse({"token": get_token(request)})


@never_cache
@require_POST
def submit(request):
    provided = request.headers.get("X-Intake-Token", "")
    if not settings.INTAKE_TOKEN or not compare_digest(
        provided.encode("utf-8"), settings.INTAKE_TOKEN.encode("utf-8")
    ):
        return error("An intake credential is required.", 403)
    try:
        key = UUID(request.headers.get("Idempotency-Key", ""))
        data = read_object(request)
        fields = report_fields(data)
        secret_hash = receipt_digest(data)
        fingerprint = digest(json.dumps(fields, sort_keys=True, default=str))
    except (ValueError, OverflowError) as failure:
        return error(str(failure), 400)

    try:
        with transaction.atomic():
            report, created = Report.objects.get_or_create(
                submission_key=key,
                defaults={**fields, "receipt_digest": secret_hash, "submission_digest": fingerprint},
            )
    except IntegrityError:
        if Report.objects.filter(receipt_digest=secret_hash).exists():
            return error("Use a different receipt secret for each report.", 409)
        raise
    if not compare_digest(report.receipt_digest, secret_hash) or not compare_digest(
        report.submission_digest, fingerprint
    ):
        return error("This submission key is already in use.", 409)
    return JsonResponse(acknowledgement(report), status=201 if created else 200)


@never_cache
@require_POST
def receipt(request):
    try:
        secret_hash = receipt_digest(read_object(request))
    except ValueError as failure:
        return error(str(failure), 400)
    report = Report.objects.filter(receipt_digest=secret_hash).first()
    if report is None:
        return error("Receipt not found.", 404)
    return JsonResponse(acknowledgement(report))


@never_cache
@require_GET
def queue(request):
    if not request.user.has_perm("reports.view_report"):
        return error("Review access is required.", 403)
    reports = Report.objects.order_by("-received_at", "-pk")[:50]
    return JsonResponse({"reports": [
        {**acknowledgement(report), "area": report.area, "category": report.category,
         "occurred_at": report.occurred_at.isoformat(), "firsthand": report.firsthand,
         "description": report.description, "version": report.version}
        for report in reports
    ]})


@never_cache
@require_POST
@transaction.atomic
def review(request, reference):
    if not request.user.has_perms(["reports.view_report", "reports.change_report"]):
        return error("Review access is required.", 403)
    try:
        data = read_object(request)
        action = text(data, "action", 12)
        version = data.get("version")
        if type(version) is not int or version < 0:
            raise ValueError("Provide the current report version.")
        reason = "review_started" if action == "start" else text(data, "reason", 32)
        if action != "start" and (action != "close" or reason not in CLOSURE_REASONS):
            raise ValueError("Choose a supported action and disposition.")
    except ValueError as failure:
        return error(str(failure), 400)
    report = Report.objects.filter(reference=reference).first()
    if report is None:
        return error("Report not found.", 404)
    expected, next_status = (
        (Report.Status.RECEIVED, Report.Status.IN_REVIEW) if action == "start"
        else (Report.Status.IN_REVIEW, Report.Status.CLOSED)
    )
    updated = Report.objects.filter(pk=report.pk, status=expected, version=version).update(
        status=next_status, version=version + 1,
    )
    if not updated:
        return error("The report changed or this action is unavailable. Refresh the queue.", 409)
    ReviewEvent.objects.create(
        report=report, actor=request.user, status=next_status, version=version + 1, reason=reason,
    )
    return JsonResponse({"status": next_status, "version": version + 1})
