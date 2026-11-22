from datetime import timedelta

from django.contrib.auth import SESSION_KEY, login, logout
from django.contrib.sessions.models import Session
from django.utils import timezone

from .models import AccountSession

IDLE = timedelta(hours=24)
ABSOLUTE = timedelta(days=7)
OBSERVER_SESSION = "observer_code_session"


def track_session(request, user, *, absolute=None):
    request.session.save()
    AccountSession.objects.update_or_create(
        key=request.session.session_key,
        defaults={"user": user, "organisation_id": user.organisation_id, "absolute_expires_at": absolute},
    )


def start_observer_session(request, user):
    # Cycle even when switching from an existing session for the same user.
    logout(request)
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    now = timezone.now()
    request.session[OBSERVER_SESSION] = True
    request.session.set_expiry(now + IDLE)
    track_session(request, user, absolute=now + ABSOLUTE)


def end_sessions(user, *, include_legacy=False):
    tracked = AccountSession.objects.filter(user=user, organisation_id=user.organisation_id)
    keys = list(tracked.values_list("key", flat=True))
    if include_legacy:
        # Existing email sessions issued before C1 have no index entry.
        keys.extend(
            session.session_key for session in Session.objects.filter(expire_date__gt=timezone.now())
            .exclude(session_key__in=keys).iterator()
            if str(session.get_decoded().get(SESSION_KEY)) == str(user.pk)
        )
    Session.objects.filter(session_key__in=keys).delete()
    tracked.delete()


class ObserverSessionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Public area documents never read or refresh a client session.
        path = request.path_info
        if path == "/api/v1/reference/areas" or path.startswith("/api/v1/reference/areas/"):
            return self.get_response(request)
        if request.session.get(OBSERVER_SESSION) and request.user.is_authenticated:
            tracked = AccountSession.objects.filter(
                key=request.session.session_key, user=request.user,
                organisation_id=request.user.organisation_id,
            ).first()
            now = timezone.now()
            if tracked is None or tracked.absolute_expires_at is None or tracked.absolute_expires_at <= now:
                logout(request)
            else:
                request.session.set_expiry(min(now + IDLE, tracked.absolute_expires_at))
        return self.get_response(request)
