from django.core.management.base import BaseCommand

from accounts.models import Organisation
from staff.retention import purge


class Command(BaseCommand):
    help = "Delete expired observation records according to each organisation's retention settings."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        for organisation_id in Organisation.objects.values_list("pk", flat=True).iterator():
            counts = purge(organisation_id, dry_run=options["dry_run"])
            summary = ", ".join(f"{label}={count}" for label, count in counts.items())
            self.stdout.write(f"{organisation_id} {summary}")
