import time
from datetime import datetime, timezone as utc

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.models import StaffCredential
from accounts.staff_auth import decrypt, totp


class Command(BaseCommand):
    help = "Print the current six-digit sign-in code for a demonstration staff account (demo databases only)."

    def add_arguments(self, parser):
        parser.add_argument("email")

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("demo_totp works only with DJANGO_DEBUG=true on a demonstration database.")
        credential = StaffCredential.objects.filter(user__email=options["email"].strip().lower()).first()
        if credential is None or not credential.secret:
            raise CommandError("No two-step setup for that account.")
        secret = decrypt(credential.secret)
        if secret is None:
            raise CommandError("The stored secret cannot be read with this DJANGO_SECRET_KEY.")
        step = int(datetime.now(utc.utc).timestamp()) // 30
        # A code is accepted once. If this step was already used to sign in, wait for the next one.
        while step <= credential.last_totp_step:
            time.sleep(1)
            step = int(datetime.now(utc.utc).timestamp()) // 30
        self.stdout.write(totp(secret, step))
