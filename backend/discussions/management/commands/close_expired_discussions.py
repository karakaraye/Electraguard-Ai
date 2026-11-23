from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from discussions.models import Discussion, ModerationAction


class Command(BaseCommand):
    help = "Close expired discussions and record each closure."

    @transaction.atomic
    def handle(self, **options):
        expired = Discussion.objects.select_for_update().filter(closed=False, closes_at__lte=timezone.now())
        count = 0
        for discussion in expired.iterator():
            discussion.closed = True
            discussion.save(update_fields=["closed"])
            ModerationAction.objects.create(discussion=discussion, action="auto_close")
            count += 1
        self.stdout.write(f"Closed {count} discussions.")
