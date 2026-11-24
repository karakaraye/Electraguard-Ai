from datetime import timedelta
from django.utils import timezone

from accounts.observer_auth import wat
from clocks.models import ReviewClock
from reports.models import Report

DEFAULT_TARGETS = {
    "urgent": 15,
    "high": 60,
    "normal": 240,
    "low": 480,
    "question_reply": 120,
}


def get_review_targets(org):
    if not org:
        return dict(DEFAULT_TARGETS)
    targets = getattr(org, "review_targets", None) or {}
    return {
        "urgent": targets.get("urgent", DEFAULT_TARGETS["urgent"]),
        "high": targets.get("high", DEFAULT_TARGETS["high"]),
        "normal": targets.get("normal", DEFAULT_TARGETS["normal"]),
        "low": targets.get("low", DEFAULT_TARGETS["low"]),
        "question_reply": targets.get("question_reply", DEFAULT_TARGETS["question_reply"]),
    }


def resolve_urgency(report):
    details = report.incident_details or {}
    if details.get("danger_now"):
        return "urgent"
    cat_obs = details.get("category_observer") or details.get("category")
    if cat_obs in ("intimidation_violence", "vote_buying"):
        return "high"
    triage = getattr(report, "triage", None)
    if triage and getattr(triage, "suggested_urgency", None):
        return triage.suggested_urgency.lower()
    if details.get("urgency"):
        return str(details["urgency"]).lower()
    return "normal"


def get_or_create_clock(report, now=None):
    if now is None:
        now = timezone.now()
    clock = getattr(report, "clock", None)
    if clock is not None:
        return clock

    clock = ReviewClock.objects.filter(report=report).first()
    if clock is not None:
        return clock

    org = getattr(report, "organisation", None)
    targets = get_review_targets(org)
    urgency = resolve_urgency(report)
    target_minutes = targets.get(urgency, DEFAULT_TARGETS.get(urgency, 240))

    started_at = report.occurred_at or report.created_at or now
    due_at = started_at + timedelta(minutes=target_minutes)

    clock = ReviewClock.objects.create(
        organisation=org,
        report=report,
        urgency=urgency,
        target_minutes=target_minutes,
        started_at=started_at,
        due_at=due_at,
        state=ReviewClock.State.ON_TIME,
        paused=(report.status == Report.Status.NEEDS_CLARIFICATION),
        paused_at=now if report.status == Report.Status.NEEDS_CLARIFICATION else None,
        stopped_at=now if report.status in (Report.Status.CLOSED, Report.Status.WITHDRAWN) else None,
    )
    return clock


def clock_json(report, now=None):
    if now is None:
        now = timezone.now()
    clock = get_or_create_clock(report, now)

    target_minutes = clock.target_minutes
    due_at = clock.due_at
    paused = clock.paused
    target_seconds = target_minutes * 60

    if clock.stopped_at:
        # Clock has finished
        state = clock.state if clock.state != ReviewClock.State.STOPPED else ReviewClock.State.ON_TIME
        minutes_left = 0
    else:
        effective_now = clock.paused_at if (paused and clock.paused_at) else now
        elapsed_seconds = (effective_now - clock.started_at).total_seconds() - clock.paused_seconds
        remaining_seconds = target_seconds - elapsed_seconds
        minutes_left = max(0, int(round(remaining_seconds / 60.0)))

        if remaining_seconds <= 0:
            state = ReviewClock.State.OVERDUE
        elif remaining_seconds <= 0.25 * target_seconds:
            state = ReviewClock.State.DUE_SOON
        else:
            state = ReviewClock.State.ON_TIME

        # Sync back to model if state changed
        if clock.state != state:
            clock.state = state
            clock.save(update_fields=["state"])

    return {
        "target_minutes": target_minutes,
        "due_at": wat(due_at),
        "state": state,
        "minutes_left": minutes_left,
        "paused": paused,
    }


def pause_clock(report, now=None):
    if now is None:
        now = timezone.now()
    clock = get_or_create_clock(report, now)
    if not clock.paused and not clock.stopped_at:
        clock.paused = True
        clock.paused_at = now
        clock.save(update_fields=["paused", "paused_at"])


def resume_clock(report, now=None):
    if now is None:
        now = timezone.now()
    clock = get_or_create_clock(report, now)
    if clock.paused and not clock.stopped_at:
        pause_duration = int((now - clock.paused_at).total_seconds()) if clock.paused_at else 0
        clock.paused_seconds += max(0, pause_duration)
        clock.paused = False
        clock.paused_at = None
        clock.due_at = clock.started_at + timedelta(minutes=clock.target_minutes, seconds=clock.paused_seconds)
        clock.save(update_fields=["paused", "paused_at", "paused_seconds", "due_at"])


def stop_clock(report, now=None):
    if now is None:
        now = timezone.now()
    clock = get_or_create_clock(report, now)
    if not clock.stopped_at:
        clock.stopped_at = now
        # Determine final state at moment of stop
        target_seconds = clock.target_minutes * 60
        effective_now = clock.paused_at if clock.paused and clock.paused_at else now
        elapsed = (effective_now - clock.started_at).total_seconds() - clock.paused_seconds
        if elapsed > target_seconds:
            clock.state = ReviewClock.State.OVERDUE
        elif (target_seconds - elapsed) <= 0.25 * target_seconds:
            clock.state = ReviewClock.State.DUE_SOON
        else:
            clock.state = ReviewClock.State.ON_TIME
        clock.save(update_fields=["stopped_at", "state"])
