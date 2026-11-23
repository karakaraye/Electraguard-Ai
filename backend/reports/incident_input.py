from datetime import datetime, time, timedelta
from unicodedata import category, normalize
from uuid import UUID
from zoneinfo import ZoneInfo

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from reference.models import resolve_place

WAT = ZoneInfo("Africa/Lagos")
KINDS = {"incident", "checklist", "result_sheet"}
CATEGORIES = set((
    "late_materials equipment_failure queues_crowding intimidation_violence access_barrier "
    "lack_of_information misinformation vote_buying good_practice not_sure"
).split())
BARRIERS = set("steps_no_ramp distance no_assistance no_large_print_braille no_sign_language other".split())
QUESTIONS = set((
    "arrival_time opened_on_time materials_all_present officials_present party_agents_present materials_missing "
    "device_working priority_given queue_size secrecy_kept assistance_available disruption inducement_seen "
    "closed_on_time counting_public agents_signed sheet_posted"
).split())


def field(code, message, **extra):
    return {"code": code, "message": message, **extra}


def aware_datetime(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = parse_datetime(value)
        return parsed.astimezone(WAT) if parsed is not None and timezone.is_aware(parsed) else None
    except (ValueError, OverflowError):
        return None


def incident_input(data, header, *, incident=True):
    errors = {}
    if incident and data.get("kind") != "incident":
        kind = data.get("kind")
        if isinstance(kind, str) and kind in KINDS:
            return {}, {"kind": field("not_supported_yet", "Only incident reports are available.")}
        return {}, {"kind": field("required" if kind is None else "invalid_choice", "Choose a report kind.")}

    def choice(name, choices, required=True):
        value = data.get(name)
        if value is None and not required:
            return None
        if not isinstance(value, str) or value not in choices:
            errors[name] = field("required" if name not in data else "invalid_choice", "Choose a valid option.")
        return value

    def boolean(name, default=None):
        value = data.get(name, default)
        if not isinstance(value, bool):
            errors[name] = field("required" if name not in data else "invalid", "Choose true or false.")
        return value

    language = choice("language", {"en", "pcm", "ha", "yo", "ig"})
    observed_category = choice("category_observer", CATEGORIES) if incident else None
    danger_now = boolean("danger_now") if incident else None
    firsthand = boolean("firsthand") if incident else None
    time_known = boolean("time_known", True)
    input_method = choice("input_method", {"typed", "dictated", "mixed"}, required=False)
    question = choice("from_checklist_question", QUESTIONS, required=False)
    related = data.get("related_report_id")
    if related is not None:
        try:
            related = str(UUID(related)) if isinstance(related, str) else None
            if related is None:
                raise ValueError
        except ValueError:
            errors["related_report_id"] = field("invalid", "Enter a valid report identifier.")
    if question is not None and data.get("related_report_id") is None:
        errors["from_checklist_question"] = field("not_allowed_for_kind", "A related report is required.")

    details = data.get("access_barrier_details", [])
    if "access_barrier_details" in data and observed_category != "access_barrier":
        errors["access_barrier_details"] = field("not_allowed_for_kind", "Choose the access barrier category first.")
    elif not isinstance(details, list) or any(not isinstance(value, str) or value not in BARRIERS for value in details):
        errors["access_barrier_details"] = field("invalid_choice", "Choose valid access barriers.")
    elif len(details) != len(set(details)):
        errors["access_barrier_details"] = field("duplicate", "Choose each access barrier once.")

    raw = data.get("description")
    description = normalize("NFC", raw.strip()) if isinstance(raw, str) else ""
    if not incident:
        for name in ("category_observer", "danger_now", "firsthand", "description", "input_method", "from_checklist_question"):
            if name in data:
                errors[name] = field("not_allowed_for_kind", "This field is for incident reports.")
    elif raw is None or (isinstance(raw, str) and not description):
        errors["description"] = field("required", "Enter a description.")
    elif not isinstance(raw, str) or any(category(char) in {"Cc", "Cs"} and char != "\n" for char in description):
        errors["description"] = field("invalid", "Enter text without control characters.")
    elif len(description) > 2000:
        errors["description"] = field("max_length", "Use 2000 characters or fewer.", limit=2000)

    now = timezone.now()
    device = aware_datetime(header) if header is not None else now
    if device is None:
        errors["X-Device-Time"] = field("invalid_datetime", "Use an explicit time offset.")
        device = now
    raw_time = data.get("occurred_at")
    occurred = aware_datetime(raw_time)
    if time_known is False and isinstance(raw_time, str):
        try:
            day = occurred.astimezone(WAT).date() if occurred else parse_date(raw_time)
            occurred = datetime.combine(day, time.min, WAT) if day else None
        except (ValueError, OverflowError):
            occurred = None
    if occurred is None:
        errors["occurred_at"] = field(
            "required" if raw_time is None else "invalid_datetime", "Enter a date and time with an explicit offset.",
        )
    elif time_known is False:
        day = occurred.date()
        if day > (min(device, now) + timedelta(minutes=5)).astimezone(WAT).date():
            errors["occurred_at"] = field("in_future", "The date cannot be in the future.")
        elif day < (now.astimezone(WAT) - timedelta(days=30)).date():
            errors["occurred_at"] = field("too_old", "Use a date from the past 30 days.")
    elif occurred - min(device, now) > timedelta(minutes=5):
        errors["occurred_at"] = field("in_future", "The time cannot be in the future.")
    elif now - occurred > timedelta(days=30):
        errors["occurred_at"] = field("too_old", "Use a time from the past 30 days.")

    saved = data.get("device_saved_at")
    saved_parsed = aware_datetime(saved) if saved is not None else None
    if saved is not None and saved_parsed is None:
        errors["device_saved_at"] = field("invalid_datetime", "Use an explicit time offset.")

    area = None
    place = data.get("place")
    if not isinstance(place, dict):
        errors["place"] = field("required" if place is None else "invalid", "Choose an observation place.")
    else:
        unit, ward = place.get("polling_unit_code"), place.get("ward_code")
        for name, code in (("polling_unit_code", unit), ("ward_code", ward)):
            if code is not None and (not isinstance(code, str) or not code or len(code) > 128):
                errors[f"place.{name}"] = field("unknown_area", "Choose the place again.")
        if unit is None and ward is None:
            errors["place.ward_code"] = field("required", "Choose a ward when the polling unit is unknown.")
        if not any(key.startswith("place.") for key in errors):
            area = resolve_place(unit, ward)
            if area is None:
                invalid = "polling_unit_code" if unit is not None and (ward is None or resolve_place(unit) is None) else "ward_code"
                errors[f"place.{invalid}"] = field("unknown_area", "Choose the place again.")

    if errors:
        return {}, errors
    return {
        "occurred_at": occurred, "description": description,
        "incident_details": {
            "language": language, "category_observer": observed_category, "access_barrier_details": details,
            "danger_now": danger_now, "firsthand": firsthand, "input_method": input_method,
            "from_checklist_question": question, "related_report_id": related, "time_known": time_known,
            "device_saved_at": saved_parsed.astimezone(WAT).isoformat() if saved_parsed else None,
            "area": area,
        },
    }, {}
