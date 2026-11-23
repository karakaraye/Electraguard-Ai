from uuid import NAMESPACE_URL, UUID, uuid5

from django.db import transaction
from django.db.models.functions import Length
from django.http import HttpResponse, JsonResponse

from accounts.models import User
from accounts.observer_auth import endpoint, error, validation, wat
from accounts.observer_credentials import rate_limit
from accounts.organisations import org_scope

from .idempotency import idempotent
from .incident_input import field
from .models import Report, ReviewEvent
from .structured_input import clean_text
from .v1_views import STATES, Status, missing
from .workflow import record_change

Action = ReviewEvent.Action
VISIBLE = (Action.REQUEST_CLARIFICATION, Action.RESPOND, Action.MESSAGE)


def entries(report):
    return report.review_events.filter(organisation_id=report.organisation_id, action__in=VISIBLE).order_by("version")


def message_id(event):
    kind = "question" if event.action == Action.REQUEST_CLARIFICATION else "message"
    return str(uuid5(NAMESPACE_URL, f"electraguard:{kind}:{event.report_id}:{event.version}"))


def messages(report, viewer):
    if report.status == Status.WITHDRAWN:
        return []
    items = []
    question = None
    timeline = list(entries(report))
    attachment_ids = [event.change["attachment_media_id"] for event in timeline if event.change.get("attachment_media_id")]
    attachments = {}
    if attachment_ids and viewer != "citizen":
        rows = report.attachments.filter(organisation_id=report.organisation_id, pk__in=attachment_ids).annotate(size=Length("content"))
        for identifier, content_type, size in rows.values_list("pk", "content_type", "size"):
            attachments[str(identifier)] = {
                "id": str(identifier), "kind": "audio" if content_type.startswith("audio/") else "photo",
                "status": "ready", "size_bytes": size, "duration_ms": None,
            }
    for event in timeline:
        identifier = message_id(event)
        author = event.change.get("author", "observer")
        state = reply = None
        if event.action == Action.REQUEST_CLARIFICATION:
            kind, author, state = "formal_question", "reviewer", "closed_unanswered"
        elif event.action == Action.RESPOND:
            kind = "reply"
            reply = event.change.get("reply_to", question["id"] if question else None)
            if question and question["id"] == reply:
                question["question_state"] = "answered"
        else:
            kind = "message"
        labels = {"reviewer": "Reviewer", "observer": report.observer_code or "Observer", "citizen": "Citizen, not accredited"}
        label = "You" if author == viewer else labels[author]
        if author == viewer == "reviewer":
            label = event.actor.get_full_name() or "Reviewer"
        read_version = report.reviewer_read_version if viewer == "reviewer" else report.observer_read_version
        item = dict(id=identifier, kind=kind, author=author, author_label=label,
                    body=event.change.get("note", ""), attachment=attachments.get(event.change.get("attachment_media_id")),
                    question_state=state, reply_to=reply,
                    created_at=wat(event.created_at), read=author == viewer or event.version <= read_version)
        items.append(item)
        if kind == "formal_question":
            question = item
    if question and report.status == Status.NEEDS_CLARIFICATION:
        question["question_state"] = "open"
    return items


def uuid_text(value):
    try:
        return str(UUID(value)) if isinstance(value, str) else None
    except ValueError:
        return None


def access(request, reference, lock=False):
    if not request.user.is_authenticated:
        return error(401, "not_authenticated", "Sign in to continue.")
    role = request.user.role
    if role not in (User.Role.OBSERVER, User.Role.REVIEWER):
        return error(403, "forbidden", "Your role cannot do this.")
    relation = "observer" if role == User.Role.OBSERVER else "assigned_reviewer"
    reports = org_scope(request, Report).filter(receipt_code__isnull=False, **{relation: request.user})
    if lock:
        reports = reports.select_for_update(no_key=True)
    return reports.filter(pk=reference).first() or missing()


@endpoint("GET")
def list_messages(request, reference):
    report = access(request, reference)
    if not isinstance(report, Report):
        return report
    items = messages(report, request.user.role)
    cursor = request.GET.get("cursor")
    try:
        limit = int(request.GET.get("limit", 50))
        if not 1 <= limit <= 100:
            raise ValueError
        if cursor:
            index = next(i for i, item in enumerate(items) if item["id"] == cursor)
            items = items[index + 1:]
    except (ValueError, StopIteration):
        return validation({"pagination": field("invalid", "Use a valid cursor and limit.")})
    return JsonResponse({"items": items[:limit], "next_cursor": items[limit - 1]["id"] if len(items) > limit else None})


@endpoint("POST")
@transaction.atomic
def mark_read(request, data, reference):
    report = access(request, reference, lock=True)
    if not isinstance(report, Report):
        return report
    identifier = uuid_text(data.get("up_to_message_id"))
    if identifier is None:
        return validation({"up_to_message_id": field("invalid", "Choose a message.")})
    event = next((event for event in entries(report) if message_id(event) == identifier), None)
    if event is None or report.status == Status.WITHDRAWN:
        return missing()
    name = "reviewer_read_version" if request.user.role == User.Role.REVIEWER else "observer_read_version"
    if event.version > getattr(report, name):
        setattr(report, name, event.version)
        report.save(update_fields=[name])
    return HttpResponse(status=204)


def send(report, actor, role, data):
    citizen = role == "citizen"
    if report.status in (Status.CLOSED, Status.WITHDRAWN):
        return error(409, f"report_{STATES[report.status]}", "Messages can no longer be sent for this report.")
    kind = "reply" if citizen else data.get("kind")
    raw_attachment = data.get("attachment_media_id")
    attachment = uuid_text(raw_attachment)
    body = clean_text(data.get("body", ""), 0 if attachment and not citizen else 1, 2000)
    key = "question_id" if citizen or "question_id" in data else "reply_to"
    question = uuid_text(data.get(key))
    errors = {}
    if role == "reviewer":
        version = data.get("version")
        if type(version) is not int or version < 0:
            errors["version"] = field("invalid", "Send the current report version.")
        elif version != report.version:
            return error(409, "stale_version", "This case has changed. Refresh before trying again.")
    if kind not in ("reply", "message") or (kind == "reply" and role == "reviewer"):
        errors["kind"] = field("invalid_choice", "Choose a valid message kind.")
    if body is None:
        errors["body"] = field("invalid", "Enter a message of 1 to 2000 characters.")
    if kind == "reply" and question is None:
        errors[key] = field("required" if key not in data else "invalid", "Choose the formal question.")
    if raw_attachment is not None:
        available = attachment and not citizen and report.attachments.filter(
            organisation_id=report.organisation_id, pk=attachment, purpose="message",
        ).exists() and not entries(report).filter(change__attachment_media_id=attachment).exists()
        if not available:
            errors["attachment_media_id"] = field("invalid", "Choose an available message attachment.")
    if errors:
        return validation(errors)
    change = {"author": role, "note": body}
    if attachment:
        change["attachment_media_id"] = attachment
    if kind == "reply":
        opened = next((item for item in messages(report, role) if item["question_state"] == "open"), None)
        if opened is None or opened["id"] != question:
            return error(409, "question_closed", "This question was already answered or closed.")
        change.update(reply_to=question, from_status=report.status, to_status=Status.IN_REVIEW)
        report.status = Status.IN_REVIEW
        record_change(report, actor, Action.RESPOND, change, "status")
    else:
        record_change(report, actor, Action.MESSAGE, change)
    return 201, {
        "message": messages(report, role)[-1],
        "status" if citizen else "report_status": STATES[report.status], "version": report.version,
    }, report


@endpoint("POST", max_body_bytes=16384)
@transaction.atomic
def post_message(request, data, reference):
    report = access(request, reference, lock=True)
    if not isinstance(report, Report):
        return report

    def perform():
        retry = rate_limit("report-messages", str(request.user.public_id), 60, 3600)
        if retry is not None:
            return error(429, "rate_limited", "Try again later.", retry=retry)
        return send(report, request.user, request.user.role, data)

    return idempotent(request, "MSG-02", data, perform)


def collection(request, reference):
    view = post_message if request.method == "POST" else list_messages
    return view(request, reference=reference)
