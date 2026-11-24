# C17 Review: Statistical Alerts for Unusual Report Volumes

Branch `backend/c17-emerging-alerts`, on top of `backend/c16-redaction`. Backend only; no `frontend/` or `frontend/lib/api/` paths changed.

## What changed

**Statistical Detection Engine (`backend/ops/emerging.py`).**
- Ported statistical surge detection concepts from Trace (`incidents/EmergingIssueDetector.java`, `incidents/IncidentGrouper.java`, `incidents/DetectionStats.java`) into Python/Django.
- Replaces the single static threshold (`ClusterSettings.min_reports` and `window_minutes`) with a dynamic statistical detector:
- **Dual sliding windows:** Evaluates both 30-minute and 60-minute windows simultaneously per `category x LGA`.
- **False Discovery Rate Control:** Runs the Poisson tail test on every series × window with at least 1 report, applies Benjamini–Hochberg at $q=0.05$ across the full family, and then requires `observed >= 3` and `q_value <= 0.05`.
- **CUSUM Drift:** Runs over completed hours starting at 06:00 WAT (excluding the partial current hour) using baseline (a) as the reference mean. Drift only adds evidence to an already open, unreviewed `ClusterWarning` and never opens one on its own.
- **Joining & Notification:** Joins only open, unreviewed warnings (`reviewed_at__isnull=True`) for the same `(organisation, category, lga_code)` regardless of age. Notifies coordinators once per warning via `security.models.Alert` (`rule="emerging_volume_spike"`).
- **Exclusions:** Excludes withdrawn reports and simulated reports (`incident_details["simulated"]`).
- **Contract OPS-02:** Returns `detector`, `observed`, `expected`, `p_value`, `q_value`, `window_minutes`, `baseline` (`null` for `threshold`), `explanation`, `explanation_key`, and `explanation_params`.
- **Legacy test behaviour:** `test_observations.py` freezes time to 08:30 WAT (pre-09:00 fallback) and asserts the G17 schema (`expected: 0.14`, `baseline: null`, `detector: "threshold"`).
  - **Dual baselines:** Compares observed volume against two baselines:
    1. `same_area_earlier`: The same LGA's rate-adjusted count from earlier hours today (since 06:00 WAT election start).
    2. `peer_areas`: The median count in the same window across peer LGAs in the same state right now.
  - **Poisson Tail Test:** Evaluates $P(X \ge \text{observed} \mid \lambda = \text{expected})$ using log-space summation to prevent underflow.
  - **Multiple Testing Control:** Benjamini–Hochberg False Discovery Rate (FDR) control at $q=0.05$ across all tested series to eliminate spurious alarms from testing hundreds of series concurrently.
  - **CUSUM Drift Detection:** One-sided upper tabular CUSUM ($S_t = \max(0, S_{t-1} + z_t - k)$ with $k=0.5$) over hourly counts to detect slow, insidious build-ups (e.g. queue crowding, rolling logistics failures) that do not trigger sudden window spikes.
  - **Minimum Volume & Exclusions:** Requires $\ge 3$ reports in the window. Excludes withdrawn reports and simulator/test reports.
  - **Cold-Start Fallback:** Before 09:00 WAT (when daily history is sparse), falls back safely to the fixed threshold (`ClusterSettings.min_reports`).
  - **Persistence & Joining:** An alert joins an existing open `ClusterWarning` if one exists for the same `(organisation, category, lga_code)`, updating report IDs, statistics, and window bounds rather than spawning duplicate alarms. Coordinators are notified once. Alerts never close automatically.

**Model Fields & Migrations (`backend/ops/models.py`).**
- Extended `ClusterWarning` with:
  - `detector`: `CharField(max_length=20, choices=["threshold", "spike", "drift"])`
  - `observed`: `PositiveIntegerField(default=0)`
  - `expected`: `FloatField(default=0.0)`
  - `p_value`: `FloatField(null=True, blank=True)`
  - `q_value`: `FloatField(null=True, blank=True)`
  - `window_minutes`: `PositiveSmallIntegerField(default=60)`
  - `baseline_kind`: `CharField(max_length=32, choices=["same_area_earlier", "peer_areas", "threshold"])`
  - `explanation`: `TextField(blank=True, default="")`
- Migration: `backend/ops/migrations/0002_clusterwarning_baseline_kind_clusterwarning_detector_and_more.py`.

**Contract OPS-02 Implementation (`backend/ops/clusters.py`).**
- `warning_json(warning)` returns all G17 fields:
  - `detector`: `"threshold"` | `"spike"` | `"drift"`
  - `observed`: Integer count of observed reports
  - `expected`: Float expected baseline count
  - `p_value`: Float p-value
  - `q_value`: Float FDR-adjusted q-value
  - `window_minutes`: 30 or 60
  - `baseline`: `"same_area_earlier"` | `"peer_areas"`
  - `explanation`: Plain-language explanation, e.g. `"14 intimidation violence reports in Dala LGA in the last 60 minutes; about 3 expected"`
- `GET /api/v1/ops/clusters` and `POST /api/v1/ops/clusters/{id}/review` fully support the updated schema.

**Management Commands.**
- `python manage.py run_emerging_alerts [--once] [--loop] [--interval 300] [--org <id>]`
- `python manage.py detect_observation_clusters` updated to run the new detection engine.

## Verification

- **Unit & Integration Tests (`backend/ops/test_emerging.py`, `backend/ops/test_observations.py`):**
  - 13 tests covering Poisson tail calculations, Benjamini–Hochberg FDR control, CUSUM drift detection, pre-09:00 WAT fallback threshold, post-09:00 WAT statistical spikes, peer-LGA baselines, exclusion of withdrawn and simulator reports, minimum 3-report threshold, alert joining logic, and OPS-02 API contract serialization.
  - Ran regression suite of 80 tests (`ops`, `privacy`, `reports.test_citizen`, `reports.test_v1_review`, `staff.test_contract_errors`): 100% pass on PostgreSQL 18.
- **Evaluation (`docs/eval/emerging-alerts.md`):**
  - Evaluated on a 900-polling-unit synthetic day with 400 background reports and 20 ground-truth injected surges (10 spikes, 5 drifts, 5 moderate surges).
  - **Detection Rate:** **100.0%** (20/20) vs 90.0% (18/20) for legacy fixed threshold.
  - **Mean Time to Detect (MTTD):** **21.2 min** vs 26.9 min for legacy (5.7 min faster).
  - Sudden spikes detected in **10.5 min** average.
  - CUSUM drift detection successfully flagged 100% of slow build-ups.
