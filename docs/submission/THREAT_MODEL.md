# Threat Model: ElectraGuard AI (STRIDE & LINDDUN)

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Date:** 2026-11-26  
**Status:** Prototype

> **In plain words:** ElectraGuard is built to protect both the system and the people who use it. Observers and citizens can report without giving a name, email or phone number, and the system hides personal details it finds in text. Staff actions are chained together with hashes, so a changed or deleted record can be detected. This document lists what can go wrong, what the code does about it, where the code and its tests are, and what risk is left. It is a design review by the team; no outside security audit has been done.

---

## 1. Method

Two frameworks are used: **STRIDE** for security threats (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege) and **LINDDUN** for privacy threats (Linkability, Identifiability, Non-repudiation, Detectability, Disclosure of information, Unawareness, Non-compliance). Each row names the code and the test file that exercise the mitigation. Residual risk is stated honestly.

---

## 2. STRIDE

| Category | Threat | Mitigation in this repository | Code and tests | Residual risk |
|---|---|---|---|---|
| **Spoofing** | Someone guesses an observer's code and PIN to file false reports. | Codes are `OBS-` plus six characters from a 32-character alphabet with a check character. PINs are hashed with PBKDF2-SHA256 (1,000,000 iterations). Five wrong tries in 15 minutes lock the code for 15 minutes; ten in 24 hours lock it until a coordinator resets the PIN. Sign-in is also rate limited per IP address. | `backend/accounts/observer_credentials.py`, `observer_auth.py`; tests in `backend/accounts/test_observer_auth.py` | A stolen card plus its PIN still works until the code is revoked. |
| **Spoofing** | Fake SMS or USSD callbacks. | The gateway URL contains a secret path segment, compared in constant time, and an optional IP allow-list (`CHANNEL_GATEWAY_NETWORKS`). Africa's Talking does not sign callbacks, so there is no payload signature. | `backend/phone_channels/views.py`; `tests.py` | If the secret leaks and no allow-list is set, callbacks can be forged. No live carrier has been connected. |
| **Tampering** | Someone alters or deletes past case actions. | Each organisation has an append-only chain of audit events; each stores the SHA-256 hash of the previous one and of its own contents. `GET /api/v1/audit/verify` recomputes the chain. The public results page shows a fingerprint of the chain. | `backend/staff/audit.py`, `backend/staff/models.py` (`AuditEvent`); `backend/staff/test_audit.py` | Someone with full database control could rewrite the whole chain; comparing the published fingerprint later is what catches that. |
| **Tampering** | Reports changed in transit. | The gateway serves HTTPS with TLS 1.2 or 1.3 and an HSTS header (on Azure the platform terminates TLS). | `deploy/gateway.conf.template`, `deploy/azure/gateway.conf.template` | The templates have not been deployed to Azure. |
| **Repudiation** | A staff member denies an action. | Case actions are recorded as review events and audit events with the account that did them. | `backend/reports/models.py` (`ReviewEvent`), `backend/staff/audit.py`; `backend/reports/test_workflow.py` | Shared staff accounts would defeat this; accounts are named and use two-step sign-in. |
| **Information disclosure** | A phone is seized at a polling unit. | Unsent drafts and reports sit in the browser's IndexedDB, **not encrypted by the app** (client-side encryption is not built). Sent reports are not kept on the phone; only the receipt and status are. "Sign out and clear this phone" removes drafts, saved reports and messages. | `frontend/lib/outbox/`, `frontend/lib/drafts/`, `frontend/app/(observer)/o/settings/` | Unsent reports are readable by anyone who can open the browser profile. |
| **Information disclosure** | Phone numbers sent by SMS or USSD are leaked. | A number is stored only as `salted_hmac("electraguard.<purpose>", number)`, using the server secret key. | `backend/accounts/observer_credentials.py` (`digest`), `backend/phone_channels/handlers.py`; `backend/phone_channels/tests.py` | Replies must be sent to the real number, so it exists in memory while the reply is sent. |
| **Information disclosure** | Free text contains phone numbers, ID numbers or names. | Reviewers see text with phone numbers, VIN, NIN, BVN, emails, account numbers, addresses and a curated name list replaced by keyed tokens. The original text can be fetched only by the assigned reviewer through contract CASE-06, with a written reason (1 to 500 characters), 30 times an hour at most, and each use is audited. | `backend/privacy/redactor.py`, `backend/privacy/tests.py`, `backend/reports/reviewer_views.py` | Measured recall is 96.3%, so about 4 in 100 personal details can slip through (`docs/eval/redaction.md`). Names not on the list are missed. |
| **Denial of service** | Flooding with false reports. | Per-user and per-IP rate limits (for example 60 reports an hour per observer, 10 rumour checks an hour per IP and device, 30 sign-ins per 10 minutes per IP); duplicate candidates shown to reviewers; a Poisson and CUSUM detector raises alerts for sudden surges. | `backend/accounts/observer_credentials.py` (`rate_limit`), `backend/ops/emerging.py`, `backend/ops/test_emerging.py` | The surge detector found 13 of 20 planted surges in testing. Distributed floods are not addressed beyond the rate limits. |
| **Denial of service** | Urgent cases wait unseen. | Review clocks track a target per case (urgent 15 minutes, high 60, normal 240) and a sweep raises one alert when a case is overdue. | `backend/clocks/calculator.py`, `sweep.py`, `tests.py` | The staff screens in this build do not display the countdown. |
| **Elevation of privilege** | An observer or one staff role reaches another role's data. | Roles are checked on the server for every route and every record is scoped to the organisation (`require_role`, `authorize`). | `backend/accounts/permissions.py`, `backend/staff/access.py`; `backend/staff/test_boundaries.py` | Role boundaries are only as complete as the tests. |

---

## 3. LINDDUN

| Category | Threat | Mitigation | Code and tests | Residual risk |
|---|---|---|---|---|
| **Linkability** | Reports from the same person are linked. | Reports carry no name. An observer's own reports are linked by their observer code (needed for follow-up), and only the issuing organisation knows who holds a code. Phone hashes use a separate salt for each purpose. | `backend/accounts/observer_credentials.py` | IP address and timing are visible to the server operator. |
| **Identifiability** | An informant is singled out from small public numbers. | Public results are by state, type and hour only, published at least 60 minutes after the reports. Any number below 5 is shown as "fewer than 5", and a combined number is shown only if every part is shown. | `backend/publicdata/aggregate.py`; `backend/publicdata/test_suppression.py` | Small counts can still be combined with outside knowledge. |
| **Non-repudiation** | An observer is forced to prove they sent a report. | Reports carry no digital signature. | design choice | Receipt codes and the organisation's records could still be used as proof. |
| **Detectability** | Someone sees that a person is using the app. | The interface has no party colours or emblems. It runs in the browser. | `frontend/ui/` | The app name, browser history and installed home-screen icon reveal it. |
| **Disclosure of information** | Names or ID numbers reach staff or the public. | Automatic redaction, plus the **Hide names** tool for reviewers. Public pages show only totals and approved rumour answers. | `backend/privacy/redactor.py`; `frontend/app/(staff)/s/_views/CaseView.tsx` | See redaction recall above. |
| **Unawareness** | People do not know what is kept. | A "What this app keeps" notice is shown before first use and a plain-language privacy notice is public. | `frontend/app/(public)/privacy/`, `frontend/messages/en.json` (`o02`, `p06`) | Not yet reviewed by native speakers or a lawyer. |
| **Non-compliance** | Data kept longer than the organisation's policy or the law allows. | Each organisation sets a retention period of 30 to 730 days; the operator command `python backend/manage.py purge_retention` deletes older reports, files and messages. | `backend/staff/retention.py`, `backend/staff/management/commands/purge_retention.py`; `backend/staff/test_retention.py` | The purge has to be run on a schedule by the operator. No legal review of NDPA 2023 compliance has been done. |

---

## 4. Running the tests

```bash
python backend/manage.py test accounts reports phone_channels publicdata privacy clocks ops rumours staff
```
In `frontend/`, `npm run check:privacy` fails the build if the app reads the phone's location. `npm run lint` and `npm run typecheck` are code-quality checks, not security tests.
