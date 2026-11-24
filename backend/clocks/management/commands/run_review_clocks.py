import time
from django.core.management.base import BaseCommand
from django.utils import timezone

from clocks.sweep import sweep_review_clocks


class Command(BaseCommand):
    help = "Run regulatory review clock sweep across all open cases."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", default=True, help="Run sweep once and exit (default).")
        parser.add_argument("--loop", action="store_true", help="Run continuously in a loop.")
        parser.add_argument("--interval", type=int, default=60, help="Loop interval in seconds (default: 60).")

    def handle(self, *args, **options):
        loop = options.get("loop", False)
        interval = options.get("interval", 60)

        while True:
            now = timezone.now()
            res = sweep_review_clocks(now)
            self.stdout.write(
                f"[{now.isoformat()}] Review clocks swept: {res['total_overdue']} overdue ({res['newly_overdue']} newly overdue)"
            )
            if not loop:
                break
            time.sleep(interval)
