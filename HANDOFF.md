# Stage 5 handoff

**Current branch** `work`. This branch contains Stages 1–5.

## What works

- The **Observation dashboard** in the Administrator Workspace shows internal observation data. Django enforces Administrator-only access and returns aggregate counts. The API includes no report text, references, Observer identities, or evidence.
- A West Africa Time date filter selects reports by incident date. Submitted reports counts all selected reports across review statuses. Distinct incidents counts connected groups of Reviewer-confirmed links. A confirmed group that spans dates is counted if any member is selected. Pending and dismissed links have no effect. The category breakdown prefers the Reviewer correction, then the triage suggestion, then Uncategorized.
- The repeatable `seed_dashboard_demo` command creates the fictional accounts and one counterpart report without resetting review progress. The README walks through submitting the second report with synthetic private evidence, assigning both cases, confirming the match, and recording a closure rationale.
- The evaluation freezes the existing `local-lexical-v1` method. The [synthetic evaluation report](evaluation/README.md) records all per-category precision and recall scores, denominators, and representative held-out errors.

## Commands and results

Backend commands ran from the repository root. Frontend commands ran from `frontend/`.

| Command or check | Result |
| --- | --- |
| `backend/.venv/bin/python backend/manage.py test accounts reports` | All 20 tests passed on PostgreSQL 17. Dashboard tests verified Administrator-only access, WAT date boundaries, A–B–C transitive grouping, exclusion of pending and dismissed links, aggregate-only fields, and category precedence. |
| `backend/.venv/bin/python backend/manage.py check`, `migrate --check`, and `makemigrations --check --dry-run` | No issues, pending migrations, or model changes. Stage 5 needed no schema migration. |
| `backend/.venv/bin/python backend/manage.py evaluate_triage` | 7 development reports and 22 held-out reports from 16 held-out incidents. Among 231 held-out pairs, 6 were duplicates. Precision and recall were both 66.7% (4/6). Per-category scores and errors are in the evaluation report. |
| `backend/.venv/bin/python backend/manage.py seed_dashboard_demo` | Reran before and after the demo. The same counterpart reference was reused, and rerunning after closure kept both reports and their review progress. |
| `npm run lint`, `npm run typecheck`, and `NEXT_TELEMETRY_DISABLED=1 npm run build` | All passed. |
| `backend/.venv/bin/python backend/manage.py runserver 127.0.0.1:8000 --noreload` and `npm run start -- --hostname localhost` | Served the API and built frontend for Chromium. |
| `node /tmp/electraguard-browser/stage5.cjs` | Chromium verified Observer submission with synthetic private evidence, Administrator assignments, `run_triage --once`, Reviewer match confirmation and closure with rationale, and the dashboard date filter. The dashboard moved from **2 reports / 2 incidents** before confirmation to **2 reports / 1 incident** after confirmation. Observer and Reviewer API requests to the dashboard were denied. |
| Django shell reconciliation | PostgreSQL contained two demo reports and one confirmed link connecting exactly those reports. The status counts were one Submitted and one Closed. Both were Access or accessibility. These counts matched the dashboard. |
| `node /tmp/electraguard-browser/audit-gap.cjs` and `node /tmp/electraguard-browser/smoke.cjs` | Chromium passed Stage 3 assignment and reassignment, clarification, closure and snapshots, stale upload rejection, and post-closure download. Stage 1 sign-in, role boundaries, and sign-out passed for all three demo roles. |

The Chromium scripts were temporary workspace checks. The verified pair of fictional demo reports remains in the workspace so the dashboard can be viewed. Additional regression fixtures were removed. Follow the README with a fresh database for a clean replay.

## Known limitations

- Evaluation is synthetic, small, and predominantly English. The duplicate metrics measure the similarity gate before assignment filtering and the five-result UI cap. Real-world accuracy and production-scale dashboard performance were outside this run.
- Incident grouping uses connected confirmed links. A mistaken confirmation can group more than two reports through transitive links. The Stage 4 workflow has no action to reverse a recorded match decision.
- Windows PowerShell and a separately managed PostgreSQL instance were outside this run.

## Next task for Greatness

Add an audited Reviewer action to reverse an incorrect match decision while preserving both reports and the original audit entry. Verify that removing a confirmed bridge from A–B–C splits the dashboard count into two incidents and that only a Reviewer assigned to both reports can reverse the decision.
