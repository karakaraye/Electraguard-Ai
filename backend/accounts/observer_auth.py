import json
import re
import secrets
from functools import wraps
from ipaddress import ip_address
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth import logout
from django.core.exceptions import RequestDataTooBig
from django.db import OperationalError, transaction
from django.http import HttpResponse, JsonResponse
from django.middleware.csrf import get_token, rotate_token
from django.utils import timezone
from django.utils.cache import add_never_cache_headers
from django.views.csrf import csrf_failure as django_csrf_failure
from django.views.decorators.cache import never_cache

from .models import AccountSession, ObserverCode, ObserverSecurityAlert, User
from .observer_credentials import (
    CODE_WINDOW, DAY, TOKEN_LIFE, digest, locked_throttle, normalize_code, pin_hash,
    rate_limit, too_simple, verify_pin,
)
from .observer_sessions import end_sessions, start_observer_session
from .organisations import org_scope

Status = ObserverCode.Status


def error(status, code, message, *, fields=None, retry=None):
    body = {"code": code, "message": message}
    if fields:
        body["fields"] = fields
    response = JsonResponse({"error": body}, status=status)
    if retry is not None:
        response["Retry-After"] = retry
    return response


def csrf_failure(request, reason=""):
    if request.path.startswith("/api/v1/"):
        response = error(403, "csrf_failed", "Refresh the page and try again.")
        add_never_cache_headers(response)
        return response
    return django_csrf_failure(request, reason)


def reject_nonfinite(value):
    raise ValueError(f"Invalid JSON constant: {value}")


def endpoint(method, *, max_body_bytes=None):
    def decorate(view):
        @never_cache
        @wraps(view)
        def wrapped(request, **kwargs):
            if request.method != method:
                response = error(405, "method_not_allowed", "This method is not available.")
                response["Allow"] = method
                return response
            if method in ("POST", "PATCH", "PUT"):
                if request.content_type != "application/json":
                    return error(400, "bad_request", "Send a JSON object.")
                try:
                    raw_body = request.body
                    if max_body_bytes is not None and len(raw_body) > max_body_bytes:
                        return error(413, "payload_too_large", "The request is too large.")
                    data = json.loads(raw_body, parse_constant=reject_nonfinite)
                except RequestDataTooBig:
                    return error(413, "payload_too_large", "The request is too large.")
                except (ValueError, RecursionError):
                    return error(400, "bad_request", "Send a valid JSON object.")
                if not isinstance(data, dict):
                    return error(400, "bad_request", "Send a JSON object.")
                try:
                    return view(request, data, **kwargs)
                except OperationalError:
                    return error(503, "service_unavailable", "The service is temporarily unavailable.")
            try:
                return view(request, **kwargs)
            except OperationalError:
                return error(503, "service_unavailable", "The service is temporarily unavailable.")
        return wrapped
    return decorate


def wat(value):
    return value.astimezone(ZoneInfo("Africa/Lagos")).isoformat()


def identity(request):
    organisation = org_scope(request).first()
    user = request.user
    result = {
        "authenticated": user.is_authenticated, "user": None, "session_expires_at": None,
        "citizen_intake_open": bool(
            organisation and not organisation.intake_paused and settings.OBSERVATION_INTAKE_ENABLED
        ),
        "server_time": wat(timezone.now()),
    }
    pending = getattr(request, "pending_staff_session", None)
    if pending:
        from .staff_sessions import pending_status

        result["pending"] = pending_status(pending.user)
    if user.is_authenticated:
        credential = org_scope(request, ObserverCode).filter(user=user).first()
        observer = user.role == User.Role.OBSERVER
        result["user"] = {
            "id": str(user.public_id), "kind": "observer" if observer else "staff",
            "observer_code": credential.code if credential else None,
            "roles": user.application_roles,
            "display_name": None if observer else user.get_full_name() or None,
            "email": None if observer else user.email,
            "totp_enrolled": not observer and hasattr(user, "staff_credential") and bool(user.staff_credential.secret),
            "organisation": {
                "id": str(organisation.pk), "name": organisation.name,
                "intake_paused": organisation.intake_paused or not settings.OBSERVATION_INTAKE_ENABLED,
            },
        }
        result["session_expires_at"] = wat(getattr(request, "staff_session_expires_at", None) or request.session.get_expiry_date())
    return result


def throttle(request, namespace, limit, seconds):
    peer = request.META.get("REMOTE_ADDR")
    address = peer or "unknown"
    if peer in settings.AUTH_TRUSTED_PROXY_IPS:
        # The trusted ingress must overwrite this header with one client address.
        try:
            address = str(ip_address(request.META.get("HTTP_X_FORWARDED_FOR", "")))
        except ValueError:
            pass
    retry = rate_limit(namespace, address, limit, seconds)
    if retry is not None:
        return error(429, "rate_limited", "Too many requests. Try again later.", retry=retry)
    return None


def validation(fields):
    return error(422, "validation_failed", "Some fields need attention.", fields=fields)


def field_error(data, name, message):
    return {"code": "required" if data.get(name) in (None, "") else "invalid", "message": message}


def pin_format(pin, lengths):
    return isinstance(pin, str) and len(pin) in lengths and re.fullmatch(r"[0-9]+", pin)


def invalid_credentials():
    return error(401, "invalid_credentials", "That code and PIN do not match.")


def locked(row):
    return error(
        423, "code_locked", "Too many tries. Try again in 15 minutes or ask your coordinator.",
        retry=None if row.permanently_locked else 900,
    )


def register_failure(row, credential, now):
    now_ts = now.timestamp()
    row.attempts = [timestamp for timestamp in row.attempts if timestamp > (now - DAY).timestamp()]
    row.attempts.append(now_ts)
    row.permanently_locked = len(row.attempts) >= 10
    short_lock = sum(timestamp > (now - CODE_WINDOW).timestamp() for timestamp in row.attempts) >= 5
    row.locked_until = now + CODE_WINDOW if short_lock else None
    row.save()
    if row.permanently_locked or short_lock:
        if credential and credential.status != Status.REVOKED:
            credential.status = Status.LOCKED
            credential.save(update_fields=["status"])
            ObserverSecurityAlert.objects.create(
                organisation_id=credential.organisation_id, credential=credential,
                permanent=row.permanently_locked,
            )
        return locked(row)
    return invalid_credentials()


@endpoint("GET")
def csrf(request):
    return throttle(request, "csrf-ip", 60, 60) or JsonResponse({"csrf_token": get_token(request)})


@endpoint("GET")
def me(request):
    return JsonResponse(identity(request))


@endpoint("POST")
def sign_in(request, data):
    limited = throttle(request, "sign-in-ip", 30, 600)
    if limited is not None:
        return limited
    code = normalize_code(data.get("code"))
    pin = data.get("pin")
    if code is None or not pin_format(pin, (6, 8)):
        fields = {}
        if code is None:
            fields["code"] = field_error(data, "code", "Enter a valid observer code.")
        if not pin_format(pin, (6, 8)):
            fields["pin"] = field_error(data, "pin", "Enter a six- or eight-digit PIN.")
        return validation(fields)
    return authenticate_code(request, code, pin)


@transaction.atomic
def authenticate_code(request, code, pin):
    now = timezone.now()
    row = locked_throttle("code", code)
    credential = org_scope(request, ObserverCode, credential={"code": code}).select_for_update().first()
    setup = len(pin) == 8
    encoded = (credential.setup_hash if setup else credential.pin_hash) if credential else ""
    correct = verify_pin(pin, encoded)
    if correct and credential.status == Status.REVOKED:
        return error(403, "code_revoked", "This code is no longer active. Ask your coordinator for a new one.")
    if row.permanently_locked or (row.locked_until and row.locked_until > now):
        return locked(row)

    if not correct or (setup and credential.setup_expires_at <= now):
        return register_failure(row, credential, now)

    if not credential.user.is_active:
        return invalid_credentials()
    credential.status = Status.UNCLAIMED if setup else Status.ACTIVE
    if setup:
        token = "pst_" + secrets.token_urlsafe(32)
        credential.token_digest = digest("setup-token", token)
        credential.token_expires_at = now + TOKEN_LIFE
        credential.token_attempts = 0
        credential.save(update_fields=["status", "token_digest", "token_expires_at", "token_attempts"])
        return JsonResponse({
            "status": "pin_setup_required", "setup_token": token,
            "setup_token_expires_at": wat(credential.token_expires_at),
        })

    credential.save(update_fields=["status"])
    start_observer_session(request, credential.user)
    return JsonResponse({"status": "signed_in", "me": identity(request)})


@endpoint("POST")
@transaction.atomic
def set_pin(request, data):
    limited = throttle(request, "setup-ip", 30, 600)
    if limited is not None:
        return limited
    token = data.get("setup_token")
    credential = None
    if isinstance(token, str) and re.fullmatch(r"pst_[A-Za-z0-9_-]{43}", token):
        credential = org_scope(request, ObserverCode, credential={
            "token_digest": digest("setup-token", token),
        }).select_for_update().first()
    now = timezone.now()
    if (
        credential is None or credential.status != Status.UNCLAIMED
        or credential.token_expires_at <= now or credential.setup_expires_at <= now
        or not credential.user.is_active
    ):
        return error(401, "invalid_credentials", "This setup step has expired. Enter your code and setup PIN again.")
    pin = data.get("new_pin")
    valid = pin_format(pin, (6,))
    simple = valid and too_simple(pin)
    reused = valid and not simple and verify_pin(pin, credential.setup_prefix_hash)
    if not valid or simple or reused:
        credential.token_attempts += 1
        if credential.token_attempts >= 5:
            credential.token_digest = None
        credential.save(update_fields=["token_attempts", "token_digest"])
        if not valid:
            return validation({"new_pin": field_error(data, "new_pin", "Enter a six-digit PIN.")})
        field = (
            {"code": "pin_same_as_setup", "message": "Choose a PIN different from the start of the setup PIN."}
            if reused else {"code": "pin_too_simple", "message": "Avoid repeated or sequential digits."}
        )
        return error(422, "validation_failed", "Choose a different PIN.", fields={"new_pin": field})

    credential.pin_hash = pin_hash(pin)
    credential.setup_hash = ""
    credential.setup_expires_at = credential.token_expires_at = None
    credential.token_digest = None
    credential.status = Status.ACTIVE
    credential.save()
    start_observer_session(request, credential.user)
    return JsonResponse({"status": "signed_in", "me": identity(request)})


@endpoint("POST")
def change_pin(request, data):
    if not request.user.is_authenticated:
        return error(401, "not_authenticated", "Sign in to continue.")
    if request.user.role != User.Role.OBSERVER:
        return error(403, "forbidden", "Your role cannot do this.")

    limited = throttle(request, "sign-in-ip", 30, 600)
    if limited is not None:
        return limited
    current, new = data.get("current_pin"), data.get("new_pin")
    fields = {
        name: field_error(data, name, "Enter a six-digit PIN.")
        for name, value in (("current_pin", current), ("new_pin", new))
        if not pin_format(value, (6,))
    }
    if fields:
        return validation(fields)
    return change_credential_pin(request, current, new)


@transaction.atomic
def change_credential_pin(request, current, new):
    credentials = org_scope(request, ObserverCode).filter(user=request.user)
    code = credentials.values_list("code", flat=True).first()
    if code is None:
        return error(403, "forbidden", "An observer code is required.")
    row = locked_throttle("code", code)
    credential = credentials.select_for_update().get(code=code)
    now = timezone.now()

    correct = verify_pin(current, credential.pin_hash)
    if credential.status not in (Status.ACTIVE, Status.LOCKED) or not credential.user.is_active:
        return invalid_credentials()
    if row.permanently_locked or (row.locked_until and row.locked_until > now):
        return locked(row)
    if not correct:
        return register_failure(row, credential, now)

    if too_simple(new):
        return validation({"new_pin": {
            "code": "pin_too_simple", "message": "Avoid repeated or sequential digits.",
        }})
    if new == current:
        return validation({"new_pin": {
            "code": "pin_reused", "message": "Choose a PIN different from your current PIN.",
        }})
    if credential.setup_prefix_hash and verify_pin(new, credential.setup_prefix_hash):
        return validation({"new_pin": {
            "code": "pin_same_as_setup", "message": "Choose a PIN different from the start of the setup PIN.",
        }})

    credential.pin_hash = pin_hash(new)
    credential.status = Status.ACTIVE
    credential.save(update_fields=["pin_hash", "status"])
    return HttpResponse(status=204)


@endpoint("POST")
@transaction.atomic
def sign_out(request, data):
    everywhere = data.get("everywhere", False)
    if not isinstance(everywhere, bool):
        return validation({"everywhere": {"code": "invalid", "message": "Use true or false."}})
    pending = getattr(request, "pending_staff_session", None)
    if pending:
        staff = User.objects.select_for_update().get(pk=pending.user_id)
        if everywhere and AccountSession.objects.filter(pk=pending.pk, user=staff, pending=True).exists():
            end_sessions(staff, include_legacy=True)
        else:
            AccountSession.objects.filter(pk=pending.pk, user=staff).delete()
    if request.user.is_authenticated:
        if everywhere:
            if request.user.role != User.Role.OBSERVER:
                User.objects.select_for_update().get(pk=request.user.pk)
            credential = org_scope(request, ObserverCode).select_for_update().filter(user=request.user).first()
            end_sessions(request.user, include_legacy=credential is None)
        else:
            org_scope(request, AccountSession).filter(key=request.session.session_key, user=request.user).delete()
    logout(request)
    rotate_token(request)
    return HttpResponse(status=204)
