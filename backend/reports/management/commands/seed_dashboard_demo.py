from datetime import datetime
from hashlib import sha256
from pathlib import Path
from uuid import UUID

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User
from reports.models import Evidence, Report, Triage
from reports.triage import METHOD_VERSION
from reports.workflow import Action, record_change, transition

REFERENCE = UUID("2a019572-8bf5-4bbc-adc2-38c4163e80ab")
LOCATION = "Fictional Cedar Training Hall"
DESCRIPTION = "Wheelchair users could not enter because a crate blocked the ramp."
FALLBACK_REFERENCE = UUID("ce44bf7d-ffb2-4533-93e9-7c4451f89126")


class Command(BaseCommand):
    help = "Seed fictional accounts and a counterpart report for the local dashboard demo."

    def add_arguments(self, parser):
        parser.add_argument("--fallback", action="store_true", help="Add a completed fictional case to a separate empty database.")

    @transaction.atomic
    def handle(self, *args, **options):
        if options["fallback"] and Report.objects.exists():
            raise CommandError("Use a separate empty fictional database for the pre-seeded fallback.")
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
        if options["fallback"]:
            self.seed_fallback(observer)

    def seed_fallback(self, observer):
        reviewer = User.objects.get(email="reviewer@demo.example")
        administrator = User.objects.get(email="administrator@demo.example")
        report = Report.objects.create(
            reference=FALLBACK_REFERENCE, submission_key=FALLBACK_REFERENCE, observer=observer,
            occurred_at=datetime.fromisoformat("2026-03-12T09:05:00+01:00"),
            location=LOCATION, description="A crate blocked the ramp and wheelchair users could not enter.",
            assigned_reviewer=reviewer,
        )
        evidence = Path(__file__).resolve().parents[4] / "demo" / "synthetic-evidence.png"
        content = evidence.read_bytes()
        Evidence.objects.create(
            report=report, name=evidence.name, content=content, content_type="image/png",
            sha256=sha256(content).hexdigest(),
        )
        Triage.objects.create(report=report, method_version=METHOD_VERSION)
        record_change(report, administrator, Action.ASSIGN, {
            "previous_reviewer": None, "reviewer": reviewer.email,
        }, "assigned_reviewer")
        transition(report, reviewer, Action.START, {})
        transition(report, reviewer, Action.REQUEST_CLARIFICATION, {"note": "Which entrance was blocked?"})
        transition(report, observer, Action.RESPOND, {"note": "The east entrance ramp."})
        transition(report, reviewer, Action.CLOSE, {
            "outcome": Report.Outcome.CORROBORATED,
            "note": "The fictional illustration and clarification support the account of a blocked east entrance ramp.",
        })
        self.stdout.write(f"Pre-seeded fictional case: {report.reference}")
