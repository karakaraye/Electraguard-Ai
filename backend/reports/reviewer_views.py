from collections import Counter
from hashlib import sha256
from unicodedata import category, normalize
from uuid import UUID

from django.core import signing
from django.db import transaction
from django.db.models import Count, IntegerField, OuterRef, Prefetch, Subquery, Value
from django.db.models.functions import Coalesce, Length
from django.http import JsonResponse
from django.utils import timezone

from accounts.models import User
from accounts.observer_auth import endpoint, error, validation, wat
from accounts.observer_credentials import rate_limit
from accounts.organisations import org_scope
from privacy.redactor import safe_text
from staff.audit import record

from .citizen_views import reply_message
from .idempotency import idempotent
from .incident_input import CATEGORIES, KINDS, aware_datetime, field
from .models import Evidence, MediaItem, Report, ReviewEvent, Triage, UploadSession
from .media_lifecycle import describe_media, describe_transcript
from .v1_views import STATES, identity, missing, question_id
from .workflow import closure_snapshot, record_change

Status = Report.Status
Action = ReviewEvent.Action
URGENCIES = ("low", "normal", "high", "urgent")
ACTIVE = (Status.SUBMITTED, Status.IN_REVIEW, Status.NEEDS_CLARIFICATION)
TRANSITIONS = {
    "start": ((Status.SUBMITTED,), Status.IN_REVIEW, Action.START),
    "ask": ((Status.IN_REVIEW,), Status.NEEDS_CLARIFICATION, Action.REQUEST_CLARIFICATION),
    "close": ((Status.IN_REVIEW, Status.NEEDS_CLARIFICATION), Status.CLOSED, Action.CLOSE),
}
LEGACY_CATEGORY = {
    "access": "access_barrier", "materials": "late_materials", "conduct": "intimidation_violence",
    "procedure": "not_sure", "other": "not_sure",
}
CURSOR = "reviewer-queue-v1"


def cases(request):
    return org_scope(request, Report).filter(assigned_reviewer=request.user).exclude(status=Status.WITHDRAWN)


def permission(request, *, object_route=False):
    if not request.user.is_authenticated:
        return error(401, "not_authenticated", "Sign in to continue.")
    if not request.user.has_role(User.Role.REVIEWER):
        return missing() if object_route else error(403, "forbidden", "Your role cannot do this.")


def channel(report):
    return "app" if report.observer_id else "citizen"


def current_triage(report):
    triage = getattr(report, "triage", None)
    return triage if triage and triage.organisation_id == report.organisation_id else None


def urgency_rules(report, photo_count, video_count=0, audio_count=0):
    details = report.incident_details
    reasons = []
    level = "normal"
    if details.get("danger_now"):
        level = "urgent"
        reasons.append("danger_reported")
    flagged = {"intimidation_violence": "intimidation", "vote_buying": "vote_buying"}.get(
        details.get("category_observer")
    )
    if flagged:
        if level != "urgent":
            level = "high"
        reasons.append(flagged)
    if details.get("firsthand") is not None:
        reasons.append("seen_firsthand" if details["firsthand"] else "told_by_someone")
    for kind, count in (("video", video_count), ("photo", photo_count), ("audio", audio_count)):
        if count:
            reasons.append(kind)
    if not report.observer_id:
        reasons.append("citizen_report")
    return level, reasons


def suggestions(report, photo_count, video_count=0, audio_count=0):
    triage = current_triage(report)
    ready = triage and triage.status == Triage.Status.READY
    if ready and triage.suggestions:
        result = {**triage.suggestions}
        for name in ("category", "urgency"):
            result[name] = {**result[name], **report.review_suggestions.get(name, {})}
        return result
    category = LEGACY_CATEGORY.get(triage.category) if ready else None
    level, reasons = urgency_rules(report, photo_count, video_count, audio_count)
    values = {}
    for name, value, evidence in (("category", category, []), ("urgency", level if ready else None, reasons)):
        decision = report.review_suggestions.get(name, {})
        values[name] = {
            "value": decision.get("value", value), "decision": decision.get("decision"),
            "corrected_value": decision.get("corrected_value"), "confidence": None,
            "reasons": evidence,
        }
    return {
        "status": triage.status if triage else "pending",
        "model_versions": {"category": triage.method_version if triage else None, "urgency": "rules-v1", "duplicates": None},
        **values, "abstained": category in (None, "not_sure"),
    }


def queue_item(report, photo_count, events, video_count=0, audio_count=0):
    suggestion = suggestions(report, photo_count, video_count, audio_count)
    category, urgency = suggestion["category"], suggestion["urgency"]
    observed = report.incident_details.get("category_observer") or "not_sure"
    triage = current_triage(report)
    legacy_correction = LEGACY_CATEGORY.get(triage.corrected_category) if triage else None
    corrected = category["corrected_value"] or legacy_correction
    closing = next((event for event in reversed(events) if event.action == Action.CLOSE), None)
    from clocks.calculator import clock_json
    c_info = clock_json(report)
    return {
        **identity(report), "channel": channel(report),
        "category": {
            "value": corrected or category["value"] or observed,
            "source": "corrected" if corrected else ("suggested" if category["value"] else "observer"),
        },
        "urgency": {
            "level": urgency["corrected_value"] or urgency["value"] or urgency_rules(report, photo_count)[0],
            "source": "corrected" if urgency["corrected_value"] else "suggested",
            "reasons": urgency["reasons"],
        },
        "area": report.incident_details.get("area"),
        "occurred_at": wat(report.occurred_at) if report.occurred_at else None,
        "media_counts": {"photo": photo_count, "video": video_count, "audio": audio_count},
        "has_open_question": report.status == Status.NEEDS_CLARIFICATION, "unread_messages": 0,
        "flags": {"possible_duplicate": False, "result_sheet_flags": 0, "possible_names": False},
        "last_activity_at": wat(events[-1].created_at if events else report.created_at),
        "outcome": closing.change.get("outcome") if closing else None,
        "clock": c_info,
    }


def queue_parameters(query):
    filters, problems = {}, {}
    choices = {
        "status": set(STATES.values()), "category": CATEGORIES, "urgency": set(URGENCIES),
        "channel": {"app", "citizen", "sms", "ussd"}, "kind": KINDS, "has_evidence": {"true", "false"},
        "state_code": None, "lga_code": None, "clock_state": {"on_time", "due_soon", "overdue"},
    }
    for name, allowed in choices.items():
        values = sorted(set(query.getlist(name)))
        if any(not value or len(value) > 128 or (allowed is not None and value not in allowed) for value in values):
            problems[name] = field("invalid_choice", "Choose a valid filter.")
        if values:
            filters[name] = values
    try:
        limit = int(query.get("limit", "50"))
        if not 1 <= limit <= 100:
            raise ValueError
    except ValueError:
        limit = 50
        problems["limit"] = field("invalid", "Use a limit from 1 to 100.")
    return filters, limit, problems


def matches(item, filters):
    values = {
        **item, **(item["area"] or {}), "category": item["category"]["value"],
        "urgency": item["urgency"]["level"], "has_evidence": "true" if any(item["media_counts"].values()) else "false",
        "clock_state": (item.get("clock") or {}).get("state"),
    }
    return all(values.get(name) in choices for name, choices in filters.items())


def report_events(request):
    return org_scope(request, ReviewEvent).select_related("actor", "citizen_reply")


@endpoint("GET")
def queue(request):
    blocked = permission(request)
    if blocked is not None:
        return blocked
    filters, limit, problems = queue_parameters(request.GET)
    filters.setdefault("status", [STATES[status] for status in ACTIVE])
    cursor = request.GET.get("cursor")
    boundary = None
    owner = str(request.user.public_id)
    sort_by_due = "clock_state" in filters
    if cursor:
        try:
            payload = signing.loads(cursor, salt=CURSOR)
            if sort_by_due:
                mode, cursor_owner, cursor_filters, due_str, pk = payload
                due_when = aware_datetime(due_str)
                if mode != "due" or cursor_owner != owner or cursor_filters != filters or due_when is None:
                    raise ValueError
                boundary = (due_when, str(UUID(pk)))
            else:
                cursor_owner, cursor_filters, rank, danger, received, pk = payload
                when = aware_datetime(received)
                if cursor_owner != owner or cursor_filters != filters or when is None:
                    raise ValueError
                boundary = (rank, danger, when, str(UUID(pk)))
        except (signing.BadSignature, ValueError, TypeError):
            problems["cursor"] = field("invalid", "Use the cursor returned for these filters.")
    if problems:
        return validation(problems)

    scoped = cases(request)
    counts = {STATES[state]: scoped.filter(status=state).count() for state in ACTIVE}

    def photo_count(model, **kind):
        photo_rows = org_scope(request, model).filter(report_id=OuterRef("pk"), **kind).order_by()
        return Coalesce(
            Subquery(photo_rows.values("report_id").annotate(n=Count("pk")).values("n"), output_field=IntegerField()),
            Value(0),
        )

    reports = scoped.filter(status__in=[state for state, wire in STATES.items() if wire in filters["status"]])
    reports = reports.select_related("triage").annotate(
        photo_count=photo_count(MediaItem, kind="photo") + photo_count(Evidence),
        video_count=photo_count(MediaItem, kind="video"), audio_count=photo_count(MediaItem, kind="audio"),
    ).defer("description", "redacted_description", "redactions").prefetch_related(
        "clocks", Prefetch("review_events", queryset=report_events(request), to_attr="case_events")
    )
    ordered = []
    for report in reports:
        item = queue_item(report, report.photo_count, report.case_events, report.video_count, report.audio_count)
        if not matches(item, filters):
            continue
        if sort_by_due:
            due_str = (item.get("clock") or {}).get("due_at")
            due_dt = aware_datetime(due_str) if due_str else datetime(9999, 12, 31, 23, 59, 59, tzinfo=dt_timezone.utc)
            key = (due_dt, str(report.pk))
            if boundary is None or key > boundary:
                ordered.append((key, item))
        else:
            key = (-URGENCIES.index(item["urgency"]["level"]), not report.incident_details.get("danger_now", False),
                   report.created_at, str(report.pk))
            if boundary is None or key > boundary:
                ordered.append((key, item))
    ordered.sort(key=lambda row: row[0])
    page = ordered[:limit]
    next_cursor = None
    if len(ordered) > limit:
        if sort_by_due:
            due_dt, pk = page[-1][0]
            next_cursor = signing.dumps(["due", owner, filters, due_dt.isoformat(), pk], salt=CURSOR)
        else:
            rank, danger, received, pk = page[-1][0]
            next_cursor = signing.dumps([owner, filters, rank, danger, received.isoformat(), pk], salt=CURSOR)
    return JsonResponse({"items": [item for _, item in page], "counts": counts, "next_cursor": next_cursor})


def describe_case_media(request, report):
    legacy = org_scope(request, Evidence).filter(report=report).defer("content").annotate(bytes=Length("content"))
    media = [
        {"id": str(item.pk), "kind": "photo", "status": "ready", "size_bytes": item.bytes,
         "duration_ms": None, "sha256": item.sha256, "original_sha256": item.sha256,
         "integrity_verified": True, "blurred": False, "exif_removed": False, "transcript": None,
         "created_at": wat(item.created_at) if item.created_at else None}
        for item in legacy
    ]
    for item in org_scope(request, MediaItem).filter(report=report).order_by("created_at", "pk"):
        media.append({
            **describe_media(item), "sha256": item.sha256 or None, "original_sha256": item.original_sha256,
            "integrity_verified": True, "transcript": describe_transcript(item),
        })
    return media


def conversation(report, events):
    if report.observer_id:
        from .conversation import messages as observer_messages

        return observer_messages(report, "reviewer")
    replies = {}
    messages = []
    for event in events:
        if event.action == Action.RESPOND:
            reply = getattr(event, "citizen_reply", None)
            if reply:
                message = reply_message(reply, viewer="reviewer")
                replies[message["reply_to"]] = message
            elif messages and "note" in event.change:
                identifier = messages[-1]["id"]
                replies[identifier] = {
                    "id": question_id(report.pk, event.version), "kind": "reply", "author": "observer",
                    "author_label": "Observer", "body": safe_text(event, report.organisation_id), "attachment": None,
                    "question_state": None, "reply_to": identifier, "created_at": wat(event.created_at), "read": True,
                }
        elif event.action == Action.REQUEST_CLARIFICATION:
            messages.append({
                "id": question_id(report.pk, event.version), "kind": "formal_question", "author": "reviewer",
                "author_label": "Reviewer", "body": safe_text(event, report.organisation_id), "attachment": None,
                "question_state": "closed_unanswered", "reply_to": None, "created_at": wat(event.created_at), "read": True,
            })
    if messages and report.status == Status.NEEDS_CLARIFICATION:
        messages[-1]["question_state"] = "open"
    result = []
    for question in messages:
        result.append(question)
        if question["id"] in replies:
            question["question_state"] = "answered"
            result.append(replies[question["id"]])
    return result


@endpoint("GET")
@transaction.atomic
def case(request, reference):
    blocked = permission(request, object_route=True)
    if blocked is not None:
        return blocked
    report = cases(request).select_for_update(no_key=True).filter(pk=reference).first()
    if report is None:
        return missing()
    events = list(report_events(request).filter(report=report).exclude(action=Action.DECIDE_MATCH))
    media = describe_case_media(request, report)
    row = queue_item(report, len(media), events)
    details = report.incident_details
    messages = conversation(report, events)
    pending = org_scope(request, UploadSession).filter(
        report=report, status=UploadSession.Status.OPEN, expires_at__gt=timezone.now(),
    )
    actions = [action for action, (states, _, _) in TRANSITIONS.items() if report.status in states]
    reporter_label = report.observer_code or "Observer" if report.observer_id else {
        "sms": "SMS reporter", "ussd": "USSD reporter",
    }.get(row["channel"], "Citizen, not accredited")
    if details.get("simulated"):
        reporter_label += " (Simulated)"
    safe_desc = safe_text(report)
    original_available = bool(
        report.redacted_description
        or report.redactions
        or report.auto_redactions
        or (report.auto_redacted_description and report.auto_redacted_description != report.description)
    )
    return JsonResponse({
        "id": row["id"], "receipt_code": row["receipt_code"], "kind": row["kind"], "channel": row["channel"],
        "status": row["status"], "outcome": row["outcome"], "version": report.version,
        "clock": row["clock"],
        "description": safe_desc,
        "original_available": original_available,
        "redaction": {
            "automatic": bool(report.auto_redactions),
            "count": len(report.auto_redactions or []),
            "kinds": sorted(list(set(r.get("kind") for r in (report.auto_redactions or [])))),
        },
        "reporter": {
            "type": "observer" if report.observer_id else "citizen", "accredited": bool(report.observer_id),
            "label": reporter_label,
        },
        "language": details.get("language"),
        "original": {
            "description": safe_desc, "redacted_description": report.redacted_description or report.auto_redacted_description,
            "redactions": report.redactions or report.auto_redactions, "original_available": original_available,
        },
        "translation": {"status": "unavailable", "text": None},
        "category_observer": details.get("category_observer"), "access_barrier_details": details.get("access_barrier_details", []),
        "danger_now": details.get("danger_now", False), "firsthand": details.get("firsthand"), "area": row["area"],
        "times": {
            "occurred_at": row["occurred_at"], "device_saved_at": details.get("device_saved_at"),
            "received_at": row["received_at"], "clock_skew_seconds": None,
        },
        "checklist": (
            {**report.structured_details, "note": safe_text({"note": report.structured_details.get("note"), "auto_redacted_body": report.structured_details.get("auto_redacted_note")}, report.organisation_id)}
            if report.kind == "checklist" and isinstance(report.structured_details, dict) and report.structured_details.get("note")
            else (report.structured_details if report.kind == "checklist" else None)
        ),
        "result_sheet": (
            {**report.structured_details, "note": safe_text({"note": report.structured_details.get("note"), "auto_redacted_body": report.structured_details.get("auto_redacted_note")}, report.organisation_id)}
            if report.kind == "result_sheet" and isinstance(report.structured_details, dict) and report.structured_details.get("note")
            else (report.structured_details if report.kind == "result_sheet" else None)
        ), "media": media,
        "pending_uploads": [
            {"id": str(upload.pk), "kind": upload.kind, "size_bytes": upload.size_bytes, "received_bytes": upload.received_bytes}
            for upload in pending
        ],
        "suggestions": suggestions(report, *(sum(item["kind"] == kind for item in media) for kind in ("photo", "video", "audio"))), "duplicates": [], "result_sheet_flags": report.result_flags,
        "related_claims": [], "name_check": {"possible_names": False},
        "open_question": next((item for item in messages if item["question_state"] == "open"), None),
        "conversation": messages, "allowed_actions": [*actions, "redact"],
        "history": {"chain_intact": None, "events": [
            {
                "id": str(event.pk), "version": event.version, "action": event.action,
                "actor_label": ("Citizen" if not event.actor_id else (
                    "Observer" if event.actor_id == report.observer_id else event.actor.get_full_name() or event.actor.role.title()
                )), "created_at": wat(event.created_at), "change": (
                    {**event.change, "note": safe_text(event, report.organisation_id)}
                    if isinstance(event.change, dict) and "note" in event.change and event.action in (
                        Action.RESPOND, Action.MESSAGE, Action.REQUEST_CLARIFICATION, Action.CLOSE
                    )
                    else event.change
                ),
            } for event in events
        ]},
    })


def write_case(request, reference, operation, data, perform):
    blocked = permission(request, object_route=True)
    if blocked is not None:
        return blocked
    if not cases(request).filter(pk=reference).exists():
        return missing()

    def locked():
        return cases(request).select_for_update(no_key=True).filter(pk=reference).first()

    def execute():
        report = locked()
        if report is None:
            return missing()
        version = data.get("version")
        if type(version) is not int or version < 0:
            return validation({"version": field("invalid", "Provide a nonnegative case version.")})
        if report.version != version:
            return error(409, "stale_version", "This case has changed. Refresh before trying again.")
        return perform(report)

    def replay(record):
        report = locked()
        return (record.status, record.body, report) if report is not None else missing()

    return idempotent(request, operation, data, execute, replay=replay)


def validate_text(data, name):
    raw = data.get(name)
    text = normalize("NFC", raw.strip()) if isinstance(raw, str) else ""
    if not text:
        return None, field("required", "Enter text.")
    if len(text) > 2000:
        return None, field("max_length", "Use 2000 characters or fewer.", limit=2000)
    if any(category(char) in {"Cc", "Cs"} and char != "\n" for char in text):
        return None, field("invalid", "Enter text without control characters.")
    return text, None


def apply_action(request, report, data):
    action = data.get("action")
    if not isinstance(action, str) or action not in TRANSITIONS:
        return validation({"action": field("invalid_choice", "Choose start, ask or close.")})
    prior, next_status, audit_action = TRANSITIONS[action]
    if report.status not in prior:
        return error(409, "invalid_transition", "This action is unavailable for the current case status.")

    change = {"from_status": report.status, "to_status": next_status}
    result = {"id": str(report.pk), "status": STATES[next_status], "outcome": None}
    allowed_fields = {"start": set(), "ask": {"question"}, "close": {"rationale", "outcome", "expected_media_ids"}}
    problems = {
        name: field("not_allowed_for_kind", "This field is unavailable for this action.")
        for name in ({"question", "rationale", "outcome", "expected_media_ids"} - allowed_fields[action])
        if name in data
    }
    if action in ("ask", "close"):
        name = "question" if action == "ask" else "rationale"
        text, problem = validate_text(data, name)
        if problem:
            problems[name] = problem
        else:
            from privacy.redactor import redact as auto_redact
            n_res = auto_redact(text, report.organisation_id)
            change["note"] = text
            change["auto_redacted_body"] = n_res.text
            change["auto_redactions"] = n_res.spans
    if action == "close":
        outcome = data.get("outcome")
        if outcome not in Report.Outcome.values:
            problems["outcome"] = field("invalid_choice" if outcome is not None else "required", "Choose a valid outcome.")
        expected = data.get("expected_media_ids")
        try:
            if not isinstance(expected, list):
                raise ValueError
            expected_ids = [str(UUID(value)) for value in expected if isinstance(value, str)]
            if len(expected_ids) != len(expected) or len(set(expected_ids)) != len(expected_ids):
                raise ValueError
        except ValueError:
            problems["expected_media_ids"] = field("invalid", "Provide a list of distinct media identifiers.")
    if problems:
        return validation(problems)

    if action == "close":
        current = {str(pk) for model in (Evidence, MediaItem) for pk in org_scope(request, model)
                   .filter(report=report).values_list("pk", flat=True)}
        if current != set(expected_ids):
            return error(409, "closure_evidence_changed", "New evidence was saved since you opened the case. Review it before closing.")
        snapshot = closure_snapshot(report)
        change.update(snapshot, outcome=outcome)
        result.update(
            outcome=outcome,
            closure={"media_ids": sorted(current), "pending_uploads": snapshot.get("pending_uploads", [])},
        )
    report.status = next_status
    record_change(report, request.user, audit_action, change, "status")
    if action == "ask":
        result["question_id"] = question_id(report.pk, report.version)
    return 200, {**result, "version": report.version}, report


@endpoint("POST", max_body_bytes=65536)
def actions(request, data, reference):
    return write_case(request, reference, "CASE-02", data, lambda report: apply_action(request, report, data))


def decide_suggestion(request, report, kind, data):
    if kind not in ("category", "urgency"):
        return missing()
    decision = data.get("decision")
    if decision not in ("accept", "correct"):
        return validation({"decision": field("invalid_choice", "Choose accept or correct.")})
    triage = current_triage(report)
    original = (
        (triage.suggestions[kind]["value"] if triage.suggestions else
         LEGACY_CATEGORY.get(triage.category) if kind == "category" else urgency_rules(report, 0)[0])
        if triage and triage.status == Triage.Status.READY else None
    )
    if decision == "accept" and original is None:
        return error(409, "invalid_transition", "There is no ready suggestion to accept.")
    value = data.get("value")
    if decision == "correct" and (
        not isinstance(value, str) or value not in (CATEGORIES if kind == "category" else URGENCIES) or value == original
    ):
        return validation({"value": field("invalid_choice", "Choose a different valid value.")})
    output = {"value": original, "decision": "accepted" if decision == "accept" else "corrected",
              "corrected_value": value if decision == "correct" else None}
    report.review_suggestions = {**report.review_suggestions, kind: output}
    if kind == "urgency":
        from clocks.calculator import update_clock_urgency
        update_clock_urgency(report, output["corrected_value"] or output["value"])
    record_change(
        report, request.user,
        Action.ACCEPT_SUGGESTION if decision == "accept" else Action.CORRECT_SUGGESTION,
        {"suggestion": kind, **output}, "review_suggestions",
    )
    return 200, {"version": report.version, "suggestion": output}, report


@endpoint("POST", max_body_bytes=65536)
def suggestion(request, data, reference, kind):
    return write_case(request, reference, "CASE-03", data, lambda report: decide_suggestion(request, report, kind, data))


def apply_redaction(request, report, data):
    spans = data.get("spans")
    if not isinstance(spans, list):
        return validation({"spans": field("invalid", "Provide a list of redaction spans.")})
    base_text = report.auto_redacted_description or report.description
    length = len(base_text)
    intervals = []
    problems = {}
    for index, span in enumerate(spans):
        if not isinstance(span, dict):
            problems[f"spans.{index}"] = field("invalid", "Provide start and end offsets.")
            continue
        start, end = span.get("start"), span.get("end")
        if type(start) is not int or start < 0:
            problems[f"spans.{index}.start"] = field("min_value", "Start must be a nonnegative integer.", limit=0)
        elif type(end) is not int or end <= start:
            problems[f"spans.{index}.end"] = field("min_value", "End must be after start.", limit=start + 1)
        elif end > length:
            problems[f"spans.{index}.end"] = field("max_value", "End exceeds the redacted text.", limit=length)
        else:
            intervals.append((start, end, index))
    intervals.sort()
    chunks, previous = [], 0
    for start, end, index in intervals:
        if start < previous:
            problems[f"spans.{index}.start"] = field("invalid", "Redaction spans must not overlap.")
        chunks.extend((base_text[previous:start], "[name removed]"))
        previous = max(previous, end)
    if problems:
        return validation(problems)

    report.redactions = [{"start": start, "end": end} for start, end, _ in intervals]
    report.redacted_description = "".join([*chunks, base_text[previous:]]) if intervals else None
    report.save(update_fields=["redactions", "redacted_description"])
    record_change(report, request.user, Action.REDACT, {
        "spans": report.redactions,
        "sha256": sha256((report.redacted_description or base_text).encode()).hexdigest(),
    })
    return 200, {
        "version": report.version, "redacted_description": report.redacted_description, "redactions": report.redactions,
    }, report


@endpoint("POST", max_body_bytes=65536)
def redact(request, data, reference):
    return write_case(request, reference, "CASE-05", data, lambda report: apply_redaction(request, report, data))


@endpoint("POST", max_body_bytes=16384)
@transaction.atomic
def original(request, data, reference):
    if not request.user.is_authenticated:
        return error(401, "not_authenticated", "Sign in to continue.")
    report = org_scope(request, Report).filter(pk=reference).first()
    if report is None:
        return missing()
    if not request.user.has_role(User.Role.REVIEWER) or report.assigned_reviewer_id != request.user.pk:
        return error(403, "forbidden", "Only the assigned reviewer can view the original text.")

    retry = rate_limit("case-original-view", str(request.user.public_id), 30, 3600)
    if retry is not None:
        return error(429, "rate_limited", "Too many requests. Try again later.", retry=retry)

    raw_reason = data.get("reason") if isinstance(data, dict) else None
    reason = str(raw_reason).strip() if raw_reason is not None else ""
    if not (1 <= len(reason) <= 500):
        return validation({"reason": field("invalid", "Provide a reason between 1 and 500 characters.")})

    from privacy.models import OriginalAccess
    OriginalAccess.objects.create(
        organisation_id=report.organisation_id,
        report=report,
        actor=request.user,
        reason=reason,
    )
    record(
        report.organisation_id,
        "case.original_viewed",
        "report",
        str(report.pk),
        actor=request.user,
        content={"reason": reason},
    )
    response = JsonResponse({"description": report.description})
    response["Cache-Control"] = "no-store"
    return response

