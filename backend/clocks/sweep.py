from django.utils import timezone
from clocks.models import ReviewClock
from reports.models import Report
from staff.audit import record


def sweep_review_clocks(now=None):
    """Evaluates all open review clocks, updating their state and notifying coordinators once when overdue."""
    if now is None:
        now = timezone.now()

    open_clocks = ReviewClock.objects.filter(
        stopped_at__isnull=True,
    ).select_related("report", "organisation")

    newly_overdue = 0
    total_overdue = 0

    for clock in open_clocks.iterator():
        report = clock.report
        # If report is closed or withdrawn, stop the clock
        if report.status in (Report.Status.CLOSED, Report.Status.WITHDRAWN):
            clock.stopped_at = now
            clock.save(update_fields=["stopped_at"])
            continue

        target_seconds = clock.target_minutes * 60
        effective_now = clock.paused_at if (clock.paused and clock.paused_at) else now
        elapsed_seconds = (effective_now - clock.started_at).total_seconds() - clock.paused_seconds
        remaining_seconds = target_seconds - elapsed_seconds

        if remaining_seconds <= 0:
            new_state = ReviewClock.State.OVERDUE
            total_overdue += 1
        elif remaining_seconds <= 0.25 * target_seconds:
            new_state = ReviewClock.State.DUE_SOON
        else:
            new_state = ReviewClock.State.ON_TIME

        fields_to_update = []
        if clock.state != new_state:
            clock.state = new_state
            fields_to_update.append("state")

        if new_state == ReviewClock.State.OVERDUE and not clock.notified_at:
            clock.notified_at = now
            fields_to_update.append("notified_at")
            newly_overdue += 1
            if clock.organisation_id:
                record(clock.organisation_id, "case.overdue", "report", clock.report_id)

        if fields_to_update:
            clock.save(update_fields=fields_to_update)

    return {"total_overdue": total_overdue, "newly_overdue": newly_overdue}
