import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User


class Command(BaseCommand):
    help = "Create fictional alternate Observer and Reviewer accounts for the browser rehearsal."

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("QA account seeding requires DJANGO_DEBUG=true.")

        for role in (User.Role.OBSERVER, User.Role.REVIEWER):
            variable = f"QA_SECOND_{role.name}_PASSWORD"
            password = os.getenv(variable)
            if not password or password.startswith("replace-with-"):
                raise CommandError(f"Set {variable} to a local password before seeding.")
            user, created = User.objects.get_or_create(
                email=f"qa-second-{role}@demo.example",
                defaults={"role": role},
            )
            if user.role != role or user.is_staff or user.is_superuser or not user.is_active:
                raise CommandError("A QA account conflicts with an existing account.")
            if created or not user.check_password(password):
                user.set_password(password)
                user.save(update_fields=["password"])

        self.stdout.write("Fictional QA accounts are ready.")
