from uuid import uuid4

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.models import INITIAL_ORGANISATION, Organisation
from reports.models import Report, ReviewEvent, Triage
from reports.v1_views import receipt

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
    while True:
        try:
            with transaction.atomic():
                report = Report.objects.create(
                    organisation=organisation, submission_key=uuid4(), receipt_code=receipt(),
                    occurred_at=timezone.now(), description=description, incident_details=details,
                    location=next((area.get(key) for key in (
                        "polling_unit_name", "ward_name", "lga_name",
                    ) if area.get(key)), "")[:160],
                    polling_unit_code=area.get("polling_unit_code") or "",
                )
            break
        except IntegrityError as exc:
            if getattr(getattr(exc.__cause__, "diag", None), "constraint_name", None) != "reports_report_receipt_code_key":
                raise
    PhoneReporter.objects.create(organisation=organisation, report=report, phone_hash=phone_hash)
    ReviewEvent.objects.create(
        organisation=organisation, report=report, version=0, action=ReviewEvent.Action.CREATE,
        change={"to_status": "received", "channel": channel, "simulated": simulated},
    )
    Triage.objects.create(organisation=organisation, report=report, method_version="tfidf-lr-2026.13")
    return report
