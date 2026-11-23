import unicodedata
from collections import Counter
from uuid import UUID, uuid4

from django.core import signing
from django.db import transaction
from django.db.models import Q
from django.db.models.functions import Length
from django.http import JsonResponse

from accounts.observer_auth import endpoint, error, validation, wat
from reports.idempotency import idempotent
from reports.incident_input import CATEGORIES
from reports.models import Report, ReviewEvent, TriageMatch
from reports.workflow import record_change

from .audit import GENESIS, authorize, digest, event_hash
from .models import AuditEvent


STATUS = {
    Report.Status.SUBMITTED: "received",
    Report.Status.IN_REVIEW: "in_review",
    Report.Status.NEEDS_CLARIFICATION: "question",
    Report.Status.CLOSED: "closed",
}
TRANSITIONS = {
    "start": ({Report.Status.SUBMITTED}, Report.Status.IN_REVIEW, ReviewEvent.Action.START),
    "ask": ({
        Report.Status.IN_REVIEW,
    }, Report.Status.NEEDS_CLARIFICATION, ReviewEvent.Action.REQUEST_CLARIFICATION),
    "close": ({
        Report.Status.IN_REVIEW, Report.Status.NEEDS_CLARIFICATION,
    }, Report.Status.CLOSED, ReviewEvent.Action.CLOSE),
}
OPEN = ("received", "in_review", "question")
URGENCY = {"urgent": 3, "high": 2, "normal": 1, "low": 0}
KINDS = {"incident", "checklist", "result_sheet"}
CHANNELS = {"app", "citizen", "sms", "ussd"}


def assigned(request):
    return Report.objects.filter(
        organisation_id=request.user.organisation_id, assigned_reviewer=request.user,
    ).exclude(status=Report.Status.WITHDRAWN)


def evidence(report):
    return report.attachments.filter(organisation_id=report.organisation_id)


def category(report):
    details = report.incident_details
    decision = details.get("review_category")
    if decision:
        return {
            "value": decision["corrected_value"] or decision["value"],
            "source": "corrected" if decision["corrected_value"] else "suggested",
        }
    suggestion = details.get("category_suggestion") or {}
    if suggestion.get("value"):
        return {"value": suggestion["value"], "source": "suggested"}
    return {"value": details.get("category"), "source": "observer"}


def urgency(report, *, corrected=True):
    details = report.incident_details
    decision = details.get("review_urgency") if corrected else None
    category_name = category(report)["value"]
    reasons = []
    if details.get("danger_now"):
        level = "urgent"
        reasons = ["danger_reported"]
    elif category_name in {"intimidation_violence", "vote_buying"}:
        level = "high"
    elif category_name == "good_practice":
        level = "low"
    else:
        level = "normal"
    if category_name in {"intimidation_violence", "vote_buying"}:
        reasons.append("intimidation" if category_name == "intimidation_violence" else category_name)
    if details.get("firsthand") is not None:
        reasons.append("seen_firsthand" if details["firsthand"] else "told_by_someone")
    return {
        "level": (decision["corrected_value"] or decision["value"]) if decision else level,
        "source": ("corrected" if decision["corrected_value"] else "suggested") if decision else "suggested",
        "reasons": reasons,
    }


def summary(report):
    details = report.incident_details
    return {
        "id": str(report.pk), "receipt_code": report.receipt_code,
        "kind": details.get("kind", "incident"), "channel": details.get("channel", "app"),
        "status": STATUS[report.status], "urgency": urgency(report), "category": category(report),
        "area": details.get("area"), "occurred_at": wat(report.occurred_at) if report.occurred_at else None,
        "received_at": wat(report.created_at),
    }


def matches(report):
    return TriageMatch.objects.filter(
        Q(first=report) | Q(second=report), organisation_id=report.organisation_id,
        first__organisation_id=report.organisation_id, second__organisation_id=report.organisation_id,
    )


def media_kind(content_type):
    return {"image": "photo", "video": "video", "audio": "audio"}.get(content_type.split("/")[0], "photo")


def queue_item(report, item):
    counts = Counter(media_kind(content_type) for content_type in evidence(report).values_list("content_type", flat=True))
    events = report.review_events.filter(organisation_id=report.organisation_id)
    latest = events.last()
    return {
        **item, "media_counts": {kind: counts[kind] for kind in ("photo", "video", "audio")},
        "has_open_question": report.status == Report.Status.NEEDS_CLARIFICATION, "unread_messages": 0,
        "flags": {
            "possible_duplicate": matches(report).filter(decision=TriageMatch.Decision.PENDING).exists(),
            "result_sheet_flags": len(report.incident_details.get("result_sheet_flags", [])),
            "possible_names": bool(report.incident_details.get("possible_names")),
        },
        "last_activity_at": wat(latest.created_at if latest else report.created_at),
    }


@endpoint("GET")
def queue(request):
    denied = authorize(request, roles={"reviewer"})
    if denied is not None:
        return denied
    filters = {
        "status": set(STATUS.values()), "category": CATEGORIES,
        "urgency": set(URGENCY), "channel": CHANNELS, "kind": KINDS,
        "state_code": None, "lga_code": None, "has_evidence": {"true", "false"},
    }
    values = {name: request.GET.getlist(name) for name in filters}
    for name, allowed in filters.items():
        if allowed is not None and not set(values[name]) <= allowed:
            return invalid(name, "invalid_choice")
    values["status"] = values["status"] or list(OPEN)
    scope = [str(request.user.public_id), values]
    try:
        limit = int(request.GET.get("limit", 50))
    except ValueError:
        return invalid("limit")
    if not 1 <= limit <= 100:
        return invalid("limit")
    after = None
    if cursor := request.GET.get("cursor"):
        try:
            cursor_scope, after = signing.loads(cursor, salt="review-queue")
            if cursor_scope != scope:
                raise ValueError
        except (ValueError, signing.BadSignature):
            return invalid("cursor")
    counts = Counter()
    rows = []
    for report in assigned(request):
        item = summary(report)
        counts[item["status"]] += 1
        area = item["area"] or {}
        fields = {
            "status": item["status"], "category": item["category"]["value"], "urgency": item["urgency"]["level"],
            "state_code": area.get("state_code"), "lga_code": area.get("lga_code"),
            "channel": item["channel"], "kind": item["kind"],
        }
        if any(values[name] and value not in values[name] for name, value in fields.items()):
            continue
        if values["has_evidence"] and str(evidence(report).exists()).lower() not in values["has_evidence"]:
            continue
        sort_key = [
            -URGENCY[item["urgency"]["level"]], -int(bool(report.incident_details.get("danger_now"))),
            item["received_at"], item["id"],
        ]
        if after is None or sort_key > after:
            rows.append((sort_key, report, item))
    rows.sort(key=lambda row: row[0])
    cursor = signing.dumps([scope, rows[limit - 1][0]], salt="review-queue") if len(rows) > limit else None
    return JsonResponse({
        "items": [queue_item(report, item) for _, report, item in rows[:limit]], "next_cursor": cursor,
        "counts": {status: counts[status] for status in OPEN},
    })


def report_history(report, events):
    chain = AuditEvent.objects.filter(organisation_id=report.organisation_id)
    audited = {
        event.version: event for event in chain.filter(object_type="report", object_id=str(report.pk))
    }
    intact = True
    history = []
    for event in events:
        audit = audited.get(event.version)
        if audit is None:
            intact = False
        else:
            previous = chain.filter(sequence=audit.sequence - 1).first()
            intact = (intact and audit.hash == event_hash(audit) and audit.content_digest == digest(event.change)
                      and audit.action == event.action
                      and audit.prev_hash == (previous.hash if previous else GENESIS))
        history.append({
            "id": str(audit.pk if audit else event.pk), "version": event.version, "action": event.action,
            "actor_label": audit.actor_label if audit else (
                "Observer" if event.actor.role == "observer" else event.actor.get_full_name() or event.actor.email
            ),
            "created_at": wat(event.created_at), "change": event.change,
        })
    return {"chain_intact": intact, "events": history}


def effective_description(report):
    return report.incident_details.get("redacted_description") or report.description


def duplicate_links(report):
    decisions = {"pending": "pending", "confirmed": "linked", "dismissed": "kept_separate"}
    rows = []
    for match in matches(report).select_related("first", "second").order_by("-score", "pk"):
        candidate = match.second if match.first_id == report.pk else match.first
        if candidate.status == Report.Status.WITHDRAWN:
            continue
        accessible = candidate.assigned_reviewer_id == report.assigned_reviewer_id
        item = summary(candidate)
        rows.append({
            "report_id": str(candidate.pk),
            "receipt_code": candidate.receipt_code if accessible else None,
            "score": match.score, "decision": decisions[match.decision], "accessible": accessible,
            "summary": {
                "category": item["category"]["value"], "ward_name": (item["area"] or {}).get("ward_name"),
                "occurred_at": item["occurred_at"], "channel": item["channel"],
                "description": effective_description(candidate) if accessible else None,
            },
        })
    return rows


def case_media(report):
    attachments = evidence(report).annotate(size=Length("content")).defer("content")
    return [{
        "id": str(item.pk), "kind": media_kind(item.content_type), "status": "ready",
        "size_bytes": item.size, "duration_ms": None, "sha256": item.sha256, "original_sha256": None,
        "integrity_verified": False, "exif_removed": False, "blurred": False, "transcript": None,
        "created_at": wat(item.created_at) if item.created_at else None,
    } for item in attachments]


@endpoint("GET")
@transaction.atomic
def case_detail(request, reference):
    denied = authorize(request, roles={"reviewer"})
    if denied is not None:
        return denied
    report = assigned(request).select_for_update().filter(pk=reference).first()
    if report is None:
        return error(404, "not_found", "We could not find that.")
    details = report.incident_details
    events = list(report.review_events.filter(organisation_id=report.organisation_id).select_related("actor"))
    latest_close = next((event for event in reversed(events) if event.action == ReviewEvent.Action.CLOSE), None)
    question = next(
        (event for event in reversed(events) if event.action == ReviewEvent.Action.REQUEST_CLARIFICATION), None,
    ) if report.status == Report.Status.NEEDS_CLARIFICATION else None
    opened = ["redact"]
    if report.status == Report.Status.SUBMITTED:
        opened.append("start")
    if report.status == Report.Status.IN_REVIEW:
        opened.extend(["ask", "close"])
    if report.status == Report.Status.NEEDS_CLARIFICATION:
        opened.append("close")
    urgency_data = urgency(report)
    item = summary(report)
    return JsonResponse({
        "id": item["id"], "receipt_code": item["receipt_code"], "kind": item["kind"],
        "channel": item["channel"], "status": item["status"], "version": report.version,
        "outcome": latest_close.change.get("outcome") if latest_close else None,
        "reporter": {
            "type": "observer" if item["channel"] == "app" else "citizen",
            "label": (report.observer_code or "Observer") if item["channel"] == "app" else "Citizen",
            "accredited": item["channel"] == "app",
        },
        "language": details.get("language"), "original": {
            "description": report.description, "redacted_description": details.get("redacted_description"),
            "redactions": details.get("redactions", []),
        },
        "translation": details.get("translation"),
        "category_observer": details.get("category"),
        "access_barrier_details": details.get("access_barrier_details", []),
        "danger_now": details.get("danger_now", False), "firsthand": details.get("firsthand"),
        "area": item["area"],
        "times": {
            "occurred_at": item["occurred_at"], "received_at": item["received_at"],
            "device_saved_at": details.get("device_saved_at"), "clock_skew_seconds": details.get("clock_skew_seconds"),
        },
        "checklist": details.get("checklist"), "result_sheet": details.get("result_sheet"),
        "media": case_media(report), "pending_uploads": [],
        "suggestions": {
            "status": "ready", "model_versions": {}, "category": details.get("review_category"),
            "urgency": details.get("review_urgency") or {
                "value": urgency_data["level"], "confidence": None, "reasons": urgency_data["reasons"],
                "decision": None, "corrected_value": None,
            },
            "abstained": "review_category" not in details,
        },
        "duplicates": duplicate_links(report), "result_sheet_flags": details.get("result_sheet_flags", []),
        "related_claims": [], "name_check": {"possible_names": bool(details.get("possible_names"))},
        "open_question": {
            "id": question.change.get("question_id", str(question.pk)),
            "text": question.change.get("note"), "created_at": wat(question.created_at),
        } if question else None,
        "allowed_actions": opened, "history": report_history(report, events),
    })


def invalid(name, code="invalid", message="Enter a valid value."):
    return validation({name: {"code": code, "message": message}})


def text_field(value):
    if not isinstance(value, str):
        return None
    value = unicodedata.normalize("NFC", value.strip())
    if not 1 <= len(value) <= 2000:
        return None
    if any(unicodedata.category(char) in {"Cc", "Cs"} and char != "\n" for char in value):
        return None
    return value


def apply_action(request, report, data):
    action, version = data.get("action"), data.get("version")
    if not isinstance(action, str) or action not in TRANSITIONS:
        return invalid("action", "invalid_choice")
    if type(version) is not int or version < 0:
        return invalid("version", "required" if version is None else "invalid")
    if report.version != version:
        return error(409, "stale_version", "This case has changed. Refresh before trying again.")
    allowed, target, event_action = TRANSITIONS[action]
    if report.status not in allowed:
        return error(409, "invalid_transition", "This action is unavailable for the current case status.")
    action_fields = {
        "start": set(), "ask": {"question"}, "close": {"outcome", "rationale", "expected_media_ids"},
    }
    for field in sorted(set(data) - {"action", "version"} - action_fields[action]):
        return invalid(field)
    change = {"from_status": report.status, "to_status": target}
    result = {"id": str(report.pk), "status": STATUS[target], "outcome": None}
    if action == "ask":
        question = text_field(data.get("question"))
        if question is None:
            return invalid("question", "required" if not data.get("question") else "invalid")
        question_id = str(uuid4())
        change.update(note=question, question_id=question_id)
        result["question_id"] = question_id
    elif action == "close":
        outcome = data.get("outcome")
        if outcome not in Report.Outcome.values:
            return invalid("outcome", "invalid_choice")
        rationale = text_field(data.get("rationale"))
        if rationale is None:
            return invalid("rationale", "required" if not data.get("rationale") else "invalid")
        expected = data.get("expected_media_ids")
        if not isinstance(expected, list):
            return invalid("expected_media_ids", "required" if expected is None else "invalid")
        try:
            expected_ids = {str(UUID(item)) for item in expected if isinstance(item, str)}
            if len(expected_ids) != len(expected):
                raise ValueError
        except ValueError:
            return invalid("expected_media_ids")
        media_ids = [str(media_id) for media_id in report.attachments.filter(
            organisation_id=report.organisation_id,
        ).values_list("pk", flat=True)]
        if set(media_ids) != expected_ids:
            return error(
                409, "closure_evidence_changed",
                "New evidence was saved since you opened the case. Review it before closing.",
            )
        closure = {"media_ids": media_ids, "pending_uploads": []}
        change.update(note=rationale, outcome=outcome, attachment_ids=media_ids, closure=closure)
        result.update(outcome=outcome, closure=closure)
    report.status = target
    record_change(report, request.user, event_action, change, "status")
    result["version"] = report.version
    return 200, result, report


@endpoint("POST", max_body_bytes=65536)
@transaction.atomic
def case_actions(request, data, reference):
    denied = authorize(request, roles={"reviewer"})
    if denied is not None:
        return denied
    report = Report.objects.select_for_update().filter(
        pk=reference, organisation_id=request.user.organisation_id, assigned_reviewer=request.user,
    ).exclude(status=Report.Status.WITHDRAWN).first()
    if report is None:
        return error(404, "not_found", "We could not find that.")
    return idempotent(request, "CASE-02", data, lambda: apply_action(request, report, data))


def version_error(report, data):
    version = data.get("version")
    if type(version) is not int or version < 0:
        return invalid("version", "required" if version is None else "invalid")
    if report.version != version:
        return error(409, "stale_version", "This case has changed. Refresh before trying again.")
    return None


def audited_change(report, actor, action, change, field=None):
    record_change(report, actor, action, change, field)


def edit_redaction(report, actor, data):
    problem = version_error(report, data)
    if problem is not None:
        return problem
    spans = data.get("spans")
    if not isinstance(spans, list) or len(spans) > len(report.description):
        return invalid("spans")
    validated = []
    for index, span in enumerate(spans):
        if not isinstance(span, dict) or set(span) != {"start", "end"}:
            return invalid(f"spans.{index}")
        start, end = span["start"], span["end"]
        if type(start) is not int or not 0 <= start < len(report.description):
            return invalid(f"spans.{index}.start")
        if type(end) is not int or end <= start:
            return invalid(f"spans.{index}.end")
        if end > len(report.description):
            return validation({f"spans.{index}.end": {"code": "max_value", "limit": len(report.description)}})
        validated.append((start, end))
    validated.sort()
    result, previous_end = [], 0
    for start, end in validated:
        if start < previous_end:
            return invalid("spans", "overlap")
        result.extend([report.description[previous_end:start], "[name removed]"])
        previous_end = end
    result.append(report.description[previous_end:])
    redactions = [{"start": start, "end": end} for start, end in validated]
    description = "".join(result) if redactions else None
    report.incident_details.update(redactions=redactions, redacted_description=description)
    report.incident_details.pop("translation", None)
    audited_change(report, actor, "redact", {"spans": redactions}, "incident_details")
    return 200, {
        "version": report.version, "redacted_description": description, "redactions": redactions,
    }, report


def edit_suggestion(report, actor, data, kind):
    problem = version_error(report, data)
    if problem is not None:
        return problem
    choice = data.get("decision")
    if choice not in ("accept", "correct"):
        return invalid("decision", "invalid_choice")
    details = report.incident_details
    base = details.get(f"{kind}_suggestion") or {}
    if kind == "urgency" and not base:
        suggested = urgency(report, corrected=False)
        base = {"value": suggested["level"], "reasons": suggested["reasons"]}
    value = base.get("value")
    corrected = None
    if choice == "accept":
        if value is None:
            return error(409, "invalid_transition", "There is no ready suggestion to accept.")
        if "value" in data:
            return invalid("value")
    else:
        corrected = data.get("value")
        permitted = CATEGORIES if kind == "category" else URGENCY
        if not isinstance(corrected, str) or corrected not in permitted or corrected == value:
            return invalid("value", "invalid_choice")
    decision = "accepted" if choice == "accept" else "corrected"
    suggestion = {"value": value, "decision": decision, "corrected_value": corrected}
    details[f"review_{kind}"] = {**suggestion, "reasons": base.get("reasons", [])}
    audited_change(
        report, actor, f"{choice}_suggestion", {"suggestion": kind, **suggestion}, "incident_details",
    )
    return 200, {"version": report.version, "suggestion": suggestion}, report


@endpoint("POST", max_body_bytes=65536)
@transaction.atomic
def case_edit(request, data, reference, kind=None):
    denied = authorize(request, roles={"reviewer"})
    if denied is not None:
        return denied
    report = assigned(request).select_for_update().filter(pk=reference).first()
    if report is None or (kind is not None and kind not in {"category", "urgency"}):
        return error(404, "not_found", "We could not find that.")
    if kind is None:
        return idempotent(request, "CASE-05", data, lambda: edit_redaction(report, request.user, data))
    return idempotent(request, "CASE-03", data, lambda: edit_suggestion(report, request.user, data, kind))


def decide_duplicate(report, candidate, match, actor, data):
    problem = version_error(report, data)
    if problem is not None:
        return problem
    choice = data.get("decision")
    if choice not in ("link", "keep_separate"):
        return invalid("decision", "invalid_choice")
    if match.decision == TriageMatch.Decision.DISMISSED or (
        match.decision == TriageMatch.Decision.CONFIRMED and choice == "link"
    ):
        return error(409, "invalid_transition", "This pair already has a decision.")
    linked = choice == "link"
    match.decision = TriageMatch.Decision.CONFIRMED if linked else TriageMatch.Decision.DISMISSED
    match.save(update_fields=["decision"])
    decision = "linked" if linked else "kept_separate"
    for left, right in ((report, candidate), (candidate, report)):
        audited_change(left, actor, ReviewEvent.Action.DECIDE_MATCH, {
            "report_id": str(right.pk), "decision": decision,
        })
    return 200, {
        "version": report.version, "duplicate": {"report_id": str(candidate.pk), "decision": decision},
    }, report


@endpoint("POST", max_body_bytes=65536)
@transaction.atomic
def duplicate(request, data, reference, other):
    denied = authorize(request, roles={"reviewer"})
    if denied is not None:
        return denied
    pair = Report.objects.select_for_update().filter(
        organisation_id=request.user.organisation_id, pk__in=[reference, other],
    ).exclude(status=Report.Status.WITHDRAWN).order_by("pk")
    rows = {row.pk: row for row in pair}
    report = rows.get(reference)
    if len(rows) != 2 or report.assigned_reviewer_id != request.user.pk:
        return error(404, "not_found", "We could not find that.")
    first, second = sorted([reference, other])
    match = TriageMatch.objects.select_for_update().filter(
        organisation_id=request.user.organisation_id, first_id=first, second_id=second,
    ).first()
    if match is None:
        return error(404, "not_found", "We could not find that.")
    return idempotent(request, "CASE-04", data, lambda: decide_duplicate(
        report, rows[other], match, request.user, data,
    ))
