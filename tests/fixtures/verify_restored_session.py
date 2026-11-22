"""Exercise a restored cookie without printing its value."""

from django.conf import settings
from django.contrib.sessions.models import Session
from django.core.management import call_command
from django.test import Client
from django.utils.timezone import now


def verify():
    database = "electraguard_recovery_ci"
    assert settings.DATABASES["default"]["NAME"] == database
    assert not settings.OBSERVATION_INTAKE_ENABLED
    sessions = Session.objects.filter(expire_date__gt=now())
    assert sessions.exists(), "Expected recent sessions in the restored database."
    cookie = sessions.values_list("session_key", flat=True).first()
    client = Client(HTTP_HOST="localhost", HTTP_X_FORWARDED_PROTO="https")
    client.cookies[settings.SESSION_COOKIE_NAME] = cookie
    assert client.get("/api/auth/me").status_code == 200
    call_command("revoke_restored_sessions", "--isolated-restore", "--confirm-database", database)
    assert not Session.objects.exists()
    client.cookies[settings.SESSION_COOKIE_NAME] = cookie
    assert client.get("/api/auth/me").status_code == 403
    print("The restored session cookie was rejected after revocation.")


verify()
