# C17 Review: Statistical Alerts for Unusual Report Volumes

Branch `backend/c17-emerging-alerts`, on top of `backend/c16-redaction`. Backend only; no `frontend/` or `frontend/lib/api/` paths changed.

## What changed

**Statistical Detection Engine (`backend/ops/emerging.py`).**
- Ported statistical surge detection concepts from Trace (`incidents/EmergingIssueDetector.java`, `incidents/IncidentGrouper.java`, `incidents/DetectionStats.java`) into Python/Django.
- Replaces the single static threshold (`ClusterSettings.min_reports` and `window_minutes`) with a dynamic statistical detector:
- **Dual sliding windows:** Evaluates both 30-minute and 60-minute windows simultaneously per `category x LGA`.
- **False Discovery Rate Control:** Runs the Poisson tail test on every series × window with at least 1 report, applies Benjamini–Hochberg at $q=0.05$ across the full family, and then requires `observed >= 3` and `q_value <= 0.05`.
- **CUSUM Drift:** Runs over completed hours starting at 07:00 WAT (excluding the partial current hour) using baseline (a) as the reference mean. Drift only adds evidence to an already open, unreviewed `ClusterWarning`, sets `detector="drift"`, and never opens one on its own.
- **Joining & Notification:** Joins only open, unreviewed warnings (`reviewed_at__isnull=True`, re-read with `select_for_update()`) for the same `(organisation, category, lga_code)` regardless of age. `observed`, `expected`, `p_value`, `q_value`, `window_minutes`, `baseline`, and `explanation` reflect the latest test window only, while `total_reports` tracks the running total of all attached reports. Notifies coordinators once per warning via `security.models.Alert` (`rule="emerging_volume_spike"`).
- **Exclusions:** Excludes withdrawn reports and simulated reports (`incident_details["simulated"]`).
- **Contract OPS-02:** Returns `detector`, `observed`, `total_reports`, `expected`, `p_value`, `q_value`, `window_minutes`, `baseline` (`null` for `threshold`), `explanation`, `explanation_key`, and `explanation_params`.
- **Legacy test behaviour:** `test_observations.py` freezes time to 08:30 WAT (pre-09:00 fallback) and asserts the G17 schema (`expected: 0.14`, `baseline: null`, `detector: "threshold"`).
  - **Dual baselines:** Compares observed volume against two baselines:
    1. `same_area_earlier`: The same LGA's rate-adjusted count from earlier hours today (since 07:00 WAT election start).
    2. `peer_areas`: The median count in the same window across peer LGAs in the same state right now (including zero-report peer LGAs from `AreaDataset`).
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

## Example OPS-02 Warning JSON

```json
{
  "id": "b7c2f3e8-4f5a-4d3b-9e1a-1234567890ab",
  "category": "intimidation_violence",
  "area": {"state_code": "KN", "state_name": "Kano", "lga_code": "KN-01", "lga_name": "Dala"},
  "report_count": 6,
  "detector": "spike",
  "observed": 6,
  "total_reports": 6,
  "expected": 0.5,
  "p_value": 0.0,
  "q_value": 0.0,
  "window_minutes": 30,
  "baseline": "same_area_earlier",
  "explanation": "6 intimidation violence reports in Dala LGA in the last 30 minutes; about 0.5 expected",
  "explanation_key": "ops.alert.spike",
  "explanation_params": {
    "count": 6,
    "category": "intimidation_violence",
    "lga_name": "Dala",
    "window_minutes": 30,
    "expected": 0.5
  },
  "window_start": "2026-11-25T14:30:00+01:00",
  "window_end": "2026-11-25T15:00:00+01:00",
  "report_ids": ["..."],
  "status": "open",
  "reviewed_by": null,
  "reviewed_at": null
}
```

## Verification

- **PostgreSQL 17 CI Suite (`https://github.com/karakaraye/Electraguard-Ai/actions/runs/45622597780`):**
  - Backend: **295 tests ran, 0 failures, 1 skipped** (`OK (skipped=1)` in 80.999s).
  - Frontend: `lint`, `typecheck`, and `build` passed.
  - `ops.test_emerging` (17 tests): covers Poisson tail, BH FDR, CUSUM drift (including 07:00 WAT start and `detector="drift"` promotion), pre-09:00 WAT fallback, zero-report peer median, latest-window stats with `total_reports` across 3 joins, `select_for_update()` review-race protection, and OPS-02 API contract fields.
- **Evaluation (`docs/eval/emerging-alerts.md`, run via `scripts/eval/emerging_alerts.py` on a throwaway PG17 test DB):**
  - 60 LGAs across 20 states from `data/synthetic/polling_units_synthetic.csv`; 11.1% (2/18) of surge-day warnings at the 0.5 expected floor.
  - **Old threshold (`2x` 7-period average, min 3):** 100.0% (20/20) detection rate, 9.0 min median time to detect, 1,790 quiet-day warnings across 80 hours (**22.38 false alarms/hour**).
  - **New statistical (Poisson + BH FDR q=0.05 + CUSUM):** 70.0% (14/20) detection rate, 19.0 min median time to detect, 27 quiet-day warnings across 80 hours (**0.34 false alarms/hour**).

## Not done / Open

- Ward-level time series were not built (detection operates at `LGA x category` granularity).
- Awaiting Claude's `docs/design/api-contracts.md` update for the new `total_reports` field on `OPS-02`.
