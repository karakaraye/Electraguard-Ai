from collections import Counter
from datetime import timedelta

from django.db.models import OuterRef, Subquery

from accounts.observer_auth import wat
from reports.incident_input import CATEGORIES
from reports.models import Report, ReviewEvent
from staff.audit import head
from staff.fields import observed_category
from staff.models import AuditEvent


K = 5


def cell(count, suppressed=False):
    if count is None or count < K or suppressed:
        return {"count": None, "suppressed": True}
    return {"count": count, "suppressed": False}


def complementary(counts, hidden):
    """Hide the smallest visible cell until the hidden cells of a line sum to K or more.

    A line with at least two hidden zero cells needs no further masking.
    """
    while True:
        secret = [counts[key] for key in hidden if key in counts]
        if not secret or (len(secret) >= 2 and (not any(secret) or sum(secret) >= K)):
            return
        visible = sorted((value, key) for key, value in counts.items() if key not in hidden)
        if not visible:
            return
        hidden.add(visible[0][1])


def series(counts):
    hidden = {key for key, value in counts.items() if value < K}
    complementary(counts, hidden)
    return {key: cell(value, key in hidden) for key, value in counts.items()}


def matrix(counts, states):
    hidden = {key for key, count in counts.items() if count < K}
    while True:
        previous = len(hidden)
        for state in states:
            complementary({(state, cat): counts[state, cat] for cat in CATEGORIES}, hidden)
        for cat in CATEGORIES:
            complementary({(state, cat): counts[state, cat] for state in states}, hidden)
        if len(hidden) == previous:
            return hidden


def build(snapshot):
    org = snapshot.organisation
    closure = ReviewEvent.objects.filter(
        organisation=org, report_id=OuterRef("pk"), action=ReviewEvent.Action.CLOSE,
    ).order_by("-version").values("change__outcome")
    reports = Report.objects.filter(organisation=org).annotate(closed_outcome=Subquery(closure[:1]))
    excluded = dict.fromkeys(("not_closed", "withdrawn", "after_cutoff", "other_kinds"), 0)
    states = {}
    counts, state_totals, outcomes, timeline = Counter(), Counter(), Counter(), Counter()
    for row in reports.values("status", "incident_details", "occurred_at", "closed_outcome").iterator():
        details = row["incident_details"]
        area = details.get("area", {})
        category = observed_category(details)
        if row["status"] == Report.Status.WITHDRAWN:
            excluded["withdrawn"] += 1
        elif details.get("kind", "incident") != "incident" or category not in CATEGORIES or not area.get("state_code"):
            excluded["other_kinds"] += 1
        elif row["status"] != Report.Status.CLOSED:
            excluded["not_closed"] += 1
        elif row["occurred_at"] is None or row["occurred_at"] >= snapshot.cutoff:
            excluded["after_cutoff"] += 1
        elif row["closed_outcome"] not in Report.Outcome.values:
            excluded["not_closed"] += 1
        else:
            state = area["state_code"]
            states[state] = area.get("state_name") or state
            counts[state, category] += 1
            state_totals[state] += 1
            outcomes[row["closed_outcome"]] += 1
            timeline[row["occurred_at"].replace(minute=0, second=0, microsecond=0)] += 1
    counts = {(state, category): counts[state, category] for state in states for category in CATEGORIES}
    hidden = matrix(counts, states)
    masked_states = series(state_totals)
    masked_outcomes = series({outcome: outcomes[outcome] for outcome in Report.Outcome.values})
    masked_timeline = series(timeline)
    total = sum(state_totals.values())
    total_cell = cell(total)
    dependencies = (masked_states, masked_outcomes, masked_timeline)
    if any(sum(item["suppressed"] for item in dimension.values()) == 1 for dimension in dependencies):
        total_cell = cell(None)
        masked_outcomes = {key: cell(None) for key in masked_outcomes}
    snapshot.preview = {
        "organisation": {"id": str(org.pk), "name": org.name},
        "snapshot_id": str(snapshot.pk), "published_at": None, "cutoff": wat(snapshot.cutoff),
        "delay_minutes": org.public_delay_minutes, "total": total_cell,
        "by_state": [
            {
                "state_code": state, "state_name": states[state], "total": masked_states[state],
                "by_category": {cat: cell(counts[state, cat], (state, cat) in hidden) for cat in CATEGORIES},
            }
            for state in sorted(states)
        ],
        "outcomes": [
            {"outcome": key, **value, "share_percent": (
                round(100 * value["count"] / total, 1) if not value["suppressed"] else None
            )}
            for key, value in masked_outcomes.items()
        ],
        "timeline": [{"hour_start": wat(hour), "count": masked_timeline[hour]} for hour in sorted(timeline)],
        "audit_chain_head": head(AuditEvent.objects.filter(organisation=org).last()),
    }
    snapshot.excluded = excluded


def latest_cutoff(organisation, now):
    return now - timedelta(minutes=organisation.public_delay_minutes)


def sum_cells(cells):
    return cell(None) if any(item is None or item["suppressed"] for item in cells) else cell(
        sum(item["count"] for item in cells)
    )


def combined(snapshots):
    if len(snapshots) < 2:
        return None
    states = [{row["state_code"]: row for row in item["by_state"]} for item in snapshots]
    timelines = [{row["hour_start"]: row["count"] for row in item["timeline"]} for item in snapshots]
    outcomes = [{row["outcome"]: row for row in item["outcomes"]} for item in snapshots]
    total = sum_cells([item["total"] for item in snapshots])
    by_state = []
    for state in sorted(set().union(*states)):
        rows = [dimension.get(state) for dimension in states]
        by_state.append({
            "state_code": state, "state_name": next(row["state_name"] for row in rows if row),
            "total": sum_cells([row["total"] if row else None for row in rows]),
            "by_category": {
                cat: sum_cells([row["by_category"].get(cat) if row else None for row in rows])
                for cat in CATEGORIES
            },
        })
    combined_outcomes = []
    for outcome in Report.Outcome.values:
        value = sum_cells([dimension.get(outcome) for dimension in outcomes]) if not total["suppressed"] else cell(None)
        combined_outcomes.append({
            "outcome": outcome, **value,
            "share_percent": round(100 * value["count"] / total["count"], 1) if not value["suppressed"] else None,
        })
    return {
        "published_at": max(item["published_at"] for item in snapshots),
        "cutoff": min(item["cutoff"] for item in snapshots),
        "delay_minutes": max(item["delay_minutes"] for item in snapshots),
        "total": total, "by_state": by_state, "outcomes": combined_outcomes,
        "timeline": [
            {"hour_start": hour, "count": sum_cells([dimension.get(hour) for dimension in timelines])}
            for hour in sorted(set().union(*timelines))
        ],
    }
