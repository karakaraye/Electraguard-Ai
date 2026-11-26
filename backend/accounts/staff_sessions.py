from datetime import timedelta

from django.contrib.auth import login, logout
from django.middleware.csrf import rotate_token
from django.utils import timezone
from django.utils.cache import add_never_cache_headers

from .models import AccountSession, StaffCredential

PENDING = "staff_pending"
VERIFIED = "staff_verified"
PENDING_LIFE = timedelta(minutes=5)
IDLE = timedelta(minutes=30)
ABSOLUTE = timedelta(hours=8)
PENDING_PATHS = {
    # Sign-in rotates the CSRF token and the cookie is HttpOnly, so the browser must fetch the new one here.
    "/api/v1/auth/csrf",
    "/api/v1/auth/staff/totp",
    "/api/v1/auth/staff/totp/enrolment",
    "/api/v1/auth/staff/totp/enrolment/confirm",
    "/api/v1/auth/staff/invite",
    "/api/v1/auth/sign-out",
    "/api/v1/auth/me",
}


def start(request, user, *, pending):
    old_key = request.session.session_key
    logout(request)
    if old_key:
        AccountSession.objects.filter(key=old_key).delete()
    if not pending:
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    request.session[PENDING if pending else VERIFIED] = True
    request.session.set_expiry(0)
    request.session.save()
    now = timezone.now()
    return AccountSession.objects.create(
        key=request.session.session_key, user=user, organisation_id=user.organisation_id,
        pending=pending, absolute_expires_at=now + (PENDING_LIFE if pending else ABSOLUTE),
        idle_expires_at=now + (PENDING_LIFE if pending else IDLE),
    )


def discard(request):
    AccountSession.objects.filter(key=request.session.session_key).delete()
    logout(request)
    rotate_token(request)


def pending_status(user):
    enrolled = StaffCredential.objects.filter(user=user).exclude(secret="").exists()
    return "totp_required" if enrolled else "totp_enrolment_required"


class StaffSessionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.session.session_key is None:
            return self.get_response(request)
        accessed = request.session.accessed
        pending = request.session.get(PENDING)
        verified = request.session.get(VERIFIED)
        if not (pending or verified):
            # Public reference data keeps its cookie-independent cache policy.
            request.session.accessed = accessed
            return self.get_response(request)
        now = timezone.now()
        session = AccountSession.objects.filter(
            key=request.session.session_key, pending=bool(pending), user__is_active=True,
            absolute_expires_at__gt=now, idle_expires_at__gt=now,
        ).select_related("user").first()
        if session is None or (verified and (
            not request.user.is_authenticated or request.user.pk != session.user_id
        )):
            discard(request)
        elif pending:
            if request.path_info not in PENDING_PATHS:
                from .observer_auth import error

                response = error(403, "totp_required", "Finish two-step verification to continue.")
                add_never_cache_headers(response)
                return response
            request.pending_staff_session = session
        else:
            session.idle_expires_at = min(now + IDLE, session.absolute_expires_at)
            AccountSession.objects.filter(key=session.pk, idle_expires_at__lt=session.idle_expires_at).update(
                idle_expires_at=session.idle_expires_at,
            )
            request.staff_session_expires_at = session.idle_expires_at
        return self.get_response(request)
