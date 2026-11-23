from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from accounts.models import Organisation
from staff.audit import record

from ...aggregate import latest_cutoff
from ...models import Schedule
from ...views import COORDINATORS, create_snapshot, publish


@transaction.atomic
def publish_due(organisation_id, now):
    organisation = Organisation.objects.select_for_update(no_key=True).get(pk=organisation_id)
    schedule = Schedule.objects.select_related("approver").filter(
        organisation=organisation, hourly=True,
    ).first()
    if schedule is None:
        return
    if schedule.last_attempt_at and schedule.last_attempt_at > now - timedelta(hours=1):
        return
    approver = schedule.approver
    schedule.last_attempt_at = now
    if (approver is None or not approver.is_active or not COORDINATORS.intersection(approver.effective_roles)
            or approver.organisation_id != organisation.id or organisation.public_delay_minutes < 60):
        schedule.hourly = False
        schedule.approver = None
        schedule.version += 1
        schedule.save(update_fields=["hourly", "approver", "version", "last_attempt_at"])
        record(
            organisation_id, "disable_publish_schedule", "organisation", organisation_id,
            version=schedule.version,
        )
        return
    snapshot = create_snapshot(organisation, approver, latest_cutoff(organisation, now))
    publish(snapshot, approver, automatic=True)
    schedule.save(update_fields=["last_attempt_at"])


class Command(BaseCommand):
    help = "Process enabled hourly public snapshot schedules."

    def handle(self, *args, **options):
        now = timezone.now()
        for organisation_id in Schedule.objects.filter(hourly=True).values_list("organisation_id", flat=True):
            publish_due(organisation_id, now)
