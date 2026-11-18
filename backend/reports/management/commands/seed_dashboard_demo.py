from datetime import datetime
from uuid import UUID

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User
from reports.models import Report, Triage
from reports.triage import METHOD_VERSION

REFERENCE = UUID("2a019572-8bf5-4bbc-adc2-38c4163e80ab")
LOCATION = "Fictional Cedar Training Hall"
DESCRIPTION = "Wheelchair users could not enter because a crate blocked the ramp."


class Command(BaseCommand):
    help = "Seed fictional accounts and a counterpart report for the local dashboard demo."

    @transaction.atomic
    def handle(self, *args, **options):
        call_command("seed_demo", stdout=self.stdout)
        observer = User.objects.get(email="observer@demo.example")
        report, _ = Report.objects.get_or_create(
            reference=REFERENCE,
            defaults={
                "observer": observer, "submission_key": REFERENCE,
                "occurred_at": datetime.fromisoformat("2026-03-12T09:00:00+01:00"),
                "location": LOCATION, "description": DESCRIPTION,
            },
        )
        if report.observer_id != observer.pk or report.location != LOCATION or report.description != DESCRIPTION:
            raise CommandError("The seed reference is already used by another report.")
        Triage.objects.get_or_create(report=report, defaults={"method_version": METHOD_VERSION})
        self.stdout.write(f"Counterpart report: {report.reference}")
