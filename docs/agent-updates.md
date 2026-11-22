# Agent updates

The shared engineering branch is `production-readiness`. Read the latest claims before editing.

## Ownership

| Area | Owner | Branch | Files |
| --- | --- | --- | --- |
| C1 observer code and PIN sign-in, organisation scoping | Codex | `codex/observer-sign-in` | `docs/agent-updates.md`, `backend/accounts/`, `backend/config/settings.py`, `backend/config/urls.py`, `backend/reports/` (organisation fields and scoping only) |

## Updates

### 22 Nov 2026 · Codex · Slice C1 observer code and PIN sign-in

- Added organisation fields and backfilled the existing application records to the initial organisation. Report, evidence, reviewer, triage and dashboard access now starts with the actor's organisation.
- Added AUTH-01/02/03/06/07 under `/api/v1/auth/`, checked Crockford observer codes, hashed setup and personal PINs, one-use ten-minute setup tokens, rolling lockouts, per-IP limits and security alert records. Observer sessions persist with a 24-hour idle limit and seven-day absolute limit. Legacy email sign-in and browser-session behaviour remain available.
- Local operator commands are `issue_observer_codes --count N --label "…"`, `revoke_observer_code OBS-XXXXXX` and `reset_observer_pin OBS-XXXXXX`. Issuing and resetting print the setup PIN once. Use an authorised shell and hand the PIN over privately. The setup PIN expires in 14 days. Revocation ends all sessions and preserves the original account and reports.
- Verified with `backend/.venv/bin/python backend/manage.py test accounts reports config --noinput` (50 passed, PostgreSQL 17.12), `makemigrations --check --dry-run` (clean), and `git diff --check` (clean). Frontend `npm run lint`, `npm run typecheck` and `npm run build` passed with no frontend diffs.
- Next, reviewer checks the backend slice and wires O-03 in the separate frontend slice. PR #2 was not on the shared branch when C1 started. Reconcile the ownership-log additions when integrating the two slices.

#### Questions

- The contract names the cookie `eg_session`. C1 keeps the shared Django cookie name so existing staff sessions, legacy clients and ingress checks remain compatible. Confirm the cookie rename with the coordinated frontend and deployment cutover.
- AUTH-03 and O-03 differ on the setup-PIN prefix error. C1 uses O-03's specific `pin_reused` field code. The current application roles remain as issued, pending a mapping for coordinator and organisation-admin permissions.
- C1 uses the immediate peer address unless the operator explicitly sets `DJANGO_AUTH_TRUSTED_PROXY_IPS` to trusted immediate peer IPs. Confirm the production ingress overwrites `X-Forwarded-For` with a single client IP before enabling that setting. Admin HTTP issuance and organisation-wide daily limits belong to the follow-on ADM slice.
- Failed credentials take the same PBKDF2 work and share the invalid-credentials response. A deployed timing measurement and high-volume retention policy for throttle records remain open.
