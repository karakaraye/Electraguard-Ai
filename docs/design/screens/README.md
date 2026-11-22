# Observer and citizen screens (phase D1)

**Status:** READY for review · 22 Nov 2026 · Binding: [design-contract.md](../design-contract.md). Behaviour: [hackathon-plan.md](../../hackathon-plan.md) sections 2–4 and 8.

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
| O-12 | Receipt (observer) | `/o/reports/[ref]?just-sent` | [O-12-receipt.md](O-12-receipt.md) |
| O-13 | My reports | `/o/reports` | [O-13-my-reports.md](O-13-my-reports.md) |
| O-14 | Report detail | `/o/reports/[ref]` | [O-14-report-detail.md](O-14-report-detail.md) |
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

### R1. Report states on the phone (one source: `useReportState(ref)`)

| Local state | Shown as (key) | Badge | Entered when | Leaves when |
|---|---|---|---|---|
| `draft` | (not a report yet) | none | first value chosen on O-05 | Send on O-11, or deleted |
| `queued` | `common.status.onPhone` | `--wait` hollow circle | Send while offline, paused, session expired, or code revoked | sync loop starts sending |
| `sending` | `common.status.sending` | `--wait` | request in flight | response, or timeout |
| `unconfirmed` | `common.status.notConfirmed` | `--wait` | request timed out or connection dropped after send | retry returns the receipt |
| `received` and later | server status keys | per contract 4.2 | server returned a receipt (REP-01 201/200) | server status changes |
| `waitingCode` | `common.status.waitingCode` | `--attn` | code revoked while items are queued | new code signs in, or cleared |

- **Never** show `received` or a receipt code without a REP-01 success response. Animation of the receipt tick is triggered by that response only.
- App killed while `sending`: on next open, items in `sending` return to `unconfirmed` and are resent with the **same idempotency key**. The server returns the original receipt (replay), so there is never a duplicate.

### R2. Drafts

- A draft is created in IndexedDB the moment a category is chosen on O-05. It holds every step's values, attachment blobs (already stripped of location and resized), and a `clientReportId` (UUID v4) that becomes the idempotency key. The key is created **once per draft**, never per tap.
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
- Sync loop order: oldest report first; for each report, the text (REP-01) first, then each attachment (MED-01..04), then queued messages (MSG-02). Retries back off 5 s, 15 s, 45 s, then every 2 min while online; immediate retry when the browser `online` event fires or the user taps a "Send now" / `ui.retry` action.
- Limits (plan 4.6): 20 queued reports, 150 MB media. Over the limit: O-11 shows `o11.queueFull` and keeps the draft; O-10 shows `common.error.storageFull`.

### R5. Session, revocation, intake pause

- **Session expired** (any API returns `session_expired`): queue kept. Next send opens the `common.pinSheet.*` sheet (AUTH-04). "Not now" leaves items `queued`.
- **Code revoked** (`code_revoked` from any call, or AUTH-03 on open): all local session data is cleared, queued items move to `waitingCode`, and the O-03 revoked state is shown. A new code signing in on this phone is offered to send or delete those items (they were made on this phone; the server attributes them to the new code and records the device link, see open question Q3).
- **Intake paused** (REP-01 returns `intake_paused`, or REP-06 says paused): item stays `queued`; Home shows the `o04.intakePaused` banner; existing reports, messages and discussions keep working. The loop checks REP-06 every 2 min while paused.

### R6. Offline

- A network bar (`common.network.offline`) sits under the top bar on every screen while `navigator.onLine` is false **or** the last request failed with a network error. It is a `Banner` with `role="status"`, never auto-dismissed. When the network returns it shows `common.network.back` for 4 s while the queue flushes.
- Screens that only read server data show the last cached copy with its age (`o13.updated`) or an honest empty/offline message. No screen invents data.

### R7. Accessibility baseline

- Focus moves to the screen title (`h1`, `tabindex="-1"`) on every route change and step change; the title text is the step question, so TalkBack reads it first.
- Errors: the first invalid field gets focus; the error text is linked with `aria-describedby` and announced via `aria-live="assertive"`. Status changes (Saved, Sending 40%) use `aria-live="polite"`.
- Every `ChoiceTile` and `YesNo` is a radio group with a group label (the screen question).
- Targets ≥ 48 px; primary button 52 px; all screens tested at 200% text and 320 px without horizontal scroll.
- `lang` attribute follows the chosen locale; language names on O-01 carry their own `lang`.

### R8. Privacy on the phone

- After REP-01 succeeds, report text and media are deleted from the phone (media after each upload succeeds). The phone keeps only a **minimal index**: ref, receipt code, category id, local status, received time, ward name. Nothing else about a received report stays here. (Plan 2.4: no copy stays on shared phones by default.)
- No GPS API is ever called. Photos and videos have EXIF/metadata stripped on the phone before they enter the draft, and again on the server.
- Free text is checked on the phone for likely personal names (O-09) and phone numbers (O-09, O-14, O-18); the reporter decides.

## API contract ids used by these screens

`docs/design/api-contracts.md` (written by another author) is authoritative for payloads. This table is the meaning these specs **assume** for each id; if a number means something else there, align that document or this table before building.

| Id | Assumed meaning | Used by |
|---|---|---|
| AUTH-01 | Observer sign-in: code + PIN → session, or `pin_setup_required` with a short-lived setup token | O-03 |
| AUTH-02 | Set own PIN with setup token (first sign-in) | O-03 |
| AUTH-03 | Current session: code, organisation, expiry; returns `code_revoked` / `session_expired` | O-04 on open, all observer screens |
| AUTH-04 | Re-enter PIN to renew an expired session without losing the device's queue | PIN sheet (R5) |
| AUTH-05 | Sign out this device (ends this session; optional "clear" is local only) | O-20 |
| AUTH-06 | Citizen reporter token: the phone sends a random device secret, gets a reporter token | O-03 citizen path, C-01, P-01 reply |
| AUTH-07 | Change PIN (current + new) | O-20 |
| REF-01 | Reference data with version: states, LGAs, wards, polling units; category list; checklist questions; synthetic party labels for the active election | O-05, O-07, O-15, O-16 |
| REP-01 | Create report (type `incident` / `checklist` / `result_sheet`) with idempotency key → ref, receipt code, received time; replays return the same receipt | O-11, O-15, O-16 |
| REP-02 | List my reports (observer) with status, unread and question flags | O-04, O-13 |
| REP-03 | Report detail: status, timeline, outcome, attachments' server status, withdrawable flag | O-12, O-14 |
| REP-04 | Withdraw report (only while `received`; else `review_started`) | O-14, P-01 |
| REP-05 | Status lookup by receipt code (public; rate limited) | P-01 |
| REP-06 | Intake state for the organisation (open / paused) and current limits | O-04, O-11, sync loop |
| REP-07 | Home summary: counts of reports, questions waiting, unread messages, discussion invites | O-04 |
| MED-01 | Start an upload for a report attachment (ref, client attachment id, size, type) → upload id, chunk size | O-12 |
| MED-02 | Upload one chunk (resumable) | O-12 |
| MED-03 | Complete upload → server-side metadata strip and scan → `saved` | O-12 |
| MED-04 | Upload status / resume offset | O-12 (after app kill) |
| MED-05 | Fetch own attachment thumbnail or audio for viewing (short-lived URL) | O-14 |
| MSG-01 | Conversation on a report: messages, formal questions, which question is open | O-14, O-17, P-01 |
| MSG-02 | Send a message or a reply to a formal question (idempotency key; `replyToQuestionId` optional) | O-14, P-01 |
| DIS-01 | List my discussion invitations and joined discussions | O-04, O-18 |
| DIS-02 | Accept or decline an invitation | O-18 |
| DIS-03 | Discussion posts (paged, newest last) | O-18 |
| DIS-04 | Create a post (text only; idempotency key) | O-18 |
| DIS-05 | Leave a discussion | O-18 |
| ASK-01 | Ask a question → approved answer with sources, or `no_approved_answer` | O-19 |
| RS-01 | Read a result-sheet photo (OCR) → suggested numbers per field, with per-field confidence | O-16 |

### What the API must provide (flags for the contracts author)

1. Every error body uses one stable `code` the screens can branch on: `network` is local; server codes needed: `validation`, `session_expired`, `code_revoked`, `pin_setup_required`, `wrong_credentials` (+ `triesLeft`), `locked` (+ `retryAfterSeconds`), `intake_paused`, `queue_limit`, `review_started`, `not_found`, `rate_limited` (+ `retryAfterSeconds`), `too_large`, `unsupported_type`, `discussion_closed`, `not_member`.
2. REP-01 must accept the client `clientReportId` as the idempotency key **and** the client's observed time, and return `receivedAt` (server time). A replay must return 200 with the original receipt, not 409.
3. REP-01 must accept a report with zero attachments and allow attachments to be added afterwards against the returned ref (MED-01 with ref), because the receipt is shown before media finishes.
4. REP-02/REP-03 must include `withdrawable: boolean` and `hasOpenQuestion: boolean`, so the phone never guesses.
5. REF-01 must be versioned (`version`, `etag`) and compact enough to cache: the polling-unit list for the configured states should stay under ~400 KB gzipped, or be split per state.
6. REP-05 must return only: status, category id, received time, last change time, open question text (if any), outcome. Never text, media, place below ward, or reporter type of other reports.
7. MSG-01 must mark which item is a **formal question** and whether it is still open.
8. DIS-03 must return authors only as observer code or `moderator`, and a `hidden` flag (content removed) for moderated posts.
9. RS-01 returns suggestions only; it must not return totals, sums, winners or any cross-unit data.
10. REP-07 should be one small call so Home costs one request on 2G.

## Open questions for the owner

Each spec that depends on one of these links here by number. The specs follow the recommendation until the owner decides.

| # | Question | Recommendation in the specs |
|---|---|---|
| Q1 | After a report is received, may the phone keep a minimal index (ref, receipt code, category, ward, status, time) so My reports works offline? | Yes, minimal index only; no text or media (R8). "Sign out and clear this phone" removes it. |
| Q2 | Citizen receipt: should "Keep this code on this phone" default to on? | On. Losing the code means losing the status; only the code is kept, and the switch is visible on C-01. |
| Q3 | When a code is revoked with reports still queued on the phone, may the next code holder send them (server records the device link), or must they only be deleted? | Allow send or delete, as the plan says ("wait for the new code holder to clear or send them"). The server should mark them "sent after revocation" for reviewers. |
| Q4 | Blur faces: on phones without face detection, is "blurred on the server before anyone sees it" acceptable wording? | Yes; the hint says "Hides faces before it leaves this phone" only where the phone does it, otherwise the server-side wording. Needs one extra string once decided. |
| Q5 | A video longer than 60 s: trim to the first 60 s on the phone, or refuse and ask to record again? | Trim and say so on the item. |
| Q6 | Dictation uses the phone browser's speech engine, which may send audio to its provider. Keep it (with a line in the privacy notice), or turn it off? | Keep, disclosed in the privacy notice; the keyboard microphone is offered where the browser has no engine. |
| Q7 | Allow more than one open incident draft? | No: one draft keeps the flow simple; O-15 opens the existing draft with `o15.draftExists`. |
| Q8 | SMS short code: until a commercial short code exists, show the gateway sandbox number? | Yes, from one config value (`SMS_SHORT_CODE`). |
| Q9 | Should changing a PIN end the code's other sessions? | No (revocation does that); easy to switch on in AUTH-07. |
| Q10 | May a citizen answer a reviewer's question with the receipt code alone (from another phone or after clearing)? | Yes, rate limited and length capped. |
| Q11 | Hausa uses the masculine/neutral "ka" form throughout, as most Hausa apps do. Keep, or use a neutral construction? | Keep for the drafts; owner to confirm. |
