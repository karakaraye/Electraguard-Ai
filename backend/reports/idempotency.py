import hashlib
import json
from uuid import UUID

from django.db import OperationalError, connection, transaction
from django.http import JsonResponse

from accounts.observer_auth import error
from accounts.organisations import org_scope

from .models import ReportIdempotency


def request_digest(request, data):
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(f"{request.method}\n{request.path_info}\n{canonical}".encode()).hexdigest()


def lock_key(scope):
    # No pending record is necessary. The lock is released even if the worker crashes.
    key = int.from_bytes(hashlib.sha256(scope.encode()).digest()[:8], "big", signed=True)
    try:
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute("SELECT current_setting('lock_timeout')")
            previous = cursor.fetchone()[0]
            cursor.execute("SELECT set_config('lock_timeout', '5s', true)")
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", [key])
            cursor.execute("SELECT set_config('lock_timeout', %s, true)", [previous])
    except OperationalError as exc:
        if getattr(exc.__cause__, "sqlstate", None) != "55P03":
            raise
        return False
    return True


@transaction.atomic
def idempotent(request, operation, data, perform, *, replay=None, citizen_digest=None):
    try:
        key = UUID(request.headers.get("Idempotency-Key", ""))
        if key.version != 4:
            raise ValueError
    except ValueError:
        return error(400, "idempotency_key_required", "Send a UUID v4 Idempotency-Key.")
    try:
        digest = request_digest(request, data)
    except ValueError:
        return error(400, "bad_request", "Send a valid JSON object.")

    public = citizen_digest is not None
    actor = None if public else request.user
    organisation = org_scope(request, public=True).values_list("pk", flat=True).first() if public else actor.organisation_id
    if organisation is None:
        return error(503, "service_unavailable", "Public reporting is unavailable.")
    identity = f"citizen:{citizen_digest}" if public else f"account:{actor.pk}"
    if not lock_key(f"reports:{organisation}:{identity}:{operation}:{key}"):
        return error(409, "request_in_progress", "This request is still being processed.", retry=2)

    records = org_scope(request, ReportIdempotency, public=public).filter(
        actor=actor, citizen_digest=citizen_digest or "", operation=operation,
    )
    previous = records.filter(key=key).first()
    if previous is not None:
        if previous.digest != digest:
            return error(409, "idempotency_key_reused", "This send key belongs to a different request.")
        if replay is None:
            response = JsonResponse(previous.body, status=200 if previous.status == 201 else previous.status)
        else:
            result = replay(previous)
            if not isinstance(result, tuple):
                return result
            _, body, report = result
            previous.body = body
            previous.save(update_fields=["body"])
            response = JsonResponse(body, status=200)
        response["Idempotent-Replayed"] = "true"
        return response

    result = perform()
    if not isinstance(result, tuple):
        return result
    status, body, report = result
    records.create(
        actor=actor, citizen_digest=citizen_digest or "", organisation_id=organisation, operation=operation, key=key,
        digest=digest, status=status, body=body, report=report,
    )
    return JsonResponse(body, status=status)
