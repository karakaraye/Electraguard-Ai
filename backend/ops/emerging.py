import math
import statistics
from collections import Counter, defaultdict
from datetime import datetime, time, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from accounts.models import Organisation
from reports.incident_input import CATEGORIES
from reports.models import Report
from security.models import Alert
from staff.audit import record
from staff.fields import category as report_category_field, is_incident

from .models import ClusterSettings, ClusterWarning

WAT = ZoneInfo("Africa/Lagos")


def poisson_tail(observed: int, expected: float) -> float:
    """Calculates P(X >= observed) for X ~ Poisson(expected) in log space."""
    if observed <= 0:
        return 1.0
    if expected <= 0:
        return 0.0
    log_e = math.log(expected)
    if observed <= expected:
        lower = 0.0
        log_fact = 0.0
        for k in range(observed):
            if k > 0:
                log_fact += math.log(k)
            lower += math.exp(-expected + k * log_e - log_fact)
        return max(0.0, min(1.0, 1.0 - lower))

    log_fact = sum(math.log(k) for k in range(2, observed + 1))
    total = 0.0
    log_term = -expected + observed * log_e - log_fact
    for k in range(observed, observed + 100_000):
        term = math.exp(log_term)
        total += term
        if term < total * 1e-16:
            break
        log_term += log_e - math.log(k + 1)
    return min(1.0, max(0.0, total))


def benjamini_hochberg(p_values: list[float], q: float = 0.05) -> list[bool]:
    """Determines which hypotheses survive Benjamini-Hochberg FDR control at rate q."""
    m = len(p_values)
    if m == 0:
        return []
    indexed = sorted(enumerate(p_values), key=lambda x: x[1])
    cutoff_rank = -1
    for rank, (_, p) in enumerate(indexed, start=1):
        if p <= (q * rank / m):
            cutoff_rank = rank
    rejected = [False] * m
    for rank in range(1, cutoff_rank + 1):
        rejected[indexed[rank - 1][0]] = True
    return rejected


def q_values(p_values: list[float]) -> list[float]:
    """Calculates step-up Benjamini-Hochberg adjusted p-values (q-values)."""
    m = len(p_values)
    if m == 0:
        return []
    indexed = sorted(enumerate(p_values), key=lambda x: x[1])
    q_out = [1.0] * m
    running = 1.0
    for rank in range(m, 0, -1):
        orig_idx, p = indexed[rank - 1]
        running = min(running, p * m / rank)
        q_out[orig_idx] = min(1.0, max(0.0, running))
    return q_out


def cusum(values: list[float], mean: float, sd: float, k: float = 0.5) -> list[float]:
    """One-sided upper tabular CUSUM: S_t = max(0, S_{t-1} + (x_t - mean)/sd - k)."""
    s = []
    prev = 0.0
    effective_sd = max(sd, 0.5)
    for v in values:
        prev = max(0.0, prev + (v - mean) / effective_sd - k)
        s.append(prev)
    return s


def is_simulator_report(details: dict) -> bool:
    """Excludes simulated reports using the real incident_details['simulated'] flag."""
    return bool(details.get("simulated"))


def build_plain_explanation(category_name: str, lga_name: str, window_minutes: int, observed: int, expected: float) -> str:
    cat_label = category_name.replace("_", " ")
    exp_display = round(expected, 1)
    if isinstance(exp_display, float) and exp_display.is_integer():
        exp_display = int(exp_display)
    return f"{observed} {cat_label} reports in {lga_name} LGA in the last {window_minutes} minutes; about {exp_display} expected"


def _notify_coordinator_once(organisation, warning, lga_name, now):
    if warning.notified_at is not None:
        return
    Alert.objects.get_or_create(
        organisation=organisation,
        rule="emerging_volume_spike",
        subject_key=f"cluster:{warning.pk}",
        status="open",
        defaults={
            "severity": "high" if warning.detector == ClusterWarning.Detector.SPIKE else "medium",
            "subject_type": "cluster_warning",
            "subject_label": f"{warning.category.replace('_', ' ')} in {lga_name}"[:254],
            "details": {
                "warning_id": str(warning.pk),
                "category": warning.category,
                "lga_code": warning.lga_code,
                "detector": warning.detector,
                "observed": warning.observed,
                "expected": warning.expected,
                "explanation": warning.explanation,
            },
            "detector": "stats" if warning.detector != ClusterWarning.Detector.THRESHOLD else "rules",
        },
    )
    warning.notified_at = now
    warning.save(update_fields=["notified_at"])


@transaction.atomic
def detect_emerging(org_id, now=None):
    """Evaluates report series for unusual volumes using Poisson tests, BH FDR control, and CUSUM drift."""
    if now is None:
        now = timezone.now()
    wat_now = now.astimezone(WAT)

    organisation = Organisation.objects.select_for_update(no_key=True).get(pk=org_id)
    config = ClusterSettings.objects.filter(organisation=organisation).first() or ClusterSettings(organisation=organisation)
    configured_categories = set(config.categories or CATEGORIES)

    if wat_now.hour < 9:
        return _fallback_threshold_detection(organisation, config, now, configured_categories)

    return _statistical_detection(organisation, now, wat_now, configured_categories)


def _fallback_threshold_detection(organisation, config, now, configured_categories):
    interval = timedelta(minutes=config.window_minutes)
    start = now - interval
    reports = Report.objects.filter(
        organisation=organisation,
        occurred_at__gte=start - 7 * interval,
        occurred_at__lt=now,
    ).exclude(status=Report.Status.WITHDRAWN).only("pk", "occurred_at", "kind", "incident_details")

    recent = defaultdict(list)
    baseline = Counter()
    areas = {}

    for report in reports.iterator():
        details = report.incident_details or {}
        if is_simulator_report(details):
            continue
        area = details.get("area") or {}
        cat_info = report_category_field(report)
        name = cat_info.get("value") or cat_info.get("code")
        if not is_incident(details, getattr(report, "kind", "incident")) or name not in configured_categories or not area.get("lga_code"):
            continue
        key = (area["lga_code"], name)
        if report.occurred_at >= start:
            recent[key].append(str(report.pk))
            areas[key] = {field: area.get(field) for field in ("state_code", "state_name", "lga_code", "lga_name")}
        else:
            baseline[key] += 1

    alerts_created = []
    for (lga, name), ids in sorted(recent.items()):
        average = baseline[lga, name] / 7.0
        if len(ids) < config.min_reports or len(ids) < 2 * average:
            continue

        # Join ONLY an open, unreviewed warning for this org + category + lga
        existing = ClusterWarning.objects.filter(
            organisation=organisation, lga_code=lga, category=name, reviewed_at__isnull=True,
        ).order_by("-window_end").first()
        if existing:
            existing = ClusterWarning.objects.select_for_update().filter(
                pk=existing.pk, reviewed_at__isnull=True
            ).first()

        lga_name = areas[lga, name].get("lga_name") or lga
        if existing:
            combined_ids = sorted(set(existing.report_ids) | set(ids))
            existing.report_ids = combined_ids
            existing.observed = len(combined_ids)
            existing.expected = round(average, 2)
            existing.baseline = round(average, 2)
            existing.window_end = now
            existing.explanation = build_plain_explanation(name, lga_name, config.window_minutes, len(combined_ids), average)
            existing.save(update_fields=["report_ids", "observed", "expected", "baseline", "window_end", "explanation"])
            _notify_coordinator_once(organisation, existing, lga_name, now)
            alerts_created.append(existing)
        else:
            explanation = build_plain_explanation(name, lga_name, config.window_minutes, len(ids), average)
            warning = ClusterWarning.objects.create(
                organisation=organisation,
                category=name,
                area=areas[lga, name],
                lga_code=lga,
                report_ids=sorted(ids),
                baseline=round(average, 2),
                expected=round(average, 2),
                observed=len(ids),
                total_reports=len(ids),
                detector=ClusterWarning.Detector.THRESHOLD,
                window_minutes=config.window_minutes,
                baseline_kind=ClusterWarning.BaselineKind.THRESHOLD,
                explanation=explanation,
                window_start=start,
                window_end=now,
            )
            record(organisation.pk, "create_cluster_warning", "cluster_warning", warning.pk)
            _notify_coordinator_once(organisation, warning, lga_name, now)
            alerts_created.append(warning)
    return alerts_created


def _statistical_detection(organisation, now, wat_now, configured_categories):
    # Election day starts at 07:00 WAT
    election_start_wat = datetime.combine(wat_now.date(), time(7, 0), tzinfo=WAT)
    if election_start_wat > wat_now:
        election_start_wat = wat_now - timedelta(hours=3)
    election_start_utc = election_start_wat.astimezone(dt_timezone.utc)

    reports = list(
        Report.objects.filter(
            organisation=organisation,
            occurred_at__gte=election_start_utc,
            occurred_at__lt=now,
        ).exclude(status=Report.Status.WITHDRAWN).only("pk", "occurred_at", "kind", "incident_details")
    )

    valid_reports = []
    lga_areas = {}
    state_known_lgas = defaultdict(set)

    for r in reports:
        details = r.incident_details or {}
        if is_simulator_report(details):
            continue
        area = details.get("area") or {}
        cat_info = report_category_field(r)
        cat_name = cat_info.get("value") or cat_info.get("code")
        if not is_incident(details, getattr(r, "kind", "incident")) or cat_name not in configured_categories:
            continue
        lga = area.get("lga_code")
        if not lga:
            continue
        state = area.get("state_code") or ""
        lga_areas[lga] = {field: area.get(field) for field in ("state_code", "state_name", "lga_code", "lga_name")}
        if state:
            state_known_lgas[state].add(lga)
        valid_reports.append({
            "id": str(r.pk),
            "occurred_at": r.occurred_at,
            "lga_code": lga,
            "state_code": state,
            "category": cat_name,
        })

    tested_series = []
    windows_to_test = [30, 60]

    # Completed hours since 07:00 WAT (exclude partial current hour for CUSUM)
    completed_hours = max(0, int((now - election_start_utc).total_seconds() // 3600))

    for win_min in windows_to_test:
        win_start = now - timedelta(minutes=win_min)

        window_counts = defaultdict(list)
        earlier_counts = defaultdict(int)
        hourly_counts = defaultdict(lambda: defaultdict(int))
        state_lga_window_counts = defaultdict(lambda: defaultdict(int))

        for r in valid_reports:
            t = r["occurred_at"]
            lga = r["lga_code"]
            cat = r["category"]
            state = r["state_code"]
            key = (lga, cat)

            if t >= win_start:
                window_counts[key].append(r["id"])
                if state:
                    state_lga_window_counts[(state, cat)][lga] += 1
            else:
                earlier_counts[key] += 1

            h_idx = int((t - election_start_utc).total_seconds() // 3600)
            if 0 <= h_idx < completed_hours:
                hourly_counts[key][h_idx] += 1

        earlier_hours = max(0.25, (win_start - election_start_utc).total_seconds() / 3600.0)
        win_hours = win_min / 60.0

        # Test EVERY (lga, category) in this window with at least 1 report
        for (lga, cat), ids in window_counts.items():
            observed = len(ids)
            if observed < 1:
                continue

            area_info = lga_areas.get(lga, {})
            state = area_info.get("state_code") or ""

            # Baseline (a): same area earlier today, rate-adjusted
            earlier_cnt = earlier_counts[(lga, cat)]
            rate_earlier_per_hour = earlier_cnt / earlier_hours
            expected_earlier = rate_earlier_per_hour * win_hours

            # Baseline (b): peer LGAs in same state right now (include zero-count peer LGAs!)
            expected_peers = 0.0
            if state:
                known_in_state = state_known_lgas.get(state, set())
                peer_lgas = [other for other in known_in_state if other != lga]
                if peer_lgas:
                    peer_vals = [state_lga_window_counts[(state, cat)].get(other, 0) for other in peer_lgas]
                    expected_peers = float(statistics.median(peer_vals))

            if expected_earlier >= expected_peers:
                expected = max(expected_earlier, 0.5)
                baseline_kind = ClusterWarning.BaselineKind.SAME_AREA_EARLIER
            else:
                expected = max(expected_peers, 0.5)
                baseline_kind = ClusterWarning.BaselineKind.PEER_AREAS

            p_val = poisson_tail(observed, expected)

            # Check CUSUM drift over completed hours using baseline (a) as reference mean
            is_drift = False
            if completed_hours >= 3:
                series_hourly = [hourly_counts[(lga, cat)][h] for h in range(completed_hours)]
                ref_mean = max(rate_earlier_per_hour, 0.25)
                ref_sd = math.sqrt(ref_mean)
                s_stat = cusum(series_hourly, ref_mean, ref_sd, k=0.5)
                if s_stat and s_stat[-1] > 4.0 and sum(series_hourly[-2:]) >= 3:
                    is_drift = True

            tested_series.append({
                "lga": lga,
                "category": cat,
                "window_minutes": win_min,
                "window_start": win_start,
                "observed": observed,
                "expected": expected,
                "p_value": p_val,
                "is_drift": is_drift,
                "baseline_kind": baseline_kind,
                "area": area_info,
                "report_ids": ids,
            })

    if not tested_series:
        return []

    # Run Benjamini-Hochberg across ALL tested series in the run (no 2x pre-filter)
    p_values = [item["p_value"] for item in tested_series]
    q_vals = q_values(p_values)
    bh_flags = benjamini_hochberg(p_values, q=0.05)

    for item, q, rejected in zip(tested_series, q_vals, bh_flags):
        item["q_value"] = q
        item["rejected"] = rejected

    # Require observed >= 3 and (q <= 0.05 for spike OR drift signal for joining open warnings)
    significant_spikes = [
        item for item in tested_series
        if item["observed"] >= 3 and (item["rejected"] or item["q_value"] <= 0.05)
    ]
    drift_evidence = [
        item for item in tested_series
        if item["observed"] >= 3 and item["is_drift"] and item not in significant_spikes
    ]

    # Best window per (lga, category) for spikes
    best_spikes = {}
    for cand in significant_spikes:
        key = (cand["lga"], cand["category"])
        if key not in best_spikes or cand["p_value"] < best_spikes[key]["p_value"]:
            best_spikes[key] = cand

    alerts_touched = []

    # 1. Raise or join SPIKE alerts
    for (lga, cat), cand in best_spikes.items():
        existing = ClusterWarning.objects.filter(
            organisation=organisation,
            lga_code=lga,
            category=cat,
            reviewed_at__isnull=True,
        ).order_by("-window_end").first()
        if existing:
            existing = ClusterWarning.objects.select_for_update().filter(
                pk=existing.pk, reviewed_at__isnull=True
            ).first()
        if existing:
            existing = ClusterWarning.objects.select_for_update().filter(
                pk=existing.pk, reviewed_at__isnull=True
            ).first()

        lga_name = cand["area"].get("lga_name") or lga
        if existing:
            combined_ids = sorted(set(existing.report_ids) | set(cand["report_ids"]))
            existing.report_ids = combined_ids
            existing.total_reports = len(combined_ids)
            existing.observed = cand["observed"]
            existing.expected = round(cand["expected"], 2)
            existing.p_value = cand["p_value"]
            existing.q_value = cand["q_value"]
            existing.detector = ClusterWarning.Detector.SPIKE
            existing.window_minutes = cand["window_minutes"]
            existing.baseline_kind = cand["baseline_kind"]
            existing.baseline = round(cand["expected"], 2)
            existing.explanation = build_plain_explanation(
                cat, lga_name, cand["window_minutes"], cand["observed"], cand["expected"]
            )
            existing.window_end = now
            existing.save(update_fields=[
                "report_ids", "total_reports", "observed", "expected", "p_value", "q_value",
                "detector", "window_minutes", "baseline_kind", "baseline",
                "explanation", "window_end",
            ])
            _notify_coordinator_once(organisation, existing, lga_name, now)
            alerts_touched.append(existing)
        else:
            explanation = build_plain_explanation(
                cat, lga_name, cand["window_minutes"], cand["observed"], cand["expected"]
            )
            warning = ClusterWarning.objects.create(
                organisation=organisation,
                category=cat,
                area=cand["area"],
                lga_code=lga,
                report_ids=sorted(cand["report_ids"]),
                baseline=round(cand["expected"], 2),
                expected=round(cand["expected"], 2),
                observed=cand["observed"],
                total_reports=len(cand["report_ids"]),
                p_value=cand["p_value"],
                q_value=cand["q_value"],
                detector=ClusterWarning.Detector.SPIKE,
                window_minutes=cand["window_minutes"],
                baseline_kind=cand["baseline_kind"],
                explanation=explanation,
                window_start=cand["window_start"],
                window_end=now,
            )
            record(organisation.pk, "create_cluster_warning", "cluster_warning", warning.pk)
            _notify_coordinator_once(organisation, warning, lga_name, now)
            alerts_touched.append(warning)

    # 2. DRIFT only adds evidence to an already open, unreviewed warning (never opens one)
    best_drift = {}
    for cand in drift_evidence:
        key = (cand["lga"], cand["category"])
        if key in best_spikes:
            continue
        if key not in best_drift or cand["observed"] > best_drift[key]["observed"]:
            best_drift[key] = cand

    for (lga, cat), cand in best_drift.items():
        existing = ClusterWarning.objects.filter(
            organisation=organisation,
            lga_code=lga,
            category=cat,
            reviewed_at__isnull=True,
        ).order_by("-window_end").first()
        if existing:
            existing = ClusterWarning.objects.select_for_update().filter(
                pk=existing.pk, reviewed_at__isnull=True
            ).first()
        if existing:
            existing = ClusterWarning.objects.select_for_update().filter(
                pk=existing.pk, reviewed_at__isnull=True
            ).first()
        if existing:
            combined_ids = sorted(set(existing.report_ids) | set(cand["report_ids"]))
            if len(combined_ids) > len(existing.report_ids):
                lga_name = cand["area"].get("lga_name") or lga
                existing.report_ids = combined_ids
                existing.total_reports = len(combined_ids)
                existing.observed = cand["observed"]
                existing.expected = round(cand["expected"], 2)
                existing.p_value = cand["p_value"]
                existing.q_value = cand["q_value"]
                existing.window_minutes = cand["window_minutes"]
                existing.baseline_kind = cand["baseline_kind"]
                existing.baseline = round(cand["expected"], 2)
                if existing.detector in (ClusterWarning.Detector.SPIKE, ClusterWarning.Detector.THRESHOLD):
                    existing.detector = ClusterWarning.Detector.DRIFT
                hours = max(1, round((now - existing.window_start).total_seconds() / 3600))
                cat_display = cat.replace("_", " ")
                exp_disp = round(cand["expected"], 1)
                if exp_disp.is_integer():
                    exp_disp = int(exp_disp)
                existing.explanation = (
                    f"{cand['observed']} {cat_display} reports in {lga_name} LGA across {hours} hours; "
                    f"about {exp_disp} expected"
                )
                existing.window_end = now
                existing.save(update_fields=[
                    "report_ids", "total_reports", "observed", "expected", "p_value", "q_value",
                    "window_minutes", "baseline_kind", "baseline", "detector",
                    "explanation", "window_end",
                ])
                alerts_touched.append(existing)

    return alerts_touched
