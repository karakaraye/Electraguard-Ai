from collections import Counter, defaultdict
from datetime import timedelta

from django.core import signing
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone

from accounts.models import Organisation
from accounts.observer_auth import endpoint, error, wat
from reports.incident_input import CATEGORIES
from reports.models import Report
from staff.assignments import COORDINATORS
from staff.audit import authorize, record
from staff.cases import category, invalid, text_field

from .models import ClusterSettings, ClusterWarning


def configuration(org):
    return ClusterSettings.objects.filter(organisation=org).first() or ClusterSettings(organisation=org)


def config_json(config):
    return {
        "window_minutes": config.window_minutes, "min_reports": config.min_reports,
        "categories": config.categories or sorted(CATEGORIES), "version": config.version,
    }


@transaction.atomic
def detect(org_id, now):
    organisation = Organisation.objects.select_for_update(no_key=True).get(pk=org_id)
    config = configuration(organisation)
    interval = timedelta(minutes=config.window_minutes)
    start = now - interval
    categories = config.categories or CATEGORIES
    reports = Report.objects.filter(
        organisation=organisation, occurred_at__gte=start - 7 * interval, occurred_at__lt=now,
    ).exclude(status=Report.Status.WITHDRAWN)
    recent, baseline, areas = defaultdict(list), Counter(), {}
    for report in reports.iterator():
        details = report.incident_details
        area = details.get("area") or {}
        name = category(report)["value"]
        if details.get("kind", "incident") != "incident" or name not in categories or not area.get("lga_code"):
            continue
        key = (area["lga_code"], name)
        if report.occurred_at >= start:
            recent[key].append(str(report.pk))
            areas[key] = {field: area.get(field) for field in ("state_code", "state_name", "lga_code", "lga_name")}
        else:
            baseline[key] += 1
    for (lga, name), ids in sorted(recent.items()):
        average = baseline[lga, name] / 7
        if len(ids) < config.min_reports or len(ids) < 2 * average:
            continue
        previous = ClusterWarning.objects.filter(
            organisation=organisation, lga_code=lga, category=name, window_end__gt=start,
        ).exists()
        if previous:
            continue
        warning = ClusterWarning.objects.create(
            organisation=organisation, category=name, area=areas[lga, name], lga_code=lga,
            report_ids=sorted(ids), baseline=round(average, 2), window_start=start, window_end=now,
        )
        record(org_id, "create_cluster_warning", "cluster_warning", warning.pk)


def warning_json(warning):
    return {
        "id": str(warning.pk), "category": warning.category, "area": warning.area,
        "report_count": len(warning.report_ids), "baseline": warning.baseline,
        "window_start": wat(warning.window_start), "window_end": wat(warning.window_end),
        "report_ids": warning.report_ids, "status": "reviewed" if warning.reviewed_at else "open",
        "reviewed_by": warning.reviewed_by or None,
        "reviewed_at": wat(warning.reviewed_at) if warning.reviewed_at else None,
    }


@endpoint("GET")
def clusters(request):
    denied = authorize(request, roles=COORDINATORS)
    if denied is not None:
        return denied
    status = request.GET.get("status", "open")
    if status not in {"open", "reviewed"}:
        return invalid("status", "invalid_choice")
    org_id = request.user.organisation_id
    rows = ClusterWarning.objects.filter(
        organisation_id=org_id, reviewed_at__isnull=status == "open",
    ).order_by("-window_end", "id")
    scope = [str(org_id), status]
    offset = 0
    try:
        limit = int(request.GET.get("limit", 50))
        if not 1 <= limit <= 100:
            return invalid("limit")
        if cursor := request.GET.get("cursor"):
            saved, offset = signing.loads(cursor, salt="clusters")
            if saved != scope:
                raise ValueError
    except (ValueError, signing.BadSignature):
        return invalid("cursor" if request.GET.get("cursor") else "limit")
    page = list(rows[offset:offset + limit + 1])
    return JsonResponse({
        "items": [warning_json(warning) for warning in page[:limit]],
        "next_cursor": signing.dumps([scope, offset + limit], salt="clusters") if len(page) > limit else None,
    })


@endpoint("POST", max_body_bytes=4096)
@transaction.atomic
def review(request, data, warning_id):
    denied = authorize(request, roles=COORDINATORS)
    if denied is not None:
        return denied
    warning = ClusterWarning.objects.select_for_update().filter(
        organisation_id=request.user.organisation_id, pk=warning_id,
    ).first()
    if warning is None:
        return error(404, "not_found", "We could not find that.")
    note = text_field(data["note"]) if "note" in data else ""
    if note is None or len(note) > 500:
        return invalid("note")
    if warning.reviewed_at is None:
        warning.reviewed_by = (request.user.get_full_name() or request.user.email)[:254]
        warning.reviewed_at = timezone.now()
        warning.save(update_fields=["reviewed_at", "reviewed_by"])
        record(
            warning.organisation_id, "review_cluster_warning", "cluster_warning", warning.pk,
            actor=request.user, content={"note": note},
        )
    return JsonResponse(warning_json(warning))


@endpoint("GET")
def get_settings(request):
    denied = authorize(request, roles=COORDINATORS)
    return denied if denied is not None else JsonResponse(config_json(configuration(request.user.organisation)))


@endpoint("PUT", max_body_bytes=4096)
@transaction.atomic
def put_settings(request, data):
    denied = authorize(request, roles=COORDINATORS)
    if denied is not None:
        return denied
    for key, minimum, maximum in (("window_minutes", 15, 360), ("min_reports", 3, 50), ("version", 0, 2**31 - 1)):
        if type(data.get(key)) is not int or not minimum <= data[key] <= maximum:
            return invalid(key)
    categories = data.get("categories")
    if not isinstance(categories, list) or not categories or any(
        not isinstance(value, str) or value not in CATEGORIES for value in categories
    ):
        return invalid("categories")
    organisation = Organisation.objects.select_for_update(no_key=True).get(pk=request.user.organisation_id)
    config = configuration(organisation)
    if data["version"] != config.version:
        return error(409, "stale_version", "These settings have changed. Refresh and try again.")
    config.window_minutes = data["window_minutes"]
    config.min_reports = data["min_reports"]
    config.categories = sorted(set(categories))
    config.version += 1
    config.save()
    result = config_json(config)
    record(
        organisation.pk, "update_cluster_settings", "organisation", organisation.pk, actor=request.user,
        version=config.version, content=result,
    )
    return JsonResponse(result)


def settings_view(request):
    return put_settings(request) if request.method == "PUT" else get_settings(request)
