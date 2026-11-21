import sys
from getpass import GetPassWarning, getpass
from warnings import catch_warnings, simplefilter

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction

from accounts.models import User


class Command(BaseCommand):
    help = "Provision a named application account without Django staff or superuser permissions."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--role", required=True, choices=User.Role.values)

    def handle(self, *args, **options):
        email = User.objects.normalize_email(options["email"].strip())
        user = User(email=email, role=options["role"])
        try:
            validate_email(email)
        except ValidationError as exc:
            raise CommandError("Enter a valid account email.") from exc
        if len(email) > User._meta.get_field("email").max_length:
            raise CommandError("The email address is too long.")
        if User.objects.filter(email=email).exists():
            raise CommandError("An account with this email already exists.")
        if not sys.stdin.isatty() or not sys.stderr.isatty():
            raise CommandError("Run this command in an interactive terminal for hidden password entry.")
        try:
            with catch_warnings():
                simplefilter("error", GetPassWarning)
                password = getpass("Initial password: ")
                confirmation = getpass("Confirm password: ")
        except GetPassWarning as exc:
            raise CommandError("This terminal does not support hidden password entry.") from exc
        except (EOFError, KeyboardInterrupt) as exc:
            raise CommandError("Account provisioning cancelled.") from exc
        if not password or password != confirmation:
            raise CommandError("Enter matching, nonempty passwords.")
        try:
            validate_password(password, user=user)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc
        try:
            with transaction.atomic():
                User.objects.create_user(email, password=password, role=user.role)
        except IntegrityError as exc:
            raise CommandError("Account creation conflicted with another write.") from exc
        self.stdout.write(self.style.SUCCESS("Application account created."))
