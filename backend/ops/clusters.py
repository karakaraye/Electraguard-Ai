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
from staff.access import COORDINATORS
from staff.audit import authorize, record
from staff.fields import category, invalid, is_incident, text_field

from .emerging import detect_emerging
from .models import ClusterSettings, ClusterWarning


def configuration(org):
    return ClusterSettings.objects.filter(organisation=org).first() or ClusterSettings(organisation=org)


def config_json(config):
    return {
        "window_minutes": config.window_minutes, "min_reports": config.min_reports,
        "categories": config.categories or sorted(CATEGORIES), "version": config.version,
    }


def detect(org_id, now):
    return detect_emerging(org_id, now)


def warning_json(warning):
    baseline_kind = getattr(warning, "baseline_kind", None)
    if not baseline_kind or baseline_kind == "threshold":
        baseline_str = "same_area_earlier"
    else:
        baseline_str = str(baseline_kind)

    observed = getattr(warning, "observed", None) or len(warning.report_ids)
    expected = getattr(warning, "expected", None)
    if expected is None:
        expected = getattr(warning, "baseline", 0.0)
    expected = round(float(expected), 2)

    p_val = getattr(warning, "p_value", None)
    p_val = round(float(p_val), 4) if p_val is not None else None
    q_val = getattr(warning, "q_value", None)
    q_val = round(float(q_val), 4) if q_val is not None else None

    detector = getattr(warning, "detector", None) or "threshold"
    win_min = getattr(warning, "window_minutes", None) or 60

    explanation = getattr(warning, "explanation", "") or ""
    if not explanation:
        cat_display = warning.category.replace("_", " ")
        lga_name = (warning.area or {}).get("lga_name") or warning.lga_code
        exp_disp = round(expected, 1)
        if exp_disp.is_integer():
            exp_disp = int(exp_disp)
        explanation = f"{observed} {cat_display} reports in {lga_name} LGA in the last {win_min} minutes; about {exp_disp} expected"

    return {
        "id": str(warning.pk),
        "category": warning.category,
        "area": warning.area,
        "report_count": len(warning.report_ids),
        "detector": detector,
        "observed": observed,
        "expected": expected,
        "p_value": p_val,
        "q_value": q_val,
        "window_minutes": win_min,
        "baseline": baseline_str,
        "explanation": explanation,
        "window_start": wat(warning.window_start),
        "window_end": wat(warning.window_end),
        "report_ids": warning.report_ids,
        "status": "reviewed" if warning.reviewed_at else "open",
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
