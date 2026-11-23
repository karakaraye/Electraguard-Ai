from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.core import signing
from django.db.models import OuterRef, Q, Subquery
from django.http import JsonResponse
from django.utils import timezone

from accounts.observer_auth import endpoint, wat
from reference.models import AreaDataset
from reports.models import Report, ReviewEvent, TriageMatch
from staff.assignments import COORDINATORS
from staff.audit import authorize
from staff.cases import KINDS, STATUS, category, invalid, urgency


LAGOS = ZoneInfo("Africa/Lagos")
STAGES = {"arrival", "opening", "voting", "closing", "counting"}


def date_value(value):
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError
    return parsed


def day_bounds(start, end):
    return datetime.combine(start, time.min, LAGOS), datetime.combine(end + timedelta(days=1), time.min, LAGOS)


def incident_groups(reports, organisation_id):
    leaders = {report.pk: report.pk for report in reports if report.incident_details.get("kind", "incident") == "incident"}

    def root(member):
        while leaders[member] != member:
            leaders[member] = leaders[leaders[member]]
            member = leaders[member]
        return member

    pairs = TriageMatch.objects.filter(
        organisation_id=organisation_id, decision=TriageMatch.Decision.CONFIRMED,
        first_id__in=leaders, second_id__in=leaders,
    ).values_list("first_id", "second_id")
    for first, second in pairs.iterator():
        leaders[root(second)] = root(first)
    return len({root(member) for member in leaders})


@endpoint("GET")
def overview(request):
    denied = authorize(request, roles=COORDINATORS)
    if denied is not None:
        return denied
    today = timezone.now().astimezone(LAGOS).date().isoformat()
    try:
        start = date_value(request.GET.get("from", today))
        end = date_value(request.GET.get("to", start.isoformat()))
        if not 0 <= (end - start).days <= 30:
            raise ValueError
        start_at, end_at = day_bounds(start, end)
    except (ValueError, OverflowError):
        return invalid("from", message="Enter an inclusive range of up to 31 days.")
    kind = request.GET.get("kind")
    if kind is not None and kind not in KINDS:
        return invalid("kind", "invalid_choice")
    org = request.user.organisation_id
    last_close = ReviewEvent.objects.filter(
        report_id=OuterRef("pk"), organisation_id=org, action=ReviewEvent.Action.CLOSE,
    ).order_by("-version").values("change__outcome")
    reports = Report.objects.filter(organisation_id=org).filter(
        Q(occurred_at__gte=start_at, occurred_at__lt=end_at) |
        Q(status=Report.Status.WITHDRAWN, withdrawn_at__gte=start_at, withdrawn_at__lt=end_at),
    ).annotate(outcome_value=Subquery(last_close[:1]))
    channels, statuses, outcomes, categories_by_count = Counter(), Counter(), Counter(), Counter()
    totals = dict.fromkeys(("reports", "urgent_open", "open_questions", "result_sheet_flags_open", "withdrawn"), 0)
    lgas = {}
    included = []
    for report in reports.iterator():
        if report.status == Report.Status.WITHDRAWN:
            totals["withdrawn"] += 1
            continue
        details = report.incident_details
        if kind is not None and kind != details.get("kind", "incident"):
            continue
        included.append(report)
        totals["reports"] += 1
        status = STATUS[report.status]
        is_urgent = urgency(report)["level"] == "urgent"
        if status != "closed":
            totals["urgent_open"] += is_urgent
            totals["result_sheet_flags_open"] += len(details.get("result_sheet_flags", ()))
        totals["open_questions"] += status == "question"
        statuses[status] += 1
        channels[details.get("channel", "app")] += 1
        if report.outcome_value:
            outcomes[report.outcome_value] += 1
        category_name = category(report)["value"]
        if category_name:
            categories_by_count[category_name] += 1
        area = details.get("area") or {}
        if lga := area.get("lga_code"):
            row = lgas.setdefault(lga, {
                "state_code": area.get("state_code"), "lga_code": lga, "lga_name": area.get("lga_name"),
                "count": 0, "urgent": 0,
            })
            row["count"] += 1
            row["urgent"] += is_urgent
    totals["incidents_after_links"] = incident_groups(included, org)

    def counted(counter, field):
        return [{field: key, "count": value} for key, value in sorted(counter.items())]

    return JsonResponse({
        "range": {"from": start.isoformat(), "to": end.isoformat()}, "totals": totals,
        "by_status": counted(statuses, "status"), "by_outcome": counted(outcomes, "outcome"),
        "by_category": counted(categories_by_count, "category"), "by_channel": counted(channels, "channel"),
        "by_lga": [lgas[code] for code in sorted(lgas)], "generated_at": wat(timezone.now()),
    })


def expected_units(organisation):
    release = AreaDataset.objects.first()
    if release is None:
        return {}
    states, selected_lgas = set(organisation.coverage_state_codes), set(organisation.coverage_lga_codes)
    lgas = {}
    for state_code, state in release.states.items():
        for lga in state["lgas"]:
            code = lga["lga_code"]
            if state_code in states or code in selected_lgas:
                units = {code: name for ward in lga["wards"] for code, name in ward["units"]}
                lgas[code] = (lga["lga_name"], units)
    return lgas


@endpoint("GET")
def coverage(request):
    denied = authorize(request, roles=COORDINATORS)
    if denied is not None:
        return denied
    organisation = request.user.organisation
    now = timezone.now()
    default_day = organisation.election_day or now.astimezone(LAGOS).date()
    try:
        day = date_value(request.GET.get("date", default_day.isoformat()))
        start_at, end_at = day_bounds(day, day)
    except (ValueError, OverflowError):
        return invalid("date", "invalid_date")
    stage = request.GET.get("stage", "opening")
    if stage not in STAGES:
        return invalid("stage", "invalid_choice")
    lgas = expected_units(organisation)
    lga = request.GET.get("lga_code")
    if lga and lga not in lgas:
        return invalid("lga_code", "invalid_choice")
    units = {code: name for _, group in lgas.values() for code, name in group.items()}
    if lga:
        units = lgas[lga][1]
    rows = Report.objects.filter(
        organisation=organisation, occurred_at__gte=start_at, occurred_at__lt=end_at,
        polling_unit_code__in=units, incident_details__kind="checklist",
    ).exclude(status=Report.Status.WITHDRAWN)
    seen = set()
    no_answers = defaultdict(list)
    for unit, details in rows.values_list("polling_unit_code", "incident_details").iterator():
        checklist = details.get("checklist", {})
        if checklist.get("stage") != stage:
            continue
        seen.add(unit)
        no_answers[unit].extend(key for key, value in checklist.get("answers", {}).items() if value in (False, "no"))
    if lga:
        results = [{
            "polling_unit_code": unit, "polling_unit_name": name,
            "has_checklist": unit in seen, "no_count": len(no_answers[unit]),
        } for unit, name in sorted(units.items())]
    else:
        results = [{
            "lga_code": code, "lga_name": name, "expected_units": len(group),
            "units_with_checklist": len(group.keys() & seen), "units_without": len(group.keys() - seen),
            "no_answers": sum(len(no_answers[unit]) for unit in group),
        } for code, (name, group) in sorted(lgas.items())]
    scope = [str(organisation.pk), day.isoformat(), stage, lga]
    offset = 0
    try:
        limit = int(request.GET.get("limit", 50))
        if not 1 <= limit <= 100:
            return invalid("limit")
        if cursor := request.GET.get("cursor"):
            saved_scope, offset = signing.loads(cursor, salt="coverage")
            if saved_scope != scope:
                raise ValueError
    except (ValueError, signing.BadSignature):
        return invalid("cursor" if request.GET.get("cursor") else "limit")
    worst = sorted((code for code in units if no_answers[code]), key=lambda code: (-len(no_answers[code]), code))
    return JsonResponse({
        "date": day.isoformat(), "stage": stage, "as_of": wat(now), "rows": results[offset:offset + limit],
        "most_no_answers": [{
            "polling_unit_code": code, "polling_unit_name": units[code],
            "no_count": len(no_answers[code]), "questions": sorted(set(no_answers[code])),
        } for code in worst[:10]],
        "next_cursor": signing.dumps([scope, offset + limit], salt="coverage")
        if offset + limit < len(results) else None,
    })
