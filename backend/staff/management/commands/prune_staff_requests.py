from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from publicdata.models import SnapshotRequest
from rumours.models import ClaimRequest
from staff.models import AssignmentRequest, CodeRequest


class Command(BaseCommand):
    help = "Remove expired printable PIN replay data and old staff request records."

    def handle(self, *args, **options):
        now = timezone.now()
        CodeRequest.objects.filter(expires_at__lte=now, encrypted__isnull=False).update(encrypted=None)
        for model in (AssignmentRequest, ClaimRequest, CodeRequest, SnapshotRequest):
            model.objects.filter(created_at__lt=now - timedelta(days=30)).delete()
