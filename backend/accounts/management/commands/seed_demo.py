import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User


class Command(BaseCommand):
    help = "Create or refresh the three fictional local demo accounts."

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Demo seeding requires DJANGO_DEBUG=true.")

        for role in User.Role:
            variable = f"DEMO_{role.name}_PASSWORD"
            password = os.getenv(variable, "")
            if not password or password.startswith("replace-with-"):
                raise CommandError(f"Set {variable} to a local password before seeding.")

            email = f"{role}@demo.example"
            user, created = User.objects.get_or_create(email=email, defaults={"role": role})
            if user.role != role or user.is_staff or user.is_superuser or not user.is_active:
                raise CommandError(f"{email} conflicts with an existing account.")
            if created or not user.check_password(password):
                user.set_password(password)
                user.save(update_fields=["password"])
            self.stdout.write(email)
