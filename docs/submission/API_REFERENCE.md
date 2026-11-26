# ElectraGuard API Reference

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Date:** 2026-11-26  
**Status:** Prototype

> **In plain words:** This technical reference documents the REST API endpoints connecting ElectraGuard's observer web app, feature phone gateways, staff review consoles, and public transparency pages. All requests use structured JSON, ISO 8601 timestamps, role-based authentication, and cryptographic receipts. Data privacy rules, automated redaction, and small-cell suppression (< 5) are strictly enforced at the API boundary.

---

Base revision of `production-readiness` is `5adae65aa316`. The [design contract](../design/api-contracts.md) supplies the versioned request and response examples below. Availability annotations identify routes and features that need another merge. Contract fields can be ahead of the deployed base. The [versioned report URL table](../../backend/reports/v1_urls.py) and [root configuration](../../backend/config/urls.py) define the mounted paths.

## 1. Conventions (read first)

### 1.1 Base, transport, formats

- **Base path:** `/api/v1/`. The browser calls the Next.js origin; Next.js rewrites `/api/:path*` to Django (already configured in `frontend/next.config.ts`), so cookies stay first-party.
- **Request bodies:** `application/json; charset=utf-8`, except: MED-02 (`application/offset+octet-stream`), RS-01 and RUM-01 with an image (`multipart/form-data`), SMS-01 and USSD-01 (`application/x-www-form-urlencoded`, the gateway's format).
- **Field names:** `snake_case` on the wire, always.
- **Times:** ISO 8601 with an explicit offset. The server **returns** every time in West Africa Time with `+01:00` (Africa/Lagos has no daylight saving). The server **accepts** any offset and stores UTC. A time without an offset is rejected (`invalid_datetime`).
- **Dates** (no time): `YYYY-MM-DD`, interpreted in West Africa Time.
- **Text:** NFC-normalised by the server; lengths are counted in Unicode code points after trimming. Control characters other than newline are rejected.
- **Languages:** `en` · `pcm` (Naijá) · `ha` · `yo` · `ig`.
- **Identifiers:**
  - Internal ids are **UUID v4** strings (`"8d0c1a52-4f3e-4b9e-9a51-2f6a0f7c3e11"`). Security never depends on them being unguessable.
  - **Receipt codes** are human-readable: `EG-XXXX-XXXX`, Crockford base32 (alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, no I, L, O, U). Seven random symbols plus one check symbol, the last character: `(Σ (i+1)·vᵢ for i = 0..6) mod 31`, encoded with the same alphabet. On input the server and the client normalise: upper-case, drop spaces and hyphens, `O→0`, `I→1`, `L→1`, then re-insert hyphens. A code whose check symbol fails returns `receipt_code_invalid` (so SMS users get "check the code" rather than "not found").
  - **Observer codes:** `OBS-XXXXXX`, the same alphabet: five random symbols plus one check symbol computed the same way over five symbols. Normalised the same way.
  - **Area codes** (`state_code`, `lga_code`, `ward_code`, `polling_unit_code`) are opaque strings from REF-01. The reference list is the only authority; clients never parse them.
- **Pagination:** cursor based. Query `?cursor=<opaque>&limit=<1..100, default 50>`. Response `{"items": [...], "next_cursor": "..." | null}`.

### 1.2 Authentication, sessions, CSRF

- Django server-side sessions in an HttpOnly cookie (`eg_session`, `Secure` outside local development, `SameSite=Lax`).
- **CSRF:** every `POST`, `PUT`, `PATCH` and `DELETE` carries `X-CSRFToken` from AUTH-01, **including anonymous citizen calls**. Exempt: SMS-01 and USSD-01 (gateway callbacks, authenticated by a path secret). Django rotates the token at sign-in, so the client fetches AUTH-01 again after AUTH-02, AUTH-03, AUTH-05 and AUTH-06.
- **Session lifetimes:**

| Session | Idle timeout | Absolute | Cookie | Why |
|---|---|---|---|---|
| Observer | 24 h | 7 days | persistent (not a browser-session cookie) | Election day runs from before 07:00 to after counting; an installed web app is closed and reopened all day |
| Staff | 30 min | 8 h | browser-session | Named accounts that see case content |
| Pre-2FA staff (password accepted, TOTP pending) | 5 min | 5 min | browser-session | Cannot call anything except AUTH-05, AUTH-06, AUTH-07 |
| Anonymous (citizen, public) | 2 h | 2 h | browser-session | Only holds the CSRF token and the simulator phone id |

- A session that expired while the phone was offline does not drop the outbox: the next send gets `401 not_authenticated`, the app asks for the PIN (AUTH-02), and the outbox resumes with the **same** idempotency keys (keys are scoped to the observer account, not the session).
- **Citizen proof of ownership:** header `X-Receipt-Secret: <base64url, 43 chars = 32 random bytes>`. The secret is created on the phone (`crypto.getRandomValues`) before the first send, sent once with REP-05, and stored by the server only as SHA-256. It is required for anything a citizen does after creating the report (media, reply, withdraw, read the conversation).

### 1.3 Common headers

| Header | Direction | Use |
|---|---|---|
| `X-CSRFToken` | request | Every unsafe method (1.2) |
| `Idempotency-Key` | request | UUID v4. Required where a contract says so (1.5) |
| `X-Receipt-Secret` | request | Citizen ownership proof (1.2) |
| `X-Device-Time` | request | The phone's clock at send time, ISO 8601 with offset. Sent with REP-01, REP-05, MSG-02. Used to record clock skew for reviewers; **excluded from the idempotency digest** |
| `Accept-Language` | request | Picks the language of `error.message` fallbacks and SMS/USSD text. The UI never shows `error.message` when it has a message key for `error.code` |
| `Idempotent-Replayed: true` | response | Set when the response is a stored replay |
| `Retry-After` | response | Seconds. On 429, 503 and `request_in_progress` |
| `Cache-Control` | response | `private, no-store` on every response except REF-01 and PUB-02 (public, cacheable) and MED-04 (`private, no-store, max-age=0`) |
| `ETag` / `If-None-Match` | both | REF-01 and PUB-02 only; `304 Not Modified` when unchanged |

### 1.4 The error shape

Every non-2xx response (except `304` and the gateway responses of SMS-01/USSD-01) has exactly this body:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Some fields need attention.",
    "fields": {
      "description": { "code": "max_length", "message": "Use 2000 characters or fewer.", "limit": 2000 },
      "result_sheet.votes.C": { "code": "min_value", "message": "Enter 0 or more.", "limit": 0 }
    }
  }
}
```

- `code` is stable and machine-readable; the UI maps it to the message key `errors.<code>` (and `errors.field.<code>` for field errors) in all five languages.
- `message` is a plain-language fallback in the `Accept-Language` language (English if not available). Never shown when a key exists.
- `fields` is present only for `validation_failed` and a few 409s that point at a field. Keys are dotted paths (`answers.2.answer`, `items.0.reviewer_id`). Each value has `code`, `message`, and optional `limit` (number).
- Field error codes: `required`, `invalid`, `max_length`, `min_length`, `min_value`, `max_value`, `invalid_choice`, `invalid_datetime`, `in_future`, `too_old`, `unknown_area`, `not_allowed_for_kind`, `duplicate`, `pin_too_simple`, `pin_reused`, `contains_polling_unit_code`, `too_recent`.

**Error code catalogue** (HTTP status · code · meaning). Contracts list which of these they return, with an exact example where the code is specific to them.

| Status | Code | Meaning |
|---|---|---|
| 400 | `bad_request` | Malformed JSON, wrong content type, missing required header |
| 400 | `idempotency_key_required` | `Idempotency-Key` missing or not a UUID v4 |
| 401 | `not_authenticated` | No session, or it expired |
| 401 | `invalid_credentials` | Wrong code/PIN or email/password (never says which) |
| 401 | `totp_invalid` | Wrong or reused authenticator code |
| 401 | `receipt_secret_invalid` | `X-Receipt-Secret` missing or does not match |
| 403 | `csrf_failed` | CSRF token missing or wrong (Django's HTML 403 is replaced by this JSON) |
| 403 | `forbidden` | Signed in but this role cannot use this contract |
| 403 | `totp_required` | Password accepted, TOTP step not done |
| 403 | `code_revoked` | Correct PIN for a revoked observer code |
| 403 | `same_person_approval` | The drafter tried to approve their own work |
| 404 | `not_found` | Does not exist **or** the caller may not know it exists (other organisation, not assigned, not owner) |
| 409 | `stale_version` | `version` does not match; refresh and retry |
| 409 | `idempotency_key_reused` | Same key, different request |
| 409 | `request_in_progress` | Same key is being processed; retry after `Retry-After` |
| 409 | `invalid_transition` | The action is not allowed in the current status |
| 409 | `withdraw_unavailable` | Review has started; withdraw is no longer possible |
| 409 | `question_closed` | Reply to a question that is already answered or closed |
| 409 | `report_closed` · `report_withdrawn` | Writes to a closed or withdrawn report |
| 409 | `closure_evidence_changed` | Saved evidence changed since the reviewer loaded the case |
| 409 | `already_assigned` | Reassign to the current reviewer |
| 409 | `offset_mismatch` | Upload chunk offset differs from the server's |
| 409 | `upload_expired` · `upload_completed` | Upload session not writable |
| 409 | `media_limit_reached` | Too many or too large attachments for this report |
| 409 | `last_admin` | Would remove the organisation's last admin |
| 409 | `confirmation_required` | Destructive setting change needs `confirm: true` |
| 409 | `discussion_closed` · `not_a_member` | Discussion writes not allowed |
| 413 | `payload_too_large` | Body or file over its limit |
| 415 | `unsupported_media_type` | File type sniffed as not allowed |
| 422 | `validation_failed` | Field errors in `fields` |
| 422 | `hash_mismatch` | Uploaded bytes do not match the declared SHA-256 |
| 422 | `media_unreadable` | The file could not be decoded or re-encoded |
| 422 | `receipt_code_invalid` | Check symbol fails |
| 423 | `code_locked` · `account_locked` | Too many failed attempts |
| 429 | `rate_limited` | Slow down; see `Retry-After` |
| 503 | `intake_paused` | The organisation paused new reports |
| 503 | `service_unavailable` | Dependency down (database, storage). Retry with the same key |

Common examples, referenced by contracts as "common errors":

```json
{ "error": { "code": "not_authenticated", "message": "Sign in to continue." } }
{ "error": { "code": "csrf_failed", "message": "Refresh the page and try again." } }
{ "error": { "code": "forbidden", "message": "Your role cannot do this." } }
{ "error": { "code": "not_found", "message": "We could not find that." } }
{ "error": { "code": "rate_limited", "message": "Too many requests. Try again in 60 seconds." } }
{ "error": { "code": "stale_version", "message": "This case has changed. Refresh before trying again." } }
{ "error": { "code": "service_unavailable", "message": "The service is busy. Your request will be retried." } }
```

### 1.5 Idempotency (every create and every observer write)

1. **Where required:** REP-01, REP-04, REP-05, REP-07 (POST), MED-01, MED-03, MSG-02, DIS-03, DIS-04, RS-01, CASE-02, CASE-03, CASE-04, CASE-05, ASG-02, RUM-01, RUM-03, PUB-01, ADM-01, ADM-02, ADM-03 (create, reset, offboard), SIM-01 (send). The typed client sends a key on **every** unsafe request; the server ignores it where not listed. Not used on AUTH-*, MED-02 (offset-addressed, naturally idempotent), MED-05 (DELETE is idempotent), SMS-01 and USSD-01 (keyed by the gateway's message id and session id).
2. **When the key is made:** when the item enters the outbox or the user presses the button the first time, **not** at send time. It is stored with the item and reused for every retry, across app restarts and re-sign-ins.
3. **Scope:** `(actor, operation, key)`. Actor = user id; for citizens = SHA-256 of the receipt secret. A key from another actor never matches.
4. **Digest:** SHA-256 over the method, the path and the canonical JSON body (keys sorted, no whitespace). Headers, including `X-Device-Time`, are not part of it.
5. **Replay:** same scope, same digest → the stored status code and body, with `Idempotent-Replayed: true`. A create that returned `201` replays as `200` with the identical body. Clients treat `200` and `201` alike.
6. **Reuse:** same scope, different digest → `409 idempotency_key_reused`. This is a client bug; the outbox stops that item and shows *Needs attention*.
   ```json
   { "error": { "code": "idempotency_key_reused", "message": "This send key belongs to a different request." } }
   ```
7. **Concurrency:** a second request with a key that is still being processed waits on the row lock for up to 5 s, then replays; if it is still not done, `409 request_in_progress` with `Retry-After: 2`.
8. **What is stored:** only `2xx` results. A `4xx` or `5xx` leaves nothing behind, so the client may fix a validation error and resend with the same key.
9. **Order of checks:** CSRF → authentication → **idempotency lookup** → rate limit (replays are exempt) → intake pause → state and version checks → validation → write. So a replay of a report sent before intake paused still returns `200`, and a replay of a case action still returns its original result after the version moved on.
10. **Retention:** idempotency records are kept 30 days, or until the resource is purged. After a withdrawal the stored body is replaced by the withdrawn stub, so a late replay returns the stub, never the deleted content and never a new report.

### 1.6 Versioning (optimistic concurrency)

- Each report has an integer `version` that increases by one with every recorded change (assignment, start, question, reply, close, suggestion decision, duplicate decision, redaction, withdrawal, attachment closure snapshot). Every change writes its audit event in the same transaction (existing guarantee).
- **Staff writes on a report carry `version`.** A mismatch returns `409 stale_version`; the screen reloads CASE-01 and shows what changed.
- **Observer and citizen writes do not carry `version`**, because the version changes for reasons the reporter cannot see (a reviewer accepting a category) and a queued reply would fail for nothing. Instead: a reply names the `question_id` it answers; withdraw is allowed only in `received`; ordinary messages need no check.
- Other versioned resources: organisation settings (ADM-04), staff accounts (ADM-03), claim responses (RUM-03), snapshots (PUB-01), security alerts (SEC-01). Each response returns the new `version`.

### 1.7 Offline and retry semantics (observer and citizen)

The outbox (`frontend/lib/outbox/`, IndexedDB) holds each queued item with its idempotency key. One sync loop sends in order: **report → its media (MED-01..03) → its messages**, oldest report first. A report's media and messages wait until the report has a server `id`.

| Response | Outbox action | Screen state |
|---|---|---|
| No response, timeout, network error, `5xx`, `503 service_unavailable` | Keep; retry with the **same key**; back-off 2 s, 4 s, 8 s … capped at 5 min, ±20 % jitter; retry at once when the browser fires `online` | *Not confirmed yet* (never *Received*) |
| `200` / `201` | Mark sent; store `id`, `receipt_code`; drop local content per the shared-phone rule (1.8) | *Received* |
| `401 not_authenticated` | Pause the whole outbox; ask for the PIN; resume | *Waiting for your PIN* |
| `403 code_revoked` | Pause; offer "Send with a new code" (sign in with the new code; items re-send under the new code with the same keys) or "Remove from this phone" | *Code no longer active* |
| `409 request_in_progress`, `429` | Retry after `Retry-After` | *Not confirmed yet* |
| `503 intake_paused` | Keep; retry after `Retry-After` (server sends 600) | *Waiting: reporting is paused* |
| `409 idempotency_key_reused`, `422`, `413`, `415` | Stop that item; keep its content | *Needs your attention* with the reason |
| `409 report_withdrawn` / `report_closed` (messages, media) | Stop that item | Explain; offer to remove |

Limits on the phone (plan 4.6): 20 queued reports, 150 MB of media. These are client limits; the server limits are in each contract.

### 1.8 Privacy defaults

- **No GPS anywhere**, in requests, responses or stored files. The finest location on any shared or public surface is the ward.
- Observer-facing responses never contain a staff email or name: staff appear as `"Reviewer"`, `"Moderator"` or `"Coordinator"`.
- Responses about reports carry `Cache-Control: private, no-store`. The app keeps no copy of a received report's text or media on the phone after the server confirms it (plan 2.4), unless the observer turns on "Keep copies on this phone" in O-20 (stored locally, never sent).
- Logs never contain report text, message text, media, PINs, receipt secrets, phone numbers or observer codes in clear (observer codes are logged as an HMAC).
- Phone numbers from SMS/USSD are stored only as an HMAC with a server key; the clear number lives in memory and in the outbound-SMS job until the reply is sent, then it is deleted.

---

## 2. Report state machine

### 2.1 States

| State (wire value) | Where | Observer sees (message key) | Staff sees |
|---|---|---|---|
| `draft` (client only) | Phone, IndexedDB | Editing (O-05..O-11) | n/a |
| `on_device` (client only) | Phone outbox, never sent | *Saved on this phone. It will send when you have network.* | n/a |
| `not_confirmed` (client only) | Phone outbox, a send was attempted, no confirmation | *Not confirmed yet. Trying again.* | n/a (or already `received` if the response was lost) |
| `needs_attention` (client only) | Phone outbox, stopped (1.7) | *Needs your attention* + reason | n/a |
| `received` | Server | *Received* + receipt code | Received |
| `in_review` | Server | *Being reviewed* | In review |
| `question` | Server | *Question for you* (the open question, reply box) | Question for you |
| `closed` | Server, with `outcome` | *Closed* + outcome | Closed |
| `withdrawn` | Server stub | *You withdrew this report.* | Withdrawn (stub only) |

`outcome` (only when `closed`): `corroborated` (*Confirmed by evidence*), `insufficient_evidence` (*Not enough evidence*), `out_of_scope` (*Outside what we observe*). The wire values keep the current enum; only the labels change.

### 2.2 Transitions

| From | To | Who | Contract | Version +1 | Audit action | Side effects |
|---|---|---|---|---|---|---|
| (none) | `received` | observer / citizen / SMS / USSD | REP-01, REP-05, SMS-01, USSD-01 | starts at 0 | `create` | Triage job queued; receipt code issued |
| `received` | `received` | coordinator | ASG-02 | yes | `assign` | Reviewer gets access |
| `received`, `in_review`, `question` | same | coordinator | ASG-02 (reassign) | yes | `assign` | Previous reviewer loses access **at once** (existing guarantee) |
| `received` | `in_review` | assigned reviewer | CASE-02 `start` | yes | `start` | Withdraw no longer possible |
| `in_review` | `question` | assigned reviewer | CASE-02 `ask` | yes | `ask` | A `formal_question` message is created and marked open |
| `question` | `in_review` | reporter | MSG-02 `reply`, REP-07, SMS `REPLY` | yes | `reply` | The question is marked answered |
| `in_review` or `question` | `closed` | assigned reviewer | CASE-02 `close` | yes | `close` | Evidence snapshot (2.4); an open question is marked `closed_unanswered`; uploads refused |
| `received` | `withdrawn` | reporter | REP-04 | yes | `withdraw` | Content purge (2.3) |
| any | same | assigned reviewer | CASE-03, CASE-04, CASE-05 | yes | `accept_suggestion`, `correct_suggestion`, `duplicate_decision`, `redact` | none |

Not allowed: closing from `received` (start first, so the record shows a person looked at it); reopening a closed report (a new report is filed instead); withdrawing after `received`; any transition out of `withdrawn`.

**Change from today:** closing is also allowed from `question` (a reporter who never answers must not block closure). Today's code allows close only from `in_review`.

### 2.3 Withdraw rules

1. Only the reporter: the observer who sent it (session), or the citizen holding the receipt secret. Not SMS/USSD reports (no secret on a basic phone); those reporters can contact the organisation.
2. Only in `received`. Once a reviewer presses *Start review*, REP-04 returns `409 withdraw_unavailable` and the observer is offered a message instead.
3. A report still on the phone (`on_device`, `needs_attention`) is withdrawn by deleting it locally; no API call. A report in `not_confirmed` is first confirmed (replay REP-01 with its key to learn the `id`), then withdrawn.
4. In the same transaction as the status change: description, redacted text, translation, checklist answers, result-sheet values, all message bodies and media rows are deleted; triage, duplicate links and cluster memberships for the report are deleted; open upload sessions are cancelled; the assignment is cleared. Blob deletion runs as a job within 15 minutes, but downloads are refused from the moment of commit.
5. The stub keeps only: `id`, `receipt_code`, `organisation_id`, `kind`, `channel`, `received_at`, `withdrawn_at`, `version`, and the audit events (which hold content digests, not content; see AUD-01).
6. Repeating a withdraw returns `200` with the stub. Replaying the original create returns `200` with the stub.
7. A withdrawn report is never counted in OPS or PUB aggregates.

### 2.4 Closure evidence snapshot (kept and extended)

The close request carries `expected_media_ids`: the saved media the reviewer saw. The server compares them with the report's saved media under the report lock. If they differ, `409 closure_evidence_changed` (the screen reloads and shows the new item). Otherwise the `close` audit event records `media_ids` (saved, with their SHA-256) and `pending_uploads` (upload sessions still open: id, kind, declared size) so the record names what was still arriving. After closure MED-01 returns `409 report_closed`; existing media stay downloadable.

---

## 3. Organisation separation

1. **Every organisation-owned row carries `organisation_id`** (reports, media, upload sessions, messages, discussions, posts, triage, clusters, claims, snapshots, audit events, alerts, codes, staff). Reference data (REF-01) and approved Ask documents are shared.
2. **The organisation comes from the actor, never from the request.** Observer → the code's organisation. Staff → the account's organisation. Citizen web, SMS, USSD and simulator reports → the deployment setting `PUBLIC_INTAKE_ORGANISATION_ID` (one organisation receives public intake; see open question 1).
3. **Every queryset starts from one helper** (`org_scope(request)`) that filters by organisation before any other filter; a test fails the build if a view queries an org-owned model without it.
4. **Cross-organisation access returns `404 not_found`**, never `403`, on object routes; list routes simply do not include the rows. The same applies to "exists in my organisation but not mine" (another observer's report, a case assigned to someone else, a former reviewer).
5. Writes that link two things check both are in the actor's organisation: ASG-02 (reviewer and report), DIS-05 (invitees), CASE-04 (the other report), MSG-02 (attached media belongs to the same report).
6. Blob paths start with the organisation id; a short-lived download link (MED-04) is scoped to one blob.
7. **Audit chains are per organisation** (AUD-01): each organisation verifies and exports its own chain.
8. **Only PUB-02 combines organisations**, and only from approved snapshots, with suppression applied so that no combination reveals a suppressed cell (PUB-02 rules).
9. Tests (plan 7.2): for every object route, a user of another organisation, another observer, an unassigned reviewer, a moderator, a former reviewer and a signed-out user each get `404` (or `401` when signed out).

---

## 4. Contracts

Template for each: **Status** · **Screens** · **Auth** · request · responses · retry · privacy · limits. "Common errors" means `401 not_authenticated`, `403 csrf_failed` (unsafe methods), `403 forbidden`, `429 rate_limited`, `503 service_unavailable` as in 1.4.

---

### AUTH

#### AUTH-01 · CSRF token

- **Status:** CHANGE (from `GET /api/auth/csrf`; response key `csrfToken` becomes `csrf_token`).
- **Screens:** every screen that writes (fetched once per page load by the API client, and again after sign-in or sign-out).
- **Auth:** anyone.
- `GET /api/v1/auth/csrf`
- **200:**
  ```json
  { "csrf_token": "h3Yk0rYz6dX0m5Qm4n2b8Vt1wQ9eLr7a" }
  ```
- **Retry:** safe to repeat.
- **Limits:** 60/min per IP.

#### AUTH-02 · Observer sign-in (code + PIN)

- **Status:** NEW (replaces email sign-in for observers).
- **Screens:** O-03, and the PIN prompt shown by the outbox after a session expired.
- **Auth:** anonymous; CSRF required.
- `POST /api/v1/auth/observer/sign-in`

| Field | Type | Rules |
|---|---|---|
| `code` | string | Observer code, normalised (1.1). Required |
| `pin` | string | 6 digits (personal PIN) **or** 8 digits (one-time setup PIN printed on the card). Required |

- **200, signed in** (personal PIN):
  ```json
  {
    "status": "signed_in",
    "me": {
      "authenticated": true,
      "user": {
        "id": "2b1f7a9e-3c44-4a8e-9a10-5f0d2c7b1e66",
        "kind": "observer",
        "observer_code": "OBS-7K2P9D",
        "roles": ["observer"],
        "display_name": null,
        "email": null,
        "totp_enrolled": false,
        "organisation": { "id": "5a3c...", "name": "Cairn Assure Observation Group", "intake_paused": false }
      },
      "session_expires_at": "2026-12-05T06:10:00+01:00",
      "citizen_intake_open": true,
      "server_time": "2026-11-28T06:10:02+01:00"
    }
  }
  ```
- **200, PIN setup needed** (setup PIN used): no session is created yet.
  ```json
  { "status": "pin_setup_required", "setup_token": "pst_6QWm2...", "setup_token_expires_at": "2026-11-28T06:20:00+01:00" }
  ```
- **Errors:**
  - `401` wrong code or wrong PIN (identical body and timing for unknown codes):
    ```json
    { "error": { "code": "invalid_credentials", "message": "That code and PIN do not match." } }
    ```
  - `403` correct PIN, code revoked (revealed only after a correct PIN):
    ```json
    { "error": { "code": "code_revoked", "message": "This code is no longer active. Ask your coordinator for a new one." } }
    ```
  - `423` locked:
    ```json
    { "error": { "code": "code_locked", "message": "Too many tries. Try again in 15 minutes or ask your coordinator." } }
    ```
  - `422 validation_failed` (`code` or `pin` missing or wrong shape), common errors.
- **Lockout:** 5 failures per code in 15 min → locked 15 min (`Retry-After: 900`). 10 failures in 24 h → locked until an admin resets the PIN (ADM-02). Every lock raises a security alert (SEC-01, rule `repeated_failed_pins`). Per IP: 30 attempts per 10 min, then `429` (generous because Nigerian mobile networks put many phones behind one address).
- **Retry:** if the response is lost, signing in again is harmless (a new session; the old one expires).
- **Privacy:** the response never includes the batch, the activation date, or anything about other codes.

#### AUTH-03 · Observer first-time PIN set

- **Status:** NEW. **Screens:** O-03 (first-time step). **Auth:** anonymous with `setup_token`; CSRF required.
- `POST /api/v1/auth/observer/pin`

| Field | Type | Rules |
|---|---|---|
| `setup_token` | string | From AUTH-02; single use; valid 10 min |
| `new_pin` | string | Exactly 6 digits; not all the same digit; not ascending or descending (`123456`, `987654`); not the first 6 digits of the setup PIN |

- **200:** `{"status": "signed_in", "me": { ...as AUTH-02... }}`. The setup PIN stops working.
- **Errors:**
  - `422`:
    ```json
    { "error": { "code": "validation_failed", "message": "Choose a different PIN.", "fields": { "new_pin": { "code": "pin_too_simple", "message": "Avoid repeated or sequential digits." } } } }
    ```
  - `401` token unknown, used or expired:
    ```json
    { "error": { "code": "invalid_credentials", "message": "This setup step has expired. Enter your code and setup PIN again." } }
    ```
- **Limits:** 5 attempts per token; then the token is void.
- **Retry:** a lost response after success: the token is used, so a retry gets `401`; the app then calls AUTH-07, finds the session and continues. If no session, the observer signs in with the new PIN.

#### AUTH-04 · Staff sign-in

**Pending merge** (PR #12).

- **Status:** CHANGE (from `POST /api/auth/sign-in`, form-encoded, single step).
- **Screens:** S-01. **Auth:** anonymous; CSRF required.
- `POST /api/v1/auth/staff/sign-in` with `{"email": "a.bello@example.org", "password": "…"}` (email ≤ 254, password ≤ 128).
- **200, TOTP needed** (pre-2FA session created):
  ```json
  { "status": "totp_required", "expires_at": "2026-12-05T09:05:00+01:00" }
  ```
- **200, enrolment needed** (first sign-in after an invite or a 2FA reset):
  ```json
  { "status": "totp_enrolment_required", "expires_at": "2026-12-05T09:05:00+01:00" }
  ```
- **Errors:** `401 invalid_credentials` (`"Email or password is wrong."`), `423 account_locked` (`"Too many tries. Try again in 15 minutes."`), `422`, common errors.
- **Lockout:** 5 failures per email in 15 min → 15-min lock; alert `repeated_failed_staff_sign_in`. Per IP 30 per 10 min.
- An offboarded or inactive account gets `401 invalid_credentials`.

#### AUTH-05 · Staff TOTP verify and enrol

**Pending merge** (PR #12).

- **Status:** NEW. **Screens:** S-01. **Auth:** pre-2FA session (verify, enrol) or an invite token (accept invite). CSRF required.
- TOTP: RFC 6238, SHA-1, 6 digits, 30-second step, ±1 step accepted, each code usable once per account.

| Operation | Method and path | Body | 200 response |
|---|---|---|---|
| `verify` | `POST /api/v1/auth/staff/totp` | `{"code": "492039"}` | `{"status": "signed_in", "me": {...}}` |
| `enrol_start` | `POST /api/v1/auth/staff/totp/enrolment` | `{}` | `{"otpauth_uri": "otpauth://totp/ElectraGuard:a.bello%40example.org?secret=JBSW...&issuer=ElectraGuard", "secret": "JBSWY3DPEHPK3PXP", "expires_at": "…"}` |
| `enrol_confirm` | `POST /api/v1/auth/staff/totp/enrolment/confirm` | `{"code": "492039"}` | `{"status": "signed_in", "me": {...}}` |
| `accept_invite` | `POST /api/v1/auth/staff/invite` | `{"token": "inv_…", "password": "…"}` | `{"status": "totp_enrolment_required", "expires_at": "…"}` |

- Password rules (accept_invite): 12–128 characters, Django password validators (not common, not similar to the email).
- **Errors:** `401 totp_invalid` (`"That code did not work. Check the time on your phone."`), `401 invalid_credentials` (invite token unknown, used or older than 72 h), `403 totp_required` when a pre-2FA session calls anything else, `422`, common errors.
- **Limits:** 5 wrong codes per pre-2FA session → the session ends; 10 per account per hour → `account_locked`.
- The secret is shown once; `enrol_start` again replaces it until confirmed.

#### AUTH-06 · Sign out (and sign out everywhere)

- **Status:** CHANGE (from `POST /api/auth/sign-out`; adds `everywhere`).
- **Screens:** O-20 ("Sign out and clear this phone"), StaffShell menu, S-10 (an admin's own sessions).
- **Auth:** any session; CSRF required.
- `POST /api/v1/auth/sign-out` with `{"everywhere": false}`.
- **204** no body. `everywhere: true` ends every session of this account on every device (sessions are tracked per user for this and for revocation).
- **Retry:** idempotent; signing out a signed-out client returns `204`.
- **Client duty:** "clear this phone" deletes IndexedDB drafts, outbox, cached reports and the Cache Storage entries for report data; it **asks first** if the outbox is not empty ("2 reports are not sent yet").

#### AUTH-07 · Me

- **Status:** CHANGE (from `GET /api/auth/me`; adds kind, roles, organisation, expiry, intake).
- **Screens:** O-03 (resume), O-04 (intake banner), O-20, every S-* screen (role-based navigation), P-02 and the citizen flow (is citizen intake open).
- **Auth:** anyone (anonymous gets `authenticated: false`).
- `GET /api/v1/auth/me`
- **200 signed in:** the `me` object shown in AUTH-02. Staff example of `user`: `{"kind": "staff", "observer_code": null, "email": "a.bello@example.org", "display_name": "A. Bello", "roles": ["reviewer", "moderator"], "totp_enrolled": true, ...}`.
- **200 anonymous:**
  ```json
  { "authenticated": false, "user": null, "session_expires_at": null, "citizen_intake_open": true, "server_time": "2026-12-05T09:00:00+01:00" }
  ```
- `server_time` lets the app warn when the phone clock is more than 10 minutes off (used by O-08 to block future times correctly).
- A pre-2FA session returns `authenticated: false` plus `"pending": "totp_required"` or `"pending": "totp_enrolment_required"`.

---

### REF

#### REF-01 · Polling-unit reference list (versioned, cacheable offline)

- **Status:** NEW. **Screens:** O-07 (Where), O-15 (Arrival stage), O-16, the citizen flow, S-02 and S-04 filters, S-05, S-08, S-11 (coverage area).
- **Auth:** anyone. Cacheable: `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`, `ETag`.
- The full national list is too big for a 2G phone, so it is split per state.

| Operation | Path | Response |
|---|---|---|
| `index` | `GET /api/v1/reference/areas` | States and the version of each state file (~3 KB) |
| `state` | `GET /api/v1/reference/areas/{state_code}` | One state's LGAs → wards → units, compact |

- **index 200:**
  ```json
  {
    "dataset_version": "2026-11-20.1",
    "source": "synthetic",
    "states": [
      { "state_code": "KN", "name": "Kano", "lga_count": 44, "unit_count": 412, "version": "2026-11-20.1", "bytes_gzip": 18234 }
    ]
  }
  ```
- **state 200** (arrays keep it small; names are as officially written, not translated):
  ```json
  {
    "state_code": "KN",
    "name": "Kano",
    "version": "2026-11-20.1",
    "lgas": [
      {
        "lga_code": "KN-04", "name": "Dala",
        "wards": [
          { "ward_code": "KN-04-07", "name": "Kantudu",
            "units": [ ["KN-04-07-012", "Kantudu Primary School I"], ["KN-04-07-013", "Kantudu Primary School II"] ] }
        ]
      }
    ]
  }
  ```
- **304** when `If-None-Match` matches. **404 not_found** for an unknown state.
- **Offline:** the service worker stores the index and the states the observer chose (or the organisation's coverage area from AUTH-07 → ADM-04). The picker searches locally. A report made with an older list version is still accepted if the code exists in any version the server knows; a code unknown to every version gets `unknown_area`.
- `source` is `"synthetic"` for the hackathon data and is shown as a footnote on S-05.

---

**REF-02.** The observer settings response below already exposes coverage and party labels on this base. See the live `GET /api/v1/reference/settings` route.

### REP

Common report shapes used below (full types in `types.ts`):

- **Area** in responses: `{"state_code","state_name","lga_code","lga_name","ward_code","ward_name","polling_unit_code","polling_unit_name"}`; unit fields are `null` when the reporter chose "I don't know the unit".
- **Categories** (`category_observer`, also used by triage): `late_materials`, `equipment_failure`, `queues_crowding`, `intimidation_violence`, `access_barrier`, `lack_of_information`, `misinformation`, `vote_buying`, `good_practice`, `not_sure` (observer only; triage never suggests it).
- **Access barrier details** (only with `access_barrier`, optional, many): `steps_no_ramp`, `distance`, `no_assistance`, `no_large_print_braille`, `no_sign_language`, `other`.

#### REP-01 · Observer creates a report (incident, checklist, result sheet)

**Available for incidents.** Checklist and result-sheet writes are **pending merge** (PR #16).

- **Status:** CHANGE (from `POST /api/reports`; adds kinds, structured place, danger, firsthand, language, receipt code; keeps idempotent create and intake pause).
- **Screens:** O-11 (Check and send), O-12 (Receipt), O-15 (Checklist stage), O-16 (Result-sheet entry).
- **Auth:** observer; CSRF; `Idempotency-Key` required; `X-Device-Time` recommended.
- `POST /api/v1/reports`

Common fields (all kinds):

| Field | Type | Rules |
|---|---|---|
| `kind` | `"incident" \| "checklist" \| "result_sheet"` | Required |
| `language` | Language | The UI language when the report was made. Required |
| `occurred_at` | datetime | Required. Not later than `X-Device-Time` + 5 min (or server time + 5 min when the header is missing) → `in_future`; not older than 30 days → `too_old`. The 7-day confirmation is a client step |
| `place.polling_unit_code` | string \| null | From REF-01 |
| `place.ward_code` | string | Required when `polling_unit_code` is null; must contain the unit when both are given |
| `device_saved_at` | datetime | When the report was saved on the phone. Optional; shown to reviewers with `received_at` |
| `related_report_id` | uuid \| null | Optional link: an incident raised from a checklist "No", or a result sheet from the Results-posted stage. Must be the same observer's report |

Incident (`kind: "incident"`):

| Field | Type | Rules |
|---|---|---|
| `category_observer` | Category | Required |
| `access_barrier_details` | string[] | Only with `access_barrier`; otherwise `not_allowed_for_kind` |
| `danger_now` | boolean | Required |
| `firsthand` | boolean | Required (`true` = "I saw this myself") |
| `description` | string | Required, 1–2000 characters |
| `input_method` | `"typed" \| "dictated" \| "mixed"` | Optional; evaluation only, never shown to reviewers as credibility |
| `from_checklist_question` | ChecklistQuestionId \| null | Optional; with `related_report_id` |

Checklist (`kind: "checklist"`):

| Field | Type | Rules |
|---|---|---|
| `stage` | `"arrival" \| "opening" \| "accreditation" \| "voting" \| "closing_counting" \| "results_posted"` | Required. One report per stage per observer per polling unit per day; a second one is accepted and marked `supersedes` the first for coverage counts |
| `answers` | `{question, answer}[]` | Required. Each `question` must belong to the stage; each at most once |
| `note` | string | Optional, ≤ 1000 |

Checklist questions and answer types:

| Stage | Question id | Answer |
|---|---|---|
| arrival | `arrival_time` | datetime |
| opening | `opened_on_time`, `materials_all_present`, `officials_present`, `party_agents_present` | `"yes" \| "no" \| "not_seen"` |
| opening | `materials_missing` | string[] of `ballot_papers`, `result_sheets`, `ballot_boxes`, `voting_cubicles`, `indelible_ink`, `voter_register`, `accreditation_device`, `stamps_seals`, `other` (only when `materials_all_present` is `no`) |
| accreditation | `device_working`, `priority_given` | yes/no/not_seen |
| accreditation | `queue_size` | `"none" \| "under_50" \| "50_200" \| "over_200"` |
| voting | `secrecy_kept`, `assistance_available`, `disruption`, `inducement_seen` | yes/no/not_seen |
| closing_counting | `closed_on_time`, `counting_public`, `agents_signed` | yes/no/not_seen |
| results_posted | `sheet_posted` | yes/no/not_seen |

Result sheet (`kind: "result_sheet"`):

| Field | Type | Rules |
|---|---|---|
| `result_sheet.registered`, `.accredited`, `.rejected` | integer | 0–99 999 |
| `result_sheet.votes` | `{A..E: integer}` | Keys must equal the organisation's party labels (ADM-04, default `A`–`E`); each 0–99 999 |
| `result_sheet.confirmed_fields` | string[] | Field names the observer confirmed against the sheet (`registered`, `accredited`, `votes.A`, …, `rejected`). Unconfirmed fields are accepted and flagged to the reviewer |
| `result_sheet.ocr_id` | uuid \| null | From RS-01. Attaches the OCR'd photo without uploading it again; must be the same observer's and not expired |
| `result_sheet.entry_method` | `"ocr_confirmed" \| "manual" \| "offline_ocr"` | Required |

- **201 created** (and the identical body as **200** on replay):
  ```json
  {
    "id": "8d0c1a52-4f3e-4b9e-9a51-2f6a0f7c3e11",
    "receipt_code": "EG-4H7Q-92KD",
    "kind": "incident",
    "status": "received",
    "received_at": "2026-12-05T09:14:31+01:00",
    "version": 0,
    "media_upload": { "max_items": 6, "max_total_bytes": 62914560 }
  }
  ```
  The response is minimal on purpose: the phone already has the content, and the receipt needs only these fields.
- **Errors:**
  - `422`:
    ```json
    { "error": { "code": "validation_failed", "message": "Some fields need attention.", "fields": { "occurred_at": { "code": "in_future", "message": "The time cannot be in the future." }, "place.ward_code": { "code": "unknown_area", "message": "Choose the ward again." } } } }
    ```
  - `503` paused (new key only; replays still succeed), `Retry-After: 600`:
    ```json
    { "error": { "code": "intake_paused", "message": "New reports are paused by your organisation. Your report is kept on this phone and will send when reporting resumes." } }
    ```
  - `409 idempotency_key_reused`, `409 request_in_progress`, `400 idempotency_key_required`, `403 code_revoked` (session of a code revoked mid-session), common errors.
- **Retry after a lost response:** resend the same body with the same key. If the first request committed, the reply is `200` with the same `id` and `receipt_code`; nothing is duplicated. If it did not, the reply is `201`. If the report was withdrawn meanwhile, the reply is the stub with `"status": "withdrawn"`.
- **Server-side work after commit:** triage job (category, urgency, duplicates, translation), name check (`possible_names` flag for the reviewer), result-sheet checks (A6), cluster counts. None of it delays the response.
- **Privacy:** result-sheet flags are never returned to the observer (the screen states "Consistency check for review. This is not a result."). The observer code is stored on the report; staff see it, the public never does.
- **Limits:** 60 new reports per hour per observer (replays exempt); body ≤ 64 KB.

#### REP-02 · List own reports

- **Status:** CHANGE (from `GET /api/reports`; adds cursor paging, status counts, question and unread markers).
- **Screens:** O-04 (counts, recent), O-13 (My reports), O-17 (Messages: `?has_messages=true`).
- **Auth:** observer. Only reports created under the current observer code.
- `GET /api/v1/reports?kind=&status=&has_messages=&cursor=&limit=`
- **200:**
  ```json
  {
    "items": [
      {
        "id": "8d0c1a52-4f3e-4b9e-9a51-2f6a0f7c3e11",
        "receipt_code": "EG-4H7Q-92KD",
        "kind": "incident",
        "category_observer": "intimidation_violence",
        "checklist_stage": null,
        "area": { "state_code": "KN", "state_name": "Kano", "lga_code": "KN-04", "lga_name": "Dala", "ward_code": "KN-04-07", "ward_name": "Kantudu", "polling_unit_code": "KN-04-07-012", "polling_unit_name": "Kantudu Primary School I" },
        "occurred_at": "2026-12-05T09:05:00+01:00",
        "received_at": "2026-12-05T09:14:31+01:00",
        "status": "question",
        "outcome": null,
        "has_open_question": true,
        "unread_messages": 1,
        "last_activity_at": "2026-12-05T10:02:11+01:00",
        "media_count": 2
      }
    ],
    "next_cursor": null,
    "counts": { "open_questions": 1, "unread_messages": 1 }
  }
  ```
- Sort: `last_activity_at` descending. Withdrawn stubs are included with `status: "withdrawn"` and null content fields.
- **Errors:** `422` (bad filter), common errors.
- **Offline:** the screen merges this list with the outbox (`on_device`, `not_confirmed`, `needs_attention` items) through `useReportState`. Server items are not stored on the phone (1.8).

#### REP-03 · Report detail

- **Status:** CHANGE (from `GET /api/reports/<reference>`).
- **Screens:** O-14 (status, attachments, withdraw), O-12 (attachment progress after receipt).
- **Auth:** observer (owner) → this shape. Staff use CASE-01. Citizens use REP-07.
- `GET /api/v1/reports/{id}`
- **200:**
  ```json
  {
    "id": "8d0c1a52-4f3e-4b9e-9a51-2f6a0f7c3e11",
    "receipt_code": "EG-4H7Q-92KD",
    "kind": "incident",
    "channel": "app",
    "status": "question",
    "outcome": null,
    "language": "ha",
    "category_observer": "intimidation_violence",
    "access_barrier_details": [],
    "danger_now": false,
    "firsthand": true,
    "description": "Wasu matasa suna tsoratar da masu jefa kuri'a a layi.",
    "checklist": null,
    "result_sheet": null,
    "area": { "...": "as REP-02" },
    "occurred_at": "2026-12-05T09:05:00+01:00",
    "received_at": "2026-12-05T09:14:31+01:00",
    "closed_at": null,
    "withdrawn_at": null,
    "media": [
      { "id": "c9f1…", "kind": "video", "status": "ready", "size_bytes": 8123456, "duration_ms": 41000, "blurred": true, "exif_removed": true, "created_at": "2026-12-05T09:16:02+01:00" }
    ],
    "open_question": { "id": "f04e…", "body": "Were the young men inside the polling unit or outside it?", "asked_at": "2026-12-05T10:02:11+01:00" },
    "can_withdraw": false,
    "can_add_media": true,
    "can_message": true
  }
  ```
  - `checklist` (checklist kind): `{"stage": "opening", "answers": [{"question": "opened_on_time", "answer": "no"}], "note": null}`.
  - `result_sheet` (result-sheet kind): the submitted numbers and `confirmed_fields`, **without** check flags.
  - Media `status`: `processing` (saved, being cleaned), `ready`, `failed` (could not be processed; the original was discarded and the observer is asked to add it again).
- **Errors:** `404 not_found` (not the owner, other organisation, or never existed), common errors.

#### REP-04 · Withdraw

- **Status:** NEW. **Screens:** O-14 (observer), P-01 (citizen, with the secret).
- **Auth:** observer (owner) **or** citizen with `X-Receipt-Secret`; CSRF; `Idempotency-Key` required.

| Operation | Path |
|---|---|
| `observer` | `POST /api/v1/reports/{id}/withdraw` |
| `citizen` | `POST /api/v1/public/receipts/{receipt_code}/withdraw` |

- Body: `{"confirm": true}` (the client's two-step confirmation; required so a stray request cannot withdraw).
- **200** (first time and every repeat):
  ```json
  { "id": "8d0c1a52-…", "receipt_code": "EG-4H7Q-92KD", "kind": "incident", "channel": "app", "status": "withdrawn", "received_at": "2026-12-05T09:14:31+01:00", "withdrawn_at": "2026-12-05T09:20:00+01:00", "version": 1 }
  ```
- **Errors:**
  - `409`:
    ```json
    { "error": { "code": "withdraw_unavailable", "message": "A reviewer has started on this report, so it can no longer be withdrawn. You can send them a message." } }
    ```
  - `401 receipt_secret_invalid` (citizen), `404 not_found`, `422` (`confirm` missing), common errors.
- **Retry:** same key or a new key both return the stub once withdrawn. Effects in 2.3.

#### REP-05 · Citizen creates a report (no account)

- **Status:** NEW. **Screens:** the citizen report steps (`/r/new/...`, same step screens as O-05..O-11 in citizen mode) and C-01 (Citizen receipt).
- **Auth:** anonymous; CSRF; `Idempotency-Key` required.
- `POST /api/v1/public/reports`
- Body: the **incident** fields of REP-01 (`kind` must be `"incident"`; checklists and result sheets are observer-only), plus:

| Field | Type | Rules |
|---|---|---|
| `receipt_secret` | string | base64url of 32 random bytes made on the phone, exactly 43 characters. Required. Stored only as SHA-256; never returned |

- **201 / 200 on replay:** same shape as REP-01, with `"channel": "citizen"`.
- **Idempotency scope:** the SHA-256 of `receipt_secret`. A replay with the same key but a different secret is a different scope and creates nothing new for the other scope; it returns `409 idempotency_key_reused` only within the same secret.
- **Errors:** `422` (including `"kind": {"code": "not_allowed_for_kind"}`), `503 intake_paused` (citizen intake is paused when the public-intake organisation pauses), `409 idempotency_key_reused`, `403 csrf_failed`, `429`.
- **Retry after a lost response:** the citizen app keeps the draft, the key and the secret in IndexedDB until confirmed, then keeps only `receipt_code` and the secret (so the citizen can reply later on this phone). The receipt screen offers "Save as image" because a cleared phone loses the secret; status checks (REP-06) need only the code.
- **Privacy:** no account, no name, no phone number. IP addresses are used for rate limits in memory and never stored with the report. Reviewers see "Citizen, not accredited".
- **Limits:** 30 new reports per 10 min per IP (carrier networks share addresses), and the security monitor watches bursts (`intake_burst`). Body ≤ 64 KB.

#### REP-06 · Status by receipt code (public, minimal)

- **Status:** NEW. **Screens:** P-01, C-01 (refresh). Same logic as SMS `STATUS`.
- **Auth:** anyone.
- `GET /api/v1/public/receipts/{receipt_code}`
- **200:**
  ```json
  { "receipt_code": "EG-4H7Q-92KD", "status": "closed", "outcome": "insufficient_evidence", "has_open_question": false, "received_on": "2026-12-05", "updated_on": "2026-12-06" }
  ```
- Dates only, no times; no category, place, text, channel, media or organisation, because anyone who sees a code (a screenshot, a shoulder) can look it up.
- **Errors:**
  - `422`:
    ```json
    { "error": { "code": "receipt_code_invalid", "message": "Check the code. It looks like EG-4H7Q-92KD." } }
    ```
  - `404 not_found` (unknown code; same timing as found), `429`.
- **Limits:** 30/min per IP; 1,000 misses per hour across the service raises `receipt_enumeration`.

#### REP-07 · Citizen reads the conversation and replies to a formal question

- **Status:** NEW. **Screens:** P-01 (when `has_open_question` and the phone holds the secret, or the citizen pastes the saved secret).
- **Auth:** anonymous with `X-Receipt-Secret`; CSRF on POST; `Idempotency-Key` on POST.

| Operation | Method and path | Body |
|---|---|---|
| `read` | `GET /api/v1/public/receipts/{receipt_code}/conversation` | none |
| `reply` | `POST /api/v1/public/receipts/{receipt_code}/reply` | `{"question_id": "f04e…", "body": "Outside, near the gate."}` (body 1–2000) |

- **read 200:** `{"receipt_code": "EG-4H7Q-92KD", "status": "question", "messages": [Message...]}` where `Message` is as MSG-01 but without attachments (citizen media replies are not supported on the web status page; see open question 6).
- **reply 201 / 200 on replay:** `{"message": Message, "status": "in_review", "version": 4}`.
- **Errors:** `401 receipt_secret_invalid`, `409 question_closed` (`"This question was already answered or closed."`), `409 report_withdrawn`, `409 report_closed`, `422`, `404`, `429`.
- **Retry:** same key → same message, no duplicate reply. A different key after success → `409 question_closed`; the app then reloads `read`.
- **Limits:** 10 requests/min per receipt code.

---

### MED

Media limits (server-enforced; the phone resizes and compresses first, plan 4.3 step 6):

| Kind | Accepted types (sniffed, not trusted from the name) | Max size | Max length | Server processing |
|---|---|---|---|---|
| `photo` | JPEG, PNG, WebP | 2 MiB | 16 megapixels | Decode and re-encode to JPEG (quality 85), drop every metadata block (EXIF, XMP, IPTC, GPS), optional face blur (A12) |
| `video` | MP4 (H.264/AAC), WebM (VP8/VP9 + Opus) | 25 MiB | 60 s | Re-encode to MP4 H.264 720p max, metadata dropped, optional face blur per frame, poster frame |
| `audio` | WebM/Opus, Ogg/Opus, MP4/AAC (m4a), MP3 | 4 MiB | 120 s | Re-encode to Ogg/Opus 32 kbps, metadata dropped, transcript job (A11) |

Per report: at most **6** media items and **60 MiB** saved in total (`media_limit_reached`). Messages: one photo or one audio per message, counted in the same report limit.

Originals are deleted after the re-encode. `original_sha256` (what the phone declared and the server verified) and `sha256` (the stored, cleaned file) are both kept; "integrity verified" means the upload matched `original_sha256`.

#### MED-01 · Start a resumable upload session

**Available for photos.** Video and audio support is **pending merge** (PR #18).

- **Status:** CHANGE (replaces single-shot multipart `POST /api/reports/<reference>/attachments`; keeps dedupe by hash per report).
- **Screens:** O-10 (Evidence), O-12 (Receipt: per-item upload), O-14 (add later), O-16 (sheet photo), citizen C-01.
- **Auth:** observer (owner) or citizen with `X-Receipt-Secret`; CSRF; `Idempotency-Key` required.
- `POST /api/v1/reports/{report_id}/uploads`

| Field | Type | Rules |
|---|---|---|
| `kind` | `"photo" \| "video" \| "audio"` | Required |
| `purpose` | `"evidence" \| "message"` | Required. `message` media is only attachable through MSG-02 |
| `content_type` | string | Declared MIME type; checked again by sniffing |
| `size_bytes` | integer | 1 … the kind's max |
| `sha256` | string | 64 lower-case hex, of the exact bytes to be sent |
| `duration_ms` | integer \| null | Required for video and audio; ≤ limit |
| `blur_faces` | boolean | Photo and video only; default `false` |
| `client_media_id` | string | ≤ 64; the outbox's local id, echoed back so the phone matches items |

- **201 created** (and **200** with the same body on replay, with `received_bytes` showing the current progress, so a lost response loses nothing):
  ```json
  {
    "upload": {
      "id": "0a7e4c1d-2b8f-4e19-8f53-1b3c9d7e6a20",
      "report_id": "8d0c1a52-…",
      "client_media_id": "local-3",
      "kind": "video",
      "size_bytes": 8123456,
      "received_bytes": 0,
      "chunk_bytes": 262144,
      "status": "open",
      "expires_at": "2026-12-06T09:16:00+01:00"
    },
    "media": null
  }
  ```
- **200, already saved** (same `sha256` already saved on this report; nothing to send):
  ```json
  { "upload": null, "media": { "id": "c9f1…", "kind": "video", "status": "ready", "size_bytes": 8123456, "duration_ms": 41000, "blurred": true, "exif_removed": true, "created_at": "2026-12-05T09:16:02+01:00" } }
  ```
- **Errors:**
  - `409`:
    ```json
    { "error": { "code": "media_limit_reached", "message": "This report already has 6 attachments or 60 MB. Remove one to add another." } }
    ```
  - `409 report_closed` (`"This case is closed, so new evidence cannot be added."`), `409 report_withdrawn`, `413 payload_too_large` (declared size over the limit), `415 unsupported_media_type` (declared type not allowed), `422` (duration over the limit: `"duration_ms": {"code": "max_value", "limit": 60000}`), `401 receipt_secret_invalid`, `404`, common errors.
- **Session lifetime:** 24 h from the last chunk. Expired sessions are deleted with their bytes.
- **Limits:** 30 new sessions per hour per actor.

#### MED-02 · Upload a chunk (and read progress)

**Available for photos.** Video and audio support is **pending merge** (PR #18).

- **Status:** NEW. **Screens:** O-12, O-14 (progress bar tied to real bytes).
- **Auth:** the session's owner (observer session or `X-Receipt-Secret`); CSRF on PATCH.

| Operation | Method and path | Request |
|---|---|---|
| `send` | `PATCH /api/v1/uploads/{upload_id}` | Headers `Content-Type: application/offset+octet-stream`, `Upload-Offset: <int>`, optional `Upload-Chunk-Sha256: <hex>`; body = raw bytes, 1 … 1 MiB (normally `chunk_bytes`; the last chunk may be shorter) |
| `progress` | `GET /api/v1/uploads/{upload_id}` | none |

- **send 200:** `{"id": "0a7e…", "received_bytes": 524288, "size_bytes": 8123456, "status": "open"}`
- **progress 200:** the `upload` object from MED-01.
- **Errors:**
  - `409` offset differs (the body tells nothing; the phone calls `progress` and continues from `received_bytes`):
    ```json
    { "error": { "code": "offset_mismatch", "message": "The upload position changed. Continue from the saved position." } }
    ```
  - `422 hash_mismatch` (only when `Upload-Chunk-Sha256` is sent and does not match; the chunk is discarded), `409 upload_expired`, `409 upload_completed`, `413 payload_too_large` (chunk over 1 MiB or past `size_bytes`), `404`, common errors.
- **Retry after a lost response:** call `progress`, then send from `received_bytes`. Re-sending a chunk that was already stored, at its original offset, returns `409 offset_mismatch` and changes nothing.
- **Why chunk size 256 KiB:** about 10–20 s per chunk on 2G (100–200 kbit/s), so a dropped connection loses at most one short chunk.

#### MED-03 · Complete the upload

**Available for photos.** Video and audio support is **pending merge** (PR #18).

- **Status:** NEW. **Screens:** O-12, O-14 (item becomes *Saved*).
- **Auth:** the session's owner; CSRF; `Idempotency-Key` required.
- `POST /api/v1/uploads/{upload_id}/complete` with `{}`.
- Server steps, in order: all bytes present → SHA-256 equals the declared `sha256` → sniff the type → store the original in private storage → create the `MediaItem` with `status: "processing"` → respond. A worker then re-encodes, strips metadata, blurs (if asked), transcribes audio, deletes the original and sets `ready` (or `failed`).
- **201 / 200 on replay:**
  ```json
  { "media": { "id": "c9f1…", "kind": "video", "status": "processing", "size_bytes": 8123456, "duration_ms": 41000, "blurred": false, "exif_removed": false, "created_at": "2026-12-05T09:16:02+01:00" }, "client_media_id": "local-3" }
  ```
  The phone shows *Saved* now: the bytes are safe and verified. `blurred` and `exif_removed` become `true` when processing finishes (REP-03 shows the final state).
- **Errors:**
  - `422` hash differs (the session is reset to `received_bytes: 0` and stays open; the phone re-sends from the start, or asks the user to choose the file again if it is gone):
    ```json
    { "error": { "code": "hash_mismatch", "message": "The file did not arrive intact. Sending it again." } }
    ```
  - `409` incomplete: `{"error": {"code": "offset_mismatch", "message": "Some of the file has not arrived yet."}}`
  - `415 unsupported_media_type` (sniffed type not allowed; session deleted), `422 media_unreadable` (cannot be decoded; session deleted), `409 report_closed` (closed while uploading; the session is named as a pending upload in the closure record and then deleted), `409 media_limit_reached`, `404`, common errors.
- **Dedupe:** if the same `sha256` was saved on this report meanwhile, the existing item is returned (`200`) and the session is deleted.

#### MED-04 · Download or stream (permission checked every time)

**Available for photos.** Video and audio support is **pending merge** (PR #18).

- **Status:** CHANGE (from `GET /api/reports/<reference>/attachments/<id>`; adds video/audio, range requests, variants, logging, storage links).
- **Screens:** O-14 (own media), S-03 (players, downloads), O-17 and S-03 (message attachments).
- **Auth:** the report's observer; the currently assigned reviewer; nobody else (not coordinators, admins or moderators, unless they are the assigned reviewer). Citizens cannot view media after sending.
- `GET /api/v1/media/{media_id}/content?variant=display|thumb|poster|original&download=0|1`
  - `display` (default): the cleaned file. `thumb`: 320 px JPEG for photos. `poster`: a frame for videos. `original` is accepted only while `status` is `processing` and only for the assigned reviewer (so an urgent case is not blocked by the worker); every such access is logged as `download_original`.
- **Responses:** either
  - `200` / `206 Partial Content` streamed by the API (supports `Range`), or
  - `302 Found` to a storage link valid for **60 seconds**, made only after the permission check.
  The client handles both (`<img>`, `<video>` and `<audio>` follow redirects). Headers: `Cache-Control: private, no-store, max-age=0`, `Content-Disposition: inline` (or `attachment` with `download=1`), `X-Content-Type-Options: nosniff`.
- **Errors:** `404 not_found` (no access, including a reviewer reassigned away a second ago; withdrawn or removed media are also `404`). A `display`, `thumb` or `poster` request while the item is still processing returns `409`:
  ```json
  { "error": { "code": "invalid_transition", "message": "This file is still being prepared." } }
  ```
- **Logging:** every staff access writes an audit event (`view_media` or `download_media`), at most one per user per media item per 10 minutes for range requests. More than 100 distinct items per user in 10 minutes raises `unusual_download_volume`.
- **Reassignment:** access is checked on every request, so the previous reviewer's next request fails at once; an issued 60-second link is the only residual window.

#### MED-05 · Remove an attachment before review

**Available for photos.** Video and audio support is **pending merge** (PR #18).

- **Status:** NEW. **Screens:** O-10, O-12, O-14.
- **Auth:** observer (owner) or citizen with `X-Receipt-Secret`; CSRF.

| Operation | Method and path |
|---|---|
| `media` | `DELETE /api/v1/reports/{report_id}/media/{media_id}` |
| `upload` | `DELETE /api/v1/uploads/{upload_id}` (cancel an unfinished upload) |

- Allowed only while the report is `received`. Message attachments cannot be removed (they are part of the conversation).
- **204** no body, also when it was already removed (idempotent).
- **Errors:**
  ```json
  { "error": { "code": "invalid_transition", "message": "A reviewer has started on this report, so attachments can no longer be removed." } }
  ```
  `404`, common errors.
- Deletes the row at once and the blob within 15 minutes; audited as `remove_media` with the SHA-256 only.

---

### MSG

#### MSG-01 · List a report's conversation (and mark read)

**Pending merge** (PR #16).

- **Status:** CHANGE (from the `clarification` and `clarification_history` fields of report detail, and `history` for reviewers).
- **Screens:** O-14, O-17, S-03.
- **Auth:** observer (owner) or the assigned reviewer. Citizens use REP-07.

| Operation | Method and path |
|---|---|
| `list` | `GET /api/v1/reports/{report_id}/messages?cursor=&limit=` |
| `mark_read` | `POST /api/v1/reports/{report_id}/messages/read` with `{"up_to_message_id": "…"}` → `204` |

- **list 200** (oldest first):
  ```json
  {
    "items": [
      { "id": "f04e…", "kind": "formal_question", "author": "reviewer", "author_label": "Reviewer", "body": "Were the young men inside the polling unit or outside it?", "attachment": null, "question_state": "open", "reply_to": null, "created_at": "2026-12-05T10:02:11+01:00", "read": false },
      { "id": "a11b…", "kind": "reply", "author": "observer", "author_label": "You", "body": "Outside, near the gate.", "attachment": null, "question_state": null, "reply_to": "f04e…", "created_at": "2026-12-05T10:09:40+01:00", "read": true }
    ],
    "next_cursor": null
  }
  ```
  - `kind`: `formal_question` · `reply` · `message` · `system` (e.g. "Report closed").
  - `author`: `observer` · `citizen` · `sms_reporter` · `reviewer` · `system`. `author_label` for the observer is "You" in their view; for a reviewer it is always "Reviewer" in the observer's view. In the reviewer's view the reporter label is the observer code (`"OBS-7K2P9D"`) or "Citizen, not accredited" or "SMS reporter", and staff labels are display names.
  - `question_state` (formal questions only): `open` · `answered` · `closed_unanswered`.
  - `attachment`: `null` or a media summary (`id`, `kind`, `status`, `size_bytes`, `duration_ms`) fetched with MED-04.
- **Errors:** `404`, common errors.
- **Reassignment:** the new reviewer sees the full history; the previous reviewer gets `404` at once.

#### MSG-02 · Post a message or reply to a formal question

**Pending merge** (PR #16).

- **Status:** CHANGE (from `POST /api/reports/<reference>/clarification`, which required `version`).
- **Screens:** O-14, S-03.
- **Auth:** observer (owner) or the assigned reviewer; CSRF; `Idempotency-Key` required; observer sends `X-Device-Time`.
- `POST /api/v1/reports/{report_id}/messages`

| Field | Type | Rules |
|---|---|---|
| `kind` | `"message" \| "reply"` | `reply` only from the reporter. Formal questions are asked with CASE-02 `ask` |
| `body` | string | 1–2000; may be empty only when `attachment_media_id` is set |
| `reply_to` | uuid | Required with `reply`: the open formal question's id |
| `attachment_media_id` | uuid \| null | Media uploaded with MED-01..03 `purpose: "message"` on this report, not yet attached |

- **201 / 200 on replay:**
  ```json
  { "message": { "id": "a11b…", "kind": "reply", "author": "observer", "author_label": "You", "body": "Outside, near the gate.", "attachment": null, "question_state": null, "reply_to": "f04e…", "created_at": "2026-12-05T10:09:40+01:00", "read": true }, "report_status": "in_review", "version": 4 }
  ```
- **Errors:**
  - `409`:
    ```json
    { "error": { "code": "question_closed", "message": "This question was already answered or closed. Your text is kept so you can send it as a message." } }
    ```
  - `409 report_closed` (`"This report is closed. Messages can no longer be sent."`), `409 report_withdrawn`, `422` (e.g. `"reply_to": {"code": "required"}`, `"attachment_media_id": {"code": "invalid"}`), `404`, common errors.
- **Retry:** same key → same message. Queued replies reference `reply_to`, not the report version (1.6), so unrelated staff changes do not break them.
- **Discussions:** an observer who wants a detail from a discussion in their case copies it into a message here; nothing moves automatically (plan 4.8).
- **Limits:** 60 messages per hour per actor.

---

### DIS

Discussion member labels are observer codes only. Posts are text only. No reports are visible through a discussion.

#### DIS-01 · My discussions

**Pending merge** (PR #16).

- **Status:** NEW. **Screens:** O-18 (list, invitations), S-08 (moderator list).
- **Auth:** observer (memberships and pending invitations); moderator (all discussions in the organisation).
- `GET /api/v1/discussions?status=open|closed&cursor=&limit=`
- **200:**
  ```json
  {
    "items": [
      { "id": "7e2d…", "title": "Materials late across Kantudu ward", "area": { "state_code": "KN", "state_name": "Kano", "lga_code": "KN-04", "lga_name": "Dala", "ward_code": "KN-04-07", "ward_name": "Kantudu" }, "status": "open", "membership": "member", "member_count": 9, "unread_posts": 3, "last_post_at": "2026-12-05T08:40:00+01:00", "closes_at": "2026-12-07T23:59:00+01:00" }
    ],
    "next_cursor": null
  }
  ```
  `membership`: `invited` · `member` · `left` · `removed` · `moderator` (moderators see all). Observers do not see `left` and `removed` discussions.

#### DIS-02 · Thread

**Pending merge** (PR #16).

- **Status:** NEW. **Screens:** O-18 thread, S-08.
- **Auth:** member, invited (title and area only, no posts) or moderator.
- `GET /api/v1/discussions/{id}?after=<post_id>&limit=`
- **200:**
  ```json
  {
    "discussion": { "id": "7e2d…", "title": "Materials late across Kantudu ward", "topic": "Coordinate on late materials", "area": { "...": "ward level" }, "status": "open", "membership": "member", "closes_at": "2026-12-07T23:59:00+01:00" },
    "posts": [
      { "id": "p91…", "author_label": "OBS-7K2P9D", "is_me": false, "body": "Still no result sheets at the school units.", "state": "visible", "created_at": "2026-12-05T08:40:00+01:00" },
      { "id": "p92…", "author_label": "Moderator", "is_me": false, "body": null, "state": "hidden", "created_at": "2026-12-05T08:42:00+01:00" }
    ],
    "next_after": null
  }
  ```
  Hidden posts keep their place with `body: null` for members; moderators also get `hidden_body`, `hidden_reason` and `flag_count`.
- **Errors:** `404` (not a member, not invited, other organisation), common errors.

#### DIS-03 · Post (and flag a post)

**Pending merge** (PR #16).

- **Status:** NEW. **Screens:** O-18.
- **Auth:** member (post, flag); CSRF; `Idempotency-Key` required.

| Operation | Method and path | Body |
|---|---|---|
| `post` | `POST /api/v1/discussions/{id}/posts` | `{"body": "…"}` (1–1000) |
| `flag` | `POST /api/v1/discussions/{id}/posts/{post_id}/flag` | `{"reason": "names_a_person" \| "too_specific_location" \| "abusive" \| "other"}` |

- **post 201 / 200 on replay:** `{"post": Post}`. **flag 204.**
- Server checks: text containing a polling-unit code (any code in REF-01) is refused, `422` with `"body": {"code": "contains_polling_unit_code", "message": "Name the ward, not the polling unit."}`. The name check flags (does not block) posts that seem to name a person; flagged posts appear in the moderator's list.
- **Errors:** `409 discussion_closed`, `409 not_a_member`, `422`, `404`, common errors.
- **Offline:** posts are queued like messages and sent in order. **Limits:** 30 posts per hour per member.

#### DIS-04 · Accept or decline an invitation, leave

**Pending merge** (PR #16).

- **Status:** NEW. **Screens:** O-18. **Auth:** the invited or member observer; CSRF; `Idempotency-Key`.
- `POST /api/v1/discussions/{id}/membership` with `{"action": "accept" | "decline" | "leave"}`.
- **200:** `{"discussion_id": "7e2d…", "membership": "member"}` (`member` after accept, `declined` after decline, `left` after leave). Repeating the same action returns the same result.
- **Errors:** `409 invalid_transition` (e.g. accept after being removed), `409 discussion_closed`, `404`, common errors.

#### DIS-05 · Moderator: create, invite, hide, remove, close, flags

**Pending merge** (PR #16).

- **Status:** NEW. **Screens:** S-08. **Auth:** moderator; CSRF; `Idempotency-Key` on creates.

| Operation | Method and path | Body | 200/201 |
|---|---|---|---|
| `create` | `POST /api/v1/discussions` | `{"title" (3–120), "topic" (≤ 500), "ward_code" or "lga_code", "closes_at"?}` | `{"discussion": Discussion}` |
| `invite` | `POST /api/v1/discussions/{id}/invitations` | `{"observer_codes": ["OBS-7K2P9D", …]}` (1–200) | `{"invited": [...], "already_members": [...], "not_found": [...]}` |
| `hide_post` | `POST /api/v1/discussions/{id}/posts/{post_id}/hide` | `{"reason": "names_a_person" \| "too_specific_location" \| "abusive" \| "off_topic" \| "other", "note"?}` | `{"post": Post}` |
| `unhide_post` | `POST /api/v1/discussions/{id}/posts/{post_id}/unhide` | `{}` | `{"post": Post}` |
| `remove_member` | `POST /api/v1/discussions/{id}/members/{observer_code}/remove` | `{"reason": "…"}` | `{"membership": "removed"}` |
| `close` | `POST /api/v1/discussions/{id}/close` | `{}` | `{"discussion": Discussion}` |
| `flags` | `GET /api/v1/moderation/flags?status=open` | none | `{"items": [{post, discussion_id, reasons, name_check, flag_count}], "next_cursor"}` |

- `closes_at` defaults to 48 h after the organisation's `election_day` (ADM-04); a worker closes discussions then and the retention purge deletes them.
- `not_found` in `invite` lists codes that are unknown, revoked or in another organisation, without saying which.
- Every operation writes a `ModerationAction` audit event. Moderators never get report access through this role.
- **Errors:** `409 discussion_closed`, `422` (`"ward_code": {"code": "unknown_area"}`), `404`, common errors.

---

### ASK

#### ASK-01 · Ask ElectraGuard (retrieval only, cited, abstains)

**Pending merge** (PR #16).

- **Status:** NEW. **Screens:** O-19, P-04.
- **Auth:** anyone; CSRF (POST). No idempotency (no side effects).
- `POST /api/v1/ask` with `{"question": "…" (3–500), "language": "yo", "audience": "observer" | "public"}`. The server uses `observer` only for an observer session (observer guide included); otherwise `public`.
- **200, answered:**
  ```json
  {
    "status": "answered",
    "language": "yo",
    "passages": [
      { "text": "…approved passage text in Yorùbá…", "source": { "document_id": "observer-guide", "title": "Observer guide", "section": "3. If the polling unit opens late", "version": "2026-11-25", "language": "yo", "url": "/guide/opening-late#if-late" }, "score": 0.82 }
    ],
    "fallback_language_used": false
  }
  ```
- **200, abstained:**
  ```json
  { "status": "abstained", "language": "yo", "passages": [], "fallback_language_used": false }
  ```
  The screen shows its own message key `ask.abstain` ("I don't have an approved answer to that. Contact your coordinator.").
- Passages are quoted exactly from approved documents; nothing is generated. If an approved passage exists only in English, it is returned in English with `fallback_language_used: true` and the screen says so. Below the retrieval threshold the answer is `abstained`, never a weaker answer.
- **Privacy:** questions are not stored; only counts by language and status are kept for the evaluation.
- **Errors:** `422`, `429`, `403 csrf_failed`. **Limits:** 20/min per session or IP.

---

### RS

#### RS-01 · Read a result-sheet photo (OCR → fields + confidence)

**Pending merge** (PR #16).

- **Status:** NEW. **Screens:** O-16.
- **Auth:** observer; CSRF; `Idempotency-Key` required.
- `POST /api/v1/result-sheets/ocr`, `multipart/form-data` with `file` (photo rules from MED, ≤ 2 MiB) and `sha256` (hex).
- **201 / 200 on replay:**
  ```json
  {
    "ocr_id": "3b7d…",
    "expires_at": "2026-12-06T18:00:00+01:00",
    "fields": {
      "registered": { "value": 742, "confidence": 0.94 },
      "accredited": { "value": 391, "confidence": 0.88 },
      "votes": { "A": { "value": 120, "confidence": 0.91 }, "B": { "value": 98, "confidence": 0.62 }, "C": { "value": 77, "confidence": 0.90 }, "D": { "value": 51, "confidence": 0.86 }, "E": { "value": null, "confidence": 0.0 } },
      "rejected": { "value": 12, "confidence": 0.80 }
    },
    "model_version": "ocr-paddle-2026.11",
    "notice_key": "result_sheet.not_a_result"
  }
  ```
  `value: null` means it could not read that field; the screen asks the observer to type it. Confidence below 0.75 is shown as "Check this number".
- The photo is cleaned (MED rules) and held for 24 h; REP-01 with `result_sheet.ocr_id` attaches it to the report as evidence. Unused OCR photos are deleted at `expires_at`.
- **Offline:** O-16 lets the observer type the numbers (or use an on-phone reader); the report is sent with `entry_method: "manual"` or `"offline_ocr"` and the photo goes through MED-01..03. The server then runs OCR on the attached photo and shows any disagreement to the reviewer.
- **Errors:** `415`, `413`, `422 media_unreadable` (`"We could not read this photo. Try again in better light, or type the numbers."`), `422 hash_mismatch`, common errors. **Limits:** 20 per hour per observer.
- **Privacy:** OCR output is never returned to anyone but the uploading observer and the assigned reviewer; never public.

---

### Q and CASE

#### Q-01 · Reviewer queue

- **Status:** CHANGE (from `GET /api/review`; adds urgency order, reasons, filters, paging).
- **Screens:** S-02 (queue), S-03 (side list on tablet).
- **Auth:** reviewer (only cases assigned to them).
- `GET /api/v1/review/queue?status=&category=&urgency=&state_code=&lga_code=&channel=&kind=&has_evidence=&cursor=&limit=`
  - multi-value filters repeat the parameter (`status=received&status=question`).
  - Default `status`: `received`, `in_review`, `question`.
- **Sort:** urgency (`urgent` > `high` > `normal` > `low`, using the reviewer's correction when present), then `danger_now` first, then `received_at` oldest first.
- **200:**
  ```json
  {
    "items": [
      {
        "id": "8d0c1a52-…", "receipt_code": "EG-4H7Q-92KD", "kind": "incident", "channel": "app", "status": "received",
        "urgency": { "level": "urgent", "source": "suggested", "reasons": ["danger_reported", "intimidation", "seen_firsthand", "video"] },
        "category": { "value": "intimidation_violence", "source": "observer" },
        "area": { "state_code": "KN", "state_name": "Kano", "lga_code": "KN-04", "lga_name": "Dala", "ward_code": "KN-04-07", "ward_name": "Kantudu", "polling_unit_code": "KN-04-07-012", "polling_unit_name": "Kantudu Primary School I" },
        "occurred_at": "2026-12-05T09:05:00+01:00", "received_at": "2026-12-05T09:14:31+01:00",
        "media_counts": { "photo": 0, "video": 1, "audio": 0 },
        "has_open_question": false, "unread_messages": 0,
        "flags": { "possible_duplicate": true, "result_sheet_flags": 0, "possible_names": false },
        "last_activity_at": "2026-12-05T09:16:02+01:00"
      }
    ],
    "next_cursor": "eyJ1IjozLCJyIjoiMjAyNi0xMi0wNVQwOToxNDozMSJ9",
    "counts": { "received": 4, "in_review": 2, "question": 1 }
  }
  ```
  `reasons` are stable codes the UI translates (`danger_reported`, `intimidation`, `vote_buying`, `seen_firsthand`, `told_by_someone`, `video`, `photo`, `audio`, `cluster`, `result_sheet_flag`, `citizen_report`, `sms_report`). `category.source`: `observer` · `suggested` · `corrected`.
- Saved filters and the restored scroll position are kept on the client (local storage); no API.
- **Errors:** `422` (bad filter), common errors.

#### CASE-01 · Case detail

- **Status:** CHANGE (from `GET /api/review/<reference>` and `GET /api/review/<reference>/triage`, merged).
- **Screens:** S-03.
- **Auth:** the assigned reviewer.
- `GET /api/v1/review/cases/{id}`
- **200** (sections in page order):
  ```json
  {
    "id": "8d0c1a52-…", "receipt_code": "EG-4H7Q-92KD", "kind": "incident", "channel": "app", "status": "in_review", "outcome": null, "version": 3,
    "reporter": { "type": "observer", "label": "OBS-7K2P9D", "accredited": true },
    "language": "ha",
    "original": { "description": "Wasu matasa suna tsoratar da masu jefa kuri'a a layi.", "redacted_description": null, "redactions": [] },
    "translation": { "status": "ready", "text": "Some young men are intimidating voters in the queue.", "from": "ha", "to": "en", "method": "nllb-200-distilled-600M", "label_key": "case.machine_translation" },
    "category_observer": "intimidation_violence", "access_barrier_details": [], "danger_now": false, "firsthand": true,
    "area": { "...": "full area" },
    "times": { "occurred_at": "2026-12-05T09:05:00+01:00", "device_saved_at": "2026-12-05T09:12:10+01:00", "received_at": "2026-12-05T09:14:31+01:00", "clock_skew_seconds": 0 },
    "checklist": null,
    "result_sheet": null,
    "media": [
      { "id": "c9f1…", "kind": "video", "status": "ready", "size_bytes": 8123456, "duration_ms": 41000, "sha256": "9f2c…", "original_sha256": "4be1…", "integrity_verified": true, "exif_removed": true, "blurred": true, "transcript": null, "created_at": "2026-12-05T09:16:02+01:00" }
    ],
    "pending_uploads": [ { "id": "0a7e…", "kind": "audio", "size_bytes": 812345, "received_bytes": 262144 } ],
    "suggestions": {
      "status": "ready",
      "model_versions": { "category": "tfidf-lr-2026.12", "urgency": "rules+gbm-2026.12", "duplicates": "e5-small-2026.12" },
      "category": { "value": "intimidation_violence", "confidence": "high", "reasons": ["matches observer choice"], "decision": null, "corrected_value": null },
      "urgency": { "value": "urgent", "confidence": "medium", "reasons": ["intimidation", "seen_firsthand", "video"], "decision": "accepted", "corrected_value": null },
      "abstained": false
    },
    "duplicates": [
      { "report_id": "1c4b…", "receipt_code": "EG-8MZ2-K4QT", "score": 0.91, "decision": "pending", "accessible": true, "summary": { "category": "intimidation_violence", "ward_name": "Kantudu", "occurred_at": "2026-12-05T09:01:00+01:00", "channel": "citizen", "description": "Boys are scaring people at the queue" } },
      { "report_id": "6e0a…", "receipt_code": null, "score": 0.84, "decision": "pending", "accessible": false, "summary": { "category": "intimidation_violence", "ward_name": "Kantudu", "occurred_at": "2026-12-05T09:07:00+01:00", "channel": "app", "description": null } }
    ],
    "result_sheet_flags": [],
    "related_claims": [ { "claim_id": "d2a0…", "excerpt": "Thugs have taken over all units in Dala", "status": "matched" } ],
    "name_check": { "possible_names": false },
    "open_question": null,
    "allowed_actions": ["ask", "close", "redact"],
    "history": { "chain_intact": true, "events": [ { "id": "e1…", "version": 3, "action": "accept_suggestion", "actor_label": "A. Bello", "created_at": "2026-12-05T09:30:00+01:00", "change": { "suggestion": "urgency", "value": "urgent" } } ] }
  }
  ```
- `result_sheet` (result-sheet kind): `{"values": {...}, "confirmed_fields": [...], "entry_method": "ocr_confirmed", "ocr": {"fields": {... per-field value and confidence}, "disagreements": ["votes.B"]}}`; `result_sheet_flags`: `[{"type": "votes_plus_rejected_differs", "explanation_key": "rs.flag.sum_differs", "values": {"accredited": 391, "sum": 358}, "benign_causes_keys": ["rs.benign.copy_error", "rs.benign.unread_digit"]}]`. Types: `accredited_exceeds_registered`, `votes_plus_rejected_differs`, `round_numbers`, `identical_to_other_unit`, `possible_digit_swap`. Never any total across units.
- Duplicates the reviewer is not assigned to show metadata only (`accessible: false`, no text, no receipt code); see open question 4.
- `chain_intact` is this report's events verified against the organisation chain (AUD-01).
- **Errors:** `404` (not assigned, including just reassigned away), common errors.

#### CASE-02 · Case actions (start, formal question, close)

- **Status:** CHANGE (from `POST /api/review/<reference>/actions`; renames `request_clarification` to `ask`, allows close from `question`, adds `expected_media_ids`).
- **Screens:** S-03. **Auth:** the assigned reviewer; CSRF; `Idempotency-Key` required.
- `POST /api/v1/review/cases/{id}/actions`

| Field | Type | Rules |
|---|---|---|
| `action` | `"start" \| "ask" \| "close"` | Required |
| `version` | integer | Required (1.6) |
| `question` | string | Required with `ask`, 1–2000; not allowed otherwise |
| `outcome` | Outcome | Required with `close` |
| `rationale` | string | Required with `close`, 1–2000. Internal; never shown to the reporter |
| `expected_media_ids` | uuid[] | Required with `close` (may be empty) |

- **200:**
  ```json
  { "id": "8d0c1a52-…", "status": "closed", "outcome": "corroborated", "version": 6, "closure": { "media_ids": ["c9f1…"], "pending_uploads": [ { "id": "0a7e…", "kind": "audio", "size_bytes": 812345 } ] } }
  ```
  (`closure` only for `close`; `question_id` is returned for `ask`.)
- **Errors:**
  - `409 stale_version`.
  - `409`:
    ```json
    { "error": { "code": "invalid_transition", "message": "This action is not available while the report is received. Start the review first." } }
    ```
  - `409`:
    ```json
    { "error": { "code": "closure_evidence_changed", "message": "New evidence was saved since you opened the case. Review it before closing." } }
    ```
  - `422` (`"rationale": {"code": "required"}`), `404`, common errors.
- **Retry:** same key → stored result even if the version moved since.

#### CASE-03 · Accept or correct a suggestion (category, urgency)

Category and rule-based urgency suggestions are available. The additional triage models are **pending merge** (PR #14).

- **Status:** CHANGE (from `POST /api/review/<reference>/triage/category`, correct only; adds accept and urgency).
- **Screens:** S-03 (SuggestionCard). **Auth:** the assigned reviewer; CSRF; `Idempotency-Key`.
- `POST /api/v1/review/cases/{id}/suggestions/{type}` where `type` is `category` or `urgency`.
- Body: `{"decision": "accept" | "correct", "value": "<category or urgency>" (required with correct, must differ from the suggestion), "version": 3}`.
- **200:** `{"version": 4, "suggestion": {"value": "intimidation_violence", "decision": "corrected", "corrected_value": "vote_buying"}}`
- Works when suggestions are `pending` or `failed` too: `correct` sets the value directly (manual review can proceed immediately). `accept` with no ready suggestion is `409 invalid_transition`.
- Every decision is recorded for the evaluation (A1, A2).
- **Errors:** `409 stale_version`, `409 invalid_transition`, `422` (`"value": {"code": "invalid_choice"}`), `404`, common errors.

#### CASE-04 · Duplicate decision

**Contract only.** The versioned route is absent on the documented base.

- **Status:** CHANGE (from `POST /api/review/<reference>/triage/matches/<candidate>`, behind the grouping flag, confirmed/dismissed).
- **Screens:** S-03 (side-by-side). **Auth:** the assigned reviewer of `{id}`; CSRF; `Idempotency-Key`.
- `POST /api/v1/review/cases/{id}/duplicates/{other_id}` with `{"decision": "link" | "keep_separate", "version": 3}`.
- **200:** `{"version": 4, "duplicate": {"report_id": "1c4b…", "decision": "linked"}}`
- Locks both reports in id order (existing pattern). A link never merges content or moves access; it groups the reports for OPS counts and shows the link on both cases. Either reviewer may later `keep_separate`, which unlinks (audited on both).
- **Errors:** `409 stale_version`, `409 invalid_transition` (`"This pair already has a decision."`), `404` (other report in another organisation or not a suggested pair), common errors.

#### CASE-05 · Redact text

- **Status:** NEW. **Screens:** S-03. **Auth:** the assigned reviewer; CSRF; `Idempotency-Key`.
- `POST /api/v1/review/cases/{id}/redaction` with `{"spans": [{"start": 12, "end": 24}], "version": 3}`. Offsets are Unicode code points in the **original** description; spans must not overlap; an empty list removes all redactions.
- The server builds `redacted_description` by replacing each span with `[name removed]` (the reviewer cannot rewrite the text). The translation is regenerated from the redacted text. Every later output (duplicate summaries, rumour matches, exports, any future public use) uses the redacted text.
- **200:** `{"version": 4, "redacted_description": "Some men led by [name removed] are …", "redactions": [{"start": 12, "end": 24}]}`
- **Errors:** `409 stale_version`, `422` (`"spans.0.end": {"code": "max_value", "limit": 57}`), `404`, common errors.
- The audit event stores the spans and a digest, not the removed text.

---

### ASG

#### ASG-01 · Assignment list

- **Status:** CHANGE (from `GET /api/assignments`; adds summaries, workload, suggestion, filters, paging).
- **Screens:** S-04. **Auth:** coordinator.
- `GET /api/v1/assignments?assigned=any|none|<reviewer_id>&status=&urgency=&state_code=&lga_code=&cursor=&limit=`
- **200:**
  ```json
  {
    "items": [
      {
        "id": "8d0c1a52-…", "receipt_code": "EG-4H7Q-92KD", "kind": "incident", "channel": "app", "status": "received", "version": 0,
        "urgency": { "level": "urgent", "source": "suggested", "reasons": ["danger_reported", "intimidation"] },
        "category": { "value": "intimidation_violence", "source": "observer" },
        "area": { "state_code": "KN", "state_name": "Kano", "lga_code": "KN-04", "lga_name": "Dala", "ward_code": "KN-04-07", "ward_name": "Kantudu", "polling_unit_code": null, "polling_unit_name": null },
        "received_at": "2026-12-05T09:14:31+01:00",
        "assigned_reviewer": null,
        "suggested_reviewer": { "id": "41", "display_name": "A. Bello", "reason": "fewest_open_cases_in_area" }
      }
    ],
    "next_cursor": null,
    "reviewers": [ { "id": "41", "display_name": "A. Bello", "open_cases": 3, "urgent_open": 1, "areas": ["KN-04", "KN-05"], "active_now": true } ]
  }
  ```
- The coordinator sees summaries (category, urgency, area to ward, times) but **not** text, media or messages. Polling-unit fields are null here.
- Suggested reviewer: the active reviewer with the fewest open cases, preferring those who worked the same LGA today; `reason` is `fewest_open_cases_in_area` · `fewest_open_cases` · `same_area`.

#### ASG-02 · Assign or reassign (bulk)

- **Status:** CHANGE (from `POST /api/assignments/<reference>`, one at a time; keeps version checks and access removal).
- **Screens:** S-04. **Auth:** coordinator; CSRF; `Idempotency-Key`.
- `POST /api/v1/assignments` with `{"items": [{"report_id": "8d0c…", "reviewer_id": "41", "version": 0}]}` (1–100 items). Use `"reviewer_id": "suggested"` to take the suggestion.
- Each item is its own transaction. **200** with a result per item:
  ```json
  {
    "results": [
      { "report_id": "8d0c…", "ok": true, "version": 1, "assigned_reviewer": { "id": "41", "display_name": "A. Bello" } },
      { "report_id": "1c4b…", "ok": false, "error": { "code": "stale_version", "message": "This case has changed. Refresh before trying again." } }
    ]
  }
  ```
- Per-item error codes: `stale_version`, `already_assigned`, `invalid_transition` (closed or withdrawn), `not_found`, `validation_failed` (`reviewer_id` not an active reviewer of this organisation).
- The previous reviewer loses access to the case, its media and messages on their next request.
- Body-level errors: `422` (no items, more than 100), common errors.

---

### OPS

All OPS contracts: **coordinator** only; aggregates and links, never report text; no polling-unit pins on maps; times in WAT.

#### OPS-01 · Overview aggregates

- **Status:** CHANGE (from `GET /api/dashboard`, administrator; moves to coordinator, adds LGA and urgency).
- **Screens:** S-05.
- `GET /api/v1/ops/overview?from=YYYY-MM-DD&to=YYYY-MM-DD&kind=incident|checklist|result_sheet` (inclusive observed dates; default today).
- **200:**
  ```json
  {
    "range": { "from": "2026-12-05", "to": "2026-12-05" },
    "totals": { "reports": 214, "incidents_after_links": 187, "urgent_open": 6, "open_questions": 11, "result_sheet_flags_open": 3, "withdrawn": 2 },
    "by_status": [ { "status": "received", "count": 40 }, { "status": "in_review", "count": 52 }, { "status": "question", "count": 11 }, { "status": "closed", "count": 111 } ],
    "by_outcome": [ { "outcome": "corroborated", "count": 64 }, { "outcome": "insufficient_evidence", "count": 39 }, { "outcome": "out_of_scope", "count": 8 } ],
    "by_category": [ { "category": "intimidation_violence", "count": 31 } ],
    "by_channel": [ { "channel": "app", "count": 170 }, { "channel": "citizen", "count": 30 }, { "channel": "sms", "count": 9 }, { "channel": "ussd", "count": 5 } ],
    "by_lga": [ { "state_code": "KN", "lga_code": "KN-04", "lga_name": "Dala", "count": 22, "urgent": 2 } ],
    "generated_at": "2026-12-05T11:00:03+01:00"
  }
  ```
- Category uses correction, then suggestion, then the observer's choice (existing rule, with the observer's choice added). Withdrawn reports are counted only in `totals.withdrawn`.
- **Errors:** `422` (`from` after `to`, range over 31 days), common errors.

#### OPS-02 · Cluster warnings (and mark reviewed, thresholds)

**Pending merge** (PR #15).

- **Status:** NEW. **Screens:** S-05.

| Operation | Method and path | Body |
|---|---|---|
| `list` | `GET /api/v1/ops/clusters?status=open\|reviewed&cursor=` | none |
| `review` | `POST /api/v1/ops/clusters/{id}/review` | `{"note": "…" (≤ 500)?}` |
| `get_settings` | `GET /api/v1/ops/cluster-settings` | none |
| `update_settings` | `PUT /api/v1/ops/cluster-settings` | `{"window_minutes": 60 (15–360), "min_reports": 5 (3–50), "categories": [...], "version": 2}` |

- **list 200:**
  ```json
  { "items": [ { "id": "k3…", "category": "intimidation_violence", "area": { "state_code": "KN", "state_name": "Kano", "lga_code": "KN-04", "lga_name": "Dala" }, "report_count": 6, "baseline": 0.8, "window_start": "2026-12-05T09:00:00+01:00", "window_end": "2026-12-05T10:00:00+01:00", "report_ids": ["8d0c…", "1c4b…"], "status": "open", "reviewed_by": null, "reviewed_at": null } ], "next_cursor": null }
  ```
  `report_ids` link to CASE-01 only for reviewers assigned to them; for the coordinator they open the ASG-01 row.
- **review 200:** the cluster with `status: "reviewed"`. Repeating is harmless.
- **Errors:** `409 stale_version` (settings), `422`, common errors.

#### OPS-03 · Coverage gaps

**Pending merge** (PR #15).

- **Status:** NEW. **Screens:** S-05.
- `GET /api/v1/ops/coverage?date=YYYY-MM-DD&stage=opening&lga_code=&cursor=`
- Expected units = the organisation's coverage area (ADM-04). Without `lga_code`: one row per LGA. With `lga_code`: one row per unit in it.
- **200:**
  ```json
  {
    "date": "2026-12-05", "stage": "opening", "as_of": "2026-12-05T10:30:00+01:00",
    "rows": [ { "lga_code": "KN-04", "lga_name": "Dala", "expected_units": 38, "units_with_checklist": 21, "units_without": 17, "no_answers": 9 } ],
    "most_no_answers": [ { "polling_unit_code": "KN-04-07-012", "polling_unit_name": "Kantudu Primary School I", "no_count": 4, "questions": ["opened_on_time", "materials_all_present"] } ],
    "next_cursor": null
  }
  ```
- Unit names appear here because this is an internal planning screen; it never shows who reported.
- **Errors:** `422` (unknown stage or area), common errors.

#### OPS-04 · Late-materials risk

**Pending merge** (PR #14).

- **Status:** NEW. **Screens:** S-05 (before election day).
- `GET /api/v1/ops/late-materials-risk?state_code=&limit=50`
- **200:**
  ```json
  {
    "model_version": "gbm-logistics-2026.12", "generated_at": "2026-12-03T18:00:00+01:00", "data_source": "synthetic",
    "metrics": { "mae_transit_hours": 1.9, "evaluated_on": "held-out 20%" },
    "rows": [ { "rank": 1, "lga_code": "KN-11", "lga_name": "Gwale", "ward_code": "KN-11-03", "ward_name": "Dandago", "polling_unit_code": "KN-11-03-004", "predicted_transit_hours": 9.4, "risk": "high", "factors": ["distance_from_hub", "river_crossing", "late_last_election"] } ]
  }
  ```
- `risk`: `high` · `medium` · `low`. `factors` are codes the UI translates. When no model run exists: `200` with `rows: []` and `generated_at: null`.

---

### RUM

Rumour desk: **coordinator** only. Claims are not reports; they hold no reporter identity.

#### RUM-01 · Claims list and create (text or image)

**Pending merge** (PR #15).

- **Status:** NEW. **Screens:** S-06.

| Operation | Method and path |
|---|---|
| `list` | `GET /api/v1/rumours/claims?status=&harm=&language=&cursor=` |
| `create` | `POST /api/v1/rumours/claims` (JSON for text; `multipart/form-data` when an image is attached, with the same fields plus `image`) |
| `get` | `GET /api/v1/rumours/claims/{id}` |

Create fields: `text` (0–4000; required if no image), `image` (JPEG/PNG/WebP ≤ 5 MiB), `seen_on` (`whatsapp` · `facebook` · `x` · `tiktok` · `sms` · `radio` · `in_person` · `other`), `language`, `seen_at` (datetime, optional), `area` (`{"state_code", "lga_code"?}`, optional). CSRF; `Idempotency-Key`.

- **create 201 / get 200:**
  ```json
  {
    "id": "d2a0…", "status": "new", "version": 0,
    "text": "Thugs have taken over all units in Dala", "image": null, "seen_on": "whatsapp", "language": "en",
    "area": { "state_code": "KN", "state_name": "Kano", "lga_code": "KN-04", "lga_name": "Dala" },
    "harm": { "level": "high", "score": 0.81, "reasons": ["violence_claim", "location_specific", "election_day"] },
    "check_worthiness": { "level": "high", "score": 0.77 },
    "image_check": null,
    "response": null,
    "created_by": "C. Okafor", "created_at": "2026-12-05T10:40:00+01:00"
  }
  ```
  With an image, `image` is `{"media_id": "…", "width": 1080, "height": 1350}` and `image_check` is the guide (A9), never a verdict:
  ```json
  { "metadata": { "had_metadata": true, "camera_make": "redacted", "created_at": "2025-03-14T16:02:00+01:00", "software": "Adobe Photoshop" }, "prompts": ["reverse_search", "check_date_vs_claim", "look_for_edits", "check_source_account"], "error_level_hint": "uneven_compression" }
  ```
  The image is stored with its metadata stripped; the metadata summary is kept for the guide.
- `status`: `new` · `matched` · `response_draft` · `response_approved` · `dismissed`.
- **Errors:** `415`, `413`, `422`, common errors. **Limits:** 120 claims per hour per organisation.

#### RUM-02 · Claim matches

**Pending merge** (PR #15).

- **Status:** NEW. **Screens:** S-06.
- `GET /api/v1/rumours/claims/{id}/matches`
- **200:**
  ```json
  {
    "observations": [ { "report_id": "8d0c…", "category": "intimidation_violence", "area": { "lga_code": "KN-04", "lga_name": "Dala", "ward_code": "KN-04-07", "ward_name": "Kantudu" }, "occurred_at": "2026-12-05T09:05:00+01:00", "status": "closed", "outcome": "corroborated", "similarity": 0.74, "excerpt": "Some young men are intimidating voters in the queue." } ],
    "past_claims": [ { "claim_id": "a91…", "text": "Dala units shut down by thugs", "similarity": 0.88, "response": { "text": "Observers in Dala report…", "approved_at": "2026-12-05T09:50:00+01:00" } } ],
    "model_version": "e5-small-2026.12"
  }
  ```
- Only **closed** reports with an outcome are matched, and `excerpt` is the English translation of the **redacted** text, at most 280 characters. No receipt codes, observer codes or media.

#### RUM-03 · Response draft and second-person approval

**Pending merge** (PR #15).

- **Status:** NEW. **Screens:** S-06. **Auth:** coordinator; CSRF; `Idempotency-Key` on approve and reject.

| Operation | Method and path | Body |
|---|---|---|
| `save_draft` | `PUT /api/v1/rumours/claims/{id}/response` | `{"text": "…" (1–1500), "language": "en", "version": 2}` |
| `approve` | `POST /api/v1/rumours/claims/{id}/response/approve` | `{"version": 3}` |
| `reject` | `POST /api/v1/rumours/claims/{id}/response/reject` | `{"note": "…" (1–500), "version": 3}` |
| `dismiss` | `POST /api/v1/rumours/claims/{id}/dismiss` | `{"note": "…", "version": 3}` |

- **200:** the claim with `response: {"text", "language", "drafted_by", "drafted_at", "approved_by", "approved_at", "rejection_note"}` and the new `version`. Saving a draft after approval returns it to `response_draft` and clears the approval.
- **Errors:**
  - `403`:
    ```json
    { "error": { "code": "same_person_approval", "message": "Another coordinator must approve a response you drafted." } }
    ```
  - `409 stale_version`, `409 invalid_transition` (approve without a draft), `422`, common errors.
- Approval is checked against the **last** person who saved the draft.

---

### PUB

#### PUB-01 · Create and approve a public snapshot

**Pending merge** (PR #15).

- **Status:** NEW. **Screens:** S-07. **Auth:** coordinator; CSRF; `Idempotency-Key`.

| Operation | Method and path | Body |
|---|---|---|
| `list` | `GET /api/v1/publish/snapshots?cursor=` | none |
| `create` | `POST /api/v1/publish/snapshots` | `{"cutoff": "2026-12-05T10:00:00+01:00"?}` (default: now − delay) |
| `get` | `GET /api/v1/publish/snapshots/{id}` | none |
| `approve` | `POST /api/v1/publish/snapshots/{id}/approve` | `{"version": 0}` |
| `discard` | `POST /api/v1/publish/snapshots/{id}/discard` | `{"version": 0}` |
| `schedule` | `PUT /api/v1/publish/schedule` | `{"hourly": true, "version": 1}` |

- **Rules applied when the snapshot is built** (the preview is exactly what will be public):
  1. Only `incident` reports with `status: closed` (reviewed), never withdrawn, checklist or result-sheet reports.
  2. Only reports observed before `cutoff`, and `cutoff` ≤ now − `public_delay_minutes` (≥ 60, ADM-04).
  3. Cells: state × category counts; per-state totals; outcome counts; hourly timeline by observed time. No LGA, ward or unit. No free text, media, codes.
  4. **Primary suppression:** any count below 5 (including 0) is published as `{"count": null, "suppressed": true}`.
  5. **Secondary suppression:** if a row or column has exactly one suppressed cell, the next-smallest cell in it is suppressed too, so totals cannot reveal it. Totals are suppressed when below 5.
  6. Outcome shares are percentages of the published total, each suppressed when its count is below 5.
  7. The organisation's audit-chain head (hash, event count, time) is attached.
- **create 201 / get 200:**
  ```json
  {
    "id": "s7…", "status": "draft", "version": 0, "cutoff": "2026-12-05T10:00:00+01:00", "created_by": "C. Okafor", "approved_by": null, "published_at": null,
    "preview": { "...": "exactly the PublicSnapshot object of PUB-02" },
    "excluded": { "not_closed": 103, "withdrawn": 2, "after_cutoff": 14, "other_kinds": 37 }
  }
  ```
- `status`: `draft` · `published` · `discarded` · `superseded`. Approving publishes it at once and supersedes the previous one. With `hourly: true` the server builds and publishes a snapshot each hour on the same rules; the coordinator who turned it on is recorded as the standing approver in the audit log, and it turns itself off if any build fails a rule check.
- **Errors:** `422` (`"cutoff": {"code": "too_recent", "message": "The cutoff must be at least 60 minutes ago."}`), `409 stale_version`, `409 invalid_transition` (approve a discarded snapshot), common errors.

#### PUB-02 · Public results

**Pending merge** (PR #15).

- **Status:** NEW. **Screens:** P-03 (results), P-02 (home summary).
- **Auth:** anyone. `Cache-Control: public, max-age=300`, `ETag`.
- `GET /api/v1/public/results`
- **200:**
  ```json
  {
    "generated_at": "2026-12-05T11:05:00+01:00",
    "notice_key": "results.notice",
    "snapshots": [
      {
        "organisation": { "id": "5a3c…", "name": "Cairn Assure Observation Group" },
        "snapshot_id": "s7…", "published_at": "2026-12-05T11:00:00+01:00", "cutoff": "2026-12-05T10:00:00+01:00", "delay_minutes": 60,
        "total": { "count": 111, "suppressed": false },
        "by_state": [
          { "state_code": "KN", "state_name": "Kano", "total": { "count": 47, "suppressed": false },
            "by_category": { "intimidation_violence": { "count": 12, "suppressed": false }, "vote_buying": { "count": null, "suppressed": true } } }
        ],
        "outcomes": [ { "outcome": "corroborated", "count": 64, "share_percent": 57.7, "suppressed": false }, { "outcome": "out_of_scope", "count": null, "share_percent": null, "suppressed": true } ],
        "timeline": [ { "hour_start": "2026-12-05T08:00:00+01:00", "count": { "count": 18, "suppressed": false } } ],
        "audit_chain_head": { "hash": "b5d1…", "event_count": 18422, "at": "2026-12-05T11:00:00+01:00" }
      }
    ],
    "combined": null
  }
  ```
- `combined` is present only when two or more organisations publish. A combined cell is the sum **only if every contributing organisation's cell is unsuppressed**; otherwise it is suppressed. So no subtraction reveals a suppressed cell.
- The screen reads "fewer than 5" for every suppressed cell, and the footer from `notice_key`: "Reviewed observations only. Not official results. Independent of INEC."
- **304** with `If-None-Match`. **200 with `snapshots: []`** before anything is published (the screen's honest empty state).
- **Never included:** unit or ward data, free text, media, receipt or observer codes, result-sheet data, checklist answers, claim texts.

---

### ADM

All ADM contracts: **org_admin** only (exclusive role: an org_admin cannot also be reviewer or coordinator, so the person who manages accounts does not see cases). CSRF on writes; every write audited.

#### ADM-01 · Observer code batches (create, print data)

**Pending merge** (PR #15).

- **Status:** NEW. **Screens:** S-09.

| Operation | Method and path | Body |
|---|---|---|
| `list` | `GET /api/v1/admin/code-batches?cursor=` | none |
| `create` | `POST /api/v1/admin/code-batches` | `{"label": "Kano training 30 Nov" (1–80), "count": 50 (1–500)}` |
| `print_data` | `POST /api/v1/admin/code-batches/{id}/print-data` | `{"confirm_reset_setup_pins": true}` |
| `codes` | `GET /api/v1/admin/codes?batch_id=&status=&q=&cursor=` | none |

- **create 201 / 200 on replay** (setup PINs appear only in this response and in `print_data`; `Cache-Control: no-store`):
  ```json
  {
    "batch": { "id": "b1…", "label": "Kano training 30 Nov", "count": 50, "created_at": "2026-11-28T14:00:00+01:00", "created_by": "F. Musa", "printed_at": null, "active": 0, "unclaimed": 50, "revoked": 0 },
    "cards": [ { "observer_code": "OBS-7K2P9D", "setup_pin": "40918273", "setup_expires_at": "2026-12-12T23:59:00+01:00" } ]
  }
  ```
  A replay returns the same cards (the plaintext is held encrypted for 10 minutes only for replay, then deleted).
- `print_data` issues **new** setup PINs for every still-unclaimed code in the batch (old ones stop working), returns `cards`, and sets `printed_at`. Activated codes are not included.
- **codes 200:** `{"items": [{"observer_code": "OBS-7K2P9D", "batch_id": "b1…", "status": "unclaimed" | "active" | "locked" | "revoked", "activated_on": "2026-11-30", "last_active_on": "2026-12-05", "replaced_by": null}], "next_cursor": null}`. Dates only. No report counts or content.
- **Errors:** `422` (count out of range), `409 confirmation_required` (print_data without confirm), common errors. **Limits:** 2,000 codes per day per organisation.

#### ADM-02 · Revoke, reissue, reset PIN

**Pending merge** (PR #15).

- **Status:** NEW. **Screens:** S-09. `Idempotency-Key` on all.

| Operation | Method and path | Body | 200 |
|---|---|---|---|
| `revoke` | `POST /api/v1/admin/codes/{observer_code}/revoke` | `{"reason": "lost_phone" \| "left_programme" \| "suspected_misuse" \| "other"}` | `{"observer_code", "status": "revoked", "sessions_ended": 2}` |
| `reissue` | `POST /api/v1/admin/codes/{observer_code}/reissue` | `{"reason": …}` | `{"revoked": "OBS-7K2P9D", "card": {"observer_code": "OBS-Q3M8TA", "setup_pin": "…", "setup_expires_at": "…"}}` |
| `reset_pin` | `POST /api/v1/admin/codes/{observer_code}/reset-pin` | `{}` | `{"card": {...same code, new setup PIN}}` (also unlocks a locked code; ends its sessions) |

- Revoking ends every session of the code at once. Reports stay with the old code; the new code does not see them (plan 2.4).
- **Errors:** `409 invalid_transition` (revoke a revoked code; reset a revoked code), `404`, common errors.

#### ADM-03 · Staff accounts (create, roles, 2FA reset, offboard)

**Pending merge** (PR #12).

- **Status:** CHANGE (from the `provision_account` and `offboard_account` commands; adds an API and multi-role).
- **Screens:** S-10.

| Operation | Method and path | Body |
|---|---|---|
| `list` | `GET /api/v1/admin/staff?role=&status=active\|offboarded` | none |
| `create` | `POST /api/v1/admin/staff` | `{"email", "display_name" (2–60), "roles": ["reviewer", "moderator"]}` |
| `update` | `PATCH /api/v1/admin/staff/{id}` | `{"display_name"?, "roles"?, "version"}` |
| `reset_2fa` | `POST /api/v1/admin/staff/{id}/reset-2fa` | `{"version"}` |
| `offboard` | `POST /api/v1/admin/staff/{id}/offboard` | `{"reason": "access_ended" \| "role_changed" \| "credential_risk", "version"}` |

- Roles: `reviewer`, `moderator`, `coordinator`, `org_admin`. `org_admin` must be alone. At least one role.
- **create 201:**
  ```json
  { "staff": { "id": "41", "email": "a.bello@example.org", "display_name": "A. Bello", "roles": ["reviewer"], "status": "invited", "totp_enrolled": false, "last_sign_in_on": null, "version": 0 }, "invite": { "url": "/s/sign-in?invite=inv_…", "expires_at": "2026-12-01T14:00:00+01:00" } }
  ```
  The invite link is shown once; the admin hands it over through the organisation's own channel. (Email delivery is optional, open question 7.)
- `reset_2fa`: removes the TOTP secret, ends all sessions; the next sign-in requires enrolment.
- `offboard`: deactivates, ends all sessions, **unassigns open cases** (they return to the unassigned list and the coordinators get a security-monitor notice `staff_offboarded_with_cases`), keeps all audit history (existing `AccountOffboarding` record).
- **Errors:** `409 last_admin`, `409 stale_version`, `422` (`"roles": {"code": "invalid", "message": "Organisation admin cannot be combined with other roles."}`, `"email": {"code": "duplicate"}`), `403 forbidden` (offboarding yourself), common errors.

#### ADM-04 · Organisation settings (intake pause, retention and more)

**Pending merge** (PR #15).

- **Status:** CHANGE (intake pause moves from the deployment variable `OBSERVATION_INTAKE_ENABLED` to a per-organisation setting; the variable stays as a deployment-wide kill switch).
- **Screens:** S-11; the effect shows on O-04 and the citizen flow via AUTH-07.
- `GET /api/v1/admin/settings` and `PATCH /api/v1/admin/settings`.
- **200:**
  ```json
  {
    "version": 7,
    "intake_paused": false,
    "retention_days": 180,
    "election_day": "2026-12-05",
    "public_delay_minutes": 60,
    "party_labels": ["A", "B", "C", "D", "E"],
    "coverage_area": { "state_codes": ["KN"], "lga_codes": [] },
    "simulator_enabled": true,
    "updated_by": "F. Musa", "updated_at": "2026-11-28T14:10:00+01:00"
  }
  ```
- PATCH body: any subset plus `version`, and `confirm: true` when shortening `retention_days`. Limits: `retention_days` 30–730; `public_delay_minutes` 60–1440; `party_labels` 2–12 labels of 1–3 upper-case letters (changing them after any result sheet exists is refused).
- **Errors:**
  - `409`, with the number of records the shorter retention would delete:
    ```json
    { "error": { "code": "confirmation_required", "message": "Shortening retention to 30 days will permanently delete 1,204 records at the next purge. Send again with confirm to proceed." } }
    ```
  - `409 stale_version`, `422`, common errors.
- Pausing intake affects new creates only (REP-01, REP-05, SMS, USSD); replays of reports already received still succeed, and existing reports stay visible.

---

### SEC and AUD

#### SEC-01 · Security alerts

**Pending merge** (PR #15).

- **Status:** NEW. **Screens:** S-12. **Auth:** coordinator and org_admin.

| Operation | Method and path | Body |
|---|---|---|
| `list` | `GET /api/v1/security/alerts?status=open\|acknowledged\|resolved&severity=&cursor=` | none |
| `update` | `POST /api/v1/security/alerts/{id}` | `{"status": "acknowledged" \| "resolved" \| "false_positive", "note"? (≤ 500), "version"}` |

- **list 200:**
  ```json
  { "items": [ { "id": "al…", "rule": "repeated_failed_pins", "severity": "medium", "status": "open", "version": 0, "subject": { "type": "observer_code", "label": "OBS-7K2P9D" }, "details": { "failures": 12, "window_minutes": 30, "distinct_networks": 3 }, "first_seen_at": "2026-12-05T07:10:00+01:00", "last_seen_at": "2026-12-05T07:38:00+01:00", "detector": "rules" } ], "next_cursor": null }
  ```
- Rules: `repeated_failed_pins`, `repeated_failed_staff_sign_in`, `unusual_download_volume`, `new_network_sign_in`, `intake_burst`, `receipt_enumeration`, `staff_offboarded_with_cases`, `anomaly` (Isolation Forest, A15). `detector`: `rules` · `model`.
- **Never in details:** report text, IP addresses in clear (only a network label such as an ASN name or a hashed /24), phone numbers.
- **Errors:** `409 stale_version`, `422`, common errors.

#### AUD-01 · Audit export and hash-chain verify

**Pending merge** (PR #15).

- **Status:** NEW. **Screens:** S-11 (export), S-12 and S-03 (chain status).
- **Auth:** org_admin (export, verify); coordinator (verify).
- Chain: one per organisation. Each event stores `prev_hash` and `hash = SHA-256(prev_hash ‖ canonical JSON of {id, organisation_id, created_at, actor_ref, action, object_type, object_id, version, content_digest})`. `content_digest` is the SHA-256 of the event's content (notes, questions, rationale, spans). Content can be deleted by withdrawal or retention **without breaking the chain**, and exports can prove integrity without revealing case content.

| Operation | Method and path |
|---|---|
| `export` | `GET /api/v1/audit/export?from=YYYY-MM-DD&to=YYYY-MM-DD&format=jsonl\|csv` (streamed, `Content-Disposition: attachment`) |
| `verify` | `GET /api/v1/audit/verify?from=&to=` |

- **export** rows: `{"id", "created_at", "actor_ref", "actor_label", "action", "object_type", "object_id", "version", "content_digest", "prev_hash", "hash"}`. Content itself is **not** exported (the org_admin does not see cases). Range ≤ 92 days per request.
- **verify 200:**
  ```json
  { "intact": true, "events_checked": 18422, "head": { "hash": "b5d1…", "event_count": 18422, "at": "2026-12-05T11:00:00+01:00" }, "first_broken_event_id": null, "checked_at": "2026-12-05T11:02:00+01:00" }
  ```
- The export itself is an audited event. **Limits:** 10 exports per hour per organisation.

---

### SMS, USSD, SIM

Gateway: Africa's Talking (sandbox for the hackathon). Callbacks are authenticated by a secret path segment (Africa's Talking does not sign callbacks), stripped from access logs, plus an IP allow-list in production. Phone numbers are stored only as `HMAC-SHA256(server_key, E.164 number)` (1.8).

#### SMS-01 · Inbound SMS webhook

**Pending merge** (PR #14).

- **Status:** NEW. **Screens:** none directly (P-07 drives it through SIM-01).
- **Auth:** gateway, `POST /api/v1/channels/sms/inbound/{webhook_secret}`; CSRF exempt.
- Request (form, Africa's Talking format): `from` (`+2348012345678`), `to` (short code), `text`, `date`, `id` (gateway message id), `linkId`, `networkCode`.
- **Response:** `200` empty body, always, within 2 s (replies go out through the gateway's send API from a job). Unknown or malformed commands get a HELP reply, not an HTTP error.
- **Idempotency:** keyed by the gateway `id`; a redelivered message produces nothing new.
- **Commands** (case-insensitive; numbers are the USSD category numbers):

| Command | Example | Reply |
|---|---|---|
| `REPORT <category 0-9> [<unit or ward code>] <description>` | `REPORT 4 KN-04-07-012 Young men scaring voters` | `ElectraGuard: received. Your code: EG-4H7Q-92KD. Text STATUS EG-4H7Q-92KD to check.` |
| `STATUS <receipt code>` | `STATUS EG-4H7Q-92KD` | `EG-4H7Q-92KD: being reviewed.` (REP-06 rules) |
| `REPLY <receipt code> <text>` | `REPLY EG-4H7Q-92KD Outside the gate` | `Thank you. Your answer was sent.` Only from the number that sent the report (HMAC match), only when a question is open |
| `LANG <EN\|PCM\|HA\|YO\|IG>` | `LANG HA` | Confirmation in that language; preference stored against the HMAC for 30 days |
| `HELP` or anything else | | The command list in the stored language |

- Reports: `channel: "sms"`; `firsthand` and `danger_now` are unknown and stored as `null`; `occurred_at` = received time. Reviewers see "SMS reporter". Intake paused → reply `Reporting is paused. Please try later.`
- **Limits:** per number 10 reports and 30 commands per hour; over the limit the number gets one "Too many messages" reply per hour, then silence.
- Outbound replies to a real network need a commercial short code; in the sandbox they go to the Africa's Talking simulator and to SIM-01.

#### USSD-01 · USSD session webhook

**Pending merge** (PR #14).

- **Status:** NEW. **Screens:** none directly (P-07 through SIM-01).
- **Auth:** gateway, `POST /api/v1/channels/ussd/{webhook_secret}`; CSRF exempt.
- Request (form, Africa's Talking format): `sessionId`, `serviceCode`, `phoneNumber`, `text` (all inputs so far joined by `*`), `networkCode`.
- **Response:** `200`, `Content-Type: text/plain`, body begins `CON ` (more input) or `END ` (finished). Each screen ≤ 182 characters, GSM-7 characters only (so "Naija", "Yoruba" without marks on USSD screens). Respond within 3 s.
- **Stateless:** the server rebuilds the position from `text` on every request; nothing is stored until confirmation. Menu (inputs in order):

| Step | Screen (English) | Input |
|---|---|---|
| 1 | `CON ElectraGuard` / `1 English 2 Naija 3 Hausa 4 Yoruba 5 Igbo` | 1–5 |
| 2 | `CON What happened?` / `1 Materials late 2 Equipment failed 3 Queues 4 Violence/threats 5 Access barrier 6 No information 7 False news 8 Vote buying 9 Good practice 0 Not sure` | 0–9 |
| 3 | `CON Is anyone in danger now?` / `1 Yes 2 No` | 1–2 (Yes: the next screen starts `Call 112 if you can.`) |
| 4 | `CON Choose state:` 8 per page, `98 More 0 Back` | number |
| 5 | `CON Choose LGA:` 8 per page, `98 More 0 Back` | number |
| 6 | `CON Say what happened (max 140 letters):` | text |
| 7 | `CON Send? <category> in <LGA>` / `1 Send 2 Cancel` | 1–2 |
| end | `END Received. Code: EG-4H7Q-92KD. We will also send it by SMS.` or `END Cancelled. Nothing was sent.` | |

- A description that contains `*` arrives split; the server joins every segment between the LGA choice and the final confirmation with `*`.
- **Idempotency:** keyed by `sessionId`; a repeated confirmation returns the same `END` text with the same code.
- Reports: `channel: "ussd"`, ward and unit `null` (LGA only), `danger_now` from step 3, `firsthand: null`.
- Intake paused → step 1 answers `END Reporting is paused. Please try later.`
- **Limits:** per number 10 reports per hour.

#### SIM-01 · Phone simulator (drives SMS-01 and USSD-01)

**Pending merge** (PR #14).

- **Status:** NEW. **Screens:** P-07.
- **Auth:** anyone with an anonymous session; CSRF; `Idempotency-Key` on sends. Returns `404 not_found` when `simulator_enabled` is false for the public-intake organisation.
- The server gives each browser session a simulated number (`+2340000` + 7 random digits, never routable) and calls the **same handlers** as SMS-01 and USSD-01, so the demo exercises the real code. Reports made this way carry `simulated: true` and show a "Simulated" label to reviewers; they are excluded from PUB snapshots.

| Operation | Method and path | Body | 200 |
|---|---|---|---|
| `ussd` | `POST /api/v1/simulator/ussd` | `{"session_id": "<uuid per dial>", "service_code": "*347*88#", "input": "4"}` (`input` is `""` when dialling) | `{"type": "CON" \| "END", "text": "What happened?\n1 Materials late…", "session_id": "…"}` |
| `sms` | `POST /api/v1/simulator/sms` | `{"text": "STATUS EG-4H7Q-92KD"}` (1–160) | `{"replies": [{"id", "text", "received_at"}]}` |
| `inbox` | `GET /api/v1/simulator/inbox?after=<id>` | none | `{"phone_label": "+234 000 0…", "messages": [{"id", "from": "ElectraGuard", "text", "received_at"}]}` |
| `reset` | `POST /api/v1/simulator/reset` | `{}` | `{"phone_label": "…"}` (new simulated number) |

- The simulator keeps the accumulated USSD `text` for each `session_id` (max 5 minutes) and passes it to the USSD handler in the gateway format.
- **Errors:** `404` (disabled), `422`, `429`, `403 csrf_failed`. **Limits:** 60 requests per 10 min and 10 reports per hour per browser session.

---

## 5. Permissions matrix

`Y` allowed · `own` only the caller's own · `asg` only cases currently assigned to the caller · `secret` with the receipt secret · `—` refused (`404` for object routes, `403` otherwise). Every allowed cell is further limited to the caller's organisation (section 3). "Gateway" is the SMS/USSD provider with the path secret.

| Contract | Public | Citizen | Observer | Reviewer | Moderator | Coordinator | Org admin | Gateway |
|---|---|---|---|---|---|---|---|---|
| AUTH-01, AUTH-07 | Y | Y | Y | Y | Y | Y | Y | — |
| AUTH-02, AUTH-03 | Y | Y | Y | — | — | — | — | — |
| AUTH-04, AUTH-05 | Y | — | — | Y | Y | Y | Y | — |
| AUTH-06 | — | — | Y | Y | Y | Y | Y | — |
| REF-01 | Y | Y | Y | Y | Y | Y | Y | — |
| REP-01, REP-02, REP-03 | — | — | own | — | — | — | — | — |
| REP-04 | — | secret | own | — | — | — | — | — |
| REP-05 | Y | Y | — | — | — | — | — | — |
| REP-06 | Y | Y | Y | Y | Y | Y | Y | — |
| REP-07 | — | secret | — | — | — | — | — | — |
| MED-01, 02, 03, 05 | — | secret | own | — | — | — | — | — |
| MED-04 | — | — | own | asg | — | — | — | — |
| MSG-01, MSG-02 | — | — | own | asg | — | — | — | — |
| DIS-01, DIS-02 | — | — | member | — | Y | — | — | — |
| DIS-03, DIS-04 | — | — | member | — | — | — | — | — |
| DIS-05 | — | — | — | — | Y | — | — | — |
| ASK-01 | Y | Y | Y | Y | Y | Y | Y | — |
| RS-01 | — | — | Y | — | — | — | — | — |
| Q-01, CASE-01..05 | — | — | — | asg | — | — | — | — |
| ASG-01, ASG-02 | — | — | — | — | — | Y | — | — |
| OPS-01..04 | — | — | — | — | — | Y | — | — |
| RUM-01..03 | — | — | — | — | — | Y | — | — |
| PUB-01 | — | — | — | — | — | Y | — | — |
| PUB-02 | Y | Y | Y | Y | Y | Y | Y | — |
| ADM-01..04 | — | — | — | — | — | — | Y | — |
| SEC-01 | — | — | — | — | — | Y | Y | — |
| AUD-01 export | — | — | — | — | — | — | Y | — |
| AUD-01 verify | — | — | — | — | — | Y | Y | — |
| SMS-01, USSD-01 | — | — | — | — | — | — | — | Y |
| SIM-01 | Y | Y | Y | Y | Y | Y | Y | — |

A staff account with several roles has the union of their rows, except that `org_admin` cannot be combined with any other role.

---

## 6. Rate limits (summary)

Limits are per organisation where an actor exists, otherwise per IP or per phone HMAC. Replays (1.5) are exempt from creation limits. Every `429` carries `Retry-After`.

| Contract | Limit |
|---|---|
| AUTH-01 | 60/min per IP |
| AUTH-02 | 5 failures per code per 15 min (lock 15 min); 10 per 24 h (admin reset); 30 attempts per IP per 10 min |
| AUTH-03 | 5 per setup token |
| AUTH-04 | 5 failures per email per 15 min; 30 per IP per 10 min |
| AUTH-05 | 5 per pre-2FA session; 10 per account per hour |
| REP-01 | 60 new reports per hour per observer |
| REP-05 | 30 new reports per IP per 10 min |
| REP-06 | 30/min per IP |
| REP-07 | 10/min per receipt code |
| MED-01 | 30 sessions per hour per actor |
| MSG-02 | 60 per hour per actor |
| DIS-03 | 30 per hour per member |
| ASK-01 | 20/min per session or IP |
| RS-01 | 20 per hour per observer |
| MED-04 | 300 per hour per staff user; alert above 100 distinct items in 10 min |
| RUM-01 | 120 per hour per organisation |
| ADM-01 | 2,000 codes per day per organisation |
| AUD-01 export | 10 per hour per organisation |
| SMS-01, USSD-01 | 10 reports and 30 commands per hour per phone |
| SIM-01 | 60 requests per 10 min, 10 reports per hour per browser session |
| All other staff reads | 600/min per user |

---

## 7. Migration from the current endpoints

The current endpoints stay until each new screen replaces its old page and passes its tests (design contract section 3); then the old route is removed in the same change. New code lives under `/api/v1/`.

| Current | New | What changes |
|---|---|---|
| `GET /api/auth/csrf` | AUTH-01 | `csrfToken` → `csrf_token` |
| `POST /api/auth/sign-in` (form, email) | AUTH-02 (observers), AUTH-04 + AUTH-05 (staff) | JSON; observer codes; staff 2FA |
| `POST /api/auth/sign-out` | AUTH-06 | `everywhere` |
| `GET /api/auth/me` | AUTH-07 | kind, roles[], organisation, expiry, intake, server time |
| `GET /api/workspaces/<role>` | AUTH-07 `roles` | Removed; route guards read AUTH-07 |
| `POST /api/reports` | REP-01 | Kinds, structured place, receipt code; idempotency compares a request digest instead of field values |
| `GET /api/reports` | REP-02 | Paging, counts |
| `GET /api/reports/<reference>` | REP-03 + MSG-01 | Clarification fields become the conversation |
| `POST /api/reports/<reference>/attachments` | MED-01..03 | Resumable sessions; video and audio |
| `GET /api/reports/<reference>/attachments/<id>` | MED-04 | `/media/{id}/content`, ranges, variants, logging |
| `POST /api/reports/<reference>/clarification` | MSG-02 `reply` | `reply_to` instead of `version` |
| `GET /api/review` | Q-01 | Urgency order, filters |
| `GET /api/review/<reference>` + `/triage` | CASE-01 | Merged |
| `POST /api/review/<reference>/actions` | CASE-02 | `request_clarification` → `ask`, `note` → `question`/`rationale`, close from `question`, `expected_media_ids` |
| `POST /api/review/<reference>/triage/category` | CASE-03 | Accept and urgency added |
| `POST /api/review/<reference>/triage/matches/<candidate>` | CASE-04 | `confirmed/dismissed` → `link/keep_separate`; behind the grouping flag until the release checks pass |
| `GET /api/assignments`, `POST /api/assignments/<reference>` | ASG-01, ASG-02 | Coordinator role; bulk; suggestion |
| `GET /api/dashboard` | OPS-01 | Coordinator role; LGA, channel, urgency |
| `provision_account`, `offboard_account` commands | ADM-03 | API with invite and 2FA; commands kept for bootstrap |
| `OBSERVATION_INTAKE_ENABLED` | ADM-04 `intake_paused` | Per organisation; the variable stays a global kill switch |

**Data migrations:**

| Current | New |
|---|---|
| `Report.reference` | `Report.id` (same UUID values) |
| status `submitted` / `needs_clarification` | `received` / `question` |
| `ReviewEvent` actions `request_clarification`, `respond` | `ask`, `reply` (old events keep their stored values; the serializer maps them) |
| `Report.location` (free text) | kept read-only as `legacy_location` for old reports; new reports use `place` |
| `Triage.Category` (access, materials, procedure, conduct, other) | new category set; old values mapped for display (`materials` → `late_materials`, `conduct` → `intimidation_violence`, `access` → `access_barrier`, `procedure` and `other` → `not_sure`) and excluded from the new evaluation |
| `Evidence` (bytes in PostgreSQL) | `MediaItem` + private blob storage; a copy job moves the bytes and keeps `sha256` |
| `User.role` (observer, reviewer, administrator) | `roles[]`; `administrator` becomes `coordinator` (operations) — the owner decides per account whether any also need `org_admin` |
| no organisation | one `Organisation` row created; every existing row gets its id |
| `ReviewEvent` (no hashes) | `AuditEvent` chain; existing events are hashed in `version` order into the new chain on migration |

## Additional live routes

These routes are registered by the base URL configuration. Examples use synthetic identifiers.

| Request | Response | Notes |
| --- | --- | --- |
| `GET /health/live` | 200 `{"status":"ok"}` | Public probe. |
| `GET /health/ready` | 200 `{"status":"ok"}` or 503 `{"status":"unavailable"}` | Deployment probe. |
| `GET /api/v1/reference/settings` | 200 `{"coverage_area":{"state_codes":[],"lga_codes":[]},"party_labels":[]}`, 401 without session, 403 for another role | Observer session required. |
| `POST /api/v1/auth/observer/pin/change` with `{"current_pin":"482605","new_pin":"593716"}` | 204 on success, 401 without session or with invalid credentials, 403 for another role, 422 for invalid PIN input, 429 when throttled | Observer session and CSRF required. |
| `POST /api/v1/public/receipts/{receipt_code}/withdraw` with `{"confirm":true}` | Uses the REP-04 withdrawal response, 404 if receipt proof fails, 409 if withdrawal is no longer permitted | Receipt proof and idempotency key required. |

The legacy compatibility routes in §7 remain mounted. For their exact path patterns see [the legacy report routes](../../backend/reports/urls.py) and [the root configuration](../../backend/config/urls.py).

## Legacy compatibility examples

The session and role rules still apply. Unsafe session requests require the CSRF header. The JSON below shows representative fields from the legacy responses. Legacy errors use `detail` or field names. Common errors are 400 for invalid data, 403 for denied access, 404 for a missing or inaccessible object, and 409 for a conflicting write.

| Request | Example response |
| --- | --- |
| `GET /api/auth/csrf` | 200 `{"csrfToken":"example-token"}` |
| `POST /api/auth/sign-in` with form `email=observer%40example.invalid&password=example` | 200 `{"email":"observer@example.invalid","role":"observer"}` or 401 for invalid credentials |
| `POST /api/auth/sign-out` with empty body | 204 |
| `GET /api/auth/me` | 200 `{"email":"observer@example.invalid","role":"observer"}` |
| `GET /api/workspaces/observer` (substitute each supported workspace role) | 200 `{"email":"observer@example.invalid","role":"observer","title":"Observer Workspace"}` |
| `GET /api/reports` | 200 `[]` when the observer has no reports |
| `POST /api/reports` with an idempotency key and `{"occurred_at":"2026-11-24T09:00:00Z","location":"Synthetic hall","description":"Synthetic report"}` | 201 report, 200 same-key replay, 409 mismatched replay, 503 intake paused |
| `GET /api/reports/{reference}` | 200 report detail, 404 outside the caller's scope |
| `POST /api/reports/{reference}/attachments` with multipart photo and its upload identifier | 201 attachment metadata, 200 replay or 409 on conflict |
| `GET /api/reports/{reference}/attachments/{attachment_id}` | 200 private file bytes, 404 outside the caller's scope |
| `POST /api/reports/{reference}/clarification` with `{"version":2,"note":"Synthetic clarification"}` | 200 `{"version":3,"status":"under_review"}` |
| `GET /api/review` | 200 `[]` when the reviewer has no assigned reports |
| `GET /api/review/{reference}` | 200 case report with evidence and review history |
| `POST /api/review/{reference}/actions` with `{"version":1,"action":"start"}` | 200 `{"version":2,"status":"under_review"}` |
| `GET /api/review/{reference}/triage` | 200 `{"status":"pending","method_version":"local-lexical-v1"}` |
| `POST /api/review/{reference}/triage/category` with `{"version":2,"category":"access"}` | 200 `{"version":3}` |
| `POST /api/review/{reference}/triage/matches/{candidate}` with `{"version":2,"decision":"dismissed"}` | 200 `{"version":3}` when grouping is enabled |
| `GET /api/assignments` | 200 `{"reports":[],"reviewers":[]}` |
| `POST /api/assignments/{reference}` with `{"version":1,"reviewer":2}` | 200 updated assignment with the new version |
| `GET /api/dashboard` | 200 operational aggregates restricted to the caller's organisation |



## Changelog

- 2026-11-24. Initial submission reference. Labels reflect the base and open pull requests listed above.
