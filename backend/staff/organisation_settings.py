import re
from datetime import date

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone

from accounts.models import Organisation
from accounts.observer_auth import endpoint, error, validation, wat
from reference.models import AreaDataset
from reports.models import Report

from .audit import authorize, record
from .retention import expired_records


def serialize(organisation):
    return {
        "version": organisation.settings_version,
        "intake_paused": organisation.intake_paused,
        "retention_days": organisation.retention_days,
        "election_day": organisation.election_day.isoformat() if organisation.election_day else None,
        "public_delay_minutes": organisation.public_delay_minutes,
        "party_labels": organisation.party_labels,
        "coverage_area": {
            "state_codes": organisation.coverage_state_codes,
            "lga_codes": organisation.coverage_lga_codes,
        },
        "review_targets": organisation.review_targets or {
            "urgent": 15, "high": 60, "normal": 240, "low": 480, "question_reply": 120,
        },
        "simulator_enabled": organisation.simulator_enabled,
        "updated_by": organisation.settings_updated_by or None,
        "updated_at": wat(organisation.settings_updated_at) if organisation.settings_updated_at else None,
    }


def coverage_values(value):
    if not isinstance(value, dict):
        return None
    if set(value) != {"state_codes", "lga_codes"}:
        return None
    if any(not isinstance(codes, list) or any(not isinstance(code, str) for code in codes)
           for codes in value.values()):
        return None
    states, lgas = set(), set()
    for release in AreaDataset.objects.values_list("states", flat=True).iterator(chunk_size=1):
        states.update(release)
        for state in release.values():
            lgas.update(lga["lga_code"] for lga in state["lgas"])
    if set(value["state_codes"]) <= states and set(value["lga_codes"]) <= lgas:
        return value
    return None


def validate_settings(data):
    errors, changes = {}, {}
    for field, value in data.items():
        valid = False
        if field in {"intake_paused", "simulator_enabled", "confirm"}:
            valid = type(value) is bool
        elif field in {"retention_days", "public_delay_minutes", "version"}:
            lower, upper = {
                "retention_days": (30, 730), "public_delay_minutes": (60, 1440),
                "version": (0, 2**31 - 1),
            }[field]
            valid = type(value) is int and lower <= value <= upper
        elif field == "election_day" and isinstance(value, str):
            try:
                parsed = date.fromisoformat(value)
                valid = parsed.isoformat() == value
                value = parsed
            except ValueError:
                pass
        elif field == "party_labels" and isinstance(value, list):
            valid = (2 <= len(value) <= 12 and
                     all(isinstance(label, str) and re.fullmatch(r"[A-Z]{1,3}", label) for label in value) and
                     len(set(value)) == len(value))
        elif field == "coverage_area":
            valid = coverage_values(value) is not None
        elif field == "review_targets":
            allowed_keys = {"urgent", "high", "normal", "low", "question_reply"}
            if isinstance(value, dict) and value and set(value) <= allowed_keys:
                valid = all(type(v) is int and 5 <= v <= 1440 for v in value.values())
            if not valid:
                errors[field] = {"code": "field_invalid", "message": "Enter review targets between 5 and 1440 minutes."}
                continue
        if valid:
            changes[field] = value
        else:
            errors[field] = {"code": "invalid", "message": "Enter a valid setting."}
    if "version" not in data:
        errors["version"] = {"code": "required", "message": "Supply the current version."}
    return changes, errors


@endpoint("GET")
def get_settings(request):
    denied = authorize(request, export=True)
    return denied if denied is not None else JsonResponse(serialize(request.user.organisation))


@endpoint("PATCH", max_body_bytes=65536)
@transaction.atomic
def patch_settings(request, data):
    denied = authorize(request, export=True)
    if denied is not None:
        return denied
    changes, errors = validate_settings(data)
    if errors:
        return validation(errors)
    organisation = Organisation.objects.select_for_update(no_key=True).get(pk=request.user.organisation_id)
    if changes.pop("version") != organisation.settings_version:
        return error(409, "stale_version", "These settings have changed. Refresh and try again.")
    confirm = changes.pop("confirm", False)
    days = changes.get("retention_days", organisation.retention_days)
    if days < organisation.retention_days and not confirm:
        count = sum(records.count() for _, records in expired_records(organisation, days))
        return error(
            409, "confirmation_required",
            f"Shortening retention to {days} days will permanently delete {count:,} records "
            "at the next purge. Send again with confirm to proceed.",
        )
    if ("party_labels" in changes and changes["party_labels"] != organisation.party_labels
            and Report.objects.filter(organisation=organisation, incident_details__kind="result_sheet").exists()):
        return error(409, "invalid_transition", "Party labels cannot change after a result sheet exists.")
    if area := changes.pop("coverage_area", None):
        changes.update(coverage_state_codes=area["state_codes"], coverage_lga_codes=area["lga_codes"])
    targets_changed = False
    if partial_targets := changes.pop("review_targets", None):
        merged = {**(organisation.review_targets or {"urgent": 15, "high": 60, "normal": 240, "low": 480, "question_reply": 120}), **partial_targets}
        changes["review_targets"] = merged
        targets_changed = True
    for field, value in changes.items():
        setattr(organisation, field, value)
    organisation.settings_version += 1
    organisation.settings_updated_by = (request.user.get_full_name() or request.user.email)[:254]
    organisation.settings_updated_at = timezone.now()
    organisation.save()
    if targets_changed:
        from clocks.calculator import recompute_org_open_clocks
        recompute_org_open_clocks(organisation)
    record(
        organisation.pk, "update_settings", "organisation", organisation.pk, actor=request.user,
        version=organisation.settings_version, content=serialize(organisation),
    )
    return JsonResponse(serialize(organisation))


def settings_view(request):
    if request.method == "PATCH":
        return patch_settings(request)
    return get_settings(request)
