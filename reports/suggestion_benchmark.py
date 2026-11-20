"""Authored evaluation-only reports. Rows in each pair share an incident label."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


@dataclass
class Entry:
    incident: str
    area: str
    occurred_at: datetime
    category: str
    description: str
    received_at: datetime


# These are authored scenarios, not measurements on a field population. All
# within-area incidents share a 90-minute window, including unrelated same-category reports.
HELD_OUT = (
    (
        ("access", 0, "Two desks blocked the ramp at the east doorway.",
         "The east entrance ramp was obstructed by desks."),
        ("access", 13, "A locked side gate made the rear entrance inaccessible.",
         "The back gate stayed locked so visitors could not enter there."),
        ("materials", 26, "The first accreditation scanner stopped reading cards.",
         "The accreditation scanner failed to read voter cards at the first desk."),
        ("procedure", 35, "The clerk began calling the second queue before finishing the first.",
         "People in the first queue waited while the second queue was called."),
    ),
    (
        ("materials", 1, "The ballot box seal was missing at opening.",
         "Staff discovered the ballot box had no seal when they opened."),
        ("materials", 14, "The table ran out of blank incident forms.",
         "No blank forms were available for recording incidents."),
        ("access", 25, "The temporary walkway was too narrow for a wheelchair.",
         "A wheelchair could not fit along the temporary path."),
        ("conduct", 42, "Two people argued near the presiding officer's desk.",
         "An argument broke out beside the presiding officer's desk."),
    ),
    (
        ("procedure", 0, "An announcement directed the waiting group to the wrong queue.",
         "People lined up in the wrong queue following an announcement."),
        ("procedure", 14, "The team did not explain the closing steps to observers.",
         "Observers could not hear any explanation of how closure would proceed."),
        ("materials", 29, "A low battery shut down the handheld scanner.",
         "The handheld scanner switched off after the battery drained."),
        ("access", 43, "Steps blocked wheelchair access to the raised entrance.",
         "A wheelchair user could not get up the entrance steps."),
    ),
    (
        ("conduct", 0, "A marshal asked an accredited observer to leave the counting room.",
         "An accredited observer was told to exit the room by a marshal."),
        ("conduct", 13, "People pushed one another beside the service entrance.",
         "Shoving broke out near the service entrance."),
        ("materials", 27, "A printer jam stopped the tally sheet from printing.",
         "Staff cleared a paper jam while trying to print a tally sheet."),
        ("procedure", 44, "A supervisor paused counting to reconcile the running log.",
         "The running log was reconciled during a pause in counting."),
    ),
    (
        ("access", 0, "The entrance queue covered the marked accessible passage.",
         "People waiting in line obstructed the accessible passage."),
        ("access", 13, "The accessible toilet door was too heavy to open independently.",
         "A visitor could not pull open the heavy accessible toilet door."),
        ("other", 28, "An observer heard a disturbance but could not see its cause.",
         "A commotion was audible with no firsthand details available."),
        ("materials", 43, "The spare rechargeable batteries were not delivered.",
         "The expected backup batteries did not arrive with the supplies."),
    ),
    (
        ("materials", 0, "The check-in tablet froze during accreditation.",
         "An accreditation device stopped responding to touch."),
        ("materials", 13, "The central desk was missing a printed checklist.",
         "Staff at the central desk could not find the paper checklist."),
        ("procedure", 29, "A long break was announced without a restart time.",
         "The announcement did not say when activity would resume."),
        ("access", 43, "A power cable crossed the accessible route.",
         "A loose cable lay across the wheelchair route."),
    ),
)

SINGLETONS = (
    ("access", 9, "A sign above the main door pointed to the closed side entrance."),
    ("materials", 11, "A packet of pens was left unopened on the supply table."),
    ("procedure", 6, "A short announcement asked everyone to move back from the service desk."),
    ("conduct", 10, "A staff member briefly asked a photographer to stand outside."),
    ("access", 7, "The main entrance could be reached by a low staircase."),
    ("materials", 6, "The check-in tablet showed that its clock needed resetting."),
)


def held_out_entries():
    start = datetime(2026, 1, 1, 8, tzinfo=timezone.utc)
    event_time_errors = (11, 2, 9, 6, 12, 5)
    for area_index, area in enumerate(HELD_OUT):
        for incident_index, (category, minute, first, second) in enumerate(area):
            offset = event_time_errors[(area_index + incident_index) % len(event_time_errors)]
            for shift, description in ((0, first), (offset, second)):
                occurred = start + timedelta(minutes=minute + shift)
                # Later incidents are deliberately often more recently received.
                received = start + timedelta(minutes=70 + 3 * incident_index + shift)
                yield Entry(f"{area_index}-{incident_index}", str(area_index), occurred,
                            category, description, received)
        category, minute, description = SINGLETONS[area_index]
        occurred = start + timedelta(minutes=minute)
        yield Entry(f"{area_index}-single", str(area_index), occurred, category,
                    description, start + timedelta(minutes=83))


def benchmark():
    from .suggestions import RANKING_POOL_LIMIT, REVIEW_CANDIDATE_LIMIT, WINDOW_MINUTES, rank_candidates

    entries = list(held_out_entries())
    paired = [entry for entry in entries if not entry.incident.endswith("-single")]
    unmatched = len(entries) - len(paired)
    results = {name: {k: 0 for k in (1, 3, REVIEW_CANDIDATE_LIMIT)}
               for name in ("recency", "ranked", "time_only")}
    errors = []
    for report in paired:
        pool = sorted(
            (candidate for candidate in entries if candidate is not report and candidate.area == report.area
             and abs((report.occurred_at - candidate.occurred_at).total_seconds()) <= WINDOW_MINUTES * 60),
            key=lambda candidate: candidate.received_at,
            reverse=True,
        )[:RANKING_POOL_LIMIT]
        ordered = {"recency": pool, "ranked": rank_candidates(report, pool),
                   "time_only": sorted(pool, key=lambda candidate: abs(report.occurred_at - candidate.occurred_at))}
        for method, candidates in ordered.items():
            for k in results[method]:
                results[method][k] += any(candidate.incident == report.incident for candidate in candidates[:k])
        if ordered["ranked"][0].incident != report.incident:
            errors.append((report.description, ordered["ranked"][0].description))
    return len(paired), unmatched, results, errors


if __name__ == "__main__":
    count, unmatched, results, errors = benchmark()
    print(f"{count} paired reports across {count // 2} incidents and {unmatched} singleton hard negatives.")
    for method, hits in results.items():
        print(f"{method}: " + ", ".join(f"Hit@{k}: {value}/{count} ({value / count:.1%})"
                                        for k, value in hits.items()))
    for report, wrong in errors:
        print(f"Top suggestion error: {report!r} -> {wrong!r}")
    print("The rankers do not abstain. Each singleton has unrelated comparison candidates.")
