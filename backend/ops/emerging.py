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
from staff.audit import record
from staff.fields import category as report_category_field, is_incident

from .models import ClusterSettings, ClusterWarning

WAT = ZoneInfo("Africa/Lagos")


def poisson_tail(observed: int, expected: float) -> float:
    """Calculates P(X >= observed) for X ~ Poisson(expected).

    Uses stable log-space summation to prevent underflow/overflow.
    Ported from Trace DetectionStats.poissonTail.
    """
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
    for rank, (orig_idx, p) in enumerate(indexed, start=1):
        if p <= (q * rank / m):
            cutoff_rank = rank
    rejected = [False] * m
    for rank in range(1, cutoff_rank + 1):
        rejected[indexed[rank - 1][0]] = True
    return rejected


def q_values(p_values: list[float]) -> list[float]:
    """Calculates step-up Benjamini-Hochberg adjusted p-values (q-values).

    q_(i) = min_{k >= i} (p_(k) * m / k), capped at 1.0.
    """
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


def is_simulator_report(report: Report, details: dict) -> bool:
    """Identifies test / simulator reports to exclude from statistical alerts."""
    if details.get("is_simulator"):
        return True
    if details.get("reporter_type") == "simulated_agent":
        return True
    observer = getattr(report, "observer", None)
    if observer and getattr(observer, "role", "") == "simulator":
        return True
    return False


def build_plain_explanation(category_name: str, lga_name: str, window_minutes: int, observed: int, expected: float) -> str:
    """Builds user-friendly plain-language explanation for coordinators.

    e.g. '14 intimidation reports in Dala LGA in the last 60 minutes; about 3 expected'
    """
    cat_label = category_name.replace("_", " ")
    exp_display = round(expected, 1)
    if exp_display.is_integer():
        exp_display = int(exp_display)
    return f"{observed} {cat_label} reports in {lga_name} LGA in the last {window_minutes} minutes; about {exp_display} expected"


@transaction.atomic
def detect_emerging(org_id, now=None):
    """Evaluates report series for unusual volumes using Poisson window tests, FDR control,

    and CUSUM drift detection.
    """
    if now is None:
        now = timezone.now()
    wat_now = now.astimezone(WAT)

    organisation = Organisation.objects.select_for_update(no_key=True).get(pk=org_id)
    config = ClusterSettings.objects.filter(organisation=organisation).first() or ClusterSettings(organisation=organisation)
    configured_categories = set(config.categories or CATEGORIES)

    # Fallback to fixed threshold before 09:00 WAT (when baseline history for today is negligible)
    if wat_now.hour < 9:
        return _fallback_threshold_detection(organisation, config, now, wat_now, configured_categories)

    return _statistical_detection(organisation, config, now, wat_now, configured_categories)


def _fallback_threshold_detection(organisation, config, now, wat_now, configured_categories):
    interval = timedelta(minutes=config.window_minutes)
    start = now - interval
    reports = Report.objects.filter(
        organisation=organisation,
        occurred_at__gte=start - 7 * interval,
        occurred_at__lt=now,
    ).exclude(status=Report.Status.WITHDRAWN)

    recent = defaultdict(list)
    baseline = Counter()
    areas = {}

    for report in reports.iterator():
        details = report.incident_details or {}
        if is_simulator_report(report, details):
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
        existing = ClusterWarning.objects.filter(
            organisation=organisation, lga_code=lga, category=name, window_end__gt=start,
        ).first()
        lga_name = areas[lga, name].get("lga_name") or lga
        explanation = build_plain_explanation(name, lga_name, config.window_minutes, len(ids), average)
        if existing:
            existing.report_ids = sorted(list(set(existing.report_ids + ids)))
            existing.observed = len(existing.report_ids)
            existing.expected = round(average, 2)
            existing.baseline = round(average, 2)
            existing.window_end = now
            existing.explanation = explanation
            existing.save(update_fields=["report_ids", "observed", "expected", "baseline", "window_end", "explanation"])
            alerts_created.append(existing)
        else:
            warning = ClusterWarning.objects.create(
                organisation=organisation,
                category=name,
                area=areas[lga, name],
                lga_code=lga,
                report_ids=sorted(ids),
                baseline=round(average, 2),
                expected=round(average, 2),
                observed=len(ids),
                detector=ClusterWarning.Detector.THRESHOLD,
                window_minutes=config.window_minutes,
                baseline_kind=ClusterWarning.BaselineKind.THRESHOLD,
                explanation=explanation,
                window_start=start,
                window_end=now,
            )
            record(organisation.pk, "create_cluster_warning", "cluster_warning", warning.pk)
            alerts_created.append(warning)
    return alerts_created


def _statistical_detection(organisation, config, now, wat_now, configured_categories):
    # Today's election window starts at 06:00 WAT
    election_start_wat = datetime.combine(wat_now.date(), time(6, 0), tzinfo=WAT)
    if election_start_wat > wat_now:
        election_start_wat = wat_now - timedelta(hours=3)
    election_start_utc = election_start_wat.astimezone(dt_timezone.utc)

    # Fetch all reports from 06:00 WAT today up to now
    reports = list(
        Report.objects.filter(
            organisation=organisation,
            occurred_at__gte=election_start_utc,
            occurred_at__lt=now,
        ).exclude(status=Report.Status.WITHDRAWN)
    )

    # Structure reports by occurred_at, LGA, category, state
    valid_reports = []
    lga_areas = {}
    for r in reports:
        details = r.incident_details or {}
        if is_simulator_report(r, details):
            continue
        area = details.get("area") or {}
        cat_info = report_category_field(r)
        cat_name = cat_info.get("value") or cat_info.get("code")
        if not is_incident(details, getattr(r, "kind", "incident")) or cat_name not in configured_categories:
            continue
        lga = area.get("lga_code")
        if not lga:
            continue
        lga_areas[lga] = {field: area.get(field) for field in ("state_code", "state_name", "lga_code", "lga_name")}
        valid_reports.append({
            "id": str(r.pk),
            "occurred_at": r.occurred_at,
            "lga_code": lga,
            "state_code": area.get("state_code", ""),
            "category": cat_name,
        })

    candidate_series = []

    # Windows to test: 30 minutes and 60 minutes
    windows_to_test = [30, 60]

    for win_min in windows_to_test:
        win_start = now - timedelta(minutes=win_min)

        # Count reports in this window per (state, lga, category)
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
                state_lga_window_counts[(state, cat)][lga] += 1
            else:
                earlier_counts[key] += 1

            # Hourly bucket relative to start of day
            hours_since_start = int((t - election_start_utc).total_seconds() // 3600)
            if hours_since_start >= 0:
                hourly_counts[key][hours_since_start] += 1

        earlier_hours = max(0.25, (win_start - election_start_utc).total_seconds() / 3600.0)
        win_hours = win_min / 60.0

        for (lga, cat), ids in window_counts.items():
            observed = len(ids)
            if observed < 3:
                continue

            area_info = lga_areas.get(lga, {})
            state = area_info.get("state_code", "")

            # Baseline (a): same area earlier today rate-adjusted
            earlier_cnt = earlier_counts[(lga, cat)]
            rate_earlier = earlier_cnt / earlier_hours
            expected_earlier = rate_earlier * win_hours

            # Baseline (b): peer LGAs in same state right now
            peers = [
                cnt for other_lga, cnt in state_lga_window_counts[(state, cat)].items()
                if other_lga != lga
            ]
            expected_peers = statistics.median(peers) if peers else 0.0

            if expected_earlier >= expected_peers:
                expected = max(expected_earlier, 0.5)
                baseline_kind = ClusterWarning.BaselineKind.SAME_AREA_EARLIER
            else:
                expected = max(expected_peers, 0.5)
                baseline_kind = ClusterWarning.BaselineKind.PEER_AREAS

            p_val = poisson_tail(observed, expected)

            # Candidate classification:
            # 1. Sudden rise in current window -> SPIKE
            # 2. Slow cumulative build-up across hours without sudden window rise -> DRIFT
            is_spike = (observed >= 2 * expected) and (observed >= 3)
            is_drift = False

            hours_elapsed = int((now - election_start_utc).total_seconds() // 3600) + 1
            if hours_elapsed >= 3:
                series_hourly = [hourly_counts[(lga, cat)][h] for h in range(hours_elapsed)]
                mean_h = sum(series_hourly[:-1]) / max(1, len(series_hourly) - 1)
                variance_h = sum((x - mean_h) ** 2 for x in series_hourly[:-1]) / max(1, len(series_hourly) - 2) if len(series_hourly) > 2 else mean_h
                sd_h = math.sqrt(max(variance_h, mean_h, 0.25))
                s_stat = cusum(series_hourly, mean_h, sd_h, k=0.5)
                if s_stat and s_stat[-1] > 4.0 and sum(series_hourly[-2:]) >= 3:
                    is_drift = True

            if is_spike:
                detector = ClusterWarning.Detector.SPIKE
            elif is_drift:
                detector = ClusterWarning.Detector.DRIFT
            else:
                continue

            candidate_series.append({
                "lga": lga,
                "category": cat,
                "window_minutes": win_min,
                "window_start": win_start,
                "observed": observed,
                "expected": expected,
                "p_value": p_val,
                "detector": detector,
                "baseline_kind": baseline_kind,
                "area": area_info,
                "report_ids": ids,
            })

    if not candidate_series:
        return []

    # Multiple testing: control False Discovery Rate at 5% across all tested series
    p_values = [cand["p_value"] for cand in candidate_series]
    q_vals = q_values(p_values)
    bh_flags = benjamini_hochberg(p_values, q=0.05)

    for cand, q, rejected in zip(candidate_series, q_vals, bh_flags):
        cand["q_value"] = q
        cand["rejected"] = rejected

    # Keep candidates that pass FDR control at q <= 0.05
    significant = [cand for cand in candidate_series if cand["rejected"] or cand["q_value"] <= 0.05]
    if not significant:
        return []

    # Deduplicate candidate windows for the same (lga, category): choose window with lowest p-value
    best_per_series = {}
    for cand in significant:
        key = (cand["lga"], cand["category"])
        if key not in best_per_series or cand["p_value"] < best_per_series[key]["p_value"]:
            best_per_series[key] = cand

    alerts_created = []
    for (lga, cat), cand in best_per_series.items():
        existing = ClusterWarning.objects.filter(
            organisation=organisation,
            lga_code=lga,
            category=cat,
            window_end__gt=cand["window_start"],
        ).first()

        lga_name = cand["area"].get("lga_name") or lga
        explanation = build_plain_explanation(
            cat, lga_name, cand["window_minutes"], cand["observed"], cand["expected"]
        )

        if existing:
            # Join existing open alert
            combined_ids = sorted(list(set(existing.report_ids + cand["report_ids"])))
            existing.report_ids = combined_ids
            existing.observed = len(combined_ids)
            existing.expected = round(cand["expected"], 2)
            existing.p_value = cand["p_value"]
            existing.q_value = cand["q_value"]
            existing.detector = cand["detector"]
            existing.window_minutes = cand["window_minutes"]
            existing.baseline_kind = cand["baseline_kind"]
            existing.baseline = round(cand["expected"], 2)
            existing.explanation = explanation
            existing.window_end = now
            existing.save(update_fields=[
                "report_ids", "observed", "expected", "p_value", "q_value",
                "detector", "window_minutes", "baseline_kind", "baseline",
                "explanation", "window_end",
            ])
            alerts_created.append(existing)
        else:
            # Open new alert
            warning = ClusterWarning.objects.create(
                organisation=organisation,
                category=cat,
                area=cand["area"],
                lga_code=lga,
                report_ids=sorted(cand["report_ids"]),
                baseline=round(cand["expected"], 2),
                expected=round(cand["expected"], 2),
                observed=cand["observed"],
                p_value=cand["p_value"],
                q_value=cand["q_value"],
                detector=cand["detector"],
                window_minutes=cand["window_minutes"],
                baseline_kind=cand["baseline_kind"],
                explanation=explanation,
                window_start=cand["window_start"],
                window_end=now,
            )
            record(organisation.pk, "create_cluster_warning", "cluster_warning", warning.pk)
            alerts_created.append(warning)

    return alerts_created
