import hashlib
import json
from uuid import UUID

from django.db import OperationalError, connection, transaction
from django.http import HttpResponse, JsonResponse

from accounts.observer_auth import error

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
def idempotent(request, operation, data, perform, *, citizen=None, record_model=ReportIdempotency):
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

    organisation, secret = citizen or (request.user.organisation_id, "")
    actor = None if citizen else request.user
    scope = secret if citizen else actor.pk
    if not lock_key(f"reports:{organisation}:{scope}:{operation}:{key}"):
        return error(409, "request_in_progress", "This request is still being processed.", retry=2)

    scope_fields = {"organisation_id": organisation, "actor": actor, "operation": operation}
    if record_model is ReportIdempotency:
        scope_fields["secret_scope"] = secret
    records = record_model.objects.filter(**scope_fields)
    previous = records.filter(key=key).first()
    if previous is not None:
        if previous.digest != digest:
            return error(409, "idempotency_key_reused", "This send key belongs to a different request.")
        response = HttpResponse(status=204) if previous.status == 204 else JsonResponse(
            previous.body, status=200 if previous.status == 201 else previous.status,
        )
        response["Idempotent-Replayed"] = "true"
        return response

    result = perform()
    if not isinstance(result, tuple):
        return result
    status, body, report = result
    if record_model is ReportIdempotency:
        scope_fields["report"] = report
    records.create(**scope_fields, key=key, digest=digest, status=status, body=body)
    return HttpResponse(status=204) if status == 204 else JsonResponse(body, status=status)
