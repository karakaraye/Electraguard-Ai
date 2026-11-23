from time import sleep

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from reports.media_av.worker import process_next


class Command(BaseCommand):
    help = "Re-encode video and voice notes, blur faces and write transcripts in a background worker."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Drain waiting media and exit.")

    def handle(self, *args, **options):
        counts = {"ready": 0, "failed": 0, "retry": 0}
        while True:
            status = process_next()
            if status in counts:
                counts[status] += 1
                if status == "failed":
                    self.stderr.write("A media item could not be processed. Its report is unaffected.")
            elif status is None and options["once"]:
                self.stdout.write(f"Ready: {counts['ready']}. Failed: {counts['failed']}. Retried: {counts['retry']}.")
                return
            elif status is None:
                sleep(2)
                close_old_connections()
