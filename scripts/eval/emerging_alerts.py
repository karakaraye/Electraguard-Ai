"""Honest evaluation of emerging-alert detectors against a throwaway test database.

Usage:
    python scripts/eval/emerging_alerts.py
"""

import csv
import os
import random
import statistics
import sys
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from pathlib import Path
from uuid import uuid4

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
CSV_PATH = REPO_ROOT / "data" / "synthetic" / "polling_units_synthetic.csv"
REPORT_PATH = REPO_ROOT / "docs" / "eval" / "emerging-alerts.md"

sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.db import connection, transaction  # noqa: E402
from django.test.utils import setup_databases, teardown_databases  # noqa: E402

from accounts.models import Organisation  # noqa: E402
from ops.emerging import (  # noqa: E402
    WAT,
    _fallback_threshold_detection,
    _statistical_detection,
)
from ops.models import ClusterSettings, ClusterWarning  # noqa: E402
from reference.models import AreaDataset  # noqa: E402
from reports.incident_input import CATEGORIES  # noqa: E402
from reports.models import Report  # noqa: E402


EVAL_CATEGORIES = ["intimidation_violence", "ballot_issues", "logistics_delay"]


def load_polling_units():
    by_state = defaultdict(lambda: defaultdict(list))
    all_lgas = []
    with CSV_PATH.open("r", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            state = row["state"].strip()
            lga = row["lga"].strip()
            ward = row["ward"].strip()
            pu_id = row["pu_id"].strip()
            by_state[state][lga].append((ward, pu_id))
    for state, lgas in sorted(by_state.items()):
        for lga in sorted(lgas.keys()):
            all_lgas.append((state, lga, len(lgas[lga])))
    return by_state, all_lgas


def seed_area_dataset(by_state, ref_date):
    states_json = {}
    for state, lgas in by_state.items():
        states_json[state] = {
            "state_code": state,
            "name": state,
            "lgas": [
                {"lga_code": lga, "name": lga, "wards": []}
                for lga in sorted(lgas.keys())
            ],
        }
    AreaDataset.objects.create(
        version="eval-synthetic-v1",
        released_on=ref_date,
        revision=1,
        source=AreaDataset.Source.SYNTHETIC,
        index={},
        states=states_json,
    )


def make_report(org, category, state, lga, occurred_at):
    return Report(
        organisation=org,
        submission_key=uuid4(),
        occurred_at=occurred_at,
        kind="incident",
        description=f"Synthetic report in {lga}",
        incident_details={
            "kind": "incident",
            "category_observer": category,
            "area": {
                "state_code": state,
                "state_name": state,
                "lga_code": lga,
                "lga_name": lga,
            },
        },
    )


def generate_background(rng, orgs, day_date, all_lgas, base_rate_per_unit_hour):
    """Generate realistic 900-unit polling-day background reports from 07:00 to 17:00 WAT."""
    start_wat = datetime.combine(day_date, time(7, 0), tzinfo=WAT)
    total_minutes = 10 * 60  # 07:00 to 17:00 WAT
    reports = []
    for state, lga, unit_count in all_lgas:
        for cat in EVAL_CATEGORIES:
            # Expected reports per hour in this (lga, cat) scaled by unit count
            lam_hour = max(1.2, unit_count * base_rate_per_unit_hour * rng.uniform(0.7, 1.4))
            expected_total = lam_hour * 10.0
            # Poisson draw via Knuth/normal approximation or exponential inter-arrivals
            t_min = 0.0
            while t_min < total_minutes:
                # exponential inter-arrival in minutes
                step = rng.expovariate(lam_hour / 60.0)
                t_min += step
                if t_min >= total_minutes:
                    break
                ts = (start_wat + timedelta(minutes=t_min)).astimezone(dt_timezone.utc)
                for org in orgs:
                    reports.append(make_report(org, cat, state, lga, ts))
    Report.objects.bulk_create(reports, batch_size=1000)


def run_evaluation():
    by_state, all_lgas = load_polling_units()
    # Filter LGAs that have at least 1 peer in the same state
    eligible_lgas = [
        (state, lga, count)
        for state, lga, count in all_lgas
        if len(by_state[state]) >= 2
    ]
    assert len(eligible_lgas) >= 20, "Need at least 20 LGAs with peers"

    surge_day = date(2027, 2, 20)
    seed_area_dataset(by_state, surge_day)

    # 1. Surge day evaluation: two independent organisations on identical reports
    org_old = Organisation.objects.create(name="Eval Old Threshold")
    org_new = Organisation.objects.create(name="Eval New Stats")
    ClusterSettings.objects.create(organisation=org_old, window_minutes=60, min_reports=3, categories=EVAL_CATEGORIES)
    ClusterSettings.objects.create(organisation=org_new, window_minutes=60, min_reports=3, categories=EVAL_CATEGORIES)

    print("DB setup done, generating surge day...", flush=True)
    rng_surge = random.Random(20270220)
    generate_background(rng_surge, [org_old, org_new], surge_day, all_lgas, base_rate_per_unit_hour=0.14)
    print(f"Generated surge background: {Report.objects.count()} reports", flush=True)

    # Plant 20 surges (4-15 reports over 15-60 minutes) at varied times and LGAs
    chosen = rng_surge.sample(eligible_lgas, 20)
    surges = []
    surge_reports = []
    for idx, (state, lga, _) in enumerate(chosen):
        cat = EVAL_CATEGORIES[idx % len(EVAL_CATEGORIES)]
        start_min = rng_surge.randint(150, 510)  # 09:30 to 15:30 WAT (from 07:00)
        duration_min = rng_surge.randint(15, 60)
        n_reports = rng_surge.randint(4, 15)
        surge_start_wat = datetime.combine(surge_day, time(7, 0), tzinfo=WAT) + timedelta(minutes=start_min)
        surge_start_utc = surge_start_wat.astimezone(dt_timezone.utc)
        surge_end_utc = surge_start_utc + timedelta(minutes=duration_min)
        for _ in range(n_reports):
            offset = rng_surge.uniform(0, duration_min)
            ts = surge_start_utc + timedelta(minutes=offset)
            for org in (org_old, org_new):
                surge_reports.append(make_report(org, cat, state, lga, ts))
        surges.append({
            "state": state,
            "lga": lga,
            "category": cat,
            "start": surge_start_utc,
            "end": surge_end_utc,
            "n": n_reports,
            "duration": duration_min,
        })
    Report.objects.bulk_create(surge_reports, batch_size=1000)

    # Step every 10 minutes from 09:00 WAT to 17:00 WAT
    config_old = ClusterSettings.objects.get(organisation=org_old)
    configured_cats = set(EVAL_CATEGORIES)
    old_detected = {}
    new_detected = {}

    step_wat = datetime.combine(surge_day, time(9, 0), tzinfo=WAT)
    end_wat = datetime.combine(surge_day, time(17, 0), tzinfo=WAT)
    while step_wat <= end_wat:
        print(f"Step {step_wat.strftime('%H:%M')}", flush=True)
        now_utc = step_wat.astimezone(dt_timezone.utc)
        with transaction.atomic():
            _fallback_threshold_detection(org_old, config_old, now_utc, configured_cats)
            _statistical_detection(org_new, now_utc, step_wat, configured_cats)

        for idx, s in enumerate(surges):
            if now_utc < s["start"] or now_utc > s["end"] + timedelta(minutes=60):
                continue
            if idx not in old_detected:
                hit_old = ClusterWarning.objects.filter(
                    organisation=org_old,
                    lga_code=s["lga"],
                    category=s["category"],
                    window_end__gte=s["start"],
                    window_end__lte=now_utc,
                ).exists()
                if hit_old:
                    old_detected[idx] = (now_utc - s["start"]).total_seconds() / 60.0
            if idx not in new_detected:
                hit_new = ClusterWarning.objects.filter(
                    organisation=org_new,
                    lga_code=s["lga"],
                    category=s["category"],
                    window_end__gte=s["start"],
                    window_end__lte=now_utc,
                ).exists()
                if hit_new:
                    new_detected[idx] = (now_utc - s["start"]).total_seconds() / 60.0
        step_wat += timedelta(minutes=10)

    # Measure share of new-detector warnings at the 0.5 floor on the surge day
    new_warnings = list(ClusterWarning.objects.filter(organisation=org_new))
    at_floor = sum(1 for w in new_warnings if w.expected <= 0.5)
    floor_share = (at_floor / len(new_warnings) * 100.0) if new_warnings else 0.0
    Report.objects.filter(organisation__in=[org_old, org_new]).delete()
    print("Surge day done", flush=True)

    # 2. 10 independent quiet days (distinct seeds, volumes, dates)
    quiet_hours_total = 10 * 8.0  # 09:00 to 17:00 WAT = 8h/day
    old_false_alarms = 0
    new_false_alarms = 0

    for d in range(10):
        q_day = date(2027, 3, 1 + d)
        q_rng = random.Random(5000 + d * 97)
        q_rate = q_rng.uniform(0.11, 0.20)
        q_old = Organisation.objects.create(name=f"Quiet Old {d}")
        q_new = Organisation.objects.create(name=f"Quiet New {d}")
        q_cfg = ClusterSettings.objects.create(
            organisation=q_old, window_minutes=60, min_reports=3, categories=EVAL_CATEGORIES
        )
        ClusterSettings.objects.create(
            organisation=q_new, window_minutes=60, min_reports=3, categories=EVAL_CATEGORIES
        )
        generate_background(q_rng, [q_old, q_new], q_day, all_lgas, base_rate_per_unit_hour=q_rate)

        q_step = datetime.combine(q_day, time(9, 0), tzinfo=WAT)
        q_end = datetime.combine(q_day, time(17, 0), tzinfo=WAT)
        while q_step <= q_end:
            now_utc = q_step.astimezone(dt_timezone.utc)
            with transaction.atomic():
                _fallback_threshold_detection(q_old, q_cfg, now_utc, configured_cats)
                _statistical_detection(q_new, now_utc, q_step, configured_cats)
            q_step += timedelta(minutes=10)

        old_false_alarms += ClusterWarning.objects.filter(organisation=q_old).count()
        new_false_alarms += ClusterWarning.objects.filter(organisation=q_new).count()
        Report.objects.filter(organisation__in=[q_old, q_new]).delete()
        print(f"Quiet day {d + 1}/10 done", flush=True)

    old_rate = len(old_detected) / len(surges) * 100.0
    new_rate = len(new_detected) / len(surges) * 100.0
    old_med_ttd = statistics.median(old_detected.values()) if old_detected else float("nan")
    new_med_ttd = statistics.median(new_detected.values()) if new_detected else float("nan")
    old_fa_hr = old_false_alarms / quiet_hours_total
    new_fa_hr = new_false_alarms / quiet_hours_total

    better_fa = new_fa_hr < old_fa_hr
    lines = [
        "# C17 Emerging Alerts Evaluation",
        "",
        "Independent evaluation run against a throwaway PostgreSQL test database using",
        f"`data/synthetic/polling_units_synthetic.csv` ({len(all_lgas)} LGAs across {len(by_state)} states, 900 polling units).",
        "",
        "## Setup",
        "",
        "- **Database:** Throwaway Django test database (`test_*`), destroyed on exit.",
        "- **Background volume:** 900-unit polling-day stream from 07:00 to 17:00 WAT across 3 incident categories (`intimidation_violence`, `ballot_issues`, `logistics_delay`).",
        f"- **Share of surge-day alerts at the 0.5 expected floor:** {floor_share:.1f}% ({at_floor}/{len(new_warnings)}).",
        "- **Surges:** 20 planted surges (4–15 reports over 15–60 minutes) across varied LGAs (each with peers) and times (09:30–15:30 WAT).",
        "- **Quiet baseline:** 10 independent quiet days (distinct random seeds, dates, and background rates; 80 evaluation hours total, 09:00–17:00 WAT). False alarms counted per distinct `ClusterWarning` created.",
        "",
        "## Results",
        "",
        "| Detector | Detection rate | Median time to detect | Quiet-day warnings (80h) | False alarms / hour |",
        "|---|---:|---:|---:|---:|",
        f"| Old threshold (`2x` 7-period average, min 3) | {old_rate:.1f}% ({len(old_detected)}/20) | {old_med_ttd:.1f} min | {old_false_alarms} | {old_fa_hr:.2f} |",
        f"| New statistical (Poisson + BH FDR q=0.05 + CUSUM) | {new_rate:.1f}% ({len(new_detected)}/20) | {new_med_ttd:.1f} min | {new_false_alarms} | {new_fa_hr:.2f} |",
        "",
        "## Honest takeaway",
        "",
        (
            f"- The new statistical detector produced **fewer** false alarms per hour ({new_fa_hr:.2f}/hr vs {old_fa_hr:.2f}/hr)."
            if better_fa
            else f"- **False alarms:** The new statistical detector was **not** better on false alarms ({new_fa_hr:.2f}/hr vs {old_fa_hr:.2f}/hr for the old threshold) because testing both 30m and 60m windows across ~{len(all_lgas) * len(EVAL_CATEGORIES)} series with `observed >= 3` still admits Poisson tail spikes under `q <= 0.05`."
        ),
        f"- **Detection:** New detector caught {len(new_detected)}/20 surges (median {new_med_ttd:.1f} min) vs {len(old_detected)}/20 (median {old_med_ttd:.1f} min) for the old threshold.",
        "",
    ]
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))


def main():
    db_name = connection.settings_dict.get("NAME", "")
    if str(db_name).startswith("test_"):
        raise RuntimeError("Refusing to run: configured main database already looks like a test DB.")

    old_config = setup_databases(verbosity=1, interactive=False)
    try:
        active_name = connection.settings_dict.get("NAME", "")
        if not str(active_name).startswith("test_"):
            raise RuntimeError(f"Refusing to run against non-test database: {active_name}")
        run_evaluation()
    finally:
        teardown_databases(old_config, verbosity=1)


if __name__ == "__main__":
    main()
