import base64
import hmac
import re
import secrets
from datetime import timedelta
from math import ceil
from urllib.parse import quote, urlencode

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone

from .models import User
from .observer_auth import endpoint, error, field_error, identity, throttle, validation, wat
from .observer_credentials import digest, locked_throttle
from .observer_sessions import track_session


PENDING = "staff_pre_totp"
VERIFIED = "staff_totp_verified"
PENDING_LIFE = timedelta(minutes=5)
STAFF_ROLES = ("reviewer", "administrator", "coordinator", "moderator", "org_admin")


def invalid_credentials():
    return error(401, "invalid_credentials", "Email or password is wrong.")


def account_locked(seconds):
    return error(423, "account_locked", "Too many tries. Try again later.", retry=seconds)


def invalid_field(data, name, message):
    return validation({name: field_error(data, name, message)})


def begin(request, user):
    logout(request)
    expiry = timezone.now() + PENDING_LIFE
    request.session[PENDING] = {
        "user": user.pk, "generation": user.staff_auth_generation,
        "challenge": secrets.token_hex(16),
        "expires": expiry.timestamp(),
    }
    request.session.set_expiry(expiry)
    status = "totp_required" if user.totp_secret else "totp_enrolment_required"
    return JsonResponse({"status": status, "expires_at": wat(expiry)})


@endpoint("POST", max_body_bytes=4096)
@transaction.atomic
def sign_in(request, data):
    limited = throttle(request, "staff-sign-in-ip", 30, 600)
    if limited is not None:
        return limited
    email, password = data.get("email"), data.get("password")
    if not isinstance(email, str) or len(email) > 254:
        return invalid_field(data, "email", "Enter a valid email address.")
    try:
        validate_email(email)
    except ValidationError:
        return invalid_field(data, "email", "Enter a valid email address.")
    if not isinstance(password, str) or not 1 <= len(password) <= 128:
        return invalid_field(data, "password", "Enter a password of up to 128 characters.")
    email = User.objects.normalize_email(email)
    row = locked_throttle("staff-password", email)
    now = timezone.now()
    if row.locked_until and row.locked_until > now:
        return account_locked(max(1, int((row.locked_until - now).total_seconds())))
    user = authenticate(request, email=email, password=password)
    if user is None or user.role not in STAFF_ROLES or user.staff_invite_digest:
        row.attempts = [stamp for stamp in row.attempts if stamp > now.timestamp() - 900]
        row.attempts.append(now.timestamp())
        if len(row.attempts) >= 5:
            row.attempts = []
            row.locked_until = now + timedelta(minutes=15)
            subject = User.objects.filter(email=email, role__in=STAFF_ROLES, is_active=True).first()
            if subject:
                from security.detectors import notice

                notice(
                    subject.organisation_id, "repeated_failed_staff_sign_in", "staff_account",
                    subject.public_id, subject.get_full_name() or subject.email,
                    {"failures": 5, "window_minutes": 15},
                )
        row.save()
        return account_locked(900) if row.locked_until and row.locked_until > now else invalid_credentials()
    row.delete()
    return begin(request, user)


def pending_user(request, *, lock=False):
    pending = request.session.get(PENDING)
    if pending is None or pending["expires"] <= timezone.now().timestamp():
        return None
    users = User.objects.filter(is_active=True, role__in=STAFF_ROLES)
    if lock:
        users = users.select_for_update()
    return users.filter(pk=pending["user"], staff_auth_generation=pending["generation"]).first()


def totp_required():
    return error(403, "totp_required", "Complete authenticator verification first.")


class StaffChallengeMiddleware:
    allowed = frozenset({
        "/api/v1/auth/csrf", "/api/v1/auth/sign-out", "/api/v1/auth/staff/sign-in",
        "/api/v1/auth/staff/invite", "/api/v1/auth/staff/totp",
        "/api/v1/auth/staff/totp/enrolment", "/api/v1/auth/staff/totp/enrolment/confirm",
        "/api/v1/public/results",
    })

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path_info
        public_areas = path == "/api/v1/reference/areas" or path.startswith("/api/v1/reference/areas/")
        if path.startswith("/api/") and path not in self.allowed and not public_areas and request.session.get(PENDING):
            response = totp_required()
            response["Cache-Control"] = "private, no-store"
            return response
        return self.get_response(request)


@endpoint("POST", max_body_bytes=4096)
def enrol_start(request, data):
    user = pending_user(request)
    if user is None or user.totp_secret:
        return totp_required()
    pending = request.session[PENDING]
    secret = base64.b32encode(secrets.token_bytes(20)).decode("ascii")
    request.session[PENDING] = {**pending, "secret": secret}
    parameters = urlencode({"secret": secret, "issuer": "ElectraGuard"})
    uri = f"otpauth://totp/ElectraGuard:{quote(user.email, safe='')}?{parameters}"
    return JsonResponse({
        "otpauth_uri": uri, "secret": secret, "expires_at": wat(request.session.get_expiry_date()),
    })


def totp(secret, step):
    key = base64.b32decode(secret)
    mac = hmac.digest(key, step.to_bytes(8, "big"), "sha1")
    offset = mac[-1] & 15
    number = int.from_bytes(mac[offset:offset + 4], "big") & 0x7fffffff
    return f"{number % 1_000_000:06d}"


@transaction.atomic
def complete(request, data, *, enrol):
    user = pending_user(request, lock=True)
    if user is None:
        return totp_required()
    pending = request.session[PENDING]
    secret = pending.get("secret") if enrol else user.totp_secret
    if not secret or (enrol and user.totp_secret):
        return totp_required()
    code = data.get("code")
    if not isinstance(code, str) or not re.fullmatch(r"[0-9]{6}", code):
        return invalid_field(data, "code", "Enter six digits.")
    row = locked_throttle("staff-totp", str(user.pk))
    challenge = locked_throttle("staff-totp-challenge", pending["challenge"])
    now = timezone.now().timestamp()
    if len(challenge.attempts) >= 5:
        logout(request)
        return totp_required()
    row.attempts = [stamp for stamp in row.attempts if stamp > now - 3600]
    if len(row.attempts) >= 10:
        logout(request)
        return account_locked(ceil(row.attempts[0] + 3600 - now))
    current_step = int(now) // 30
    steps = range(current_step + 1, current_step - 2, -1)
    step = next((step for step in steps if hmac.compare_digest(totp(secret, step), code)), None)
    if step is None or step <= user.totp_last_step:
        row.attempts.append(now)
        row.save(update_fields=["attempts", "updated_at"])
        challenge.attempts.append(now)
        challenge.save(update_fields=["attempts", "updated_at"])
        if len(challenge.attempts) >= 5 or len(row.attempts) >= 10:
            logout(request)
        if len(row.attempts) >= 10:
            return account_locked(ceil(row.attempts[0] + 3600 - now))
        return error(401, "totp_invalid", "That code did not work. Check the time on your phone.")
    user.totp_secret = secret
    user.totp_last_step = step
    user.save(update_fields=["totp_secret", "totp_last_step"])
    logout(request)
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    request.session[VERIFIED] = True
    track_session(request, user)
    from security.detectors import staff_network
    from staff.audit import record

    staff_network(request, user)
    record(user.organisation_id, "staff_sign_in", "staff_account", user.public_id, actor=user)
    return JsonResponse({"status": "signed_in", "me": identity(request)})


@endpoint("POST", max_body_bytes=4096)
def verify(request, data):
    return complete(request, data, enrol=False)


@endpoint("POST", max_body_bytes=4096)
def enrol_confirm(request, data):
    return complete(request, data, enrol=True)


@endpoint("POST", max_body_bytes=4096)
@transaction.atomic
def accept_invite(request, data):
    limited = throttle(request, "staff-invite-ip", 30, 600)
    if limited is not None:
        return limited
    token, password = data.get("token"), data.get("password")
    if not isinstance(token, str) or not token.startswith("inv_") or len(token) > 128:
        return invalid_credentials()
    if not isinstance(password, str) or not 12 <= len(password) <= 128:
        return invalid_field(data, "password", "Use 12 to 128 characters.")
    user = User.objects.select_for_update().filter(
        staff_invite_digest=digest("staff-invite", token),
        staff_invite_expires_at__gt=timezone.now(),
        role__in=STAFF_ROLES,
        is_active=True,
    ).first()
    if user is None:
        return invalid_credentials()
    try:
        validate_password(password, user)
    except ValidationError as exc:
        return invalid_field(data, "password", exc.messages[0])
    user.set_password(password)
    user.staff_invite_digest = None
    user.staff_invite_expires_at = None
    user.save(update_fields=["password", "staff_invite_digest", "staff_invite_expires_at"])
    return begin(request, user)
