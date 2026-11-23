from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import ObserverCode
from accounts.observer_credentials import locked_throttle, new_setup_pin, normalize_code
from accounts.observer_sessions import end_sessions


class Command(BaseCommand):
    help = "Reset a code, end its sessions, and print its replacement setup PIN once."

    def add_arguments(self, parser):
        parser.add_argument("code")

    def handle(self, *args, **options):
        code = normalize_code(options["code"])
        if code is None:
            raise CommandError("No matching observer code.")
        pin = self.reset(code)
        self.stdout.write(f"{code} {pin}")

    @transaction.atomic
    def reset(self, code):
        throttle = locked_throttle("code", code)
        credential = ObserverCode.objects.select_for_update().filter(code=code).first()
        if credential is None or credential.status == ObserverCode.Status.REVOKED:
            raise CommandError("No resettable observer code matches.")
        end_sessions(credential.user)
        pin = new_setup_pin(credential)
        throttle.delete()
        return pin
