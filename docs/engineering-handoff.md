# ElectraGuard engineering handoff

## Start here

Read [the production plan](../PRODUCTION.md) and [field operations](field-operations.md) before picking up work. Verify the checkout, branch, current behavior and accepted decisions. The authenticated Django, PostgreSQL and Next.js implementation on `work` is the production baseline. Keep work in the intended checkout and use explicit pathspecs for local commits.

The shared GitHub branch is `production-readiness`. Fetch that branch before continuing work so the handoff, tests and deployment changes are visible. Coordinate ownership before editing files already assigned to someone.

Product, planning and design set requirements, priorities, field journeys and interface direction. Engineering owns architecture, implementation, migrations, release checks and operational evidence. Treat new guidance from the project owner or the designated product/design lead as the input to technical delivery. Bring contradictions and privacy implications back with a concrete decision request and keep independent work moving.

When the project owner hands over coordination to Claude, Claude supervises product, planning and design and may restructure the backlog, ownership map, handoff and review cadence. The supervising engineering agent directs technical work and verifies delivery against that structure. Update the ownership map before overlapping edits.

## Current work

| Area | State | Next evidence |
| --- | --- | --- |
| Access and intake | Named provisioning, audited offboarding and a production-default pause passed PostgreSQL regression checks. | Establish operational ownership, staff credential assurance and the account recovery process before enabling intake. |
| Deployment | Packaged private HTTPS and the three-role Chromium flow passed on the hosted Docker stack. The portable container topology separates ingress, frontend, backend, database and migration credentials. | Repeat acceptance on the intended host and private network, including a maximum-size upload and migration rollback. |
| Evidence and recovery | The isolated restore passed hash, relationship, closure and count checks. | Verify restored access and session revocation through the target deployment; use approved backup encryption and measure recovery against operating objectives. |
| Field acceptance | Existing monochrome interface and report-only operation govern. | An approved field lead runs the physical Android, TalkBack, weak-network and participant checks. |

## Working agreements

- Pick one observable production gate. Declare the files you own and the evidence that would close the gate. Ask an independent reviewer to challenge consequential security, data and deployment changes.
- Preserve authenticated observer ownership, private evidence, assigned access, original accounts and human assessment. Keep grouping gated and triage advisory. Resolve policy questions with the accountable owner.
- Use isolated test input and keep secrets and records out of diffs, logs and handoff artifacts. Keep intake paused until the production and operating gates pass. Publishing, external deployment and real record collection require the relevant authorisation.
- Update this handoff after each completed slice. Record commands, results, unresolved failures and the next owner. Use the release plan to decide whether evidence closes a launch gate.
- Commit each verified slice promptly in the shared checkout so collaborators can inspect the commits. Keep unrelated changes outside the commit. Work in parallel on separate files when another collaborator starts. Remote publication requires separate approval.

## Verification ledger

### 21 November 2026

- Built a loopback-only native TLS ingress against an isolated PostgreSQL database, with production Django settings and a short-lived local certificate. The health probe returned 200 through TLS and direct HTTP redirected.
- `scripts/verify-private-api.cjs` passed with the local certificate trusted, including CSRF, Secure and HttpOnly cookies, receipt replay, a 2 MiB PNG, denied evidence access, assigned download with byte equality and no-store, human closure and report-level WAT totals. Observer intake was opened only for this isolated run.
- `pg_dump --format=custom`, `pg_restore --exit-on-error`, and `scripts/verify-restored-data.py --compare` passed on a separate restored database. Aggregate counts matched and there were no hash, relationship, audit-version or closure-snapshot errors. This measured local recovery of generated records.
- The checker detected intentionally corrupted evidence in an uncommitted restore transaction. The transaction was rolled back.
- `manage.py test accounts reports config --noinput` passed all 35 PostgreSQL-backed tests. `makemigrations --check --dry-run`, frontend lint and typecheck, shell and JavaScript syntax checks, and deployment YAML parsing passed. A production-settings probe verified intake is paused by default and an HTTP error logs only status.
- The portable Compose configuration parsed and the frontend production build passed. Initially the Docker Desktop daemon could not start, and the local policy rejected launching Next.js separately. Hosted Docker acceptance below supersedes those local execution blockers.
- Android device discovery found no connected device. Physical phone, assistive-technology and field participant acceptance remain open.
- GitHub Actions passed backend and frontend verification and the packaged private TLS deployment smoke at `286f797`. That run built the images, migrated PostgreSQL, served the HTTPS sign-in page, checked the CSRF cookie and confirmed origin ports were private. [Deployment run](https://github.com/karakaraye/Electraguard-Ai/actions/runs/44945530868) · [Verification run](https://github.com/karakaraye/Electraguard-Ai/actions/runs/44945530967)
- Docker Desktop is active again on the local machine. Hosted checks at `3cba013` passed again and additionally encrypted, decrypted and restored the migrated PostgreSQL database in isolation. [Recovery run](https://github.com/karakaraye/Electraguard-Ai/actions/runs/44945800755) · [Verification run](https://github.com/karakaraye/Electraguard-Ai/actions/runs/44945800730)
- At `d68059e`, GitHub Actions built the Docker release and ran `node scripts/verify-core.cjs` through its HTTPS gateway with isolated QA accounts and the triage worker stopped. Chromium passed at 320 and 360 CSS pixels with 200% text. It verified all three roles, report and evidence recovery, reassignment and immediate loss of access, clarification, closure and the frozen evidence snapshot, sign-out and Back, and WAT reconciliation. Local Docker image pulls failed with a short read and a later registry DNS error, so the browser evidence comes from the hosted stack. [Docker browser and recovery run](https://github.com/karakaraye/Electraguard-Ai/actions/runs/44956437613)

### 22 November 2026

- Rechecked the GitHub branch tips, PRs, issues and handoff. The local checkout matched `production-readiness` at `46562d4`. No new handoff or review activity was visible.
- At `9e2397b`, the hosted Docker workflow passed the three-role Chromium test with an exact 2 MiB PNG on both viewports. It then encrypted the populated PostgreSQL database and restored it in isolation. The source and restore matched on the two closed reports and audit history. The restored photos matched their stored hashes and both closure snapshots referenced the original attachment IDs. [Docker browser and populated recovery run](https://github.com/karakaraye/Electraguard-Ai/actions/runs/44976829468)

The next deployment owner should repeat acceptance on the intended private endpoint, rehearse rollback and verify access after a restore, including revocation of restored sessions. Confirm telemetry is free of record data, establish approved backup encryption and recovery targets, and arrange physical Android, TalkBack and field acceptance with the product/design supervisor.
