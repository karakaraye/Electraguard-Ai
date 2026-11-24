import time
from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import Organisation
from ops.emerging import detect_emerging


class Command(BaseCommand):
    help = "Run emerging issue alerts detection for unusual report volumes."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", default=True, help="Run detection once and exit (default).")
        parser.add_argument("--loop", action="store_true", help="Run in a loop every interval seconds.")
        parser.add_argument("--interval", type=int, default=300, help="Loop interval in seconds (default: 300).")
        parser.add_argument("--org", type=str, help="Specific organisation ID to run detection for.")

    def handle(self, *args, **options):
        org_filter = options.get("org")
        loop = options.get("loop", False)
        interval = options.get("interval", 300)

        while True:
            now = timezone.now()
            org_qs = Organisation.objects.all()
            if org_filter:
                org_qs = org_qs.filter(pk=org_filter)

            total_alerts = 0
            for org_id in org_qs.values_list("pk", flat=True).iterator():
                alerts = detect_emerging(org_id, now)
                total_alerts += len(alerts)

            self.stdout.write(f"[{now.isoformat()}] Emerging alerts evaluation complete: {total_alerts} active alert(s)")

            if not loop:
                break
            time.sleep(interval)
