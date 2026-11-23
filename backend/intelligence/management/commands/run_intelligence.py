from django.core.management.base import BaseCommand

from intelligence.triage import process_next


class Command(BaseCommand):
    help = "Process pending v1 incident triage jobs locally."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        count = 0
        for _ in range(options["limit"]):
            if not process_next():
                break
            count += 1
        self.stdout.write(f"Processed {count} triage jobs.")
