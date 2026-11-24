from django.core.management.base import BaseCommand
from django.utils import timezone

from staff.models import CodeRequest


class Command(BaseCommand):
    help = "Remove expired observer card replay ciphertext."

    def handle(self, *args, **options):
        count = CodeRequest.objects.filter(
            expires_at__lte=timezone.now(), encrypted__isnull=False,
        ).update(encrypted=None)
        self.stdout.write(f"Cleared {count} expired card replays.")
