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

- **Contracts Implemented (G18):**
  - **Q-01 & CASE-01 (`backend/reports/reviewer_views.py`):**
    - Both `queue_item` and `case()` return `clock: { target_minutes, due_at, state, minutes_left, paused }`.
    - `minutes_left` is negative when overdue; stopped clocks return `state: "stopped"` and are excluded from `clock_state` filtering and `OPS-01` `overdue` counts.
    - Filtering by `clock_state` sorts results by `due_at` ascending.
    - Reads are read-only with `prefetch_related("clocks")`.
  - **Question-reply clock & lifecycle:**
    - `first_action` clock starts at server `created_at` (on REP-01, REP-05, citizen form, and SMS/USSD intake) and stops at the first reviewer action (`start`, `request_clarification`, `close`, or `withdraw`).
    - When an observer/citizen replies (`Action.RESPOND`), a separate `question_reply` clock starts (120m default) and stops when staff next respond or close.
    - Urgency changes (`CASE-03`) recompute `due_at` from the original `started_at`.
  - **Sweep & Backfill:**
    - `sweep_review_clocks` uses `select_for_update(skip_locked=True)` + conditional `UPDATE ... WHERE notified_at IS NULL` and notifies coordinators once via `security.models.Alert` (`rule="review_clock_overdue"`) and `staff.audit.record`.
    - `backfill_review_clocks` creates already-acted cases as `stopped` so deploying does not flood coordinators.
  - **ADM-04 (`backend/staff/organisation_settings.py`):**
    - Supports partial `review_targets` updates, validates 5–1440 min with `field_invalid`, and recomputes `due_at` on open clocks.
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

## Example Payloads

### Q-01 Queue Row (`GET /api/v1/review/queue`)

```json
{
  "id": "a1b2c3d4-0000-4000-8000-000000000001",
  "receipt_code": "EG-ABCD-123X",
  "kind": "incident",
  "channel": "observer",
  "status": "submitted",
  "urgency": {"level": "urgent", "source": "suggested", "reasons": ["Immediate danger reported"]},
  "clock": {
    "target_minutes": 15,
    "due_at": "2026-11-25T14:15:00+01:00",
    "state": "overdue",
    "minutes_left": -45,
    "paused": false
  }
}
```

### CASE-01 Clock (`GET /api/v1/review/cases/{id}`)

```json
{
  "target_minutes": 15,
  "due_at": "2026-11-25T14:15:00+01:00",
  "state": "on_time",
  "minutes_left": 12,
  "paused": false
}
```

### OPS-01 Overdue (`GET /api/v1/ops/overview`)

```json
{
  "overdue": {
    "urgent": 1,
    "high": 0,
    "normal": 2,
    "low": 0
  }
}
```

### ADM-04 Review Targets (`GET / PATCH /api/v1/admin/settings`)

```json
{
  "review_targets": {
    "urgent": 30,
    "high": 60,
    "normal": 240,
    "low": 480,
    "question_reply": 120
  }
}
```

## Verification

- **PostgreSQL 17 CI Suite:**
  - Full test suite verified green in GitHub Actions CI with `clocks` and `privacy` included.
  - `clocks.tests` (18 tests across `ReviewClocksTests`, `ConcurrentSweepTests`, `ReviewClockApiIntegrationTests`): covers clock creation on observer/citizen/SMS/USSD intake, atomic rollback on clock failure, target calculations, triage urgency recomputation, `notified_at` reset when urgency/targets change out of overdue, pause/resume and `question_reply` clock lifecycle, `TransactionTestCase` 2-thread barrier concurrent sweep, signed `(due_at, pk)` cursor paging for `clock_state` filter, organisation isolation, OPS-01 overdue counters, `decide_suggestion` 422 rejection of null/none urgency, `backfill_review_clocks`, and ADM-04 `review_targets` validation.
- **Round 2 Review Fixes:**
  - Wrapped `persist_report` body in `with transaction.atomic():` so report creation, review event, initial triage, and clock creation commit atomically or roll back together.
  - In `update_clock_urgency` and `recompute_org_open_clocks`, reset `notified_at = None` whenever a clock's recomputed state is not `OVERDUE`.
  - Documented reserved `paused*` model fields in `ReviewClock`.
  - Enforced 422 error rejection in `decide_suggestion` for null or `"none"` urgency.
  - Documented backfill first-sweep overdue alert behaviour in `PRODUCTION.md` and `deploy/README.md`.

## Not done / Open

- No dedicated systemd timer or Compose sidecar service was added for `run_review_clocks`; deployments schedule `python manage.py run_review_clocks --once` (or `--loop`) and run `backfill_review_clocks` once after `migrate` as documented in `PRODUCTION.md` and `deploy/README.md`.
