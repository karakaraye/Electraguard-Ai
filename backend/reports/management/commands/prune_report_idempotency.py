from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from reports.models import AssignmentBatch, Report, ReportIdempotency


class Command(BaseCommand):
    help = "Delete expired report idempotency entries while preserving withdrawn receipt stubs."

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=30)
        count, _ = ReportIdempotency.objects.filter(created_at__lt=cutoff).exclude(report__status=Report.Status.WITHDRAWN).delete()
        self.stdout.write(f"Removed {count} expired report idempotency records.")
        batches, _ = AssignmentBatch.objects.filter(created_at__lt=cutoff).delete()
        self.stdout.write(f"Removed {batches} expired assignment batches.")
