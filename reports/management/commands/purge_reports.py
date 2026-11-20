from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from reports.models import Report


class Command(BaseCommand):
    help = "Count or purge reports older than an approved retention window."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, required=True)
        parser.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        days = options["days"]
        if not 2 <= days <= 36500:
            raise CommandError("Choose a retention period between 2 and 36500 days.")
        cutoff = timezone.now() - timedelta(days=days)
        reports = Report.objects.filter(received_at__lt=cutoff)
        if not options["apply"]:
            self.stdout.write(f"{reports.count()} reports eligible before {cutoff.isoformat()}.")
            return
        with transaction.atomic():
            _, counts = reports.delete()
        self.stdout.write(f"Purged {counts.get('reports.Report', 0)} reports before {cutoff.isoformat()}.")
