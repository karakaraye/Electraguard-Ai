from datetime import timedelta

from django.apps import apps
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import Organisation

from .audit import record


def expired_records(organisation, days, *, now=None):
    cutoff = (now or timezone.now()) - timedelta(days=days)
    model_fields = {
        "reports.Evidence": "created_at",
        **getattr(settings, "OBSERVATION_RETENTION_MODELS", {}),
        "reports.Report": "created_at",
    }
    for label, age_field in model_fields.items():
        model = apps.get_model(label)
        yield label, model._base_manager.filter(
            organisation_id=organisation.pk, **{f"{age_field}__lt": cutoff},
        )


@transaction.atomic
def purge(organisation_id, *, dry_run=False):
    organisation = Organisation.objects.select_for_update(no_key=True).get(pk=organisation_id)
    counts = {}
    for label, records in expired_records(organisation, organisation.retention_days):
        counts[label] = records.count()
        if not dry_run and counts[label]:
            records.delete()
    if not dry_run and any(counts.values()):
        record(organisation_id, "retention_purge", "organisation", organisation_id, content=counts)
    return counts
