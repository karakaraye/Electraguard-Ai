from django.core.management.base import BaseCommand
from django.utils import timezone

from reports.models import OcrRead


class Command(BaseCommand):
    help = "Delete result-sheet photos read before reporting once their 24 hour hold has passed."

    def handle(self, *args, **options):
        deleted, _ = OcrRead.objects.filter(expires_at__lte=timezone.now()).delete()
        self.stdout.write(f"Deleted {deleted} expired photo reads.")
