import base64
import hmac
import re
import secrets
from datetime import timedelta
from hashlib import sha1
from math import ceil
from urllib.parse import quote, urlencode

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.utils.crypto import salted_hmac

from .models import AccountSession, StaffCredential, StaffSecurityAlert, User
from .observer_auth import endpoint, error, field_error, identity, throttle, validation, wat
from .observer_credentials import DUMMY_HASH, digest, locked_throttle
from .observer_sessions import end_sessions
from .staff_sessions import discard, start

STAFF_ROLES = (User.Role.REVIEWER, User.Role.MODERATOR, User.Role.COORDINATOR, User.Role.ORG_ADMIN)
PASSWORD_WINDOW = timedelta(minutes=15)
TOTP_WINDOW = timedelta(hours=1)


def cipher(key):
    derived = salted_hmac("electraguard.staff-totp", "", secret=key, algorithm="sha256")
    return Fernet(base64.urlsafe_b64encode(derived.digest()))


def encrypt(secret):
    return cipher(settings.SECRET_KEY).encrypt(secret.encode()).decode()


def decrypt(value):
    for key in (settings.SECRET_KEY, *settings.SECRET_KEY_FALLBACKS):
        try:
            return cipher(key).decrypt(value.encode()).decode()
        except InvalidToken:
            continue
    return None


def totp(secret, step):
    mac = hmac.new(base64.b32decode(secret), step.to_bytes(8, "big"), sha1).digest()
    offset = mac[-1] & 15
    number = int.from_bytes(mac[offset:offset + 4], "big") & 0x7fffffff
    return f"{number % 1_000_000:06d}"


def email_address(value):
    if isinstance(value, str) and len(value) <= 254:
        value = User.objects.normalize_email(value.strip())
        try:
            validate_email(value)
        except ValidationError:
            return None
        return value
    return None


def invalid_credentials():
    return error(401, "invalid_credentials", "Email or password is wrong.")


def account_locked(until, now, *, totp_attempt=False):
    message = "Too many tries. Try again later." if totp_attempt else "Too many tries. Try again in 15 minutes."
    return error(423, "account_locked", message, retry=max(1, ceil((until - now).total_seconds())))


def alert(user, rule, **details):
    StaffSecurityAlert.objects.create(organisation_id=user.organisation_id, user=user, rule=rule, details=details)


def get_credential(user):
    return StaffCredential.objects.get_or_create(user=user, defaults={"organisation_id": user.organisation_id})[0]


def begin(request, user, credential):
    pending = start(request, user, pending=True)
    return JsonResponse({
        "status": "totp_required" if credential.secret else "totp_enrolment_required",
        "expires_at": wat(pending.absolute_expires_at),
    })


@endpoint("POST", max_body_bytes=4096)
def sign_in(request, data):
    limited = throttle(request, "staff-sign-in-ip", 30, 600)
    if limited is not None:
        return limited
    email, password = email_address(data.get("email")), data.get("password")
    fields = {}
    if email is None:
        fields["email"] = field_error(data, "email", "Enter a valid email address.")
    if not isinstance(password, str) or not 1 <= len(password) <= 128:
        fields["password"] = field_error(data, "password", "Enter a password of up to 128 characters.")
    return validation(fields) if fields else authenticate_staff(request, email, password)


@transaction.atomic
def authenticate_staff(request, email, password):
    row = locked_throttle("staff-password", email)
    now = timezone.now()
    user = User.objects.select_for_update().filter(email=email).first()
    eligible = user and user.role in (*STAFF_ROLES, User.Role.ADMINISTRATOR) and user.is_active and not (user.is_staff or user.is_superuser)
    correct = check_password(password, user.password if eligible and user.has_usable_password() else DUMMY_HASH)
    if user and not eligible:
        return invalid_credentials()
    if row.locked_until and row.locked_until > now:
        return account_locked(row.locked_until, now)
    if correct and eligible:
        credential = get_credential(user)
        totp_limit = locked_throttle("staff-totp", str(user.pk))
        if totp_limit.locked_until and totp_limit.locked_until > now:
            return account_locked(totp_limit.locked_until, now, totp_attempt=True)
        return begin(request, user, credential)

    row.attempts = [attempt for attempt in row.attempts if attempt > (now - PASSWORD_WINDOW).timestamp()]
    row.attempts.append(now.timestamp())
    if len(row.attempts) >= 5:
        row.locked_until = now + PASSWORD_WINDOW
        if user:
            alert(user, StaffSecurityAlert.Rule.SIGN_IN, failures=5, window_minutes=15)
    row.save()
    return account_locked(row.locked_until, now) if len(row.attempts) >= 5 else invalid_credentials()


def locked_pending(request):
    session = getattr(request, "pending_staff_session", None)
    if session is None:
        return None, None, None
    user = User.objects.select_for_update().filter(pk=session.user_id, is_active=True).first()
    if user is None:
        return None, None, None
    pending = AccountSession.objects.select_for_update().filter(
        pk=session.pk, user=user, pending=True, absolute_expires_at__gt=timezone.now(),
    ).first()
    return (user, pending, get_credential(user)) if pending else (None, None, None)


def needs_pending():
    return error(401, "not_authenticated", "Sign in to continue.")


@endpoint("POST", max_body_bytes=4096)
@transaction.atomic
def enrol(request, data):
    user, pending, credential = locked_pending(request)
    if pending is None:
        return needs_pending()
    if credential.secret:
        return error(403, "forbidden", "Two-step verification is already enrolled.")
    secret = base64.b32encode(secrets.token_bytes(20)).decode()
    pending.enrolment_secret = encrypt(secret)
    pending.save(update_fields=["enrolment_secret"])
    query = urlencode({"secret": secret, "issuer": "ElectraGuard"})
    return JsonResponse({
        "otpauth_uri": f"otpauth://totp/ElectraGuard:{quote(user.email, safe='')}?{query}",
        "secret": secret, "expires_at": wat(pending.absolute_expires_at),
    })


def wrong_code(request, user, pending, row, now):
    row.attempts = [attempt for attempt in row.attempts if attempt > (now - TOTP_WINDOW).timestamp()]
    row.attempts.append(now.timestamp())
    pending.totp_attempts += 1
    if len(row.attempts) >= 10:
        row.locked_until = now + TOTP_WINDOW
        alert(user, StaffSecurityAlert.Rule.TOTP, failures=10, window_minutes=60)
    row.save()
    if pending.totp_attempts >= 5 or len(row.attempts) >= 10:
        discard(request)
    else:
        pending.save(update_fields=["totp_attempts"])
    if len(row.attempts) >= 10:
        return account_locked(row.locked_until, now, totp_attempt=True)
    return error(401, "totp_invalid", "That code did not work. Check the time on your phone.")


@transaction.atomic
def finish(request, data, *, confirming):
    user, pending, credential = locked_pending(request)
    if pending is None:
        return needs_pending()
    if confirming == bool(credential.secret):
        return error(403, "forbidden", "Use the two-step verification step shown at sign-in.")
    code = data.get("code")
    if not isinstance(code, str) or not re.fullmatch(r"[0-9]{6}", code):
        return validation({"code": field_error(data, "code", "Enter a six-digit verification code.")})
    row = locked_throttle("staff-totp", str(user.pk))
    now = timezone.now()
    if row.locked_until and row.locked_until > now:
        discard(request)
        return account_locked(row.locked_until, now, totp_attempt=True)
    encrypted = pending.enrolment_secret if confirming else credential.secret
    if not encrypted:
        return error(403, "forbidden", "Start two-step enrolment first.")
    secret = decrypt(encrypted)
    if secret is None:
        return error(503, "service_unavailable", "Two-step verification is temporarily unavailable.")
    current = int(now.timestamp()) // 30
    matches = [step for step in (current - 1, current, current + 1) if hmac.compare_digest(totp(secret, step), code)]
    if not matches or min(matches) <= credential.last_totp_step:
        return wrong_code(request, user, pending, row, now)
    credential.secret = encrypt(secret)
    credential.last_totp_step = max(matches)
    from security.detectors import staff_network

    staff_network(request, user)
    credential.last_sign_in_on = now
    credential.enforce_totp = True
    credential.save()
    if confirming:
        end_sessions(user, include_legacy=True)
    request.pending_staff_session = None
    session = start(request, user, pending=False)
    request.staff_session_expires_at = session.idle_expires_at
    return JsonResponse({"status": "signed_in", "me": identity(request)})


@endpoint("POST", max_body_bytes=4096)
def verify(request, data):
    return finish(request, data, confirming=False)


@endpoint("POST", max_body_bytes=4096)
def confirm(request, data):
    return finish(request, data, confirming=True)


@endpoint("POST", max_body_bytes=4096)
def accept_invite(request, data):
    limited = throttle(request, "staff-invite-ip", 30, 600)
    if limited is not None:
        return limited
    token = data.get("token")
    if not isinstance(token, str) or not re.fullmatch(r"inv_[A-Za-z0-9_-]{43}", token):
        return invalid_credentials()
    return claim_invite(request, digest("staff-invite", token), data.get("password"))


@transaction.atomic
def claim_invite(request, token_digest, password):
    user_id = StaffCredential.objects.filter(invite_digest=token_digest).values_list("user_id", flat=True).first()
    user = User.objects.select_for_update().filter(pk=user_id, is_active=True).first()
    if user is None:
        return invalid_credentials()
    credential = StaffCredential.objects.filter(user=user, invite_digest=token_digest).first()
    if credential is None or credential.invite_expires_at <= timezone.now():
        return invalid_credentials()
    if not isinstance(password, str) or not 12 <= len(password) <= 128:
        return validation({"password": {"code": "invalid", "message": "Use 12 to 128 characters."}})
    try:
        validate_password(password, user=user)
    except ValidationError as exc:
        return validation({"password": {"code": "invalid", "message": " ".join(exc.messages)}})
    user.set_password(password)
    user.save(update_fields=["password"])
    credential.invite_digest = credential.invite_expires_at = None
    credential.version += 1
    credential.save(update_fields=["invite_digest", "invite_expires_at", "version"])
    return begin(request, user, credential)
