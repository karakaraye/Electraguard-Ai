import re
from collections import Counter
from datetime import date, datetime, time, timedelta
from uuid import UUID

from django.contrib.sessions.models import Session
from django.core import signing
from django.db import transaction
from django.db.models import OuterRef, Q, Subquery
from django.http import JsonResponse
from django.utils import timezone

from accounts.models import AccountSession, User
from accounts.observer_auth import endpoint, error, validation, wat
from accounts.organisations import org_scope

from . import capabilities
from .dashboard import incident_count
from .idempotency import lock_key, request_digest
from .incident_input import KINDS, WAT, aware_datetime, field
from .models import AssignmentBatch, Report, ReviewEvent, TriageMatch
from .reviewer_views import ACTIVE, URGENCIES, queue_item
from .v1_views import STATES
from .workflow import record_change

Status = Report.Status
QUEUE_CURSOR = "coordinator-assignment-queue"


def coordinator_required(request):
    if not request.user.is_authenticated:
        return error(401, "not_authenticated", "Sign in to continue.")
    if not request.user.is_active or not request.user.has_role(User.Role.COORDINATOR):
        return error(403, "forbidden", "Your role cannot do this.")


def reviewer_info(reviewer):
    return {"id": str(reviewer.pk), "display_name": reviewer.get_full_name() or reviewer.email}


def reviewers_and_workloads(request):
    reviewers = list(org_scope(request, User).filter(User.with_role(User.Role.REVIEWER), is_active=True))
    reviewer_ids = {reviewer.pk for reviewer in reviewers}
    loads = {
        pk: {"open_cases": 0, "urgent_open": 0, "areas": set(), "today": set(), "active_now": False}
        for pk in reviewer_ids
    }
    assigned = org_scope(request, Report).filter(
        assigned_reviewer_id__in=reviewer_ids, status__in=ACTIVE,
    ).select_related("triage").defer("description", "redacted_description", "redactions")
    for report in assigned:
        load = loads[report.assigned_reviewer_id]
        load["open_cases"] += 1
        item = queue_item(report, 0, [])
        load["urgent_open"] += item["urgency"]["level"] == "urgent"
        lga = (item["area"] or {}).get("lga_code")
        if lga:
            load["areas"].add(lga)

    now = timezone.now()
    midnight = datetime.combine(now.astimezone(WAT).date(), time.min, WAT)
    activity = org_scope(request, ReviewEvent).filter(
        actor_id__in=reviewer_ids, report__organisation_id=request.user.organisation_id,
        created_at__gte=midnight,
    ).values_list("actor_id", "report__incident_details__area__lga_code")
    for reviewer_id, lga in activity:
        if lga:
            loads[reviewer_id]["today"].add(lga)
            loads[reviewer_id]["areas"].add(lga)

    valid_sessions = Session.objects.filter(expire_date__gt=now).values("session_key")
    active_users = org_scope(request, AccountSession).filter(
        user_id__in=reviewer_ids, pk__in=valid_sessions,
    ).filter(Q(absolute_expires_at__isnull=True) | Q(absolute_expires_at__gt=now))
    for pk in active_users.values_list("user_id", flat=True).distinct():
        loads[pk]["active_now"] = True
    return reviewers, loads


def suggest(report, reviewers, loads):
    if not reviewers:
        return None, None
    area = report.incident_details.get("area") or {}
    lga = area.get("lga_code")
    local = [user for user in reviewers if lga and lga in loads[user.pk]["today"]]
    chosen = min(local or reviewers, key=lambda user: (loads[user.pk]["open_cases"], user.pk))
    reason = "fewest_open_cases_in_area" if local else "fewest_open_cases"
    return chosen, reason


def assignment_filters(request):
    query = request.GET
    problems = {}
    fields = {
        "status": set(STATES.values()), "urgency": set(URGENCIES),
        "state_code": None, "lga_code": None,
    }
    filters = {}
    for name, allowed in fields.items():
        values = sorted(set(query.getlist(name)))
        if any(not value or len(value) > 128 or (allowed is not None and value not in allowed) for value in values):
            problems[name] = field("invalid_choice", "Choose a valid filter.")
        if values:
            filters[name] = values
    filters.setdefault("status", [STATES[state] for state in ACTIVE])
    assigned = query.get("assigned", "any")
    if assigned not in ("any", "none") and reviewer_id(assigned) is None:
        problems["assigned"] = field("invalid_choice", "Choose any, none or a Reviewer.")
    filters["assigned"] = assigned
    try:
        limit = int(query.get("limit", "50"))
        if not 1 <= limit <= 100:
            raise ValueError
    except ValueError:
        limit = 50
        problems["limit"] = field("invalid", "Use a limit from 1 to 100.")
    return filters, limit, problems


def reviewer_id(value):
    if isinstance(value, str) and re.fullmatch(r"[1-9][0-9]{0,18}", value):
        number = int(value)
        if number <= 9223372036854775807:
            return number
    return None


def assignment_summary(report, reviewers, loads):
    row = queue_item(report, 0, [])
    area = row["area"]
    if area is not None:
        area = {field: area.get(field) for field in (
            "state_code", "state_name", "lga_code", "lga_name", "ward_code", "ward_name",
        )}
    chosen, reason = suggest(report, reviewers, loads) if report.status in ACTIVE else (None, None)
    reviewer = report.assigned_reviewer
    if reviewer is not None and reviewer.organisation_id != report.organisation_id:
        reviewer = None
    return {
        **{name: row[name] for name in ("id", "receipt_code", "kind", "channel", "status", "urgency", "category", "received_at")},
        "version": report.version,
        "area": {**area, "polling_unit_code": None, "polling_unit_name": None} if area else None,
        "assigned_reviewer": reviewer_info(reviewer) if reviewer else None,
        "suggested_reviewer": {**reviewer_info(chosen), "reason": reason} if chosen else None,
    }


@endpoint("GET")
def list_assignments(request):
    blocked = coordinator_required(request)
    if blocked is not None:
        return blocked
    filters, limit, problems = assignment_filters(request)
    boundary = None
    owner = str(request.user.public_id)
    cursor = request.GET.get("cursor")
    if cursor:
        try:
            cursor_owner, cursor_filters, rank, received, pk = signing.loads(cursor, salt=QUEUE_CURSOR)
            when = aware_datetime(received)
            if cursor_owner != owner or cursor_filters != filters or when is None:
                raise ValueError
            boundary = (rank, when, str(UUID(pk)))
        except (signing.BadSignature, ValueError, TypeError):
            problems["cursor"] = field("invalid", "Use the cursor returned for these filters.")
    if problems:
        return validation(problems)

    reviewers, loads = reviewers_and_workloads(request)
    reports = org_scope(request, Report).filter(
        status__in=[state for state, wire in STATES.items() if wire in filters["status"]],
    ).exclude(status=Status.WITHDRAWN)
    assigned = filters["assigned"]
    if assigned == "none":
        reports = reports.filter(assigned_reviewer__isnull=True)
    elif assigned != "any":
        reports = reports.filter(assigned_reviewer_id=reviewer_id(assigned), assigned_reviewer__organisation_id=request.user.organisation_id)
    for name in ("state_code", "lga_code"):
        if name in filters:
            reports = reports.filter(**{f"incident_details__area__{name}__in": filters[name]})

    ordered = []
    for report in reports.select_related("assigned_reviewer", "triage").defer(
        "description", "redacted_description", "redactions",
    ):
        summary = assignment_summary(report, reviewers, loads)
        level = summary["urgency"]["level"]
        if "urgency" in filters and level not in filters["urgency"]:
            continue
        key = (-URGENCIES.index(level), report.created_at, str(report.pk))
        if boundary is None or key > boundary:
            ordered.append((key, summary))
    ordered.sort(key=lambda row: row[0])
    page = ordered[:limit]
    next_cursor = None
    if len(ordered) > limit:
        rank, received, pk = page[-1][0]
        next_cursor = signing.dumps([owner, filters, rank, received.isoformat(), pk], salt=QUEUE_CURSOR)
    return JsonResponse({
        "items": [item for _, item in page], "next_cursor": next_cursor,
        "reviewers": [
            {**reviewer_info(user), **{field: loads[user.pk][field] for field in ("open_cases", "urgent_open", "active_now")},
             "areas": sorted(loads[user.pk]["areas"])}
            for user in sorted(reviewers, key=lambda user: (reviewer_info(user)["display_name"], user.pk))
        ],
    })


def item_error(report_id, code, message, *, fields=None):
    problem = {"code": code, "message": message}
    if fields:
        problem["fields"] = fields
    return {"report_id": report_id, "ok": False, "error": problem}


def assign_item(request, item):
    raw_id = item.get("report_id") if isinstance(item, dict) else None
    echo = raw_id if isinstance(raw_id, str) and len(raw_id) <= 36 else None
    try:
        reference = UUID(raw_id) if isinstance(raw_id, str) else None
        if reference is None:
            raise ValueError
    except ValueError:
        return item_error(echo, "validation_failed", "Provide a report ID.", fields={
            "report_id": field("invalid", "Provide a valid report ID."),
        })
    report = org_scope(request, Report).select_for_update(no_key=True).filter(pk=reference).first()
    if report is None:
        return item_error(str(reference), "not_found", "We could not find that report.")
    version = item.get("version")
    if type(version) is not int or version < 0:
        return item_error(str(reference), "validation_failed", "Provide a case version.", fields={
            "version": field("invalid", "Provide a nonnegative case version."),
        })
    if version != report.version:
        return item_error(str(reference), "stale_version", "This case has changed. Refresh before trying again.")
    if report.status not in ACTIVE:
        return item_error(str(reference), "invalid_transition", "This case can no longer be assigned.")

    value = item.get("reviewer_id")
    if value == "suggested":
        reviewers, loads = reviewers_and_workloads(request)
        suggested, _ = suggest(report, reviewers, loads)
        pk = suggested.pk if suggested else None
    else:
        pk = reviewer_id(value)
    reviewer = org_scope(request, User).select_for_update().filter(
        User.with_role(User.Role.REVIEWER), pk=pk, is_active=True,
    ).first() if pk else None
    if reviewer is None:
        return item_error(str(reference), "validation_failed", "Select an active Reviewer in this organisation.", fields={
            "reviewer_id": field("invalid_choice", "Select an active Reviewer in this organisation."),
        })
    if report.assigned_reviewer_id == reviewer.pk:
        return item_error(str(reference), "already_assigned", "This Reviewer already has the case.")
    previous = org_scope(request, User).filter(pk=report.assigned_reviewer_id).first()
    report.assigned_reviewer = reviewer
    record_change(report, request.user, ReviewEvent.Action.ASSIGN, {
        "previous_reviewer": previous.email if previous else None,
        "reviewer": reviewer.email,
    }, "assigned_reviewer")
    return {"report_id": str(reference), "ok": True, "version": report.version, "assigned_reviewer": reviewer_info(reviewer)}


@endpoint("POST", max_body_bytes=65536)
def assign(request, data):
    blocked = coordinator_required(request)
    if blocked is not None:
        return blocked
    try:
        key = UUID(request.headers.get("Idempotency-Key", ""))
        if key.version != 4:
            raise ValueError
    except ValueError:
        return error(400, "idempotency_key_required", "Send a UUID v4 Idempotency-Key.")
    try:
        digest = request_digest(request, data)
    except ValueError:
        return error(400, "bad_request", "Send a valid JSON object.")
    items = data.get("items")

    # Each item commits with its result. After an interrupted batch the same
    # request resumes at the first uncommitted item, even in another worker.
    first_step = True
    replayed = False
    while True:
        with transaction.atomic():
            if not lock_key(f"assignments:{request.user.organisation_id}:{request.user.pk}:{key}"):
                return error(409, "request_in_progress", "This request is still being processed.", retry=2)
            batches = org_scope(request, AssignmentBatch).filter(actor=request.user)
            batch = batches.filter(key=key).first()
            if batch is not None and digest != batch.digest:
                return error(409, "idempotency_key_reused", "This send key belongs to a different request.")
            if not isinstance(items, list) or not 1 <= len(items) <= 100:
                return validation({"items": field("invalid", "Provide 1 to 100 assignment items.")})
            created = batch is None
            if created:
                batch = batches.create(
                    key=key, digest=digest, organisation_id=request.user.organisation_id, actor=request.user,
                )
            if first_step:
                replayed = not created
                first_step = False
            position = len(batch.results)
            if position == len(items):
                response = JsonResponse({"results": batch.results})
                if replayed:
                    response["Idempotent-Replayed"] = "true"
                return response
            batch.results.append(assign_item(request, items[position]))
            batch.save(update_fields=["results"])


def assignments(request):
    if request.method == "POST":
        return assign(request)
    response = list_assignments(request)
    if response.status_code == 405:
        response["Allow"] = "GET, POST"
    return response


def overview_dates(query):
    today = timezone.now().astimezone(WAT).date()
    try:
        start = date.fromisoformat(query.get("from", today.isoformat()))
        end = date.fromisoformat(query.get("to", today.isoformat()))
        if query.get("from", start.isoformat()) != start.isoformat() or query.get("to", end.isoformat()) != end.isoformat():
            raise ValueError
        if start > end or end - start > timedelta(days=30):
            raise ValueError
    except ValueError:
        return None, None, validation({"from": field("invalid", "Choose an ordered range of at most 31 WAT dates.")})
    return start, end, None


def count_rows(counts, key):
    return [{key: value, "count": count} for value, count in sorted(counts.items())]


@endpoint("GET")
def overview(request):
    blocked = coordinator_required(request)
    if blocked is not None:
        return blocked
    start, end, problem = overview_dates(request.GET)
    if problem is not None:
        return problem
    kind = request.GET.get("kind")
    if kind is not None and kind not in KINDS:
        return validation({"kind": field("invalid_choice", "Choose a valid report kind.")})
    first, last = datetime.combine(start, time.min, WAT), datetime.combine(end, time.max, WAT)
    scope = org_scope(request, Report)
    active = scope.exclude(status=Status.WITHDRAWN).filter(occurred_at__range=(first, last))
    withdrawn = scope.filter(status=Status.WITHDRAWN, withdrawn_at__range=(first, last))
    if kind and kind != "incident":
        active, withdrawn = active.none(), withdrawn.none()
    closure = org_scope(request, ReviewEvent).filter(
        report_id=OuterRef("pk"), action=ReviewEvent.Action.CLOSE,
    ).order_by("-version").values("change__outcome")[:1]
    active = active.select_related("triage").defer("description", "redacted_description", "redactions").annotate(
        closure_outcome=Subquery(closure),
    )

    statuses, categories, channels, urgencies, outcomes = (Counter() for _ in range(5))
    lgas = {}
    references = []
    urgent_open = 0
    for report in active:
        item = queue_item(report, 0, [])
        level = item["urgency"]["level"]
        area = item["area"] or {}
        lga = lgas.setdefault((area.get("state_code"), area.get("lga_code")), {
            "lga_name": area.get("lga_name") or "Unspecified", "count": 0, "urgent": 0,
        })
        lga["count"] += 1
        lga["urgent"] += level == "urgent"
        references.append(report.pk)
        statuses[item["status"]] += 1
        categories[item["category"]["value"]] += 1
        channels[item["channel"]] += 1
        urgencies[level] += 1
        if report.status in ACTIVE:
            urgent_open += level == "urgent"
        if report.status == Status.CLOSED:
            outcomes[report.closure_outcome or "unrecorded"] += 1

    totals = {
        "reports": len(references), "urgent_open": urgent_open,
        "open_questions": statuses["question"], "result_sheet_flags_open": 0,
        "withdrawn": withdrawn.count(),
    }
    if capabilities.GROUPING_ENABLED:
        links = org_scope(request, TriageMatch).filter(
            decision=TriageMatch.Decision.CONFIRMED,
            first__organisation_id=request.user.organisation_id, second__organisation_id=request.user.organisation_id,
        ).values_list("first_id", "second_id")
        totals["incidents_after_links"] = incident_count(references, links)

    return JsonResponse({
        "range": {"from": start.isoformat(), "to": end.isoformat()}, "totals": totals,
        "by_status": count_rows(statuses, "status"), "by_outcome": count_rows(outcomes, "outcome"),
        "by_category": count_rows(categories, "category"), "by_channel": count_rows(channels, "channel"),
        "by_urgency": count_rows(urgencies, "urgency"),
        "by_lga": [
            {"state_code": state, "lga_code": code, **group}
            for (state, code), group in sorted(lgas.items(), key=lambda item: (item[0][0] or "", item[0][1] or ""))
        ],
        "generated_at": wat(timezone.now()),
    })
