from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import Organisation
from ops.clusters import detect


class Command(BaseCommand):
    help = "Evaluate the current sliding window for observation clusters."

    def handle(self, *args, **options):
        now = timezone.now()
        for organisation_id in Organisation.objects.values_list("pk", flat=True).iterator():
            detect(organisation_id, now)
