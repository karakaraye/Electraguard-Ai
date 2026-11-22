# Observer and citizen screens (phase D1)

**Status:** READY for review · 22 Nov 2026 · Binding: [design-contract.md](../design-contract.md). Behaviour: [hackathon-plan.md](../../hackathon-plan.md) sections 2–4 and 8. **API:** reconciled with [api-contracts.md](../api-contracts.md), which is the source of truth for ids, operations, paths, field names and error codes; where a screen needs something the contracts do not give, see [Contract gaps](#contract-gaps).

One spec per screen. Every visible string is a key in `frontend/messages/{en,pcm,ha,yo,ig}.json`. Terms are fixed in [glossary.md](glossary.md).

| Id | Screen | Route | Spec |
|---|---|---|---|
| O-01 | Language | `/o/start` (step 1) | [O-01-language.md](O-01-language.md) |
| O-02 | What this app keeps | `/o/start` (step 2) | [O-02-privacy-notice.md](O-02-privacy-notice.md) |
| O-03 | Who are you · Sign in · Set PIN · Code revoked | `/o/start` (step 3) | [O-03-sign-in.md](O-03-sign-in.md) |
| O-04 | Home | `/o` | [O-04-home.md](O-04-home.md) |
| O-05 | What happened? | `/o/new/what` · `/r/new/what` | [O-05-category.md](O-05-category.md) |
| O-06 | Is anyone in danger? (+ emergency guidance) | `/o/new/danger` | [O-06-danger.md](O-06-danger.md) |
| O-07 | Where? | `/o/new/where` | [O-07-where.md](O-07-where.md) |
| O-08 | When? | `/o/new/when` | [O-08-when.md](O-08-when.md) |
| O-09 | Tell us what happened | `/o/new/describe` | [O-09-describe.md](O-09-describe.md) |
| O-10 | Add evidence | `/o/new/evidence` | [O-10-evidence.md](O-10-evidence.md) |
| O-11 | Check and send | `/o/new/check` | [O-11-check-send.md](O-11-check-send.md) |
| O-12 | Receipt (observer) | `/o/reports/[id]?just-sent` | [O-12-receipt.md](O-12-receipt.md) |
| O-13 | My reports | `/o/reports` | [O-13-my-reports.md](O-13-my-reports.md) |
| O-14 | Report detail | `/o/reports/[id]` | [O-14-report-detail.md](O-14-report-detail.md) |
| O-15 | Checklist (stage list + stage form) | `/o/checklist` · `/o/checklist/[stage]` | [O-15-checklist.md](O-15-checklist.md) |
| O-16 | Result-sheet check | `/o/checklist/results/sheet` | [O-16-result-sheet.md](O-16-result-sheet.md) |
| O-17 | Messages | `/o/messages` | [O-17-messages.md](O-17-messages.md) |
| O-18 | Discussions list and thread | `/o/discussions` · `/o/discussions/[id]` | [O-18-discussions.md](O-18-discussions.md) |
| O-19 | Ask ElectraGuard | `/o/ask` | [O-19-ask.md](O-19-ask.md) |
| O-20 | Settings | `/o/settings` | [O-20-settings.md](O-20-settings.md) |
| C-01 | Citizen receipt | `/r/receipt/[code]` | [C-01-citizen-receipt.md](C-01-citizen-receipt.md) |
| P-01 | Status lookup | `/status` | [P-01-status.md](P-01-status.md) |

## Flow map

```mermaid
flowchart TD
  start((First open)) --> O01[O-01 Language]
  O01 --> O02[O-02 What this app keeps]
  O02 --> O03{O-03 Who are you?}
  O03 -->|Observer| SIGN[O-03 Sign in: code + PIN]
  SIGN -->|setup PIN on card| SETPIN[O-03 Choose your own PIN]
  SETPIN --> O04
  SIGN -->|ok| O04[O-04 Home]
  SIGN -->|code revoked| REV[O-03 Code revoked]
  REV --> SIGN
  O03 -->|Citizen| C05
  O03 -->|Check a receipt code| P01

  O04 -->|Report something / Continue your report| O05
  O04 --> O15[O-15 Checklist]
  O04 --> O13[O-13 My reports]
  O04 --> O17[O-17 Messages]
  O04 --> O18[O-18 Discussions]
  O04 --> O19[O-19 Ask]
  O04 -->|menu| O20[O-20 Settings]

  subgraph Incident steps, observer and citizen
    O05[O-05 What happened?] --> O06{O-06 Danger now?}
    C05[Citizen enters at O-05] -.-> O05
    O06 -->|Yes| EMG[O-06 Get safe first: call 112]
    EMG --> O07
    O06 -->|No| O07[O-07 Where?]
    O07 --> O08[O-08 When?]
    O08 --> O09[O-09 Tell us what happened]
    O09 --> O10[O-10 Add evidence]
    O10 --> O11[O-11 Check and send]
  end

  O11 -->|server confirmed, observer| O12[O-12 Receipt]
  O11 -->|server confirmed, citizen| C01[C-01 Citizen receipt]
  O11 -->|offline / paused / not confirmed| O04
  O12 --> O14[O-14 Report detail]
  O13 --> O14
  O17 --> O14
  C01 --> P01[P-01 Status lookup]

  O15 -->|any No: Report this as an incident| O05
  O15 -->|Results posted: Yes| O16[O-16 Result-sheet check]
  O16 --> O13
  O20 -->|Sign out and clear| O01
```

## Shared rules (every screen follows these; specs only note exceptions)

### R1. Report states on the phone (one source: `useReportState(id)`)

| Local state | Shown as (key) | Badge | Entered when | Leaves when |
|---|---|---|---|---|
| `draft` | (not a report yet) | none | first value chosen on O-05 | Send on O-11, or deleted |
| `queued` (contract `on_device`) | `common.status.onPhone` | `--wait` hollow circle | Send while offline, paused, session expired, or code revoked | sync loop starts sending |
| `sending` | `common.status.sending` | `--wait` | request in flight | response, or timeout |
| `unconfirmed` (contract `not_confirmed`) | `common.status.notConfirmed` | `--wait` | request timed out, network error, `5xx` or `503 service_unavailable` after send | retry returns the receipt |
| `needsAttention` (contract `needs_attention`) | `common.status.needsAttention` (new key) + the reason | `--attn` | the server refused the item for good: `409 idempotency_key_reused`, `422`, `413`, `415`, or `409 report_closed` / `report_withdrawn` for media and messages (contract 1.7) | the observer fixes it and resends with the same key (a 4xx stores nothing, so the key stays valid), or deletes it |
| `received` and later | server status keys (`received`, `in_review`, `question`, `closed` + `outcome`, `withdrawn`; contract 2.1) | per contract 2.1 | server returned a receipt (REP-01 or REP-05 `201`/`200`) | server status changes |
| `waitingCode` | `common.status.waitingCode` | `--attn` | code revoked while items are queued | new code signs in, or cleared |

- **Never** show `received` or a receipt code without a REP-01 (observer) or REP-05 (citizen) success response. Animation of the receipt tick is triggered by that response only.
- App killed while `sending`: on next open, items in `sending` return to `unconfirmed` and are resent with the **same `Idempotency-Key`**. The server returns the original receipt (`200` with `Idempotent-Replayed: true`, never `409`), so there is never a duplicate. Keys are made when the item enters the outbox, not at send time, and are scoped to the observer account, so they survive a re-sign-in.

### R2. Drafts

- A draft is created in IndexedDB the moment a category is chosen on O-05. It holds every step's values, attachment blobs (already stripped of location and resized), and a client report id (UUID v4) that becomes the `Idempotency-Key`. The key is created **once per draft**, never per tap.
- One open incident draft at a time per signed-in code (and one for citizen mode). Home shows "Continue your report" while it exists. Starting "Report something" with a draft open goes straight to the draft's last step (no second draft, no silent discard).
- Every field change is written to the draft within 300 ms (debounced). App kill, reload, language change, and session expiry never lose a draft.
- A draft is deleted only by: (a) the explicit "Delete this report" action in the step menu (`incident.discard`, confirm sheet `common.discard.*`), (b) successful send (content moves to the outbox), (c) "Sign out and clear this phone".
- Drafts and outbox items belong to the observer code that created them. Another code signing in on the same phone does not see them (shared phones).

### R3. Back

- Every step has the labelled `ui.back` in the top bar. Android hardware Back does the same thing.
- Order: close an open sheet first → otherwise go to the previous step with every value kept. On O-05, Back goes to Home and the draft is kept (banner `incident.draftKept` on Home for 6 s, not a toast for an important outcome: the "Continue your report" card stays).
- Back never asks "Are you sure?", because nothing is lost. Only deletion asks.
- Back from O-12 / C-01 goes to Home, never back into the sent draft.

### R4. Sending and retries

- Primary send buttons switch to their `...sending` label with the button width kept and become disabled on first tap (no double submit). The idempotency key protects against a second request anyway.
- Sync loop order (contract 1.7): oldest report first; for each report, the text (REP-01, or REP-05 for a citizen) first, then each attachment (MED-01..03), then queued messages (MSG-02). A report's media and messages wait until the report has its server `id`. Retries back off 2 s, 4 s, 8 s and so on, capped at 5 min, with ±20 % jitter, using the **same key**; immediate retry when the browser `online` event fires or the user taps a "Send now" / `ui.retry` action. `409 request_in_progress`, `429 rate_limited` and `503` wait for `Retry-After` instead.
- Limits (plan 4.6): 20 queued reports, 150 MB media. Over the limit: O-11 shows `o11.queueFull` and keeps the draft; O-10 shows `common.error.storageFull`.

### R5. Session, revocation, intake pause

- **Session expired** (any call returns `401 not_authenticated`): queue kept and the outbox paused. The next send opens the `common.pinSheet.*` sheet, which signs in again with AUTH-02 (the code is remembered; the observer types the PIN) and then fetches AUTH-01 again; the outbox resumes with the same keys. "Not now" leaves items `queued`.
- **Code revoked** (`403 code_revoked` from any call): all local session data is cleared, queued items move to `waitingCode`, and the O-03 revoked state is shown. A new code signing in on this phone is offered to send or delete those items (they re-send under the new code with the same keys, contract 1.7; see open question Q3).
- **Intake paused** (REP-01 or REP-05 returns `503 intake_paused`, or AUTH-07 shows `user.organisation.intake_paused` for an observer, or `citizen_intake_open: false` for a citizen): item stays `queued`; Home shows the `o04.intakePaused` banner; existing reports, messages and discussions keep working. The loop retries after `Retry-After` (the server sends 600 s) and re-reads AUTH-07 meanwhile. A replay of a report the server already received still succeeds while intake is paused.

### R6. Offline

- A network bar (`common.network.offline`) sits under the top bar on every screen while `navigator.onLine` is false **or** the last request failed with a network error. It is a `Banner` with `role="status"`, never auto-dismissed. When the network returns it shows `common.network.back` for 4 s while the queue flushes.
- Screens that only read server data show what was loaded in this session, with its age (`o13.updated`), or an honest empty/offline message. Server items are not stored on the phone (contract 1.8; see gap G9). No screen invents data.

### R7. Accessibility baseline

- Focus moves to the screen title (`h1`, `tabindex="-1"`) on every route change and step change; the title text is the step question, so TalkBack reads it first.
- Errors: the first invalid field gets focus; the error text is linked with `aria-describedby` and announced via `aria-live="assertive"`. Status changes (Saved, Sending 40%) use `aria-live="polite"`.
- Every `ChoiceTile` and `YesNo` is a radio group with a group label (the screen question).
- Targets ≥ 48 px; primary button 52 px; all screens tested at 200% text and 320 px without horizontal scroll.
- `lang` attribute follows the chosen locale; language names on O-01 carry their own `lang`.

### R8. Privacy on the phone

- After REP-01 or REP-05 succeeds, report text and media are deleted from the phone (media after each MED-03 succeeds), unless the observer turned on "Keep copies on this phone" in O-20 (stored locally, never sent; contract 1.8). Contract 1.8 and REP-02 say server items are not stored on the phone, so no index of received reports is kept by default; whether a minimal index (id, receipt code, category, ward, status, time) may stay is contract gap G9 and question Q1. (Plan 2.4: no copy stays on shared phones by default.) A citizen phone keeps only the receipt code and the receipt secret, and only while "Keep this code on this phone" is on.
- No GPS API is ever called, and no GPS appears in any request or response. Photos and videos have EXIF/metadata stripped on the phone before they enter the draft, and again on the server (the server drops every metadata block and deletes the original after re-encoding).
- Free text is checked on the phone for likely personal names (O-09) and phone numbers (O-09, O-14, O-18); the reporter decides.

## API contracts used by these screens
[api-contracts.md](../api-contracts.md) is authoritative for ids, operation keys (`ID.operation`, as in `frontend/lib/api/contracts.ts`), paths, field names (snake_case on the wire) and error codes. This table lists every contract id and operation, generated from the contracts; the fourth column is the contract's title and the last two columns show which screens in these specs use it and which screens the contract itself names (S-xx and P-xx screens belong to later phases). Paths are relative to the origin; the API base is `/api/v1`.

| Id | Operation key | Method and path | Contract | Screens in these specs | Screens named by the contract |
|---|---|---|---|---|---|
| AUTH-01 | `AUTH-01` | `GET /api/v1/auth/csrf` | CSRF token | O-03, O-11, O-12, O-14, O-18, O-19, O-20, C-01, P-01 (the API client, before any write) | every screen that writes (fetched once per page load by the API client, and again after sign-in or sign-out) |
| AUTH-02 | `AUTH-02` | `POST /api/v1/auth/observer/sign-in` | Observer sign-in (code + PIN) | O-03; the PIN sheet on any observer screen (R5) | O-03, and the PIN prompt shown by the outbox after a session expired |
| AUTH-03 | `AUTH-03` | `POST /api/v1/auth/observer/pin` | Observer first-time PIN set | O-03 | O-03 (first-time step) |
| AUTH-04 | `AUTH-04` | `POST /api/v1/auth/staff/sign-in` | Staff sign-in | none | S-01 |
| AUTH-05 | `AUTH-05.verify` | `POST /api/v1/auth/staff/totp` | Staff TOTP verify and enrol | none | S-01 |
| AUTH-05 | `AUTH-05.enrol_start` | `POST /api/v1/auth/staff/totp/enrolment` | Staff TOTP verify and enrol | none | S-01 |
| AUTH-05 | `AUTH-05.enrol_confirm` | `POST /api/v1/auth/staff/totp/enrolment/confirm` | Staff TOTP verify and enrol | none | S-01 |
| AUTH-05 | `AUTH-05.accept_invite` | `POST /api/v1/auth/staff/invite` | Staff TOTP verify and enrol | none | S-01 |
| AUTH-06 | `AUTH-06` | `POST /api/v1/auth/sign-out` | Sign out (and sign out everywhere) | O-20 | O-20 ("Sign out and clear this phone"), StaffShell menu, S-10 (an admin's own sessions) |
| AUTH-07 | `AUTH-07` | `GET /api/v1/auth/me` | Me | O-03, O-04, O-08, O-20 | O-03 (resume), O-04 (intake banner), O-20, every S-* screen (role-based navigation), P-02 and the citizen flow (is citizen intake open) |
| REF-01 | `REF-01.index` | `GET /api/v1/reference/areas` | Polling-unit reference list (versioned, cacheable offline) | O-07, O-15 | O-07 (Where), O-15 (Arrival stage), O-16, the citizen flow, S-02 and S-04 filters, S-05, S-08, S-11 (coverage area) |
| REF-01 | `REF-01.state` | `GET /api/v1/reference/areas/{state_code}` | Polling-unit reference list (versioned, cacheable offline) | O-07, O-15 | O-07 (Where), O-15 (Arrival stage), O-16, the citizen flow, S-02 and S-04 filters, S-05, S-08, S-11 (coverage area) |
| REP-01 | `REP-01` | `POST /api/v1/reports` | Observer creates a report (incident, checklist, result sheet) | O-11, O-12, O-15, O-16 | O-11 (Check and send), O-12 (Receipt), O-15 (Checklist stage), O-16 (Result-sheet entry) |
| REP-02 | `REP-02` | `GET /api/v1/reports` | List own reports | O-04, O-13, O-15, O-17 | O-04 (counts, recent), O-13 (My reports), O-17 (Messages: `?has_messages=true`) |
| REP-03 | `REP-03` | `GET /api/v1/reports/{id}` | Report detail | O-12, O-14 | O-14 (status, attachments, withdraw), O-12 (attachment progress after receipt) |
| REP-04 | `REP-04.observer` | `POST /api/v1/reports/{id}/withdraw` | Withdraw | O-14 | O-14 (observer), P-01 (citizen, with the secret) |
| REP-04 | `REP-04.citizen` | `POST /api/v1/public/receipts/{receipt_code}/withdraw` | Withdraw | P-01 | O-14 (observer), P-01 (citizen, with the secret) |
| REP-05 | `REP-05` | `POST /api/v1/public/reports` | Citizen creates a report (no account) | O-11 (citizen mode), C-01 | the citizen report steps (`/r/new/...`, same step screens as O-05..O-11 in citizen mode) and C-01 (Citizen receipt) |
| REP-06 | `REP-06` | `GET /api/v1/public/receipts/{receipt_code}` | Status by receipt code (public, minimal) | C-01, P-01 | P-01, C-01 (refresh). Same logic as SMS `STATUS` |
| REP-07 | `REP-07.read` | `GET /api/v1/public/receipts/{receipt_code}/conversation` | Citizen reads the conversation and replies to a formal question | P-01 | P-01 (when `has_open_question` and the phone holds the secret, or the citizen pastes the saved secret) |
| REP-07 | `REP-07.reply` | `POST /api/v1/public/receipts/{receipt_code}/reply` | Citizen reads the conversation and replies to a formal question | P-01 | P-01 (when `has_open_question` and the phone holds the secret, or the citizen pastes the saved secret) |
| MED-01 | `MED-01` | `POST /api/v1/reports/{report_id}/uploads` | Start a resumable upload session | O-12, O-14, O-16, C-01 (fields prepared on O-10) | O-10 (Evidence), O-12 (Receipt: per-item upload), O-14 (add later), O-16 (sheet photo), citizen C-01 |
| MED-02 | `MED-02.send` | `PATCH /api/v1/uploads/{upload_id}` | Upload a chunk (and read progress) | O-12, O-14, C-01 | O-12, O-14 (progress bar tied to real bytes) |
| MED-02 | `MED-02.progress` | `GET /api/v1/uploads/{upload_id}` | Upload a chunk (and read progress) | O-12, O-14, C-01 | O-12, O-14 (progress bar tied to real bytes) |
| MED-03 | `MED-03` | `POST /api/v1/uploads/{upload_id}/complete` | Complete the upload | O-12, O-14, O-16, C-01 | O-12, O-14 (item becomes *Saved*) |
| MED-04 | `MED-04` | `GET /api/v1/media/{media_id}/content` | Download or stream (permission checked every time) | O-14 | O-14 (own media), S-03 (players, downloads), O-17 and S-03 (message attachments) |
| MED-05 | `MED-05.media` | `DELETE /api/v1/reports/{report_id}/media/{media_id}` | Remove an attachment before review | O-12, O-14, C-01 | O-10, O-12, O-14 |
| MED-05 | `MED-05.upload` | `DELETE /api/v1/uploads/{upload_id}` | Remove an attachment before review | O-12, O-14, C-01 | O-10, O-12, O-14 |
| MSG-01 | `MSG-01.list` | `GET /api/v1/reports/{report_id}/messages` | List a report's conversation (and mark read) | O-14 | O-14, O-17, S-03 |
| MSG-01 | `MSG-01.mark_read` | `POST /api/v1/reports/{report_id}/messages/read` | List a report's conversation (and mark read) | O-14 | O-14, O-17, S-03 |
| MSG-02 | `MSG-02` | `POST /api/v1/reports/{report_id}/messages` | Post a message or reply to a formal question | O-14 | O-14, S-03 |
| DIS-01 | `DIS-01` | `GET /api/v1/discussions` | My discussions | O-04, O-18 | O-18 (list, invitations), S-08 (moderator list) |
| DIS-02 | `DIS-02` | `GET /api/v1/discussions/{id}` | Thread | O-18 | O-18 thread, S-08 |
| DIS-03 | `DIS-03.post` | `POST /api/v1/discussions/{id}/posts` | Post (and flag a post) | O-18 | O-18 |
| DIS-03 | `DIS-03.flag` | `POST /api/v1/discussions/{id}/posts/{post_id}/flag` | Post (and flag a post) | O-18 | O-18 |
| DIS-04 | `DIS-04` | `POST /api/v1/discussions/{id}/membership` | Accept or decline an invitation, leave | O-18 | O-18 |
| DIS-05 | `DIS-05.create` | `POST /api/v1/discussions` | Moderator: create, invite, hide, remove, close, flags | none | S-08 |
| DIS-05 | `DIS-05.invite` | `POST /api/v1/discussions/{id}/invitations` | Moderator: create, invite, hide, remove, close, flags | none | S-08 |
| DIS-05 | `DIS-05.hide_post` | `POST /api/v1/discussions/{id}/posts/{post_id}/hide` | Moderator: create, invite, hide, remove, close, flags | none | S-08 |
| DIS-05 | `DIS-05.unhide_post` | `POST /api/v1/discussions/{id}/posts/{post_id}/unhide` | Moderator: create, invite, hide, remove, close, flags | none | S-08 |
| DIS-05 | `DIS-05.remove_member` | `POST /api/v1/discussions/{id}/members/{observer_code}/remove` | Moderator: create, invite, hide, remove, close, flags | none | S-08 |
| DIS-05 | `DIS-05.close` | `POST /api/v1/discussions/{id}/close` | Moderator: create, invite, hide, remove, close, flags | none | S-08 |
| DIS-05 | `DIS-05.flags` | `GET /api/v1/moderation/flags` | Moderator: create, invite, hide, remove, close, flags | none | S-08 |
| ASK-01 | `ASK-01` | `POST /api/v1/ask` | Ask ElectraGuard (retrieval only, cited, abstains) | O-19 | O-19, P-04 |
| RS-01 | `RS-01` | `POST /api/v1/result-sheets/ocr` | Read a result-sheet photo (OCR → fields + confidence) | O-16 | O-16 |
| Q-01 | `Q-01` | `GET /api/v1/review/queue` | Reviewer queue | none | S-02 (queue), S-03 (side list on tablet) |
| CASE-01 | `CASE-01` | `GET /api/v1/review/cases/{id}` | Case detail | none | S-03 |
| CASE-02 | `CASE-02` | `POST /api/v1/review/cases/{id}/actions` | Case actions (start, formal question, close) | none | S-03 |
| CASE-03 | `CASE-03` | `POST /api/v1/review/cases/{id}/suggestions/{type}` | Accept or correct a suggestion (category, urgency) | none | S-03 (SuggestionCard) |
| CASE-04 | `CASE-04` | `POST /api/v1/review/cases/{id}/duplicates/{other_id}` | Duplicate decision | none | S-03 (side-by-side) |
| CASE-05 | `CASE-05` | `POST /api/v1/review/cases/{id}/redaction` | Redact text | none | S-03 |
| ASG-01 | `ASG-01` | `GET /api/v1/assignments` | Assignment list | none | S-04 |
| ASG-02 | `ASG-02` | `POST /api/v1/assignments` | Assign or reassign (bulk) | none | S-04 |
| OPS-01 | `OPS-01` | `GET /api/v1/ops/overview` | Overview aggregates | none | S-05 |
| OPS-02 | `OPS-02.list` | `GET /api/v1/ops/clusters` | Cluster warnings (and mark reviewed, thresholds) | none | S-05 |
| OPS-02 | `OPS-02.review` | `POST /api/v1/ops/clusters/{id}/review` | Cluster warnings (and mark reviewed, thresholds) | none | S-05 |
| OPS-02 | `OPS-02.get_settings` | `GET /api/v1/ops/cluster-settings` | Cluster warnings (and mark reviewed, thresholds) | none | S-05 |
| OPS-02 | `OPS-02.update_settings` | `PUT /api/v1/ops/cluster-settings` | Cluster warnings (and mark reviewed, thresholds) | none | S-05 |
| OPS-03 | `OPS-03` | `GET /api/v1/ops/coverage` | Coverage gaps | none | S-05 |
| OPS-04 | `OPS-04` | `GET /api/v1/ops/late-materials-risk` | Late-materials risk | none | S-05 (before election day) |
| RUM-01 | `RUM-01.list` | `GET /api/v1/rumours/claims` | Claims list and create (text or image) | none | S-06 |
| RUM-01 | `RUM-01.create` | `POST /api/v1/rumours/claims` | Claims list and create (text or image) | none | S-06 |
| RUM-01 | `RUM-01.get` | `GET /api/v1/rumours/claims/{id}` | Claims list and create (text or image) | none | S-06 |
| RUM-02 | `RUM-02` | `GET /api/v1/rumours/claims/{id}/matches` | Claim matches | none | S-06 |
| RUM-03 | `RUM-03.save_draft` | `PUT /api/v1/rumours/claims/{id}/response` | Response draft and second-person approval | none | S-06 |
| RUM-03 | `RUM-03.approve` | `POST /api/v1/rumours/claims/{id}/response/approve` | Response draft and second-person approval | none | S-06 |
| RUM-03 | `RUM-03.reject` | `POST /api/v1/rumours/claims/{id}/response/reject` | Response draft and second-person approval | none | S-06 |
| RUM-03 | `RUM-03.dismiss` | `POST /api/v1/rumours/claims/{id}/dismiss` | Response draft and second-person approval | none | S-06 |
| PUB-01 | `PUB-01.list` | `GET /api/v1/publish/snapshots` | Create and approve a public snapshot | none | S-07 |
| PUB-01 | `PUB-01.create` | `POST /api/v1/publish/snapshots` | Create and approve a public snapshot | none | S-07 |
| PUB-01 | `PUB-01.get` | `GET /api/v1/publish/snapshots/{id}` | Create and approve a public snapshot | none | S-07 |
| PUB-01 | `PUB-01.approve` | `POST /api/v1/publish/snapshots/{id}/approve` | Create and approve a public snapshot | none | S-07 |
| PUB-01 | `PUB-01.discard` | `POST /api/v1/publish/snapshots/{id}/discard` | Create and approve a public snapshot | none | S-07 |
| PUB-01 | `PUB-01.schedule` | `PUT /api/v1/publish/schedule` | Create and approve a public snapshot | none | S-07 |
| PUB-02 | `PUB-02` | `GET /api/v1/public/results` | Public results | none | P-03 (results), P-02 (home summary) |
| ADM-01 | `ADM-01.list` | `GET /api/v1/admin/code-batches` | Observer code batches (create, print data) | none | S-09 |
| ADM-01 | `ADM-01.create` | `POST /api/v1/admin/code-batches` | Observer code batches (create, print data) | none | S-09 |
| ADM-01 | `ADM-01.print_data` | `POST /api/v1/admin/code-batches/{id}/print-data` | Observer code batches (create, print data) | none | S-09 |
| ADM-01 | `ADM-01.codes` | `GET /api/v1/admin/codes` | Observer code batches (create, print data) | none | S-09 |
| ADM-02 | `ADM-02.revoke` | `POST /api/v1/admin/codes/{observer_code}/revoke` | Revoke, reissue, reset PIN | none | S-09. `Idempotency-Key` on all |
| ADM-02 | `ADM-02.reissue` | `POST /api/v1/admin/codes/{observer_code}/reissue` | Revoke, reissue, reset PIN | none | S-09. `Idempotency-Key` on all |
| ADM-02 | `ADM-02.reset_pin` | `POST /api/v1/admin/codes/{observer_code}/reset-pin` | Revoke, reissue, reset PIN | none | S-09. `Idempotency-Key` on all |
| ADM-03 | `ADM-03.list` | `GET /api/v1/admin/staff` | Staff accounts (create, roles, 2FA reset, offboard) | none | S-10 |
| ADM-03 | `ADM-03.create` | `POST /api/v1/admin/staff` | Staff accounts (create, roles, 2FA reset, offboard) | none | S-10 |
| ADM-03 | `ADM-03.update` | `PATCH /api/v1/admin/staff/{id}` | Staff accounts (create, roles, 2FA reset, offboard) | none | S-10 |
| ADM-03 | `ADM-03.offboard` | `POST /api/v1/admin/staff/{id}/offboard` | Staff accounts (create, roles, 2FA reset, offboard) | none | S-10 |
| ADM-04 | `ADM-04.get` | `GET /api/v1/admin/settings` | Organisation settings (intake pause, retention and more) | none | S-11; the effect shows on O-04 and the citizen flow via AUTH-07 |
| ADM-04 | `ADM-04.update` | `PATCH /api/v1/admin/settings` | Organisation settings (intake pause, retention and more) | none | S-11; the effect shows on O-04 and the citizen flow via AUTH-07 |
| SEC-01 | `SEC-01.list` | `GET /api/v1/security/alerts` | Security alerts | none | S-12 |
| SEC-01 | `SEC-01.update` | `POST /api/v1/security/alerts/{id}` | Security alerts | none | S-12 |
| AUD-01 | `AUD-01.export` | `GET /api/v1/audit/export` | Audit export and hash-chain verify | none | S-11 (export), S-12 and S-03 (chain status) |
| AUD-01 | `AUD-01.verify` | `GET /api/v1/audit/verify` | Audit export and hash-chain verify | none | S-11 (export), S-12 and S-03 (chain status) |
| SMS-01 | `SMS-01` | `POST /api/v1/channels/sms/inbound/{webhook_secret}` | Inbound SMS webhook | none | none directly (P-07 drives it through SIM-01) |
| USSD-01 | `USSD-01` | `POST /api/v1/channels/ussd/{webhook_secret}` | USSD session webhook | none | none directly (P-07 through SIM-01) |
| SIM-01 | `SIM-01.ussd` | `POST /api/v1/simulator/ussd` | Phone simulator (drives SMS-01 and USSD-01) | none | P-07 |
| SIM-01 | `SIM-01.sms` | `POST /api/v1/simulator/sms` | Phone simulator (drives SMS-01 and USSD-01) | none | P-07 |
| SIM-01 | `SIM-01.inbox` | `GET /api/v1/simulator/inbox` | Phone simulator (drives SMS-01 and USSD-01) | none | P-07 |
| SIM-01 | `SIM-01.reset` | `POST /api/v1/simulator/reset` | Phone simulator (drives SMS-01 and USSD-01) | none | P-07 |

Rows with "none" in the fourth-from-last column are contracts for staff, public-site and gateway screens (AUTH-04, AUTH-05, Q-01 to ADM-04, SMS-01, USSD-01, SIM-01 and the others) that the observer and citizen specs do not use; the web client never calls SMS-01 or USSD-01.

### Error codes the screens branch on

Every non-2xx response has one shape, `{"error": {"code", "message", "fields"}}` (contract 1.4). The UI maps `code` to the message key `errors.<code>` (and `errors.field.<code>` for field errors) and never shows `error.message` when a key exists. The five message files do not have the `errors.*` family yet (see [Message keys these specs need](#message-keys-these-specs-need)); until they do, each screen uses the key named in its states table.

| Status · `code` | Screens | What the screen does |
|---|---|---|
| 401 `not_authenticated` | every observer screen | outbox pauses; PIN sheet (AUTH-02); resume with the same keys |
| 401 `invalid_credentials` | O-03 | sign-in: wrong code or PIN, never says which. AUTH-03: the setup step expired, back to sign-in |
| 401 `receipt_secret_invalid` | C-01, P-01 | the action is not available from this phone |
| 403 `csrf_failed` | any write | fetch AUTH-01 again once and retry |
| 403 `code_revoked` | any observer call | revoked view (R5) |
| 403 `forbidden` | any | client bug; `common.error.server` |
| 404 `not_found` | O-14, O-18, P-01, REF-01 | not yours, or does not exist (the contract never says which) |
| 409 `stale_version` | none here | staff only (observer and citizen writes carry no version, contract 1.6) |
| 409 `idempotency_key_reused`, 400 `idempotency_key_required`, 400 `bad_request` | every write | item stops as `needsAttention`; client bug |
| 409 `request_in_progress` | every write | retry after `Retry-After` (2 s) |
| 409 `invalid_transition` | O-12, O-14, O-18 | attachments cannot be removed once review started; a media file is still being prepared; an invitation cannot be accepted |
| 409 `withdraw_unavailable` | O-14, P-01 | `o14.withdraw.tooLate` |
| 409 `question_closed` | O-14, P-01 | keep the text; offer to send it as a message (O-14) or reload (P-01) |
| 409 `report_closed`, `report_withdrawn` | O-12, O-14, C-01, P-01 | messages and media stop; the screen explains |
| 409 `media_limit_reached` | O-10, O-12, O-14 | `o10.limitItems` (6 items, 60 MiB) |
| 409 `offset_mismatch`, `upload_expired`, `upload_completed` | O-12, O-14, C-01 | read MED-02.progress and continue; or start a new session; or treat as saved |
| 409 `discussion_closed`, `not_a_member` | O-18 | `o18.closed`, `o18.thread.removed` |
| 413 `payload_too_large` | O-10, O-12, O-16, O-11 | `o10.tooBig`, or `o09.tooLong` for a report over 64 KB |
| 415 `unsupported_media_type` | O-10, O-12, O-16 | `o10.wrongType` |
| 422 `validation_failed` | every write | field errors from `fields` (dotted paths, codes in contract 1.4) shown under the matching control |
| 422 `hash_mismatch`, `media_unreadable` | O-12, O-16, C-01 | resend once; unreadable shows `o12.upload.failed` / `o16.photo.readFailed` |
| 422 `receipt_code_invalid` | P-01 | `p01.formatError` |
| 423 `code_locked` | O-03 | `common.error.tooManyTries` with `Retry-After` |
| 429 `rate_limited` | every write, P-01, O-19 | `common.error.tooManyTries` with `Retry-After`; queued items wait |
| 503 `intake_paused` | O-11, O-15, O-16, C-01 | item stays queued; `o04.intakePaused`; retry after `Retry-After` (600 s) |
| 503 `service_unavailable`, other `5xx`, no response | every call | *Not confirmed yet* for writes (never *Received*); retry with the same key |

## Open questions for the owner

Each spec that depends on one of these links here by number. The specs follow the recommendation until the owner decides.

| # | Question | Recommendation in the specs |
|---|---|---|
| Q1 | After a report is received, may the phone keep a minimal index (id, receipt code, category, ward, status, time) so My reports works offline? | The specs follow contract 1.8 and keep nothing; the recommendation is yes, minimal index only, no text or media, removed by "Sign out and clear this phone". This needs the contract change in gap G9. |
| Q2 | Citizen receipt: should "Keep this code on this phone" default to on? | On. Losing the code means losing the status; only the code is kept, and the switch is visible on C-01. |
| Q3 | When a code is revoked with reports still queued on the phone, may the next code holder send them (server records the device link), or must they only be deleted? | Allow send or delete, as the plan says ("wait for the new code holder to clear or send them"). The server should mark them "sent after revocation" for reviewers. |
| Q4 | Blur faces: on phones without face detection, is "blurred on the server before anyone sees it" acceptable wording? | Yes; the hint says "Hides faces before it leaves this phone" only where the phone does it, otherwise the server-side wording. Needs one extra string once decided. |
| Q5 | A video longer than 60 s: trim to the first 60 s on the phone, or refuse and ask to record again? | Trim and say so on the item. |
| Q6 | Dictation uses the phone browser's speech engine, which may send audio to its provider. Keep it (with a line in the privacy notice), or turn it off? | Keep, disclosed in the privacy notice; the keyboard microphone is offered where the browser has no engine. |
| Q7 | Allow more than one open incident draft? | No: one draft keeps the flow simple; O-15 opens the existing draft with `o15.draftExists`. |
| Q8 | SMS short code: until a commercial short code exists, show the gateway sandbox number? | Yes, from one config value (`SMS_SHORT_CODE`). |
| Q9 | Should changing a PIN end the code's other sessions? | No (revocation does that). There is no change-PIN contract yet (gap G12), so this waits for it. |
| Q10 | May a citizen answer a reviewer's question with the receipt code alone (from another phone or after clearing)? | The contract says no: REP-07 needs the receipt secret (`X-Receipt-Secret`). The specs follow the contract; see gap G11 for what would make "yes" possible. |
| Q11 | Hausa uses the masculine/neutral "ka" form throughout, as most Hausa apps do. Keep, or use a neutral construction? | Keep for the drafts; owner to confirm. |

## Message keys these specs need

The specs use these keys, which are not in `frontend/messages/*.json` yet (the message files were not changed in this pass). All five languages need them; use the glossary terms.

| Key | Where | Meaning |
|---|---|---|
| `errors.<code>` and `errors.field.<code>` families | all | contract 1.4: one text per error code and field code |
| `common.status.needsAttention` (+ `…Hint`) | R1, O-13, O-14 | an outbox item the server refused for good, with its reason |
| `o03.signIn.pinHint`, `o03.signIn.pinFormat` | O-03 | now say 6 digits (personal PIN) or 8 digits (setup PIN on the card) |
| `o14.question.alreadyAnswered` | O-14 | the question was answered or closed; send the text as a message |
| `o15.answer.notSeen`, `o15.note` | O-15 | third answer "I did not see"; optional note per stage |
| `o16.numbers.checkThis` | O-16 | "Check this number" for confidence below 0.75 |
| `o18.thread.flag`, flag reasons (`names_a_person`, `too_specific_location`, `abusive`, `other`), `o18.thread.more`, `o18.thread.noUnitCode` | O-18 | flag a post; load more; "Name the ward, not the polling unit." |
| `o20.keepCopies`, `o20.signOut.everywhere` | O-20 | "Keep copies on this phone"; sign out everywhere |
| `p01.question.needSecret` | P-01 | replying needs the phone that sent the report |

Keys that stay in the files but are unused until a gap closes: `o03.signIn.triesLeft` (G1), `o14.conversation.notAssigned` (G10), `o18.thread.earlier` (replaced by `o18.thread.more`), `p01.result.category` (REP-06 returns no category). `o17.*` has no snippet text (G8).


## Contract gaps

Found while reconciling the screen specs with [api-contracts.md](../api-contracts.md) on 22 Nov 2026. The contracts were not changed. Each row is something a screen needs that the contracts do not give, or a point where the two genuinely disagree on behaviour. The specs follow the contract and refer to the row by number (`G1` to `G15`).

| # | Screen | What it needs (or where they disagree) | Proposed contract change |
|---|---|---|---|
| G1 | O-03 | The spec showed "tries left" (`o03.signIn.triesLeft`) after wrong PINs. AUTH-02 returns the same body and timing for unknown and known codes, so a count would reveal which codes exist. Genuine disagreement. | Keep the contract: no count. Delete the `o03.signIn.triesLeft` key; the first signal is `423 code_locked`. |
| G2 | O-03 | AUTH-03 refuses a new PIN equal to the first 6 digits of the setup PIN but does not say which field code it returns (`pin_reused` is in the catalogue, in 1.4). | State in AUTH-03 that this case returns `fields.new_pin.code = pin_reused`. |
| G3 | O-04 | Home needs the total number of reports and a count of checklist stages received today; REP-07 (old home summary) no longer exists, and REP-02 `counts` has only `open_questions` and `unread_messages`. Home now costs three requests (AUTH-07, REP-02, DIS-01) on 2G. | Add `counts.reports_total` (and optionally `counts.checklist_stages_today`) to REP-02, so one `GET /reports?limit=1` feeds Home. |
| G4 | O-07 | The observer app should preload the states the organisation covers; REF-01 says to use "the organisation's coverage area from AUTH-07 → ADM-04", but AUTH-07 `organisation` has only `id`, `name`, `intake_paused` and ADM-04 is org_admin only. | Add `coverage_area: {state_codes, lga_codes}` to `me.user.organisation` in AUTH-02, AUTH-03 and AUTH-07. |
| G5 | O-16 | REP-01 requires `result_sheet.votes` keys to equal the organisation's `party_labels`, but only ADM-04 (org_admin) returns them, so an observer cannot know which fields to show. | Add `party_labels` to `me.user.organisation` (same place as G4), or to the REF-01 index. |
| G6 | O-16 | The spec allowed an unreadable or blank field and an all-blank sheet. REP-01 takes integers 0 to 99 999 for `registered`, `accredited`, `rejected` and every `votes` label, with no `null`. | Allow `null` for a field the observer could not read, excluded from `confirmed_fields` and flagged to the reviewer. |
| G7 | O-08 | The spec allowed "Another day" with the time unknown. REP-01 `occurred_at` is a full date and time. | Add optional `occurred_precision: "time" \| "date"` (date-only stored at 00:00 and shown to reviewers as a date), or accept that the time is required (what the spec now does). |
| G8 | O-17 | The Messages list showed the first line of the latest reviewer text. REP-02 has no message text, and MSG-01 per row is one request per report on 2G. | Add `last_message: {author, snippet (≤ 120), created_at}` to REP-02 items when `has_messages=true`. |
| G9 | O-04, O-13, O-17, R8 | Spec question Q1 recommends a minimal on-phone index of received reports (id, receipt code, category, ward, status, time) and cached Home counts so lists work offline. Contract 1.8 and REP-02 say server items are not stored on the phone. Genuine disagreement; the specs follow the contract (offline lists show only outbox items). | Amend 1.8 and REP-02 (Offline) to allow the minimal index (no text, no media, no messages), cleared by "Sign out and clear this phone"; or keep the contract and accept that My reports and Messages are empty offline. Owner decision (Q1). |
| G10 | O-14 | The spec showed `o14.conversation.notAssigned` when no reviewer is assigned. REP-03 gives `can_message` but does not say whether a reviewer is assigned or what `can_message` means before assignment. | Add `reviewer_assigned: boolean` to REP-03 and define `can_message` (true while the report is not closed or withdrawn, assigned or not). |
| G11 | P-01, C-01 | Spec question Q10 wanted a citizen to reply from another phone with the code alone. REP-06 returns no question text, and REP-07 needs `X-Receipt-Secret`, which is made on the sending phone and is not in the saved image. A cleared or second phone can see status only. Genuine disagreement; the specs follow the contract. | Either put the secret into the C-01 "Save as image" (as a QR or a short recovery key) with a P-01 field to paste it, which REP-07 already allows, or record that replies need the sending phone. |
| G12 | O-20 | "Change PIN" needs a call. AUTH-03 only sets the first PIN from a setup token; no contract changes an existing PIN. | Add `AUTH-08` `POST /api/v1/auth/observer/pin/change` with `{current_pin, new_pin}` → `204`; errors `401 invalid_credentials`, `423 code_locked`, `422` (`pin_too_simple`, `pin_reused`), `429`; say whether other sessions end. Until then the O-20 row is hidden. |
| G13 | O-18 | `unread_posts` in DIS-01 has no way to return to zero: DIS-02 does not say it marks posts read and there is no mark-read call. | Add `POST /api/v1/discussions/{id}/read` with `{up_to_post_id}` → `204` (like MSG-01 `mark_read`), or state that DIS-02 marks the returned posts read. |
| G14 | O-13, O-17 | REP-02 `has_messages` does not say whether it means "any message" or "needs the observer" (open question or unread). The screens need the second. | Define `has_messages` as any message, and add `needs_attention=true` (open question or unread) to REP-02. |
| G15 | O-12, O-14 | MED-01 replay after the upload session expired (24 h) is not defined: it could return the stored `200` for an upload that no longer exists. The spec starts a new session with a new `Idempotency-Key`. | State that MED-01 replay for an expired session returns `409 upload_expired`, so the client knows to use a new key. |
