from collections import defaultdict
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.core import signing
from django.http import JsonResponse
from django.utils import timezone

from accounts.observer_auth import endpoint, wat
from reference.models import AreaDataset
from reports.models import Report
from staff.access import COORDINATORS
from staff.audit import authorize
from staff.fields import invalid


LAGOS = ZoneInfo("Africa/Lagos")
STAGES = {"arrival", "opening", "accreditation", "voting", "closing_counting", "results_posted"}
STRUCTURED = any(item.name == "structured_details" for item in Report._meta.get_fields())


def date_value(value):
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError
    return parsed


def day_bounds(start, end):
    return datetime.combine(start, time.min, LAGOS), datetime.combine(end + timedelta(days=1), time.min, LAGOS)


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
    seen = set()
    no_answers = defaultdict(list)
    if STRUCTURED:
        rows = list(Report.objects.filter(
            organisation=organisation, occurred_at__gte=start_at, occurred_at__lt=end_at,
            polling_unit_code__in=units, kind="checklist",
        ).exclude(status=Report.Status.WITHDRAWN).values_list("pk", "polling_unit_code", "structured_details"))
        replaced = {str(details.get("supersedes")) for _, _, details in rows if details.get("supersedes")}
        for pk, unit, details in rows:
            if str(pk) in replaced or details.get("stage") != stage:
                continue
            seen.add(unit)
            no_answers[unit].extend(
                item["question"] for item in details.get("answers", []) if item.get("answer") == "no"
            )
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
