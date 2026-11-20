import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from hmac import compare_digest
from uuid import UUID

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import RequestDataTooBig
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone as django_timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from .models import Report, ReportLink, ReviewEvent
from .suggestions import RANKING_POOL_LIMIT, REVIEW_CANDIDATE_LIMIT, WINDOW_MINUTES, rank_candidates

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
    if settings.INTAKE_PAUSED:
        return error("Report intake is paused. Keep this report and retry later.", 503)
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
    cutoff = django_timezone.now() - timedelta(days=settings.RECEIPT_LIFETIME_DAYS)
    report = Report.objects.filter(receipt_digest=secret_hash, received_at__gte=cutoff).first()
    if report is None:
        return error("Receipt not found.", 404)
    return JsonResponse(acknowledgement(report))


@never_cache
@require_GET
def queue(request):
    if not request.user.has_perm("reports.view_report"):
        return error("Review access is required.", 403)
    reports = scoped_reports(request.user).select_related("assigned_to")
    if request.GET.get("unassigned") == "1":
        reports = reports.filter(assigned_to__isnull=True)
    status = request.GET.get("status", "")
    if status in Report.Status.values:
        reports = reports.filter(status=status)
    query = request.GET.get("q", "").strip()[:120]
    if query:
        reports = reports.filter(Q(reference__istartswith=query) | Q(area__icontains=query))
    return JsonResponse({"reports": [report_summary(report, request.user)
                                     for report in reports.order_by("-received_at", "-pk")[:50]]})


def scoped_reports(user):
    if user.has_perm("reports.assign_report"):
        return Report.objects.all()
    return Report.objects.filter(assigned_to=user)


def report_summary(report, user):
    return {
        **acknowledgement(report), "area": report.area, "category": report.category,
         "occurred_at": report.occurred_at.isoformat(), "firsthand": report.firsthand,
        "description": report.description, "version": report.version,
        "assigned_to": report.assigned_to.get_username() if report.assigned_to else None,
        "can_review": user.has_perm("reports.change_report"),
    }


@never_cache
@require_http_methods(["GET", "POST"])
@transaction.atomic
def review(request, reference):
    if not request.user.has_perm("reports.view_report"):
        return error("Review access is required.", 403)
    scope = scoped_reports(request.user)
    report = scope.filter(reference=reference).first()
    if report is None:
        return error("Report not found.", 404)
    if request.method == "GET":
        return detail(request.user, scope, report)
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
    expected, next_status = (
        (Report.Status.RECEIVED, Report.Status.IN_REVIEW) if action == "start"
        else (Report.Status.IN_REVIEW, Report.Status.CLOSED)
    )
    updated = scope.filter(pk=report.pk, status=expected, version=version).update(
        status=next_status, version=version + 1,
    )
    if not updated:
        return error("The report changed or this action is unavailable. Refresh the queue.", 409)
    ReviewEvent.objects.create(
        report=report, actor=request.user, status=next_status, version=version + 1, reason=reason,
    )
    return JsonResponse({"status": next_status, "version": version + 1})


def detail(user, scope, report):
    window = timedelta(minutes=WINDOW_MINUTES)
    nearby = Q(area__iexact=report.area, occurred_at__range=(
        report.occurred_at - window, report.occurred_at + window,
    ))
    links = ReportLink.objects.filter(Q(first=report) | Q(second=report))
    decisions = {
        second if first == report.pk else first: decision
        for first, second, decision in links.values_list("first_id", "second_id", "decision")
    }
    scoped = scope.select_related("assigned_to").order_by("-received_at", "-pk")
    decided = list(scoped.filter(pk__in=decisions))
    pool = scoped.filter(nearby).exclude(pk__in=[report.pk, *decisions])[:RANKING_POOL_LIMIT]
    candidates = rank_candidates(report, pool)[:REVIEW_CANDIDATE_LIMIT]
    return JsonResponse({
        "report": report_summary(report, user),
        "events": list(report.events.order_by("version").select_related("actor").values(
            "actor__username", "created_at", "reason", "note",
        )),
        "candidates": [
            {**report_summary(candidate, user), "decision": decisions.get(candidate.pk),
             "minutes_apart": round(abs((report.occurred_at - candidate.occurred_at).total_seconds()) / 60)}
            for candidate in [*candidates, *decided]
        ],
    })


def reviewer_accounts():
    return [
        user for user in get_user_model().objects.filter(is_active=True).order_by("username")
        if user.has_perms(["reports.view_report", "reports.change_report"])
    ]


@never_cache
@require_GET
def assignees(request):
    if not request.user.has_perms(["reports.view_report", "reports.assign_report"]):
        return error("Assignment access is required.", 403)
    return JsonResponse({"reviewers": [
        {"id": user.pk, "label": user.get_username()} for user in reviewer_accounts()
    ]})


@never_cache
@require_POST
@transaction.atomic
def assign(request, reference):
    if not request.user.has_perms(["reports.view_report", "reports.assign_report"]):
        return error("Assignment access is required.", 403)
    try:
        data = read_object(request)
        version, reviewer_id = data.get("version"), data.get("reviewer")
        if type(version) is not int or version < 0 or type(reviewer_id) is not int:
            raise ValueError("Choose a reviewer and provide the current report version.")
    except ValueError as failure:
        return error(str(failure), 400)
    reviewer = get_user_model().objects.filter(pk=reviewer_id, is_active=True).first()
    if reviewer is None or not reviewer.has_perms(["reports.view_report", "reports.change_report"]):
        return error("Choose an active reviewer.", 400)
    report = Report.objects.filter(reference=reference).first()
    if report is None:
        return error("Report not found.", 404)
    updated = Report.objects.filter(pk=report.pk, version=version).exclude(
        status=Report.Status.CLOSED,
    ).exclude(assigned_to=reviewer).update(assigned_to=reviewer, version=version + 1)
    if not updated:
        return error("The report changed or is already assigned to this reviewer.", 409)
    ReviewEvent.objects.create(report=report, actor=request.user, status=report.status,
                               version=version + 1, reason="assignment_changed",
                               note=reviewer.get_username())
    return JsonResponse({"version": version + 1})


@never_cache
@require_POST
@transaction.atomic
def decide_link(request, reference, candidate):
    if not request.user.has_perms(["reports.view_report", "reports.change_report"]):
        return error("Review access is required.", 403)
    try:
        data = read_object(request)
        decision, note = text(data, "decision", 8), text(data, "note", 400)
        versions = data.get("versions")
        if (decision not in ReportLink.Decision.values or not isinstance(versions, dict)
                or any(type(versions.get(str(key))) is not int for key in (reference, candidate))):
            raise ValueError("Provide a decision and the current versions of both reports.")
    except ValueError as failure:
        return error(str(failure), 400)
    pair = list(scoped_reports(request.user).select_for_update().filter(
        reference__in=(reference, candidate),
    ).order_by("pk"))
    if len(pair) != 2:
        return error("Reports not found.", 404)
    first, second = pair
    for report in pair:
        if report.version != versions[str(report.reference)]:
            return error("A report changed. Refresh before trying again.", 409)
    existing = ReportLink.objects.filter(first=first, second=second).first()
    if existing and existing.decision == decision:
        return error("This decision is already recorded.", 409)
    if existing is None and (
        first.area.lower() != second.area.lower()
        or abs(first.occurred_at - second.occurred_at) > timedelta(minutes=WINDOW_MINUTES)
    ):
        return error("These reports are outside the comparison window.", 400)
    ReportLink.objects.update_or_create(first=first, second=second, defaults={"decision": decision})
    for report in pair:
        report.version += 1
        report.save(update_fields=["version"])
        ReviewEvent.objects.create(report=report, actor=request.user, status=report.status,
                                   version=report.version, reason="reports_" + decision, note=note)
    return JsonResponse({"decision": decision})
