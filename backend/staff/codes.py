import json
from base64 import urlsafe_b64encode
from datetime import timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from cryptography.fernet import Fernet, InvalidToken
from django.core import signing
from django.db import transaction
from django.db.models import Count, Sum
from django.http import JsonResponse
from django.utils import timezone

from accounts.models import AccountSession, ObserverCode, Organisation
from accounts.observer_auth import endpoint, error, wat
from accounts.observer_credentials import digest, issue_code, locked_throttle, new_setup_pin, normalize_code
from accounts.observer_sessions import end_sessions
from reports.idempotency import lock_key, request_digest

from .audit import authorize, record
from .fields import invalid, text_field
from .models import CodeBatch, CodeBatchMembership, CodeIssuance, CodeRequest


LAGOS = ZoneInfo("Africa/Lagos")
REASONS = {"lost_phone", "left_programme", "suspected_misuse", "other"}


def card_cipher(request_key, organisation_id):
    key = bytes.fromhex(digest("observer-card-replay", f"{organisation_id}/{request_key}"))
    return Fernet(urlsafe_b64encode(key))


def replayable(request, data, perform):
    try:
        key = UUID(request.headers.get("Idempotency-Key", ""))
        if key.version != 4:
            raise ValueError
    except ValueError:
        return error(400, "idempotency_key_required", "Send a UUID v4 Idempotency-Key.")
    actor = request.user
    if not lock_key(f"observer-code-request:{actor.organisation_id}:{actor.pk}:{key}"):
        return error(409, "request_in_progress", "This request is still being processed.", retry=2)
    checksum = request_digest(request, data)
    saved = CodeRequest.objects.filter(organisation_id=actor.organisation_id, actor=actor, key=key).first()
    if saved:
        if saved.digest != checksum:
            return error(409, "idempotency_key_reused", "This send key belongs to a different request.")
        if saved.expires_at and (saved.expires_at <= timezone.now() or not saved.encrypted):
            return error(409, "invalid_transition", "The printable PIN replay has expired.")
        body = saved.body
        if saved.encrypted:
            try:
                body = json.loads(card_cipher(key, actor.organisation_id).decrypt(bytes(saved.encrypted)))
            except InvalidToken:
                return error(409, "invalid_transition", "The printable PIN replay is unavailable.")
        response = JsonResponse(body)
        response["Idempotent-Replayed"] = "true"
        return response
    organisation = Organisation.objects.select_for_update(no_key=True).get(pk=actor.organisation_id)
    result = perform(organisation)
    if not isinstance(result, tuple):
        return result
    status, body, private = result
    CodeRequest.objects.create(
        organisation=organisation, actor=actor, key=key, digest=checksum,
        encrypted=card_cipher(key, organisation.pk).encrypt(json.dumps(body).encode()) if private else None,
        body=None if private else body, expires_at=timezone.now() + timedelta(minutes=10) if private else None,
    )
    return JsonResponse(body, status=status)


def page(request, rows, scope, salt, render):
    offset = 0
    try:
        limit = int(request.GET.get("limit", 50))
        if not 1 <= limit <= 100:
            return invalid("limit")
        if cursor := request.GET.get("cursor"):
            saved, offset = signing.loads(cursor, salt=salt)
            if saved != scope:
                raise ValueError
    except (ValueError, signing.BadSignature):
        return invalid("cursor" if request.GET.get("cursor") else "limit")
    page_rows = list(rows[offset:offset + limit + 1])
    return JsonResponse({
        "items": [render(row) for row in page_rows[:limit]],
        "next_cursor": signing.dumps([scope, offset + limit], salt=salt) if len(page_rows) > limit else None,
    })


def batch_json(batch):
    status = dict(batch.members.filter(credential__organisation_id=batch.organisation_id).values_list(
        "credential__status",
    ).annotate(total=Count("pk")))
    return {
        "id": str(batch.pk), "label": batch.label, "count": batch.count, "created_at": wat(batch.created_at),
        "created_by": batch.created_by.get_full_name() or batch.created_by.email,
        "printed_at": wat(batch.printed_at) if batch.printed_at else None,
        "active": status.get("active", 0), "unclaimed": status.get("unclaimed", 0),
        "revoked": status.get("revoked", 0),
    }


def card(credential, pin):
    return {
        "observer_code": credential.code, "setup_pin": pin,
        "setup_expires_at": wat(credential.setup_expires_at),
    }


def grant(organisation, count):
    local_now = timezone.now().astimezone(LAGOS)
    existing = CodeIssuance.objects.filter(organisation=organisation, day=local_now.date()).aggregate(total=Sum("count"))
    if (existing["total"] or 0) + count > 2000:
        midnight = (local_now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        return error(429, "rate_limited", "This organisation has reached its daily code limit.",
                     retry=max(1, int((midnight - local_now).total_seconds())))
    CodeIssuance.objects.create(organisation=organisation, day=local_now.date(), count=count)
    return None


@endpoint("GET")
def list_batches(request):
    denied = authorize(request, export=True)
    if denied is not None:
        return denied
    org_id = request.user.organisation_id
    rows = CodeBatch.objects.filter(organisation_id=org_id).select_related("created_by").order_by("-created_at", "id")
    return page(request, rows, [str(org_id)], "code-batches", batch_json)


def create_batch(request, data, organisation):
    label, count = text_field(data.get("label")), data.get("count")
    if not label or len(label) > 80 or not label.isprintable():
        return invalid("label")
    if type(count) is not int or not 1 <= count <= 500:
        return invalid("count")
    limited = grant(organisation, count)
    if limited is not None:
        return limited
    batch = CodeBatch.objects.create(organisation=organisation, label=label, count=count, created_by=request.user)
    cards = []
    for _ in range(count):
        credential, pin = issue_code(organisation, label)
        CodeBatchMembership.objects.create(batch=batch, credential=credential)
        cards.append(card(credential, pin))
    record(organisation.pk, "create_code_batch", "code_batch", batch.pk, actor=request.user, content={"count": count})
    return 201, {"batch": batch_json(batch), "cards": cards}, True


@endpoint("POST", max_body_bytes=4096)
@transaction.atomic
def create(request, data):
    denied = authorize(request, export=True)
    return denied if denied is not None else replayable(
        request, data, lambda organisation: create_batch(request, data, organisation),
    )


def batches(request):
    return create(request) if request.method == "POST" else list_batches(request)


@endpoint("POST", max_body_bytes=4096)
@transaction.atomic
def print_data(request, data, batch_id):
    denied = authorize(request, export=True)
    if denied is not None:
        return denied
    organisation = Organisation.objects.select_for_update(no_key=True).get(pk=request.user.organisation_id)
    batch = CodeBatch.objects.filter(organisation=organisation, pk=batch_id).first()
    if batch is None:
        return error(404, "not_found", "We could not find that.")
    if data.get("confirm_reset_setup_pins") is not True:
        return error(409, "confirmation_required", "Confirm that unclaimed setup PINs should be reset.")
    credentials = ObserverCode.objects.select_for_update().filter(
        organisation=organisation, batch_membership__batch=batch, status=ObserverCode.Status.UNCLAIMED,
    ).order_by("code")
    cards = [card(credential, new_setup_pin(credential)) for credential in credentials]
    batch.printed_at = timezone.now()
    batch.save(update_fields=["printed_at"])
    record(organisation.pk, "print_code_batch", "code_batch", batch.pk, actor=request.user, content={"count": len(cards)})
    return JsonResponse({"batch": batch_json(batch), "cards": cards})


def credential_json(credential):
    membership = getattr(credential, "batch_membership", None)
    return {
        "observer_code": credential.code, "batch_id": str(membership.batch_id) if membership else None,
        "status": credential.status, "activated_on": wat(credential.activated_at)[:10] if credential.activated_at else None,
        "last_active_on": wat(credential.user.last_login)[:10] if credential.user.last_login else None,
        "replaced_by": credential.replaced_by.code if credential.replaced_by else None,
    }


@endpoint("GET")
def code_list(request):
    denied = authorize(request, export=True)
    if denied is not None:
        return denied
    org_id = request.user.organisation_id
    batch_id, status, query = (request.GET.get(field) for field in ("batch_id", "status", "q"))
    rows = ObserverCode.objects.filter(organisation_id=org_id).select_related(
        "user", "replaced_by", "batch_membership",
    ).order_by("code")
    if status:
        if status not in ObserverCode.Status.values:
            return invalid("status")
        rows = rows.filter(status=status)
    if batch_id:
        try:
            rows = rows.filter(batch_membership__batch_id=UUID(batch_id), batch_membership__batch__organisation_id=org_id)
        except ValueError:
            return invalid("batch_id")
    if query:
        rows = rows.filter(code__icontains=query.strip())
    return page(request, rows, [str(org_id), batch_id, status, query], "observer-codes", credential_json)


def mutate_code(request, data, organisation, observer_code, operation):
    code = normalize_code(observer_code)
    credential = ObserverCode.objects.select_for_update().filter(organisation=organisation, code=code).first()
    if credential is None:
        return error(404, "not_found", "We could not find that.")
    if credential.status == ObserverCode.Status.REVOKED:
        return error(409, "invalid_transition", "This observer code has already been revoked.")
    reason = data.get("reason")
    if operation != "reset_pin" and (not isinstance(reason, str) or reason not in REASONS):
        return invalid("reason")
    if operation == "reissue":
        limited = grant(organisation, 1)
        if limited is not None:
            return limited
    sessions = AccountSession.objects.filter(organisation=organisation, user=credential.user).count()
    end_sessions(credential.user)
    if operation == "reset_pin":
        throttle = locked_throttle("code", credential.code)
        pin = new_setup_pin(credential)
        throttle.delete()
        body = {"card": card(credential, pin)}
    else:
        credential.status = ObserverCode.Status.REVOKED
        credential.token_digest = None
        if operation == "reissue":
            replacement, pin = issue_code(organisation, credential.label)
            credential.replaced_by = replacement
            body = {"revoked": credential.code, "card": card(replacement, pin)}
        else:
            body = {"observer_code": credential.code, "status": "revoked", "sessions_ended": sessions}
        credential.save(update_fields=["status", "token_digest", "replaced_by"])
    record(
        organisation.pk, operation + "_observer_code", "observer_code", credential.code,
        actor=request.user, content={"reason": reason},
    )
    return 200, body, operation != "revoke"


@endpoint("POST", max_body_bytes=4096)
@transaction.atomic
def code_action(request, data, observer_code, operation):
    denied = authorize(request, export=True)
    return denied if denied is not None else replayable(
        request, data, lambda organisation: mutate_code(request, data, organisation, observer_code, operation),
    )
