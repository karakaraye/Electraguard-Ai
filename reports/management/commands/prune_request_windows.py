from time import time

from django.core.management.base import BaseCommand

from reports.models import RequestWindow


class Command(BaseCommand):
    help = "Remove expired request counters and their per-window client digests."

    def handle(self, *args, **options):
        count, _ = RequestWindow.objects.filter(expires_at__lt=int(time()) - 60).delete()
        self.stdout.write(f"Removed {count} expired request counters.")
