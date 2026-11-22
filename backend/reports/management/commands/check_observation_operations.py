import json

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count, Min, Q
from django.utils.timezone import now

from reports.models import Triage


class Command(BaseCommand):
    help = "Report privacy-safe operational counts and evaluate operator-supplied triage thresholds."

    def add_arguments(self, parser):
        parser.add_argument("--alert-pending-age-seconds", type=int)
        parser.add_argument("--alert-failed-count", type=int)

    def handle(self, *args, **options):
        max_age = options["alert_pending_age_seconds"]
        failed_limit = options["alert_failed_count"]
        if any(limit is not None and limit < 1 for limit in (max_age, failed_limit)):
            raise CommandError("Alert thresholds must be positive integers.")

        pending = Q(status=Triage.Status.PENDING)
        counts = Triage.objects.aggregate(
            pending=Count("pk", filter=pending),
            ready=Count("pk", filter=Q(status=Triage.Status.READY)),
            failed=Count("pk", filter=Q(status=Triage.Status.FAILED)),
            oldest_pending=Min("report__created_at", filter=pending),
        )
        oldest = counts.pop("oldest_pending")
        age = max(0, int((now() - oldest).total_seconds())) if oldest is not None else None
        alerts = []
        if max_age is not None and age is not None and age >= max_age:
            alerts.append("triage_pending_age")
        if failed_limit is not None and counts["failed"] >= failed_limit:
            alerts.append("triage_failed_count")
        self.stdout.write(json.dumps({
            "intake_enabled": settings.OBSERVATION_INTAKE_ENABLED,
            "triage": {**counts, "oldest_pending_report_age_seconds": age},
            "alerts": alerts,
        }))
        if alerts:
            raise CommandError("An observation operations threshold was reached.")
