import secrets
from hashlib import sha256
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from django.conf import settings
from django.core import signing
from django.db import IntegrityError, transaction
from django.db.models import Count, DateTimeField, Exists, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce, Length, TruncDate
from django.http import JsonResponse
from django.utils import timezone

from accounts.models import ObserverCode, User
from accounts.observer_auth import endpoint, error, validation, wat
from accounts.observer_credentials import ALPHABET, check_symbol, rate_limit
from accounts.organisations import org_scope

from .idempotency import idempotent, lock_key
from .incident_input import KINDS, WAT, aware_datetime, field, incident_input
from .media_lifecycle import cancel_report_uploads, describe_photo, remove_photo
from .media_storage import photo_key, storage
from .models import Evidence, MediaItem, OcrRead, Report, ReportIdempotency, ReviewEvent, Triage, TriageMatch
from .photo_processing import clean_photo
from .result_checks import check_result_sheet
from .structured_input import checklist_input, result_input
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
        "id": str(report.pk), "receipt_code": report.receipt_code, "kind": report.kind,
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


def ocr_photo(request, value):
    try:
        identifier = UUID(value) if isinstance(value, str) else None
    except ValueError:
        identifier = None
    if identifier is None:
        return None
    return OcrRead.objects.select_for_update().filter(
        pk=identifier, observer=request.user, organisation_id=request.user.organisation_id,
        expires_at__gt=timezone.now(), used_by__isnull=True,
    ).first()


def ocr_disagreements(photo, structured):
    """List fields where the photo reading and the observer's number differ."""
    read = {"registered": photo.fields["registered"], "accredited": photo.fields["accredited"],
            "rejected": photo.fields["rejected"], **{f"votes.{k}": v for k, v in photo.fields["votes"].items()}}
    entered = {"registered": structured["registered"], "accredited": structured["accredited"],
               "rejected": structured["rejected"], **{f"votes.{k}": v for k, v in structured["votes"].items()}}
    differing = sorted(k for k, v in read.items() if v["value"] is not None and entered.get(k) != v["value"])
    if not differing:
        return []
    return [{"code": "ocr_disagreement", "fields": differing,
             "explanation": "The numbers typed differ from the photo reading for: " + ", ".join(differing) + ".",
             "benign_explanation": "Photo reading can misread handwriting; the observer may have corrected it."}]


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

    kind = data.get("kind")
    values, errors = incident_input(data, request.headers.get("X-Device-Time"), incident=kind not in ("checklist", "result_sheet"))
    structured = {}
    flags = []
    photo = None
    if kind == "checklist":
        structured = checklist_input(data, errors)
    elif kind == "result_sheet":
        structured = result_input(data, request.user.organisation.party_labels, errors)
        sheet = data.get("result_sheet")
        if isinstance(sheet, dict) and sheet.get("ocr_id") is not None:
            photo = ocr_photo(request, sheet["ocr_id"])
            if photo is None:
                errors["result_sheet.ocr_id"] = field("invalid", "Choose an available photo.")
    if errors:
        return validation(errors)
    details = values["incident_details"]
    related = details["related_report_id"]
    if related and not org_scope(request, Report).filter(
        observer=request.user, pk=related,
    ).exclude(status=Status.WITHDRAWN).exists():
        return missing()
    area = details["area"]
    unit = area["polling_unit_code"]
    if kind in ("checklist", "result_sheet") and not unit:
        return validation({"place.polling_unit_code": field("required", "Choose a polling unit.")})
    if kind == "checklist":
        day = values["occurred_at"].astimezone(WAT).date()
        scope = f"checklist:{request.user.pk}:{unit}:{day}:{structured['stage']}"
        if not lock_key(scope):
            return error(409, "request_in_progress", "This request is still being processed.", retry=2)
        previous = owned(request).alias(report_day=TruncDate("occurred_at", tzinfo=WAT)).filter(
            kind=kind, polling_unit_code=unit, report_day=day,
            structured_details__stage=structured["stage"],
        ).exclude(status=Status.WITHDRAWN).order_by("-created_at", "-pk").first()
        if previous:
            structured["supersedes"] = str(previous.pk)
    elif kind == "result_sheet":
        if not lock_key(f"result-sheets:{request.user.organisation_id}"):
            return error(409, "request_in_progress", "This request is still being processed.", retry=2)
        matching = org_scope(request, Report).filter(
            kind=kind, **{f"structured_details__{k}": structured[k] for k in ("registered", "accredited", "rejected", "votes")},
        ).exclude(Q(polling_unit_code=unit) | Q(status=Status.WITHDRAWN))
        flags = check_result_sheet(structured, matching.values_list("structured_details", flat=True)[:1])
        fields = {"registered", "accredited", "rejected", *(f"votes.{key}" for key in structured["votes"])}
        if fields.difference(structured["confirmed_fields"]):
            flags.append({"code": "unconfirmed_fields", "explanation": "Some fields were not confirmed against the sheet.",
                          "benign_explanation": "The observer may have been unable to read part of the photo."})
    code = org_scope(request, ObserverCode).filter(user=request.user).values_list("code", flat=True).first()
    if photo is not None:
        flags.extend(ocr_disagreements(photo, structured))
    try:
        with transaction.atomic():
            response = persist_report(request.user, request.user.organisation_id, values, code=code or "",
                                      kind=kind, structured_details=structured, result_flags=flags)
            if photo is not None:
                attach_ocr_photo(photo, response[2])
    except OSError:
        return error(503, "service_unavailable", "Private media is temporarily unavailable.")
    return response


def attach_ocr_photo(photo, report):
    cleaned, blurred = clean_photo(bytes(photo.content), photo.content_type, True)
    storage().write(photo_key(report.organisation_id, photo.pk), cleaned)
    MediaItem.objects.create(
        id=photo.pk, report=report, organisation_id=report.organisation_id, purpose="evidence",
        size_bytes=len(cleaned), original_sha256=photo.photo_sha256,
        sha256=sha256(cleaned).hexdigest(), blurred=blurred,
    )
    photo.used_by, photo.content = report, b""
    photo.save(update_fields=["used_by", "content"])


def persist_report(actor, organisation, values, *, code="", secret_digest="", **extra):
    area = values["incident_details"]["area"]
    while True:
        reference = receipt()
        try:
            with transaction.atomic():
                report = Report.objects.create(
                    observer=actor, organisation_id=organisation, observer_code=code,
                    receipt_secret_digest=secret_digest,
                    receipt_code=reference, submission_key=uuid4(), **extra,
                    location=(area.get("polling_unit_name") or area.get("ward_name") or area.get("lga_name") or "")[:160],
                    polling_unit_code=(area.get("polling_unit_code") or ""), **values,
                )
            break
        except IntegrityError as exc:
            if getattr(getattr(exc.__cause__, "diag", None), "constraint_name", None) != "reports_report_receipt_code_key":
                raise

    ReviewEvent.objects.create(
        report=report, organisation_id=report.organisation_id, actor=actor,
        version=0, action=ReviewEvent.Action.CREATE, change={"to_status": "received", **{
            key: details[key] for key in ("channel", "simulated") if key in details
        }},
    )
    Triage.objects.create(
        report=report, organisation_id=report.organisation_id, method_version=METHOD_VERSION,
    )
    return 201, {
        **identity(report), "version": report.version,
        **({"channel": "citizen"} if report.observer_id is None else {}),
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
        "category_observer": details.get("category_observer"), "checklist_stage": report.structured_details.get("stage"),
        "area": details.get("area"), "occurred_at": wat(report.occurred_at) if report.occurred_at else None,
        "time_known": details.get("time_known"),
        "outcome": report.outcome, "has_open_question": report.status == Status.NEEDS_CLARIFICATION,
        "unread_messages": report.unread_messages, "last_message_preview": report.message_preview,
        "last_activity_at": wat(report.activity), "media_count": report.media_count + report.photo_count,
    }


def read_reports(request):
    events = org_scope(request, ReviewEvent).filter(report_id=OuterRef("pk"))
    closure = events.filter(action=ReviewEvent.Action.CLOSE).order_by("-version")
    photos = org_scope(request, Evidence).filter(report_id=OuterRef("pk"))
    photos_v1 = org_scope(request, MediaItem).filter(report_id=OuterRef("pk"), purpose="evidence")
    messages = events.filter(action__in=[
        ReviewEvent.Action.REQUEST_CLARIFICATION, ReviewEvent.Action.RESPOND, ReviewEvent.Action.MESSAGE,
    ]).exclude(report__status=Status.WITHDRAWN)
    unread = messages.filter(version__gt=OuterRef("observer_read_version")).filter(
        Q(action=ReviewEvent.Action.REQUEST_CLARIFICATION) | Q(change__author="reviewer"),
    )
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
        has_messages=Exists(messages),
        message_preview=Subquery(messages.order_by("-version").values("change__note")[:1]),
        unread_messages=Coalesce(Subquery(
            unread.order_by().values("report_id").annotate(count=Count("pk")).values("count")[:1],
        ), 0),
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
    match = Q(status=Status.NEEDS_CLARIFICATION) | Q(unread_messages__gt=0)
    counts = queryset.aggregate(
        total=Count("pk"),
        open_questions=Count("pk", filter=Q(status=Status.NEEDS_CLARIFICATION)),
        unread_total=Coalesce(Sum("unread_messages"), 0),
    )
    counts["unread_messages"] = counts.pop("unread_total")
    counts["needs_attention"] = queryset.filter(match).count()
    if kind:
        queryset = queryset.filter(kind=kind)
    if status:
        queryset = queryset.filter(status=next(key for key, value in STATES.items() if value == status))
    if messages:
        queryset = queryset.filter(has_messages=messages == "true")
    if attention:
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
        **details, "description": (report.redacted_description if report.redacted_description is not None else report.description) if report.kind == "incident" else None,
        "checklist": {k: v for k, v in report.structured_details.items() if k != "supersedes"} if report.kind == "checklist" else None,
        "result_sheet": report.structured_details if report.kind == "result_sheet" else None,
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
    ReportIdempotency.objects.filter(organisation_id=report.organisation_id, report=report, operation="MSG-02").delete()
    ReviewEvent.objects.filter(organisation_id=report.organisation_id, report=report, action=ReviewEvent.Action.MESSAGE).delete()
    report.status = Status.WITHDRAWN
    report.withdrawn_at = timezone.now()
    report.assigned_reviewer = report.occurred_at = None
    report.description = report.location = report.polling_unit_code = report.observer_code = ""
    report.incident_details = report.review_suggestions = {}
    report.redacted_description = None
    report.redactions = []
    report.structured_details = {}
    report.result_flags = []
    report.save(update_fields=[
        "status", "withdrawn_at", "assigned_reviewer", "occurred_at", "description",
        "location", "polling_unit_code", "observer_code", "incident_details",
        "review_suggestions", "redacted_description", "redactions", "structured_details", "result_flags",
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
