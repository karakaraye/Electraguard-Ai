# ElectraGuard engineering handoff

## Start here

Read [the production plan](../PRODUCTION.md) and [field operations](field-operations.md) before picking up work. Verify the checkout, branch, current behavior and accepted decisions. The authenticated Django, PostgreSQL and Next.js implementation on `work` is the production baseline. Keep work in the intended checkout and use explicit pathspecs for local commits.

Product, planning and design set requirements, priorities, field journeys and interface direction. Engineering owns architecture, implementation, migrations, release checks and operational evidence. Treat new guidance from the project owner or the designated product/design lead as the input to technical delivery. Bring contradictions and privacy implications back with a concrete decision request and keep independent work moving.

When the project owner hands over coordination, the product/design supervisor may restructure how the team works, including the backlog, ownership map, handoff and review cadence. The supervising engineering agent directs technical work and verifies delivery against that structure. Update the ownership map before overlapping edits.

## Current work

| Area | State | Next evidence |
| --- | --- | --- |
| Access and intake | Named provisioning, audited offboarding and a production-default pause passed PostgreSQL regression checks. | Establish operational ownership, staff credential assurance and the account recovery process before enabling intake. |
| Deployment | A private TLS environment is being exercised locally. The portable container topology separates ingress, frontend, backend, database and migration credentials. | Run the packaged release on a working container host. Verify browser and server-rendered access, cookie/CSRF behavior, image upload limits, exposure boundaries and rollback. |
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
- The portable Compose configuration parsed and the frontend production build passed. The Docker Desktop daemon could not start because its installation registry key was missing. Local execution policy rejected starting Next.js for the dedicated acceptance environment. The full browser run through HTTPS and the packaged container smoke remain open. The manual CI deployment workflow is prepared for an authorised run.
- Android device discovery found no connected device. Physical phone, assistive-technology and field participant acceptance remain open.

The next deployment owner should run the container smoke, then exercise sign-in, server-rendered access and the three-role workflow on the private endpoint. Confirm telemetry is free of record data, establish the approved backup encryption and recovery targets, then hand the same build to the field and accessibility reviewers.
