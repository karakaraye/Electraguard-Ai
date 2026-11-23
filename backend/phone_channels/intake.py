from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import INITIAL_ORGANISATION, Organisation
from reports.v1_views import persist_report

from .models import PhoneReporter


def public_organisation():
    return Organisation.objects.filter(pk=getattr(settings, "PUBLIC_INTAKE_ORGANISATION_ID", INITIAL_ORGANISATION)).first()


def paused(organisation):
    return organisation.intake_paused or not settings.OBSERVATION_INTAKE_ENABLED


@transaction.atomic
def create_report(organisation, phone_hash, channel, simulated, category, language, description, area, danger):
    details = {
        "kind": "incident", "channel": channel, "simulated": simulated, "language": language,
        "category_observer": category, "area": area, "danger_now": danger, "firsthand": None,
        "time_known": True, "access_barrier_details": [],
    }
    _, _, report = persist_report(
        None, organisation.pk,
        {"occurred_at": timezone.now(), "description": description, "incident_details": details},
    )
    PhoneReporter.objects.create(organisation=organisation, report=report, phone_hash=phone_hash)
    return report
