from django.db import transaction
from django.utils import timezone

from clocks.calculator import compute_clock_state
from clocks.models import ReviewClock
from reports.models import Report
from security.models import Alert
from staff.audit import record


def sweep_review_clocks(now=None):
    """Evaluates open review clocks atomically, updating state and notifying coordinators once when overdue."""
    if now is None:
        now = timezone.now()

    clock_ids = list(
        ReviewClock.objects.filter(stopped_at__isnull=True).values_list("pk", flat=True)
    )

    newly_overdue = 0
    total_overdue = 0

    for clock_id in clock_ids:
        with transaction.atomic():
            clock = (
                ReviewClock.objects.select_for_update(skip_locked=True)
                .select_related("report", "organisation")
                .filter(pk=clock_id, stopped_at__isnull=True)
                .first()
            )
            if clock is None:
                continue

            report = clock.report
            if report.status in (Report.Status.CLOSED, Report.Status.WITHDRAWN):
                clock.stopped_at = now
                clock.state = ReviewClock.State.STOPPED
                clock.save(update_fields=["stopped_at", "state"])
                continue

            computed = compute_clock_state(clock, now=now)
            new_state = computed["state"]

            if clock.state != new_state:
                clock.state = new_state
                clock.save(update_fields=["state"])

            if new_state == ReviewClock.State.OVERDUE:
                total_overdue += 1
                if clock.notified_at is None:
                    updated = ReviewClock.objects.filter(
                        pk=clock.pk,
                        notified_at__isnull=True,
                    ).update(notified_at=now)
                    if updated == 1:
                        newly_overdue += 1
                        if clock.organisation_id:
                            Alert.objects.get_or_create(
                                organisation_id=clock.organisation_id,
                                rule="review_clock_overdue",
                                subject_key=f"clock:{clock.pk}",
                                status="open",
                                defaults={
                                    "severity": "high" if clock.urgency == "urgent" else "medium",
                                    "subject_type": "report",
                                    "subject_label": f"Overdue {clock.kind} ({clock.urgency}) case {report.receipt_code}"[:254],
                                    "details": {
                                        "report_id": str(report.pk),
                                        "clock_id": str(clock.pk),
                                        "kind": clock.kind,
                                        "urgency": clock.urgency,
                                        "target_minutes": clock.target_minutes,
                                        "minutes_left": computed["minutes_left"],
                                    },
                                    "detector": "clock",
                                },
                            )
                            record(clock.organisation_id, "case.overdue", "report", str(report.pk))

    return {"total_overdue": total_overdue, "newly_overdue": newly_overdue}
