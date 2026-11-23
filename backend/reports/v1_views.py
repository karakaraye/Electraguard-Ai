import secrets
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from django.conf import settings
from django.core import signing
from django.db import IntegrityError, transaction
from django.db.models import Count, DateTimeField, Exists, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce, Length
from django.http import JsonResponse
from django.utils import timezone

from accounts.models import ObserverCode, User
from accounts.observer_auth import endpoint, error, validation, wat
from accounts.observer_credentials import ALPHABET, check_symbol, rate_limit
from accounts.organisations import org_scope

from .idempotency import idempotent
from .incident_input import KINDS, aware_datetime, field, incident_input
from .media_lifecycle import cancel_report_uploads, describe_photo, remove_photo
from .models import Evidence, MediaItem, Report, ReportIdempotency, ReviewEvent, Triage, TriageMatch
from .triage import METHOD_VERSION
from .workflow import record_change

Status = Report.Status
STATES = {
    Status.SUBMITTED: "received", Status.IN_REVIEW: "in_review",
    Status.NEEDS_CLARIFICATION: "question", Status.CLOSED: "closed", Status.WITHDRAWN: "withdrawn",
}
CURSOR_SALT = "observer-report-list-v1"


def observer_required(request):
    if not request.user.is_authenticated:
        return error(401, "not_authenticated", "Sign in to continue.")
    if request.user.role != User.Role.OBSERVER:
        return error(403, "forbidden", "Your role cannot do this.")
    return None


def owned(request):
    return org_scope(request, Report).filter(observer=request.user, receipt_code__isnull=False)


def identity(report):
    return {
        "id": str(report.pk), "receipt_code": report.receipt_code, "kind": "incident",
        "status": STATES[report.status], "received_at": wat(report.created_at),
    }


def withdrawn_stub(report):
    return {
        **identity(report), "channel": "citizen" if report.observer_id is None else "app", "withdrawn_at": wat(report.withdrawn_at),
        "version": report.version,
    }


def question_id(report, version):
    return str(uuid5(NAMESPACE_URL, f"electraguard:question:{report}:{version}"))


def missing():
    return error(404, "not_found", "We could not find that.")


def receipt():
    prefix = "".join(secrets.choice(ALPHABET) for _ in range(7))
    return f"EG-{prefix[:4]}-{prefix[4:]}{check_symbol(prefix)}"


def create_report(request, data):
    retry = rate_limit("report-create", str(request.user.public_id), 60, 3600)
    if retry is not None:
        return error(429, "rate_limited", "Too many reports. Try again later.", retry=retry)
    if not settings.OBSERVATION_INTAKE_ENABLED or request.user.organisation.intake_paused:
        return error(
            503, "intake_paused",
            "New reports are paused by your organisation. Your report is kept on this phone and will send when reporting resumes.",
            retry=600,
        )

    values, errors = incident_input(data, request.headers.get("X-Device-Time"))
    if errors:
        return validation(errors)
    details = values["incident_details"]
    related = details["related_report_id"]
    if related and not org_scope(request, Report).filter(
        observer=request.user, pk=related,
    ).exclude(status=Status.WITHDRAWN).exists():
        return missing()
    code = org_scope(request, ObserverCode).filter(user=request.user).values_list("code", flat=True).first()
    return persist_report(request.user, request.user.organisation_id, values, code=code or "")


def persist_report(actor, organisation, values, *, code="", secret_digest=""):
    details = values["incident_details"]
    area = details["area"]
    while True:
        reference = receipt()
        try:
            with transaction.atomic():
                report = Report.objects.create(
                    observer=actor, organisation_id=organisation, observer_code=code,
                    receipt_secret_digest=secret_digest,
                    receipt_code=reference, submission_key=uuid4(),
                    location=(area["polling_unit_name"] or area["ward_name"])[:160],
                    polling_unit_code=(area["polling_unit_code"] or ""), **values,
                )
            break
        except IntegrityError as exc:
            if getattr(getattr(exc.__cause__, "diag", None), "constraint_name", None) != "reports_report_receipt_code_key":
                raise

    ReviewEvent.objects.create(
        report=report, organisation_id=report.organisation_id, actor=actor,
        version=0, action=ReviewEvent.Action.CREATE, change={"to_status": "received"},
    )
    Triage.objects.create(
        report=report, organisation_id=report.organisation_id, method_version=METHOD_VERSION,
    )
    return 201, {
        **identity(report), "version": report.version,
        **({"channel": "citizen"} if actor is None else {}),
        "media_upload": {"max_items": 6, "max_total_bytes": 62914560},
    }, report


@endpoint("POST", max_body_bytes=65536)
def create(request, data):
    blocked = observer_required(request)
    return blocked if blocked is not None else idempotent(request, "REP-01", data, lambda: create_report(request, data))


def summary(report):
    details = report.incident_details
    return {
        **identity(report),
        "category_observer": details.get("category_observer"), "checklist_stage": None,
        "area": details.get("area"), "occurred_at": wat(report.occurred_at) if report.occurred_at else None,
        "time_known": details.get("time_known"),
        "outcome": report.outcome, "has_open_question": report.status == Status.NEEDS_CLARIFICATION,
        "unread_messages": 0, "last_message_preview": None,
        "last_activity_at": wat(report.activity), "media_count": report.media_count + report.photo_count,
    }


def read_reports(request):
    events = org_scope(request, ReviewEvent).filter(report_id=OuterRef("pk"))
    closure = events.filter(action=ReviewEvent.Action.CLOSE).order_by("-version")
    photos = org_scope(request, Evidence).filter(report_id=OuterRef("pk"))
    photos_v1 = org_scope(request, MediaItem).filter(report_id=OuterRef("pk"), purpose="evidence")
    return owned(request).annotate(
        activity=Coalesce(
            Subquery(events.order_by("-version").values("created_at")[:1], output_field=DateTimeField()),
            "created_at",
        ),
        outcome=Subquery(closure.values("change__outcome")[:1]),
        media_count=Coalesce(Subquery(
            photos.order_by().values("report_id").annotate(count=Count("pk")).values("count")[:1]
        ), 0),
        photo_count=Coalesce(Subquery(
            photos_v1.order_by().values("report_id").annotate(count=Count("pk")).values("count")[:1]
        ), 0),
        has_messages=Exists(events.filter(action__in=[
            ReviewEvent.Action.REQUEST_CLARIFICATION, ReviewEvent.Action.RESPOND,
        ])),
    )


@endpoint("GET")
def list_reports(request):
    blocked = observer_required(request)
    if blocked is not None:
        return blocked
    query = request.GET
    kind, status, messages, attention = (query.get(name, "") for name in (
        "kind", "status", "has_messages", "needs_attention",
    ))
    filters = (kind, status, messages, attention)
    errors = {}
    for name, value, choices in (
        ("kind", kind, KINDS), ("status", status, STATES.values()),
        ("has_messages", messages, {"true", "false"}), ("needs_attention", attention, {"true", "false"}),
    ):
        if value and value not in choices:
            errors[name] = field("invalid_choice", "Choose a valid filter.")
    try:
        limit = int(query.get("limit", "50"))
        if not 1 <= limit <= 100:
            raise ValueError
    except ValueError:
        errors["limit"] = field("invalid", "Use a limit from 1 to 100.")
    owner = str(request.user.public_id)
    cursor = query.get("cursor")
    if cursor:
        try:
            actor, saved_filters, stamp, pk = signing.loads(cursor, salt=CURSOR_SALT)
            if actor != owner or saved_filters != list(filters) or (stamp := aware_datetime(stamp)) is None:
                raise ValueError
            pk = UUID(pk)
        except (signing.BadSignature, ValueError, TypeError):
            errors["cursor"] = field("invalid", "Use the cursor returned for these filters.")
    if errors:
        return validation(errors)

    queryset = read_reports(request)
    counts = queryset.aggregate(total=Count("pk"), needs_attention=Count(
        "pk", filter=Q(status=Status.NEEDS_CLARIFICATION),
    ))
    counts.update(open_questions=counts["needs_attention"], unread_messages=0)
    if kind and kind != "incident":
        queryset = queryset.none()
    if status:
        queryset = queryset.filter(status=next(key for key, value in STATES.items() if value == status))
    if messages:
        queryset = queryset.filter(has_messages=messages == "true")
    if attention:
        match = Q(status=Status.NEEDS_CLARIFICATION)
        queryset = queryset.filter(match if attention == "true" else ~match)
    if cursor:
        queryset = queryset.filter(Q(activity__lt=stamp) | Q(activity=stamp, pk__lt=pk))
    rows = list(queryset.order_by("-activity", "-pk")[:limit + 1])
    next_cursor = None
    if len(rows) > limit:
        rows.pop()
        last = rows[-1]
        next_cursor = signing.dumps([owner, filters, last.activity.isoformat(), str(last.pk)], salt=CURSOR_SALT)
    return JsonResponse({"items": [summary(row) for row in rows], "next_cursor": next_cursor, "counts": counts})


@endpoint("GET")
def detail(request, reference):
    blocked = observer_required(request)
    if blocked is not None:
        return blocked
    report = read_reports(request).filter(pk=reference).first()
    if report is None:
        return missing()
    if report.status == Status.WITHDRAWN:
        return JsonResponse(withdrawn_stub(report))
    details = report.incident_details
    events = org_scope(request, ReviewEvent).filter(report=report).order_by("-version")
    closure = events.filter(action=ReviewEvent.Action.CLOSE).first()
    question = None
    if report.status == Status.NEEDS_CLARIFICATION:
        event = events.filter(action=ReviewEvent.Action.REQUEST_CLARIFICATION).first()
        if event:
            question = {"id": question_id(report.pk, event.version), "body": event.change["note"], "asked_at": wat(event.created_at)}
    media = [
        {"id": str(pk), "kind": "photo", "status": "ready", "size_bytes": size, "duration_ms": None,
         "blurred": False, "exif_removed": False, "created_at": wat(created) if created else None}
        for pk, size, created in org_scope(request, Evidence).filter(report=report)
        .annotate(size=Length("content")).values_list("pk", "size", "created_at")
    ]
    media.extend(
        describe_photo(photo) for photo in org_scope(request, MediaItem)
        .filter(report=report, purpose="evidence").order_by("created_at", "pk")
    )
    return JsonResponse({
        **identity(report), "channel": "app", "outcome": report.outcome,
        **details, "description": report.redacted_description if report.redacted_description is not None else report.description, "checklist": None, "result_sheet": None,
        "occurred_at": wat(report.occurred_at), "closed_at": wat(closure.created_at) if closure else None,
        "withdrawn_at": None, "media": media, "open_question": question,
        "reviewer_assigned": report.assigned_reviewer_id is not None,
        "can_withdraw": report.status == Status.SUBMITTED, "can_add_media": report.status != Status.CLOSED,
        "can_message": report.status != Status.CLOSED,
    })


def perform_withdrawal(request, reference, data):
    report = owned(request).select_for_update(no_key=True).filter(pk=reference).first()
    if report is None:
        return missing()
    return withdraw_report(request, report, data)


def withdraw_report(request, report, data, *, public=False):
    if report.status == Status.WITHDRAWN:
        return 200, withdrawn_stub(report), report
    if data.get("confirm") is not True:
        return validation({"confirm": field("required", "Confirm that you want to withdraw this report.")})
    if report.status != Status.SUBMITTED:
        return error(409, "withdraw_unavailable", "A reviewer has started on this report, so it can no longer be withdrawn. You can send them a message.")

    org_scope(request, Triage, public=public).filter(report=report).delete()
    org_scope(request, TriageMatch, public=public).filter(Q(first=report) | Q(second=report)).delete()
    org_scope(request, Evidence, public=public).filter(report=report).delete()
    cancel_report_uploads(report)
    report.media_uploads.filter(organisation_id=report.organisation_id).delete()
    for photo in org_scope(request, MediaItem, public=public).filter(report=report):
        remove_photo(photo)
    report.status = Status.WITHDRAWN
    report.withdrawn_at = timezone.now()
    report.assigned_reviewer = report.occurred_at = None
    report.description = report.location = report.polling_unit_code = report.observer_code = ""
    report.incident_details = report.review_suggestions = {}
    report.redacted_description = None
    report.redactions = []
    report.save(update_fields=[
        "status", "withdrawn_at", "assigned_reviewer", "occurred_at", "description",
        "location", "polling_unit_code", "observer_code", "incident_details",
        "review_suggestions", "redacted_description", "redactions",
    ])
    record_change(report, None if public else request.user, ReviewEvent.Action.WITHDRAW, {
        "from_status": "received", "to_status": "withdrawn",
    })
    stub = withdrawn_stub(report)
    org_scope(request, ReportIdempotency, public=public).filter(report=report).update(body=stub)
    return 200, stub, report


@endpoint("POST", max_body_bytes=65536)
def withdraw(request, data, reference):
    blocked = observer_required(request)
    return blocked if blocked is not None else idempotent(
        request, "REP-04", data, lambda: perform_withdrawal(request, reference, data),
    )
