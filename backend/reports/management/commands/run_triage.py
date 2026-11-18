from time import sleep

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from reports.models import Triage
from reports.triage import METHOD_VERSION, process_next


class Command(BaseCommand):
    help = "Process advisory triage jobs in a background worker."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Drain pending jobs and exit.")
        parser.add_argument("--retry-failed", action="store_true", help="Requeue failed jobs on startup.")

    def handle(self, *args, **options):
        if options["retry_failed"]:
            Triage.objects.filter(status=Triage.Status.FAILED, method_version=METHOD_VERSION).update(
                status=Triage.Status.PENDING
            )

        counts = {Triage.Status.READY: 0, Triage.Status.FAILED: 0}
        while True:
            status = process_next()
            if status is not None:
                counts[status] += 1
                if status == Triage.Status.FAILED:
                    self.stderr.write("A triage job failed. Manual review remains available.")
            elif options["once"]:
                self.stdout.write(f"Ready: {counts[Triage.Status.READY]}. Failed: {counts[Triage.Status.FAILED]}.")
                return
            else:
                sleep(2)
                close_old_connections()
