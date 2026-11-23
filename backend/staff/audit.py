import csv
import hashlib
import json
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db import OperationalError, transaction
from django.http import JsonResponse, StreamingHttpResponse
from django.utils import timezone

from accounts.models import User
from accounts.observer_auth import endpoint, error, validation, wat
from accounts.observer_credentials import rate_limit
from accounts.staff_auth import VERIFIED, totp_required
from reports.idempotency import lock_key

from .models import AuditEvent


GENESIS = "0" * 64
LAGOS = ZoneInfo("Africa/Lagos")


def digest(data):
    serialized = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode()).hexdigest()


def event_data(event):
    return {
        "id": str(event.pk), "organisation_id": str(event.organisation_id),
        "created_at": wat(event.created_at), "actor_ref": event.actor_ref,
        "action": event.action, "object_type": event.object_type, "object_id": event.object_id,
        "version": event.version, "content_digest": event.content_digest,
    }


def event_hash(event):
    payload = json.dumps(event_data(event), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256((event.prev_hash + payload).encode()).hexdigest()


@transaction.atomic
def record(organisation_id, action, object_type, object_id="", *, actor=None, version=None, content=None):
    if not lock_key(f"audit:{organisation_id}"):
        raise OperationalError("Audit chain is busy")
    previous = AuditEvent.objects.filter(organisation_id=organisation_id).last()
    actor_label = ""
    if actor:
        actor_label = "Observer" if actor.role == User.Role.OBSERVER else actor.get_full_name() or actor.email
    event = AuditEvent(
        organisation_id=organisation_id, sequence=previous.sequence + 1 if previous else 1,
        created_at=timezone.now(), actor_ref=str(actor.public_id) if actor else "",
        actor_label=actor_label[:254],
        action=action, object_type=object_type, object_id=str(object_id), version=version,
        content_digest=digest(content), prev_hash=previous.hash if previous else GENESIS,
    )
    event.hash = event_hash(event)
    event.save(force_insert=True)
    return event


def head(event):
    return {
        "hash": event.hash if event else GENESIS, "event_count": event.sequence if event else 0,
        "at": wat(event.created_at) if event else None,
    }


def authorize(request, *, export=False, roles=None):
    if not request.user.is_authenticated:
        return error(401, "not_authenticated", "Sign in to continue.")
    if roles is None:
        roles = {"org_admin"} if export else {"org_admin", "coordinator", "administrator"}
    if not roles.intersection(request.user.effective_roles):
        return error(403, "forbidden", "You do not have access to this operation.")
    if not request.session.get(VERIFIED):
        return totp_required()
    return None


def bounds(request):
    today = timezone.now().astimezone(LAGOS).date()
    try:
        start = date.fromisoformat(request.GET.get("from", (today - timedelta(days=91)).isoformat()))
        end = date.fromisoformat(request.GET.get("to", today.isoformat()))
        if not timedelta(0) <= end - start < timedelta(days=92):
            raise ValueError
        return datetime.combine(start, time.min, LAGOS), datetime.combine(
            end + timedelta(days=1), time.min, LAGOS
        )
    except (ValueError, OverflowError):
        return None


def invalid_range():
    return validation({"from": {"code": "invalid", "message": "Use a date range of at most 92 days."}})


@endpoint("GET")
def verify(request):
    denied = authorize(request)
    if denied is not None:
        return denied
    dates = bounds(request) if "from" in request.GET or "to" in request.GET else None
    if dates is None and ("from" in request.GET or "to" in request.GET):
        return invalid_range()
    events = AuditEvent.objects.filter(organisation_id=request.user.organisation_id)
    last = events.last()
    if dates:
        events = events.filter(created_at__gte=dates[0], created_at__lt=dates[1])
    if last:
        events = events.filter(sequence__lte=last.sequence)
    first = events.first()
    previous = events.model.objects.filter(
        organisation_id=request.user.organisation_id, sequence=first.sequence - 1
    ).first() if first and dates else None
    previous_hash = previous.hash if previous else GENESIS
    sequence = previous.sequence if previous else 0
    checked = 0
    broken = None
    for event in events.iterator():
        checked += 1
        if event.sequence != sequence + 1 or event.prev_hash != previous_hash or event.hash != event_hash(event):
            broken = str(event.pk)
            break
        sequence = event.sequence
        previous_hash = event.hash
    return JsonResponse({
        "intact": broken is None, "events_checked": checked, "head": head(last),
        "first_broken_event_id": broken, "checked_at": wat(timezone.now()),
    })


EXPORT_FIELDS = (
    "id", "created_at", "actor_ref", "actor_label", "action", "object_type",
    "object_id", "version", "content_digest", "prev_hash", "hash",
)


def export_rows(events, format_name):
    class Echo:
        def write(self, value):
            return value

    writer = csv.DictWriter(Echo(), fieldnames=EXPORT_FIELDS)
    if format_name == "csv":
        yield writer.writeheader()
    for event in events.iterator():
        data = event_data(event)
        data.pop("organisation_id")
        data.update(actor_label=event.actor_label, prev_hash=event.prev_hash, hash=event.hash)
        if format_name == "jsonl":
            yield json.dumps(data, ensure_ascii=False) + "\n"
        else:
            for key, value in data.items():
                if isinstance(value, str) and value.lstrip().startswith(("=", "-", "+", "@")):
                    data[key] = "'" + value
            yield writer.writerow(data)


@endpoint("GET")
def export(request):
    denied = authorize(request, export=True)
    if denied is not None:
        return denied
    dates = bounds(request)
    if dates is None:
        return invalid_range()
    format_name = request.GET.get("format", "jsonl")
    if format_name not in {"jsonl", "csv"}:
        return validation({"format": {"code": "invalid", "message": "Use jsonl or csv."}})
    organisation_id = request.user.organisation_id
    retry = rate_limit("audit-export", str(organisation_id), 10, 3600)
    if retry is not None:
        return error(429, "rate_limited", "Too many exports. Try again later.", retry=retry)
    event = record(organisation_id, "export_audit", "organisation", organisation_id, actor=request.user)
    events = AuditEvent.objects.filter(
        organisation_id=organisation_id, created_at__gte=dates[0], created_at__lt=dates[1],
        sequence__lt=event.sequence,
    )
    content_type = "text/csv" if format_name == "csv" else "application/x-ndjson"
    response = StreamingHttpResponse(export_rows(events, format_name), content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="audit.{format_name}"'
    return response
