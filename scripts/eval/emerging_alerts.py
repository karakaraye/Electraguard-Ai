import csv
import os
import random
import statistics
import sys
from collections import defaultdict
from datetime import datetime, time, timedelta, timezone as dt_timezone
from pathlib import Path
from uuid import uuid4

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()

from django.db import transaction
from accounts.models import Organisation, User
from ops.emerging import WAT, detect_emerging
from ops.models import ClusterWarning
from reports.models import Report

EVAL_OUT = REPO_ROOT / "docs" / "eval" / "emerging-alerts.md"
SYNTHETIC_DIR = REPO_ROOT / "data" / "synthetic"


def legacy_threshold_detect(reports_list, now, min_reports=5, window_minutes=60):
    win_start = now - timedelta(minutes=window_minutes)
    base_start = win_start - timedelta(minutes=7 * window_minutes)
    recent = defaultdict(list)
    baseline = defaultdict(int)
    for r in reports_list:
        t = r["occurred_at"]
        key = (r["lga"], r["category"])
        if t >= win_start:
            recent[key].append(r["id"])
        elif t >= base_start:
            baseline[key] += 1
    fired = []
    for (lga, cat), ids in recent.items():
        avg = baseline[(lga, cat)] / 7.0
        if len(ids) >= min_reports and len(ids) >= 2 * avg:
            fired.append((lga, cat))
    return fired


def run_evaluation():
    random.seed(42)

    # Load 900 polling units & 400 base incidents
    with open(SYNTHETIC_DIR / "polling_units_synthetic.csv", encoding="utf-8") as f:
        pus = list(csv.DictReader(f))
    with open(SYNTHETIC_DIR / "incident_reports_synthetic.csv", encoding="utf-8") as f:
        base_csv = list(csv.DictReader(f))

    # Map LGA names to clean codes
    lga_to_state = {}
    for row in pus:
        lga_to_state[row["lga"]] = row["state"]

    # Create isolated evaluation organisation inside a rolled-back transaction or cleaned up after
    org = Organisation.objects.create(name=f"Eval Org {uuid4().hex[:6]}")
    actor = User.objects.create_user(f"eval-{uuid4().hex[:6]}@example.org", role="coordinator", organisation=org)

    try:
        # Define 20 ground-truth surges strictly within 4–15 reports over 15–60 minutes
        surges = [
            {"id": "SURGE-01", "lga": "Kano LGA-1", "state": "Kano", "cat": "intimidation_violence", "start": time(9, 30), "dur": 25, "n": 10},
            {"id": "SURGE-02", "lga": "Lagos LGA-1", "state": "Lagos", "cat": "equipment_failure", "start": time(10, 15), "dur": 20, "n": 12},
            {"id": "SURGE-03", "lga": "Rivers LGA-1", "state": "Rivers", "cat": "intimidation_violence", "start": time(11, 0), "dur": 30, "n": 9},
            {"id": "SURGE-04", "lga": "Enugu LGA-1", "state": "Enugu", "cat": "vote_buying", "start": time(12, 10), "dur": 20, "n": 8},
            {"id": "SURGE-05", "lga": "Borno LGA-1", "state": "Borno", "cat": "late_materials", "start": time(8, 10), "dur": 35, "n": 7},
            {"id": "SURGE-06", "lga": "Plateau LGA-2", "state": "Plateau", "cat": "equipment_failure", "start": time(13, 20), "dur": 25, "n": 9},
            {"id": "SURGE-07", "lga": "Oyo LGA-1", "state": "Oyo", "cat": "vote_buying", "start": time(14, 0), "dur": 30, "n": 11},
            {"id": "SURGE-08", "lga": "Edo LGA-1", "state": "Edo", "cat": "intimidation_violence", "start": time(14, 45), "dur": 25, "n": 8},
            {"id": "SURGE-09", "lga": "Cross River LGA-1", "state": "Cross River", "cat": "equipment_failure", "start": time(15, 30), "dur": 20, "n": 7},
            {"id": "SURGE-10", "lga": "Delta LGA-1", "state": "Delta", "cat": "intimidation_violence", "start": time(16, 15), "dur": 25, "n": 10},
            {"id": "SURGE-11", "lga": "Kaduna LGA-2", "state": "Kaduna", "cat": "queues_crowding", "start": time(10, 0), "dur": 55, "n": 14},
            {"id": "SURGE-12", "lga": "Imo LGA-2", "state": "Imo", "cat": "late_materials", "start": time(9, 45), "dur": 60, "n": 15},
            {"id": "SURGE-13", "lga": "Ogun LGA-2", "state": "Ogun", "cat": "queues_crowding", "start": time(11, 30), "dur": 50, "n": 12},
            {"id": "SURGE-14", "lga": "Kwara LGA-1", "state": "Kwara", "cat": "lack_of_information", "start": time(12, 0), "dur": 60, "n": 13},
            {"id": "SURGE-15", "lga": "Sokoto LGA-1", "state": "Sokoto", "cat": "queues_crowding", "start": time(13, 0), "dur": 55, "n": 15},
            {"id": "SURGE-16", "lga": "Bauchi LGA-1", "state": "Bauchi", "cat": "equipment_failure", "start": time(9, 45), "dur": 40, "n": 5},
            {"id": "SURGE-17", "lga": "Benue LGA-1", "state": "Benue", "cat": "intimidation_violence", "start": time(11, 15), "dur": 30, "n": 4},
            {"id": "SURGE-18", "lga": "Ebonyi LGA-1", "state": "Ebonyi", "cat": "vote_buying", "start": time(13, 45), "dur": 45, "n": 5},
            {"id": "SURGE-19", "lga": "Ondo LGA-1", "state": "Ondo", "cat": "equipment_failure", "start": time(15, 0), "dur": 30, "n": 4},
            {"id": "SURGE-20", "lga": "Adamawa LGA-1", "state": "Adamawa", "cat": "late_materials", "start": time(8, 15), "dur": 40, "n": 6},
        ]

        cat_map = {
            "queue_management": "queues_crowding",
            "logistics_delay": "late_materials",
            "intimidation": "intimidation_violence",
            "positive_practice": "good_practice",
            "accessibility_barrier": "access_barrier",
            "information_gap": "lack_of_information",
            "equipment_failure": "equipment_failure",
            "vote_buying": "vote_buying",
        }

        def build_background(day_date, extra_scale=1):
            bg = []
            for idx, row in enumerate(base_csv):
                if row.get("reporter_type") == "simulated_agent":
                    continue
                orig_t = datetime.fromisoformat(row["timestamp"])
                t_wat = datetime.combine(day_date, orig_t.time(), tzinfo=WAT)
                bg.append({
                    "id": f"BG-{day_date}-{idx}",
                    "occurred_at": t_wat.astimezone(dt_timezone.utc),
                    "state": row["state"],
                    "lga": row["lga"],
                    "category": cat_map.get(row["category"], "not_sure"),
                })
            # Add steady background reports across LGAs so expected baseline > 0.5 floor
            for k in range(250 * extra_scale):
                pu = random.choice(pus)
                hr = random.randint(6, 17)
                mn = random.randint(0, 59)
                t_wat = datetime.combine(day_date, time(hr, mn), tzinfo=WAT)
                cat = random.choice(["queues_crowding", "late_materials", "equipment_failure", "lack_of_information"])
                bg.append({
                    "id": f"BGN-{day_date}-{k}",
                    "occurred_at": t_wat.astimezone(dt_timezone.utc),
                    "state": pu["state"],
                    "lga": pu["lga"],
                    "category": cat,
                })
            return sorted(bg, key=lambda x: x["occurred_at"])

        # --- Part A: Surge Day (20 injected surges) ---
        surge_day = datetime(2026, 11, 24).date()
        surge_reports = build_background(surge_day, extra_scale=1)
        surge_windows = {}
        for s in surges:
            s_start = datetime.combine(surge_day, s["start"], tzinfo=WAT).astimezone(dt_timezone.utc)
            s_end = s_start + timedelta(minutes=s["dur"])
            surge_windows[s["id"]] = (s, s_start, s_end)
            for i in range(s["n"]):
                t = s_start + timedelta(seconds=random.randint(0, s["dur"] * 60))
                surge_reports.append({
                    "id": f"{s['id']}-{i}",
                    "occurred_at": t,
                    "state": s["state"],
                    "lga": s["lga"],
                    "category": s["cat"],
                })
        surge_reports.sort(key=lambda x: x["occurred_at"])

        # Replay surge day through REAL detect_emerging in 5-min ticks
        stat_ttd = {}
        thresh_ttd = {}
        thresh_warnings = set()

        inserted_idx = 0
        sim_start = datetime.combine(surge_day, time(6, 0), tzinfo=WAT).astimezone(dt_timezone.utc)
        sim_end = datetime.combine(surge_day, time(18, 0), tzinfo=WAT).astimezone(dt_timezone.utc)
        cur = sim_start
        active_legacy = []

        while cur <= sim_end:
            to_create = []
            while inserted_idx < len(surge_reports) and surge_reports[inserted_idx]["occurred_at"] <= cur:
                r = surge_reports[inserted_idx]
                active_legacy.append(r)
                to_create.append(Report(
                    organisation=org,
                    observer=actor,
                    submission_key=uuid4(),
                    occurred_at=r["occurred_at"],
                    description="Eval report",
                    incident_details={
                        "area": {"state_code": r["state"][:2].upper(), "state_name": r["state"], "lga_code": r["lga"], "lga_name": r["lga"]},
                        "category": r["category"],
                    },
                ))
                inserted_idx += 1
            if to_create:
                Report.objects.bulk_create(to_create)

            # Real C17 detector
            detect_emerging(org.pk, now=cur)
            for w in ClusterWarning.objects.filter(organisation=org, reviewed_at__isnull=True):
                for sid, (s, s_start, s_end) in surge_windows.items():
                    if sid not in stat_ttd and w.lga_code == s["lga"] and w.category == s["cat"] and s_start <= cur <= s_end + timedelta(minutes=30):
                        stat_ttd[sid] = (cur - s_start).total_seconds() / 60.0

            # Legacy fixed threshold
            for lga, cat in legacy_threshold_detect(active_legacy, cur):
                matched = False
                for sid, (s, s_start, s_end) in surge_windows.items():
                    if lga == s["lga"] and cat == s["cat"] and s_start <= cur <= s_end + timedelta(minutes=30):
                        matched = True
                        if sid not in thresh_ttd:
                            thresh_ttd[sid] = (cur - s_start).total_seconds() / 60.0
                if not matched:
                    thresh_warnings.add((lga, cat, cur.hour))

            cur += timedelta(minutes=5)

        surge_false_warnings_c17 = 0
        for w in ClusterWarning.objects.filter(organisation=org):
            is_true_surge = any(
                w.lga_code == s["lga"] and w.category == s["cat"]
                for s in surges
            )
            if not is_true_surge:
                surge_false_warnings_c17 += 1

        # --- Part B: 10 Quiet Days (no injected surges) to measure false alarms per hour per distinct warning ---
        quiet_c17_warnings = 0
        quiet_legacy_warnings = 0
        quiet_hours = 10 * 12.0  # 10 days x 12 hours

        for day_offset in range(1, 11):
            Report.objects.filter(organisation=org).delete()
            ClusterWarning.objects.filter(organisation=org).delete()
            q_day = surge_day + timedelta(days=day_offset)
            q_reports = build_background(q_day, extra_scale=1)
            q_start = datetime.combine(q_day, time(6, 0), tzinfo=WAT).astimezone(dt_timezone.utc)
            q_end = datetime.combine(q_day, time(18, 0), tzinfo=WAT).astimezone(dt_timezone.utc)
            cur = q_start
            idx_q = 0
            q_active_legacy = []
            seen_legacy_day = set()

            while cur <= q_end:
                batch = []
                while idx_q < len(q_reports) and q_reports[idx_q]["occurred_at"] <= cur:
                    r = q_reports[idx_q]
                    q_active_legacy.append(r)
                    batch.append(Report(
                        organisation=org,
                        observer=actor,
                        submission_key=uuid4(),
                        occurred_at=r["occurred_at"],
                        description="Quiet eval report",
                        incident_details={
                            "area": {"state_code": r["state"][:2].upper(), "state_name": r["state"], "lga_code": r["lga"], "lga_name": r["lga"]},
                            "category": r["category"],
                        },
                    ))
                    idx_q += 1
                if batch:
                    Report.objects.bulk_create(batch)

                detect_emerging(org.pk, now=cur)
                for lga, cat in legacy_threshold_detect(q_active_legacy, cur):
                    if (lga, cat) not in seen_legacy_day:
                        seen_legacy_day.add((lga, cat))
                        quiet_legacy_warnings += 1
                cur += timedelta(minutes=5)

            quiet_c17_warnings += ClusterWarning.objects.filter(organisation=org).count()

        c17_det_rate = len(stat_ttd) / len(surges) * 100.0
        leg_det_rate = len(thresh_ttd) / len(surges) * 100.0
        c17_median_ttd = statistics.median(stat_ttd.values()) if stat_ttd else 0.0
        leg_median_ttd = statistics.median(thresh_ttd.values()) if thresh_ttd else 0.0
        c17_fa_hr = quiet_c17_warnings / quiet_hours
        leg_fa_hr = quiet_legacy_warnings / quiet_hours

        lines = [
            "# Statistical Alerts Evaluation (C17)",
            "",
            "Replayed through the production `ops.emerging.detect_emerging` function on PostgreSQL across:",
            "- **1 Surge Day** (900 polling units, realistic background + 20 injected surges of 4–15 reports over 15–60 minutes).",
            "- **10 Quiet Days** (120 hours of realistic background reports, 0 injected surges) to measure false alarms per hour per **distinct warning**.",
            "",
            "## Headline Results",
            "",
            "| Metric | Legacy Fixed Threshold | C17 Statistical Detector | Notes |",
            "|---|---|---|---|",
            f"| **Surge Detection Rate** | {leg_det_rate:.1f}% ({len(thresh_ttd)}/{len(surges)}) | **{c17_det_rate:.1f}% ({len(stat_ttd)}/{len(surges)})** | Tested across 20 surges (4–15 reports, 15–60 min) |",
            f"| **Median Time to Detect** | {leg_median_ttd:.1f} min | **{c17_median_ttd:.1f} min** | Median minutes from surge start to alert |",
            f"| **Quiet-Day False Alarms / Hour** | {leg_fa_hr:.3f} ({quiet_legacy_warnings} warnings / 120h) | **{c17_fa_hr:.3f} ({quiet_c17_warnings} warnings / 120h)** | Distinct warnings raised across 10 quiet days |",
            "",
            "## Surge Detection Detail",
            "",
            "| Surge ID | LGA | Category | Reports | Duration | Legacy TTD | C17 TTD |",
            "|---|---|---|---|---|---|---|",
        ]
        for s in surges:
            sid = s["id"]
            lt = f"{thresh_ttd[sid]:.0f} min" if sid in thresh_ttd else "Missed"
            ct = f"{stat_ttd[sid]:.0f} min" if sid in stat_ttd else "Missed"
            lines.append(f"| {sid} | {s['lga']} | {s['cat']} | {s['n']} | {s['dur']} min | {lt} | {ct} |")

        lines.extend([
            "",
            "## Findings",
            "",
            f"- **Detection:** C17 detected {len(stat_ttd)}/{len(surges)} ({c17_det_rate:.1f}%) surges with a median detection time of {c17_median_ttd:.1f} minutes, compared to {len(thresh_ttd)}/{len(surges)} ({leg_det_rate:.1f}%) and {leg_median_ttd:.1f} minutes for the legacy threshold.",
            f"- **False Alarms:** Across 10 quiet days (120 hours), C17 raised {quiet_c17_warnings} distinct warnings ({c17_fa_hr:.3f}/hr) versus {quiet_legacy_warnings} ({leg_fa_hr:.3f}/hr) for the legacy threshold.",
        ])

        EVAL_OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"C17 Eval complete: Det={c17_det_rate:.1f}%, MedTTD={c17_median_ttd:.1f}m, QuietFA/hr={c17_fa_hr:.3f}")
    finally:
        from security.models import Alert
        from staff.models import AuditEvent
        Alert.objects.filter(organisation=org).delete()
        AuditEvent.objects.filter(organisation=org).delete()
        ClusterWarning.objects.filter(organisation=org).delete()
        Report.objects.filter(organisation=org).delete()
        actor.delete()
        org.delete()


if __name__ == "__main__":
    run_evaluation()
