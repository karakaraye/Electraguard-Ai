from datetime import timedelta
from django.utils import timezone

from accounts.observer_auth import wat
from clocks.models import ReviewClock
from reports.models import Report, ReviewEvent

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
    """Matches Q-01 urgency.level: correction -> triage suggestion -> urgency_rules."""
    sug_urg = (report.review_suggestions or {}).get("urgency") or {}
    if sug_urg.get("corrected_value"):
        return str(sug_urg["corrected_value"]).lower()

    triage = getattr(report, "triage", None)
    if triage and triage.organisation_id == report.organisation_id and triage.status == "ready":
        s_urg = (triage.suggestions or {}).get("urgency", {}).get("value")
        if s_urg:
            return str(s_urg).lower()

    details = report.incident_details or {}
    if details.get("danger_now"):
        return "urgent"
    cat_obs = details.get("category_observer") or details.get("category")
    if cat_obs in ("intimidation_violence", "vote_buying"):
        return "high"
    return "normal"


def compute_clock_state(clock, now=None):
    """Pure, read-only calculation of clock JSON representation."""
    if clock is None:
        return None
    if now is None:
        now = timezone.now()

    if clock.stopped_at is not None or clock.state == ReviewClock.State.STOPPED:
        return {
            "target_minutes": clock.target_minutes,
            "due_at": wat(clock.due_at),
            "state": ReviewClock.State.STOPPED,
            "minutes_left": 0,
            "paused": False,
        }

    target_seconds = clock.target_minutes * 60
    effective_now = clock.paused_at if (clock.paused and clock.paused_at) else now
    elapsed_seconds = (effective_now - clock.started_at).total_seconds() - clock.paused_seconds
    remaining_seconds = target_seconds - elapsed_seconds
    minutes_left = int(round(remaining_seconds / 60.0))

    if remaining_seconds <= 0:
        state = ReviewClock.State.OVERDUE
    elif remaining_seconds <= 0.25 * target_seconds:
        state = ReviewClock.State.DUE_SOON
    else:
        state = ReviewClock.State.ON_TIME

    return {
        "target_minutes": clock.target_minutes,
        "due_at": wat(clock.due_at),
        "state": state,
        "minutes_left": minutes_left,
        "paused": clock.paused,
    }


def latest_clock_for_report(report):
    """Gets the active clock (or most recent clock) without writing to DB."""
    # Check prefetched clocks if available
    prefetched = getattr(report, "_prefetched_objects_cache", {}).get("clocks")
    if prefetched is not None:
        clocks_list = list(prefetched)
    else:
        clocks_list = list(ReviewClock.objects.filter(report=report))

    if not clocks_list:
        return None
    # Prefer open clock; otherwise most recently started
    open_clocks = [c for c in clocks_list if c.stopped_at is None]
    if open_clocks:
        return max(open_clocks, key=lambda c: c.started_at)
    return max(clocks_list, key=lambda c: c.started_at)


def clock_json(report, now=None):
    """Pure read-only clock payload for Q-01 and CASE-01."""
    clock = latest_clock_for_report(report)
    if clock is None:
        return None
    return compute_clock_state(clock, now=now)


def create_initial_clock(report, now=None):
    """Creates the initial first_action clock at server received time (created_at).

    If the report already has a reviewer action (pre-deploy backfill), creates it stopped.
    """
    if now is None:
        now = timezone.now()

    existing = ReviewClock.objects.filter(report=report, kind=ReviewClock.Kind.FIRST_ACTION).first()
    if existing is not None:
        return existing

    org = getattr(report, "organisation", None)
    targets = get_review_targets(org)
    urgency = resolve_urgency(report)
    target_minutes = targets.get(urgency, DEFAULT_TARGETS.get(urgency, 240))

    started_at = report.created_at or now
    due_at = started_at + timedelta(minutes=target_minutes)

    first_action = ReviewEvent.objects.filter(
        report=report,
        action__in=(
            ReviewEvent.Action.START,
            ReviewEvent.Action.REQUEST_CLARIFICATION,
            ReviewEvent.Action.CLOSE,
            ReviewEvent.Action.WITHDRAW,
        ),
    ).order_by("created_at").first()

    is_closed_or_active = report.status != Report.Status.SUBMITTED or first_action is not None
    stopped_at = (first_action.created_at if first_action else now) if is_closed_or_active else None
    initial_state = ReviewClock.State.STOPPED if stopped_at is not None else ReviewClock.State.ON_TIME

    return ReviewClock.objects.create(
        organisation_id=report.organisation_id,
        report=report,
        kind=ReviewClock.Kind.FIRST_ACTION,
        urgency=urgency,
        target_minutes=target_minutes,
        started_at=started_at,
        due_at=due_at,
        state=initial_state,
        stopped_at=stopped_at,
    )


def start_question_reply_clock(report, now=None):
    """Starts a question_reply clock when an observer/citizen replies to a question."""
    if now is None:
        now = timezone.now()
    # Stop any open clock first
    stop_open_clocks(report, now=now)

    org = getattr(report, "organisation", None)
    targets = get_review_targets(org)
    target_minutes = targets.get("question_reply", 120)
    urgency = resolve_urgency(report)

    return ReviewClock.objects.create(
        organisation_id=report.organisation_id,
        report=report,
        kind=ReviewClock.Kind.QUESTION_REPLY,
        urgency=urgency,
        target_minutes=target_minutes,
        started_at=now,
        due_at=now + timedelta(minutes=target_minutes),
        state=ReviewClock.State.ON_TIME,
    )


def stop_open_clocks(report, now=None):
    """Stops all open clocks on a report."""
    if now is None:
        now = timezone.now()
    ReviewClock.objects.filter(report=report, stopped_at__isnull=True).update(
        stopped_at=now,
        state=ReviewClock.State.STOPPED,
    )


def update_clock_urgency(report, urgency_level, now=None):
    """Recomputes target_minutes and due_at from original started_at when urgency changes."""
    if now is None:
        now = timezone.now()
    org = getattr(report, "organisation", None)
    targets = get_review_targets(org)
    level = str(urgency_level).lower()
    target_minutes = targets.get(level, DEFAULT_TARGETS.get(level, 240))

    open_clocks = ReviewClock.objects.filter(
        report=report,
        kind=ReviewClock.Kind.FIRST_ACTION,
        stopped_at__isnull=True,
    )
    for clock in open_clocks:
        clock.urgency = level
        clock.target_minutes = target_minutes
        clock.due_at = clock.started_at + timedelta(minutes=target_minutes, seconds=clock.paused_seconds)
        state_info = compute_clock_state(clock, now=now)
        clock.state = state_info["state"]
        clock.save(update_fields=["urgency", "target_minutes", "due_at", "state"])


def recompute_org_open_clocks(organisation, now=None):
    """Recomputes due_at and state on all open clocks in an organisation when ADM-04 targets change."""
    if now is None:
        now = timezone.now()
    targets = get_review_targets(organisation)
    for clock in ReviewClock.objects.filter(organisation=organisation, stopped_at__isnull=True):
        if clock.kind == ReviewClock.Kind.QUESTION_REPLY:
            new_target = targets.get("question_reply", 120)
        else:
            new_target = targets.get(clock.urgency, DEFAULT_TARGETS.get(clock.urgency, 240))
        clock.target_minutes = new_target
        clock.due_at = clock.started_at + timedelta(minutes=new_target, seconds=clock.paused_seconds)
        clock.state = compute_clock_state(clock, now=now)["state"]
        clock.save(update_fields=["target_minutes", "due_at", "state"])
