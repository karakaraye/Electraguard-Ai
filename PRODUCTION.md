# ElectraGuard production delivery

ElectraGuard serves authorised observation organisations. Observers report what they experienced, assigned reviewers assess available evidence, and coordinators route cases and reconcile internal totals. Electoral authorities make official determinations. Workspace totals describe received reports and the selected incident-date range.

## Baseline and decisions

The production baseline is the authenticated Django, PostgreSQL and Next.js application on `work`. The earlier field-trial branch changes identity, routing and storage semantics. Its operational material can inform deployment and recovery work. Each proposed change must preserve authenticated ownership, assignment, clarification and the closure evidence snapshot.

Use [the engineering handoff](docs/engineering-handoff.md) for the current slice and [field operations](docs/field-operations.md) for the operating approvals. Deployment and recovery steps are in [private deployment](deploy/README.md), the [recovery policy proposal](docs/recovery-policy.md) and [restore acceptance](docs/restore-verification.md).

- One accountable observation organisation is the initial deployment boundary. A second organisation requires separate deployment or a reviewed tenant isolation design.
- Use the existing black-and-white interface, with colour reserved for status. Test field workflows on phones before desktop polish.
- Keep reporting and photo uploads separate and recoverable. Preserve the original account, exact evidence references and the human assessment. Provide clear guidance for shared phones, uncertain saves, sensitive images and help.
- Keep grouping behind the server gate. A later activation requires scoped comparison, stale and concurrent write handling, auditable reversal, a consistent WAT dashboard snapshot and independent tests.
- Keep triage local and advisory. Review continues during worker downtime. Assess the adoption value and error rates with authorised representative cases before changing the suggestion method.
- Use generated data only in isolated automated tests and controlled preproduction acceptance. Production account provisioning creates one named account at a time. The release pipeline never seeds observations.

## Delivery sequence and exit criteria

| Order | Work and dependencies | Evidence required to advance |
| --- | --- | --- |
| 0 | **Operating mandate and data policy.** Name the observation organisation, data owner, incident lead and approver. Inventory data and access. Agree collection notice, photo guidance, evidence access, participant support, retention by record type, withdrawal/legal hold and backup expiry. Identify applicable obligations with the organisation. | Approved data map, policies and accountable contacts. Decide which assessment fields an observer may see and who may correct or escalate a closed case. |
| 1 | **Reproducible release and safe defaults.** Harden production settings, remove presentation tooling, provision named accounts, and gate changes through PostgreSQL tests and the frontend build. Pin runtime, database and deployment image versions. | Clean checkout builds. Django production checks pass with documented waivers. Production rejects unsafe settings. A named privileged account has only the intended application role. |
| 2 | **Private preproduction environment.** After hosting and budget approval, deploy a versioned app release to an isolated environment using Gunicorn or an equivalent production server, Next.js, a restricted worker and managed PostgreSQL or an approved equivalent. Terminate HTTPS at trusted ingress. Keep the backend and database private. Use a runtime secret store and least-privilege database roles with a separate migration credential. | TLS, host allow-list, Secure cookies, CSRF and forwarded-protocol trust are verified through the actual proxy for both browser calls and Next.js server-side reads. Restricted routes and evidence return private cache directives. Valid 2 MiB photos traverse ingress with multipart overhead. A migration and deployment rollback are rehearsed. |
| 3 | **Account and data lifecycle.** Add controlled onboarding, credential rotation and recovery, staff MFA or equivalent assurance, session revocation, account offboarding and assignment transfer. Enforce login rate limits and alert on abuse. Implement approved intake pause, evidence retention, legal hold, access reviews and audit export/storage. | Access and abuse controls have independent checks. Offboarded and reassigned staff lose access across tabs and direct file URLs. Evidence integrity and authorised deletion are demonstrated on isolated records, including backing stores. |
| 4 | **Operations and resilience.** Instrument request errors, database readiness, queue lag and capacity without collecting reports, evidence, account identifiers or secrets in telemetry. Document escalation, support, key rotation, intake pause, upgrade, rollback and recovery. Set service objectives, recovery point and recovery time with operators. | Alert drills and failure-mode checks. A restore into isolation proves report, permission, evidence and audit integrity within the agreed targets. Load tests cover concurrent intake and constrained uploads on isolated infrastructure. |
| 5 | **Field and accessibility qualification.** Rehearse observer intake and support, reassignment, clarification, assessment and dashboard reconciliation on intended Android devices. Exercise weak connections, interruptions before/after server commit, duplicate retries, shared phones, expired sessions and worker failure. Run keyboard-only, enlargement and TalkBack journeys and five consented formative sessions. | Record per-role completion, blockers, errors, recovery times and fixes. Independently reconcile totals and run the critical paths again after changes. |
| 6 | **Controlled opening.** Approve policy, security, field and operational evidence together. Open access to a bounded authorised cohort with named support coverage. Use review and escalation windows and pause criteria set by operators. | Recorded owner sign-off, named on-call contact, capacity limits, rollback triggers and measured operating results before wider access. |

## In-progress implementation and verification

Production settings require an explicit strong Django secret, concrete allowed hosts and an HTTPS frontend origin. Enable proxy HTTPS trust only when the trusted ingress overwrites `X-Forwarded-Proto` and clients cannot access Django directly. Verify end-to-end HTTPS behaviour on the selected topology before deploying. Local HTTP development requires explicit `DJANGO_DEBUG=true`.

Named accounts are provisioned using the command documented in [README](README.md). Confirm the operator is authorised before creating accounts. Keep deployment secrets in the approved runtime secret store and production records out of development, QA and support exports.

Production starts with new observation intake paused. Setting `OBSERVATION_INTAKE_ENABLED=true` and restarting all application replicas opens intake. A pause preserves same-payload receipt recovery, attachment uploads for existing open reports, clarification and review. Operate pauses at a coordinated deployment boundary.

Independently reconcile internal dashboard totals within the authorised database:

```powershell
python backend/manage.py reconcile_observations --start YYYY-MM-DD --end YYYY-MM-DD
```

After running database migrations on an existing deployment, backfill review clocks once (safe and idempotent):

```powershell
python backend/manage.py backfill_review_clocks
```

> [!NOTE]
> When existing open reports created prior to C18 are past due, the backfill creates their clocks with `notified_at=None`. The first review clock background sweep (`run_review_clocks` or `sweep_review_clocks`) will raise one overdue alert (`case.overdue` audit event) per untouched old case that is past due.

Use an isolated loopback database named `electraguard_qa` for browser regression. Migrate it and set five distinct local `QA_*_PASSWORD` variables for the administrator, observer, second observer, reviewer and second reviewer. Run `python backend/manage.py shell -c "exec(open('tests/fixtures/provision_browser_accounts.py').read())"`. Start Django and Next.js against that database. Install Playwright in an ignored local tool directory or use the installed package path, set `QA_FRONTEND_ORIGIN` to the loopback frontend, and run `node scripts/verify-core.cjs` on unused test dates. Keep the worker stopped for the worker-independence check.

## Release decision

Production use requires a verified target deployment and approval of the operating mandate, evidence policy, account lifecycle and recovery objectives. These are open gates. No real observation records should be collected until they close.

## Current evidence

- PostgreSQL suite with accounts, reports and deployment configuration passed all 28 tests. A separate database migrated from empty, accepted the isolated browser fixture setup, and showed no schema drift. The operator reconciliation command returned zero observations for the empty range.
- Production Django client checks covered HTTPS redirects, untrusted hosts, framing, HSTS, cookie protection and proxy trust. `manage.py check --deploy` reported domain-dependent HSTS subdomain and preload warnings. The actual ingress is still unverified.
- Frontend lint, typecheck and production build passed locally.
- GitHub Actions passed backend and frontend checks, the packaged private HTTPS smoke test, and an encrypted backup and restore on `production-readiness`. [Application verification](https://github.com/karakaraye/Electraguard-Ai/actions/runs/44945800730) · [Deployment and recovery verification](https://github.com/karakaraye/Electraguard-Ai/actions/runs/44945800755)
- The hosted Docker browser suite passed all three roles through private HTTPS at 320 and 360 CSS pixels with 200% text. The workflow now repeats this check on relevant changes to the production branch. [Docker browser run](https://github.com/karakaraye/Electraguard-Ai/actions/runs/44956437613)
- A loopback TLS environment verified production cookies, CSRF, private evidence, a 2 MiB upload, receipt recovery and report closure. PostgreSQL backup and restore matched the source counts and integrity checks. The intended deployment host, recovery objectives and physical field acceptance are open gates.
