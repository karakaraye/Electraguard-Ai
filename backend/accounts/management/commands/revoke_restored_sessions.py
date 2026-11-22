from django.conf import settings
from django.contrib.sessions.models import Session
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction


class Command(BaseCommand):
    help = "Remove restored sessions before exposing an isolated recovery database."

    def add_arguments(self, parser):
        parser.add_argument("--confirm-database", required=True)
        parser.add_argument("--isolated-restore", action="store_true", required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        if settings.OBSERVATION_INTAKE_ENABLED:
            raise CommandError("Pause intake and stop application traffic before revoking restored sessions.")
        if options["confirm_database"] != connection.settings_dict["NAME"]:
            raise CommandError("The confirmation does not match the configured database.")
        removed, _ = Session.objects.all().delete()
        self.stdout.write(f"Revoked restored sessions: {removed}.")
