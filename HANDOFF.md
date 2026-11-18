# Handoff: match reversal on top of Stage 5

**Current branch** `feature/reverse-confirmed-match`, created from the Stage 5 checkpoint `eef8d92` on `work`. Commit `fad8927` adds the backend reversal API. The following commit adds the Reviewer UI and this handoff.

## Handover to Greatness Charles

### Where things stand

- **`work` branch.** Contains the five completed prototype stages: observer reporting with private evidence, case assignment, reviewer decisions and audit history, advisory AI triage, and the internal observation dashboard.
- **Draft PR #1** (`feature/reverse-confirmed-match` into `work`, https://github.com/karakaraye/Electraguard-Ai/pull/1). Adds an audited Reviewer action to reverse an incorrect duplicate match. Frontend lint, type checking, the production build, and Chromium checks against a stub API passed. PostgreSQL verification and the real-stack Chromium demo are still pending. See [Match reversal checks](#match-reversal-checks).

### Your first task: verify the latest PR commit

1. Check out the latest commit of PR #1 and note its full hash.
2. Create a dedicated PostgreSQL 17 database for verification and use only synthetic data. Installing PostgreSQL directly on Windows is fine (README, "Option B — Existing PostgreSQL"). Docker is optional (README, "Option A").
3. Run the migrations, the accounts and reports test suite, and `sqlmigrate reports 0005`, using the commands under [Match reversal checks](#match-reversal-checks). On Windows PowerShell, use `.\backend\.venv\Scripts\python.exe` wherever those commands use `backend/.venv/bin/python`. Migration 0005 should show two `-- Alter field` comments and no SQL statements.
4. Run the Stage 5 fictional demo in Chromium against the real frontend and Django backend (README, "Stage 5 fictional demo"). Check the Administrator dashboard at each step:
   - Before confirming the match: **2 reports / 2 incidents**.
   - After the Reviewer confirms the match: **2 reports / 1 incident**.
   - After the Reviewer reverses it with a reason: **2 reports / 2 incidents**.

   Also verify that both reports remain available and that the assigned Reviewer's audit history shows both the original confirmation and the reversal reason.
5. Send back the commit tested, the commands run, the result of each, and any blockers.

### Hackathon preparation

- Rehearse the demo locally and record a two-minute walkthrough.
- Before deploying anywhere, confirm whether the judges need a public link.

## Match reversal (this branch)

- **Backend (`fad8927`).** `POST /api/review/<reference>/triage/matches/<candidate>/reverse` takes `{version, reason}`. The reason is required, cannot be blank, and is capped at 2,000 characters. Both report locks are taken in primary-key order, and both reports must still be assigned to the requesting Reviewer. The match changes from `confirmed` to `reversed`, and a `reverse_match` audit entry (`candidate`, `previous_decision`, `reason`) is saved in the same transaction. Stale and repeated requests return 409 without adding audit entries. Reports, the original confirmation entry, and closure snapshots are unchanged. `get_history` applies the same candidate-visibility filter to reversal entries as to match decisions. Migration `0005_match_reversal` only changes the allowed values of two fields. The dashboard code is unchanged because it already groups only confirmed links. A reversed match cannot be confirmed again.
- **Reviewer UI.** In the case view, **Possible duplicate reports** is now a client component (`possible-matches.tsx`). Only a match currently `confirmed` and returned by Django for this Reviewer shows **Reverse match**. The form identifies the matched report by reference, location, and incident time. It requires a nonblank reason (up to 2,000 characters) and then a confirmation step. A ref guard and disabled controls during the request and refresh prevent duplicate submissions. On success the view refreshes and shows **Reversed**. On 409 it explains that the case or match changed and refreshes. On 403 or 404 it refreshes, closes the form, and shows only details Django still returns. Audit history shows the original confirmation and the reversal with its reason. Confirm and dismiss for pending matches are unchanged. Labels live in `match-decisions.ts`.

### Match reversal checks

| Command or check | Result |
| --- | --- |
| `manage.py check` and `makemigrations --check --dry-run` (backend) | No issues, no pending model changes. |
| `git diff --check` | Clean. |
| `manage.py test accounts reports` on an in-memory SQLite settings override (scratch only) | 25 of 27 passed, including all 7 new reversal tests. The 2 errors are the existing PostgreSQL concurrency tests, which fail the same way on unmodified Stage 5 code under SQLite. This does not replace the PostgreSQL run. |
| `npm ci`, `npm run lint`, `npm run typecheck`, `NEXT_TELEMETRY_DISABLED=1 npm run build` | All passed on Node 22.23.5 and npm 10.9.9. The lockfile allows Node 22 (Next.js requires >=20.9). The README recommends Node 24, which was unavailable. |
| Chromium UI check against the production build and a **stub** review API (scratch only) | Passed 3 of 3 runs. Confirmed only the confirmed match offers reversal, the pending decision form remains, blank and whitespace reasons are blocked, the candidate is identified, a repeated click sends one request, **Reversed** and both audit entries with the reason appear, 409 and access-denial paths refresh and remove the candidate's details, and there were no page errors. The stub does not exercise Django or PostgreSQL. |

**Not run, pending an approved PostgreSQL 17 instance:**

- `backend/.venv/bin/python backend/manage.py migrate && backend/.venv/bin/python backend/manage.py test accounts reports`
- `backend/.venv/bin/python backend/manage.py sqlmigrate reports 0005`. The expected output is two `-- Alter field` comments and no SQL statements.
- Chromium end-to-end check with the real stack. Seed with `seed_dashboard_demo`, submit and assign the second report per the Stage 5 demo, and drain triage. The dashboard should show **2 reports / 2 incidents**, then **2 reports / 1 incident** after the Reviewer confirms the match, then **2 reports / 2 incidents** after the Reviewer reverses it with a reason.

## Stage 5 record

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
- Incident grouping uses connected confirmed links. A mistaken confirmation can group more than two reports through transitive links. A Reviewer assigned to both reports can now reverse a confirmed link. Reversed links cannot be confirmed again, and dismissed links cannot be reversed.
- Windows PowerShell and a separately managed PostgreSQL instance were outside this run.

## Next task

1. Run the PostgreSQL test suite, `sqlmigrate reports 0005`, and the real-stack Chromium dashboard check listed above.
2. Review the draft pull request for this branch into `work`.
3. Decide whether reversed links should be confirmable again. That is outside this task.
