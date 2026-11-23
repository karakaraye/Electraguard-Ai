from django.core import signing
from django.db import transaction
from django.http import JsonResponse

from accounts.observer_auth import endpoint, error, wat
from staff.audit import authorize, record
from staff.cases import invalid, text_field

from .models import Alert


ROLES = {"coordinator", "org_admin"}
STATUSES = {"open", "acknowledged", "resolved", "false_positive"}
SEVERITIES = {"low", "medium", "high"}


def serialize(alert):
    return {
        "id": str(alert.pk), "rule": alert.rule, "severity": alert.severity, "status": alert.status,
        "version": alert.version, "subject": {"type": alert.subject_type, "label": alert.subject_label},
        "details": alert.details, "first_seen_at": wat(alert.first_seen_at),
        "last_seen_at": wat(alert.last_seen_at), "detector": alert.detector,
    }


@endpoint("GET")
def alerts(request):
    denied = authorize(request, roles=ROLES)
    if denied is not None:
        return denied
    status = request.GET.get("status", "open")
    severity = request.GET.get("severity")
    if status not in STATUSES:
        return invalid("status")
    if severity is not None and severity not in SEVERITIES:
        return invalid("severity")
    rows = Alert.objects.filter(
        organisation_id=request.user.organisation_id, status=status,
    ).order_by("-last_seen_at", "id")
    if severity:
        rows = rows.filter(severity=severity)
    scope = [str(request.user.organisation_id), status, severity]
    offset = 0
    try:
        limit = int(request.GET.get("limit", 50))
        if not 1 <= limit <= 100:
            return invalid("limit")
        if cursor := request.GET.get("cursor"):
            saved, offset = signing.loads(cursor, salt="security-alerts")
            if saved != scope:
                raise ValueError
    except (ValueError, signing.BadSignature):
        return invalid("cursor" if request.GET.get("cursor") else "limit")
    page = list(rows[offset:offset + limit + 1])
    return JsonResponse({
        "items": [serialize(alert) for alert in page[:limit]],
        "next_cursor": signing.dumps([scope, offset + limit], salt="security-alerts") if len(page) > limit else None,
    })


@endpoint("POST", max_body_bytes=4096)
@transaction.atomic
def update(request, data, alert_id):
    denied = authorize(request, roles=ROLES)
    if denied is not None:
        return denied
    alert = Alert.objects.select_for_update().filter(
        organisation_id=request.user.organisation_id, pk=alert_id,
    ).first()
    if alert is None:
        return error(404, "not_found", "We could not find that.")
    version, status = data.get("version"), data.get("status")
    if type(version) is not int or version < 0:
        return invalid("version")
    if version != alert.version:
        return error(409, "stale_version", "This alert has changed. Refresh before trying again.")
    if not isinstance(status, str) or status == "open" or status not in STATUSES:
        return invalid("status", "invalid_choice")
    note = text_field(data["note"]) if "note" in data else ""
    if note is None or len(note) > 500:
        return invalid("note")
    alert.status = status
    alert.note = note
    alert.version += 1
    alert.save(update_fields=["status", "note", "version"])
    record(
        alert.organisation_id, "update_security_alert", "security_alert", alert.pk,
        actor=request.user, version=alert.version, content={"status": status, "note": note},
    )
    return JsonResponse(serialize(alert))
