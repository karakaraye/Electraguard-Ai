# C18 Review: Review Clocks and Overdue Alerts

Branch `backend/c18-review-clocks`, on top of `backend/c17-emerging-alerts`. Backend only; no `frontend/` or `frontend/lib/api/` paths changed.

## What changed

**Review Clocks Architecture (`backend/clocks/`).**
- Ported regulatory review clock concepts from Trace (`regulatory/RegulatoryClock.java`, `regulatory/RegulatoryClocks.java`, `regulatory/RegulatorySweep.java`, `handoffs/OverdueSweep.java`) into Python/Django.
- Each open case tracks a clock against an organisation-configured review target:
  - **Urgent:** 15 minutes (default)
  - **High:** 60 minutes (default)
  - **Normal:** 240 minutes (default)
  - **Low:** 480 minutes (default)
  - **Question reply:** 120 minutes (default)
- **Clock Mechanics (`backend/clocks/calculator.py`):**
  - **Starts** at report receipt / occurrence time (`occurred_at` / `created_at`).
  - **Pauses** when staff asks a formal question (`Action.REQUEST_CLARIFICATION`, moving report to `needs_clarification`), freezing remaining time.
  - **Resumes** when the citizen or observer submits a reply (`Action.RESPOND`), accumulating paused duration and extending `due_at`.
  - **Stops** permanently at the first reviewer action (`start`, `request_clarification`, `close`) or when the case is withdrawn.
  - **States:**
    - `on_time`: > 25% of target window remaining.
    - `due_soon`: $\le 25\%$ of target window remaining and not overdue.
    - `overdue`: deadline expired ($\text{remaining} \le 0$).
- **Model (`backend/clocks/models.py`):**
  - `ReviewClock`: `organisation`, `report`, `urgency`, `target_minutes`, `started_at`, `due_at`, `state`, `paused`, `paused_at`, `paused_seconds`, `stopped_at`, `notified_at`.
  - Indexed by `(organisation, state)` and `(organisation, due_at)`.
- **Clock Sweep (`backend/clocks/sweep.py`):**
  - `sweep_review_clocks(now)` evaluates all running clocks, advances state transitions, and generates a single `case.overdue` audit event when a case breaches its target.
  - Subsequent sweeps do not duplicate notifications.
- **Management Command:**
  - `python manage.py run_review_clocks [--once] [--loop] [--interval 60]`.

**Contracts Implemented (G18).**
- **Q-01 & CASE-01 (`backend/reports/reviewer_views.py`):**
  - `queue_item` and `case` detail endpoints return the `clock` block:
    ```json
    "clock": {
      "target_minutes": 15,
      "due_at": "2026-11-24T20:30:00+01:00",
      "state": "on_time",
      "minutes_left": 12,
      "paused": false
    }
    ```
  - `GET /api/v1/review/cases` (and `/api/v1/review/queue`, `/api/v1/cases`) accepts the `clock_state` filter (`on_time`, `due_soon`, `overdue`).
  - Route aliases added in `v1_urls.py`: `/api/v1/cases`, `/api/v1/review/cases`, `/api/v1/cases/{ref}`.
- **OPS-01 (`backend/reports/operations_views.py`):**
  - `GET /api/v1/ops/overview` adds the `overdue` breakdown across open active cases:
    ```json
    "overdue": {
      "urgent": 1,
      "high": 0,
      "normal": 0,
      "low": 0
    }
    ```
- **ADM-04 (`backend/staff/organisation_settings.py`, `backend/accounts/models.py`):**
  - Added `review_targets = JSONField(default=default_review_targets)` to `Organisation`.
  - `GET /api/v1/admin/settings` returns `review_targets: { urgent, high, normal, low, question_reply }`.
  - `PATCH /api/v1/admin/settings` validates (each target must be an integer between 5 and 1,440 minutes) and updates organisation targets.

## Verification

- **Unit & Integration Tests (`backend/clocks/tests.py`):**
  - 8 tests covering clock creation by urgency, target calculations, pause/resume cycles, stop on reviewer actions, overdue sweep notification deduplication, queue clock state filtering, OPS-01 overdue counters, and ADM-04 settings validation.
- **Full Backend Regression Suite:**
  - 90 tests ran across `clocks`, `ops`, `privacy`, `reports.test_citizen`, `reports.test_v1_review`, `staff.test_contract_errors`, and `staff.test_retention`.
  - 100% passed on PostgreSQL 18.
