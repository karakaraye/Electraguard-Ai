from django.core.management.base import BaseCommand
from django.db import transaction

from clocks.calculator import create_initial_clock
from clocks.models import ReviewClock
from reports.models import Report


class Command(BaseCommand):
    help = "Backfill review clocks for existing reports (creating already-acted cases as stopped)."

    def add_arguments(self, parser):
        parser.add_argument("--batch-size", type=int, default=500, help="Batch size (default: 500).")

    def handle(self, *args, **options):
        batch_size = options["batch_size"]
        existing_report_ids = ReviewClock.objects.values_list("report_id", flat=True)
        base_qs = Report.objects.exclude(pk__in=existing_report_ids).select_related("organisation", "triage").order_by("pk")

        created_count = 0
        last_pk = None
        while True:
            qs = base_qs.filter(pk__gt=last_pk) if last_pk is not None else base_qs
            batch = list(qs[:batch_size])
            if not batch:
                break
            with transaction.atomic():
                for report in batch:
                    create_initial_clock(report)
                    created_count += 1
                    last_pk = report.pk

        self.stdout.write(self.style.SUCCESS(f"Backfilled {created_count} review clock(s)."))
