from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import ObserverCode
from accounts.observer_credentials import normalize_code
from accounts.observer_sessions import end_sessions


class Command(BaseCommand):
    help = "Revoke an observer code and end its sessions, keeping its reports."

    def add_arguments(self, parser):
        parser.add_argument("code")

    @transaction.atomic
    def handle(self, *args, **options):
        code = normalize_code(options["code"])
        credential = ObserverCode.objects.select_for_update().filter(code=code).first()
        if credential is None or credential.status == ObserverCode.Status.REVOKED:
            raise CommandError("No revocable observer code matches.")
        credential.status = ObserverCode.Status.REVOKED
        credential.token_digest = None
        credential.save(update_fields=["status", "token_digest"])
        end_sessions(credential.user)
        self.stdout.write(f"{code} revoked.")
