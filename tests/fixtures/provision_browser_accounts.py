"""Run through Django shell against an isolated browser acceptance database."""

import os

from django.conf import settings
from django.db import transaction

from accounts.models import User


def provision():
    database = settings.DATABASES["default"]
    local_fixture = (
        settings.DEBUG and database["NAME"] == "electraguard_qa"
        and database["HOST"] in {"127.0.0.1", "localhost", "::1"}
    )
    compose_fixture = (
        os.getenv("QA_COMPOSE_PROJECT") == "electraguard-acceptance" and not settings.DEBUG
        and database["NAME"] == "electraguard" and database["HOST"] == "postgres"
        and settings.ALLOWED_HOSTS == ["localhost"]
        and settings.CSRF_TRUSTED_ORIGINS == ["https://localhost"]
        and settings.OBSERVATION_INTAKE_ENABLED
    )
    if not (local_fixture or compose_fixture):
        raise RuntimeError("Use an isolated browser acceptance database.")
    roles = {
        "observer": User.Role.OBSERVER,
        "second-observer": User.Role.OBSERVER,
        "reviewer": User.Role.REVIEWER,
        "second-reviewer": User.Role.REVIEWER,
        "administrator": User.Role.ADMINISTRATOR,
    }
    with transaction.atomic():
        for name, role in roles.items():
            password = os.environ[f"QA_{name.upper().replace('-', '_')}_PASSWORD"]
            if len(password) < 12:
                raise RuntimeError("Set each browser test password to at least 12 characters.")
            email = f"{name}@qa.example"
            user = User.objects.filter(email=email).first()
            if user is None:
                User.objects.create_user(email, password=password, role=role)
            elif user.role != role or user.is_staff or user.is_superuser or not user.is_active or not user.check_password(password):
                raise RuntimeError("An existing browser test account conflicts with the fixture configuration.")


provision()
