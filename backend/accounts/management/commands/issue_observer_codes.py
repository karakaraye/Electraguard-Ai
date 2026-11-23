from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import INITIAL_ORGANISATION, Organisation
from accounts.observer_credentials import issue_code


class Command(BaseCommand):
    help = "Issue observer codes and print their one-time setup PINs once."

    def add_arguments(self, parser):
        parser.add_argument("--count", type=int, required=True)
        parser.add_argument("--label", required=True)
        parser.add_argument("--organisation", default=str(INITIAL_ORGANISATION))

    def handle(self, *args, **options):
        count = options["count"]
        label = options["label"].strip()
        if not 1 <= count <= 500 or not 1 <= len(label) <= 80 or not label.isprintable():
            raise CommandError("Use a count from 1 to 500 and a printable label of 1 to 80 characters.")
        cards = self.issue(options["organisation"], count, label)
        for code, pin in cards:
            self.stdout.write(f"{code} {pin}")

    @transaction.atomic
    def issue(self, organisation_id, count, label):
        try:
            organisation = Organisation.objects.select_for_update().get(pk=organisation_id)
        except (Organisation.DoesNotExist, ValidationError) as exc:
            raise CommandError("No matching organisation.") from exc
        cards = []
        for _ in range(count):
            credential, pin = issue_code(organisation, label)
            cards.append((credential.code, pin))
        return cards
