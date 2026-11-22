from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from reports.media_lifecycle import retire_upload
from reports.media_storage import flush_deletion
from reports.models import MediaBlobDeletion, Report, UploadSession


class Command(BaseCommand):
    help = "Expire private upload sessions and retry queued blob deletions."

    def handle(self, *args, **options):
        now = timezone.now()
        pending = UploadSession.objects.filter(status=UploadSession.Status.OPEN, expires_at__lte=now)
        for upload_id, report_id in pending.values_list("pk", "report_id").iterator():
            with transaction.atomic():
                if not Report.objects.select_for_update(no_key=True).filter(pk=report_id).first():
                    continue
                upload = pending.filter(pk=upload_id).first()
                if upload:
                    retire_upload(upload, UploadSession.Status.EXPIRED)

        for pk in MediaBlobDeletion.objects.values_list("pk", flat=True).iterator():
            flush_deletion(pk)
