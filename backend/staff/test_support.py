from django.utils import timezone

from accounts.models import AccountSession
from accounts.staff_sessions import ABSOLUTE, IDLE


def bind_staff_session(session, user):
    now = timezone.now()
    AccountSession.objects.update_or_create(
        key=session.session_key,
        defaults={
            "user": user,
            "organisation": user.organisation,
            "absolute_expires_at": now + ABSOLUTE,
            "idle_expires_at": now + IDLE,
        },
    )
