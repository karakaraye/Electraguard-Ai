from collections import defaultdict
from uuid import UUID
from zoneinfo import ZoneInfo

from django.contrib.sessions.models import Session
from django.core import signing
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone

from accounts.models import AccountSession, Organisation, User
from accounts.observer_auth import endpoint, error
from reports.idempotency import lock_key, request_digest
from reports.models import Report, ReviewEvent

from .audit import authorize
from .cases import STATUS, URGENCY, audited_change, invalid, summary
from .models import AssignmentRequest


COORDINATORS = {"coordinator", "administrator"}
LAGOS = ZoneInfo("Africa/Lagos")


def reviewer_identity(user):
    return {"id": str(user.public_id), "display_name": user.get_full_name() or user.email}


def staff_workload(organisation_id):
    users = User.objects.filter(organisation_id=organisation_id, role=User.Role.REVIEWER, is_active=True)
    active = AccountSession.objects.filter(
        organisation_id=organisation_id,
        key__in=Session.objects.filter(expire_date__gt=timezone.now()).values("session_key"),
    ).values("user_id")
    from django.db.models import Exists, OuterRef

    users = list(users.annotate(active_now=Exists(active.filter(user_id=OuterRef("pk")))).order_by("public_id"))
    workload = {
        user.pk: {**reviewer_identity(user), "open_cases": 0, "urgent_open": 0, "areas": [],
                  "active_now": user.active_now} for user in users
    }
    today = timezone.now().astimezone(LAGOS).date()
    areas = defaultdict(set)
    reports = Report.objects.filter(
        organisation_id=organisation_id, assigned_reviewer_id__in=workload,
    ).exclude(status=Report.Status.WITHDRAWN)
    for report in reports:
        row = workload[report.assigned_reviewer_id]
        item = summary(report)
        if report.status != Report.Status.CLOSED:
            row["open_cases"] += 1
            row["urgent_open"] += item["urgency"]["level"] == "urgent"
        if report.created_at.astimezone(LAGOS).date() == today:
            lga = (item["area"] or {}).get("lga_code")
            if lga:
                areas[report.assigned_reviewer_id].add(lga)
    for user_id, codes in areas.items():
        workload[user_id]["areas"] = sorted(codes)
    return users, workload


def suggest(workload, area):
    if not workload:
        return None, None
    lga = (area or {}).get("lga_code")
    ordered = sorted(workload, key=lambda pk: (
        lga not in workload[pk]["areas"], workload[pk]["open_cases"], workload[pk]["id"],
    ))
    reviewer_id = ordered[0]
    reason = "fewest_open_cases_in_area" if lga in workload[reviewer_id]["areas"] else "fewest_open_cases"
    return reviewer_id, reason


def assignment_summary(report, workload):
    item = summary(report)
    suggested, reason = suggest(workload, item["area"])
    area = dict(item["area"]) if item["area"] else None
    if area is not None:
        area.update(polling_unit_code=None, polling_unit_name=None)
    reviewer = report.assigned_reviewer
    item.pop("occurred_at")
    return {
        **item, "area": area, "version": report.version,
        "assigned_reviewer": reviewer_identity(reviewer)
        if reviewer and reviewer.organisation_id == report.organisation_id else None,
        "suggested_reviewer": {
            "id": workload[suggested]["id"], "display_name": workload[suggested]["display_name"], "reason": reason,
        } if suggested else None,
    }


@endpoint("GET")
def assignment_list(request):
    denied = authorize(request, roles=COORDINATORS)
    if denied is not None:
        return denied
    selection = request.GET.get("assigned", "any")
    scope = [str(request.user.organisation_id), selection, {
        name: request.GET.getlist(name) for name in ("status", "urgency", "state_code", "lga_code")
    }]
    filters = scope[2]
    if not set(filters["status"]) <= set(STATUS.values()):
        return invalid("status", "invalid_choice")
    if not set(filters["urgency"]) <= set(URGENCY):
        return invalid("urgency", "invalid_choice")
    reports = Report.objects.filter(organisation_id=request.user.organisation_id).exclude(
        status=Report.Status.WITHDRAWN,
    ).select_related("assigned_reviewer").order_by("-created_at", "pk")
    try:
        if selection == "none":
            reports = reports.filter(assigned_reviewer__isnull=True)
        elif selection != "any":
            reports = reports.filter(assigned_reviewer__public_id=UUID(selection))
    except ValueError:
        return invalid("assigned")
    try:
        limit = int(request.GET.get("limit", 50))
        if not 1 <= limit <= 100:
            raise ValueError
    except ValueError:
        return invalid("limit")
    after = None
    if cursor := request.GET.get("cursor"):
        try:
            cursor_scope, after = signing.loads(cursor, salt="assignments")
            if scope != cursor_scope:
                raise ValueError
        except (ValueError, signing.BadSignature):
            return invalid("cursor")
    _, workload = staff_workload(request.user.organisation_id)
    rows = []
    for report in reports.iterator():
        item = assignment_summary(report, workload)
        area = item["area"] or {}
        fields = {
            "status": item["status"], "urgency": item["urgency"]["level"],
            "state_code": area.get("state_code"), "lga_code": area.get("lga_code"),
        }
        if any(filters[name] and value not in filters[name] for name, value in fields.items()):
            continue
        key = [-report.created_at.timestamp(), item["id"]]
        if after is not None and key <= after:
            continue
        rows.append((key, item))
        if len(rows) > limit:
            break
    cursor = signing.dumps([scope, rows[limit - 1][0]], salt="assignments") if len(rows) > limit else None
    return JsonResponse({
        "items": [row for _, row in rows[:limit]], "next_cursor": cursor, "reviewers": list(workload.values()),
    })


def assign_one(actor, data):
    report_id = data["report_id"]
    response = {"report_id": report_id, "ok": False}

    def failed(code, message):
        return {**response, "error": {"code": code, "message": message}}

    report = Report.objects.select_for_update().filter(pk=report_id, organisation=actor.organisation).first()
    if report is None:
        return failed("not_found", "We could not find that.")
    if report.version != data["version"]:
        return failed("stale_version", "This case has changed. Refresh before trying again.")
    if report.status in {Report.Status.CLOSED, Report.Status.WITHDRAWN}:
        return failed("invalid_transition", "This case cannot be reassigned.")
    selector = data["reviewer_id"]
    reviewers = User.objects.filter(organisation=actor.organisation, is_active=True, role=User.Role.REVIEWER)
    if selector == "suggested":
        _, workload = staff_workload(actor.organisation_id)
        reviewer_id, _ = suggest(workload, report.incident_details.get("area"))
        reviewer = reviewers.filter(pk=reviewer_id).first() if reviewer_id else None
    else:
        reviewer = reviewers.filter(public_id=selector).first()
    if reviewer is None:
        return failed("validation_failed", "Select an active reviewer of this organisation.")
    if report.assigned_reviewer_id == reviewer.pk:
        return failed("already_assigned", "This reviewer already has the case.")
    old = report.assigned_reviewer
    report.assigned_reviewer = reviewer
    audited_change(report, actor, ReviewEvent.Action.ASSIGN, {
        "previous_reviewer": str(old.public_id) if old else None, "reviewer": str(reviewer.public_id),
    }, "assigned_reviewer")
    return {**response, "ok": True, "version": report.version, "assigned_reviewer": reviewer_identity(reviewer)}


@transaction.atomic
def apply_next(actor, key, checksum, items):
    if not lock_key(f"assignments:{actor.organisation_id}:{actor.pk}:{key}"):
        return error(409, "request_in_progress", "This request is still being processed.", retry=2)
    entry, _ = AssignmentRequest.objects.get_or_create(
        actor=actor, organisation_id=actor.organisation_id, key=key, defaults={"digest": checksum},
    )
    if entry.digest != checksum:
        return error(409, "idempotency_key_reused", "This send key belongs to a different request.")
    if len(entry.results) < len(items):
        Organisation.objects.select_for_update(no_key=True).get(pk=actor.organisation_id)
        entry.results.append(assign_one(actor, items[len(entry.results)]))
        entry.save(update_fields=["results"])
        return entry.results, False
    return entry.results, True


@endpoint("POST", max_body_bytes=65536)
def assignment_create(request, data):
    denied = authorize(request, roles=COORDINATORS)
    if denied is not None:
        return denied
    try:
        key = UUID(request.headers.get("Idempotency-Key", ""))
        if key.version != 4:
            raise ValueError
    except ValueError:
        return error(400, "idempotency_key_required", "Send a UUID v4 Idempotency-Key.")
    items = data.get("items")
    if not isinstance(items, list) or not 1 <= len(items) <= 100:
        return invalid("items")
    for index, item in enumerate(items):
        try:
            if not isinstance(item, dict) or set(item) != {"report_id", "version", "reviewer_id"}:
                raise ValueError
            if not isinstance(item["report_id"], str) or not isinstance(item["reviewer_id"], str):
                raise ValueError
            UUID(item["report_id"])
            if item["reviewer_id"] != "suggested":
                UUID(item["reviewer_id"])
            if type(item["version"]) is not int or item["version"] < 0:
                raise ValueError
        except ValueError:
            return invalid(f"items.{index}")
    checksum = request_digest(request, data)
    for index in range(len(items)):
        result = apply_next(request.user, key, checksum, items)
        if not isinstance(result, tuple):
            return result
        results, replayed = result
        if len(results) == len(items):
            response = JsonResponse({"results": results})
            if replayed and index == 0:
                response["Idempotent-Replayed"] = "true"
            return response


def assignments(request):
    return assignment_create(request) if request.method == "POST" else assignment_list(request)
