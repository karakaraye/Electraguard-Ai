# ElectraGuard Track 5 release acceptance

The baseline is `work` at `eef8d92`. The matrix records source inspection against PRD 1.0. The Stage 5 handoff describes previous PostgreSQL and Chromium runs. Those runs do not establish acceptance of this release.

ElectraGuard documents observations for the workspace. Reviewers assess the evidence available for individual reports. Official electoral determinations remain with the responsible authorities. Dashboard totals describe reports received within the selected incident dates. They provide no estimate of nationwide incidence or observation coverage.

## Requirements matrix

| PRD | Baseline evidence and outstanding work | Release check or dependency |
| --- | --- | --- |
| AUTH-01 | Django enforces stored roles, uses DB sessions and invalidates sessions on sign-out. Next checks workspace access before rendering. | Try cross-role page and API links. Test expiry and Back after sign-out on a shared-device browser session. |
| OBS-01 | Observer form captures incident time, approximate location and account. It uses device time and the case displays WAT. Server validation has a general form message. | Verify the timezone is visible before submit, approximate location works by itself, and required field errors are clear at the field. |
| OBS-02 | `views.py` and `tests.py` cover scoped submission keys, replay and changed-payload conflict. `incident-form.tsx` keeps the held submission for retry. | Interrupt before commit and discard the successful response after a committed save in separate browser runs. Retry and assert one row and one reference. After leaving the form, find the committed report in My Reports. |
| OBS-03 | Report save and attachment upload are separate. Upload validation and deduplication exist, along with receipt and retry UI. | Use invalid, oversized and interrupted uploads. Confirm the report survives and replaying valid bytes produces one attachment. |
| OBS-04 | Scoped owner list, detail, attachment downloads and active clarification reply exist. Baseline observer detail has no durable question/reply history or closed outcome. | Deny another observer direct report and file URLs. Verify clarification history, return to In review and clarification-first ordering. Approve owner-visible outcome fields before exposing them. |
| REV-01 | Assigned queue, original account, private evidence and audit history exist. Backend tests cover reassignment. Queue has no status filter at baseline. | Check queue and return navigation on phone. Reassign with the old case open, exercise stale case and file links and a stale action, and check that the UI clears private material once access loss is known. |
| REV-02 | `workflow.py` enforces version and allowed transitions, with transactional audit, including a required closure rationale. | Run PostgreSQL concurrency and rollback tests and attempt whitespace closure and stale closure from the case view. |
| REV-03 | New closures snapshot the attachment IDs in the audit. Legacy closures retain their original history. | Reconcile actor, time, outcome, rationale and snapshot in the case audit. Race upload with closure and verify a report with no attachment has an empty snapshot. |
| REV-04 | Local triage uses time, approximate location and account text. The reviewer view distinguishes pending and failed work and allows manual review. | With the worker stopped, finish Core. If the worker is available in a separate check, verify suggestions remain advisory, without confidence percentages, and candidates stay scoped. |
| ADM-01 | Open-report assignment view and restricted routing action exist. Review workflow tests cover access revocation. | Try inactive and non-reviewer assignees, assignment after closure, and original evidence access from the Administrator role. |
| ADM-02 | `dashboard.py` filters by incident dates in WAT and aggregates statuses and categories. Baseline lacks closed-outcome counts and always shows grouping. | Reconcile same-day, empty, invalid and cross-midnight ranges against report rows and closure events. Check the sum of closed outcomes equals the closed cohort, including historical closure fixtures. |
| GRP-01 | Baseline triage offers one-way confirmation or dismissal and checks both endpoint assignments. No scoped comparison preview or whole-component visibility check. | Withhold grouping. To qualify later, verify preview permissions, graph revision and actor binding, stale and concurrent writes and generic denial under partial visibility. |
| GRP-02 | No audited reversal at baseline. | Withhold grouping. To qualify later, reverse with a required reason, preserve the original event and frozen assessment, and verify safe replay. |
| GRP-03 | Baseline connected component queries have tests for transitive and out-of-period links. No paired capability gate or validated consistent snapshot. | Core must refuse match decisions and omit the group total. A grouping release additionally needs one logical snapshot and independently counted bridge, alternate-path and cross-period cases. |
| OPS-01 | `seed_dashboard_demo` creates demo accounts and one synthetic counterpart. Rerunning preserves later progress. The historical rehearsal included the worker. | Rehearse on a clean fixture with the worker stopped. Verify reset and pre-seeded fallback in separate fixtures. |

## Delivery sequence and gates

1. Reproduce a clean PostgreSQL install. Capture commands and expected counts before live writes.
2. Qualify the report-level dashboard and pair the grouping switch across server and UI. Check access, audit rollback and evidence consistency with independent tests.
3. Complete the Core phone paths and interruption handling. Verify all three roles at 320 and 360 CSS pixels, enlarged text at 200%, keyboard focus and live status announcements. Check TalkBack on Android and run five formative sessions across all three roles, including assistive technology. Record help needed, mistakes and recovery times. The monochrome PRD direction governs pending further Karen design guidance.
4. Rehearse Core on a clean fixture and verify independent WAT counts and recovery with triage stopped. Reserve optional guidance, translation, partner connections and publishing for later scope. Confirm organiser rules before claiming any formal cross-track participation.
5. Qualify grouping separately only if Core passes. Require all GRP tests together before exposing links or group totals. The demo ending below assumes report-only mode.

Core readiness requires actual passing evidence for the full critical journey, access, data integrity, field recovery, WAT reconciliation, mobile acceptance and worker independence. Record any unavailable browser, hardware or participant evidence as unverified. The working privacy proposal for the observer is to expose their own history and approved outcome category while keeping assignee identity, internal rationale and cross-report information private. Owner-visible outcome fields remain subject to approval.

## Core operator runbook

Follow the Windows prerequisites and environment setup in [README.md](README.md). Use a dedicated empty fictional PostgreSQL database and three local demo passwords. Sign in to separate role sessions before sharing the screen. Keep credentials and account identifiers out of recordings and shared material. From the repository root, after installing dependencies:

```powershell
.\backend\.venv\Scripts\python.exe backend/manage.py migrate
.\backend\.venv\Scripts\python.exe backend/manage.py seed_dashboard_demo
.\backend\.venv\Scripts\python.exe backend/manage.py runserver 127.0.0.1:8000 --noreload
```

In another terminal:

```powershell
npm.cmd --prefix frontend run dev -- --hostname localhost
```

Open `http://localhost:3000`. Leave the triage worker stopped. The release candidate runs in report-only mode. Rerunning the seed keeps case progress. For a full replay, use a new dedicated database and rerun migrations and seed.

1. As Observer, submit a case for **12 March 2026, 09:05 WAT**, at **Fictional Cedar Training Hall**. Convert to the equivalent device time if needed. Use the account “A crate blocked the ramp and wheelchair users could not enter.” Choose the [fictional illustration](demo/synthetic-evidence.png) as optional evidence. Note the reference after the server confirms the report and verify the independent attachment status. If the photo fails, use the attachment retry or continue with a rationale that reflects the evidence actually available.
2. As Administrator, use **Reviewer assignments** to assign the new reference to the active demo Reviewer. Leave the seeded 09:00 WAT counterpart Submitted.
3. As Reviewer, open the assigned reference, start review, and ask “Which entrance was blocked?” As Observer, open the same reference in **My Reports** and reply “The east entrance ramp.”
4. As Reviewer, confirm the original account and clarification remain available. Inspect the fictional illustration. If it supports the assessment, close as **Corroborated by available evidence** with a rationale referring to the ramp and the available attachment. Show the audit event and the recorded snapshot. If the attachment remains unavailable, choose **Insufficient evidence** for the scripted fallback and reconcile the corresponding outcome.
5. As Administrator, filter the dashboard from **12 March 2026** through **12 March 2026** in WAT. Explain that the two records are two received reports. No group metric or match decision should appear in Core mode.

| Fixture state | Reports | Statuses | Closed outcomes |
| --- | ---: | --- | --- |
| Immediately after seed | 1 | 1 Submitted | None |
| New case requests clarification | 2 | 1 Submitted, 1 Needs clarification | None |
| Observer answers | 2 | 1 Submitted, 1 In review | None |
| Reviewer closes with the available photo | 2 | 1 Submitted, 1 Closed | 1 Corroborated by available evidence |
| Reviewer closes without adequate evidence | 2 | 1 Submitted, 1 Closed | 1 Insufficient evidence |
| Same-day filter for 13 March 2026 | 0 | None | None |

With the clean fixture, worker stopped, and no manual category corrections, all selected reports are Uncategorized. The fixture has one incident at 08:00 UTC and the scripted submission adds one at 08:05 UTC. The date range for 12 March in WAT runs from 11 March 23:00 UTC inclusive to 12 March 23:00 UTC exclusive. Independently verify the per-status counts and closure event outcomes within those bounds before presenting.

In a separate empty fictional database, run migrations and `backend/manage.py seed_dashboard_demo --fallback` with the same virtual environment. The command creates a completed case and prints its reference. If the venue connection fails, use that local fixture, label the case **Pre-seeded fictional case**, and state that live submission was skipped. Show the recorded clarification, assessment and reconciled dashboard. Keep the live and pre-seeded fixtures in separate databases.

## Verification record

The Windows candidate used Node 24.22.1, Python 3.14.2, and an isolated PostgreSQL 18.1 instance bound to loopback. Historical Stage 5 results are in [HANDOFF.md](HANDOFF.md).

| Check | Candidate evidence |
| --- | --- |
| `python -m pip install -r backend/requirements.txt` in a fresh virtual environment | Pinned Python packages installed. The sandboxed attempt could not resolve the package registry. |
| `npm ci --no-audit --no-fund` in `frontend` | Clean retry installed all 347 packages. The earlier overlapping install left files missing and failed lint and typecheck. |
| `python backend/manage.py test accounts reports` | All 22 tests passed on PostgreSQL, including expired-session denial for report and evidence URLs. Includes access and reassignment, stale and concurrent writes, audit rollback, evidence deduplication and snapshot, advisory-worker failure, and report-only dashboard and mutation gating. |
| `python backend/manage.py makemigrations --check --dry-run` and `python backend/manage.py migrate --check` | No model changes detected and no unapplied migrations. |
| `python backend/manage.py migrate` and `python backend/manage.py seed_dashboard_demo` | Both passed on a fresh demo database. Triage remained stopped. |
| `python backend/manage.py seed_dashboard_demo --fallback` | Passed in a separate database. Direct PostgreSQL counts and the authenticated dashboard both returned 2 reports, 1 Submitted, 1 Closed, and 1 corroborated outcome for March 12 WAT. The closed case had all five workflow events and its one photo in the frozen snapshot. Both triage jobs were pending. |
| `node scripts/rehearse-demo-api.cjs` with the seeded March fixture | Passed over the local production frontend proxy with triage stopped. Checked upload and authorised download, assignment, clarification, closure with one frozen photo, and the exact report-only outcome. |
| `python backend/manage.py reconcile_demo --start 2026-03-12 --end 2026-03-12` | Independently matched the March dashboard on the live rehearsal and fallback databases. Each returned 2 reports, 1 Submitted, 1 Closed, 1 Corroborated and 2 Uncategorized. |
| `npm run lint`, `npm run typecheck`, and `npm run build` in `frontend` | Passed. |
| `node scripts/verify-core.cjs` with `QA_DATE=2026-05-06` and triage stopped | Passed at 320 and 360 CSS pixels with 200% root text. Covered all three roles, targeted keyboard actions, pre-commit interruption, lost report and photo acknowledgements, independent photo validation, forbidden evidence, reassignment and Back navigation, shared-device sign-out, assessment snapshots, and WAT report-only totals. The early retry corrected a broad alert locator and replaced multipart routing with a fault injected after Chromium received the real server response. |
| `reconcile_demo` for the 6 and 8 May Chromium cohorts | The independent SQL agreed with both browser dashboard counts. Each WAT day had 1 report, 1 Closed, 1 Corroborated and 1 Uncategorized. |

The local synthetic report-only demo passed its automated rehearsal. Formal PRD release sign-off remains open for full keyboard-only completion, physical Android under weak connectivity, TalkBack, and five formative participant sessions including assistive technology. The exact March narrative was rehearsed against the API. A presenter-led rehearsal on the venue setup remains unverified. Grouping stays disabled because the preview, reversal, concurrency and consistent-snapshot gate has not passed.

Run browser regression checks against a local fictional database. Seed the three demo accounts, set `QA_SECOND_OBSERVER_PASSWORD` and `QA_SECOND_REVIEWER_PASSWORD` in the local `.env`, and run `python backend/manage.py seed_qa_accounts`. With the frontend and API running, use the following commands from the repository root:

```powershell
npm.cmd --prefix .local/qa install --no-save playwright
node .local/qa/node_modules/playwright/cli.js install chromium
$env:NODE_PATH = (Resolve-Path .local/qa/node_modules).Path
$env:QA_FRONTEND_ORIGIN = 'http://localhost:3000'
node scripts/verify-core.cjs
```

Use unused fictional incident dates for reruns. The harness accepts `QA_DATE` as the first incident date and checks a second date two days later.

To replay the March API rehearsal, start with only the seeded March counterpart in the live fixture, leave the worker stopped, and run `node scripts/rehearse-demo-api.cjs` with the same Playwright and origin settings. Run `reconcile_demo` against that database and the separate fallback database for independently calculated totals.
