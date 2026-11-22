# O-11 Check and send (step 7 of 7)

**Status:** READY for review · Route: `/o/new/check` · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Show everything once with a Change link per part, then send. Be honest about what happened: received, saved on this phone, or not confirmed yet.

## Entry and exit
- **Entry:** O-10 Continue / Continue without.
- **Exit:**
  - Online, REP-01 success → observer O-12, citizen C-01.
  - Offline, paused, session expired with "Not now", revoked → Home (observer) with the unsent banner; citizen: stays on this screen in the "saved on this phone" state with a Home link to P-02.
  - Not confirmed (timeout) → stays here in the not-confirmed state; when the retry returns the receipt, it moves on to O-12/C-01 automatically if the screen is still open; otherwise Home shows it as received.
  - Each `common.edit` link → that step in edit-return mode.
- **Back:** → O-10, nothing lost. After a successful send, Back is not possible (route replaced).

## Layout
**Phone 360 px** (`AppShell`, `Stepper` 7 of 7):
1. Title `o11.title`; hint `o11.hint`.
2. Summary as a definition list, one block per part, each with a right-aligned `common.edit` link (48 px target, accessible name "Change: What happened"):
   - `o11.what`: category pictogram + `o05.tile.*` label (+ access barriers if any).
   - `o11.danger`: `o11.dangerYes` (danger icon) or `o11.dangerNo`.
   - `o11.where`: unit, ward, LGA (or ward only).
   - `o11.when`: formatted WAT time + `common.wat`.
   - `o11.description`: full text (first 6 lines, then `common.showAll`; never truncated without a way to see all).
   - `o11.source`: `o09.sourceSelf` / `o09.sourceTold`.
   - `o11.evidence`: thumbnails with count, or `o11.noEvidence`.
3. Status area (`aria-live="polite"`), empty until a send attempt.
4. Pinned: primary `o11.send` (danger reports: same button, no colour change).

**Tablet 768 px:** summary in two columns (what/danger/where/when left, description/source/evidence right).

## States
| State | Trigger | What shows |
|---|---|---|
| First view | arrive from O-10 | summary; Send enabled |
| Incomplete | a required part missing (draft edited elsewhere) | that block shows its step's error text and the Change link; Send focuses the first incomplete block |
| Sending | tap Send online | button `o11.sending`, disabled, width kept; the draft is moved to the outbox **before** the request (state `sending`), so app kill cannot lose it |
| Success | REP-01 201/200 | navigate (replace) to O-12 / C-01 with the receipt |
| Offline | no network at tap | item `queued`; status `o11.savedOffline` (wait badge `common.status.onPhone`); observer is taken to Home after 2 s showing the same message in the banner; nothing says "sent" |
| Not confirmed | timeout (20 s on 2G) or connection drop after the request left | status `o11.notConfirmed`, badge `common.status.notConfirmed`; automatic retry with same key (R4) |
| Intake paused | REP-01 `intake_paused` | `o11.intakePaused`; item `queued` |
| Queue full | 20 items already queued | `o11.queueFull` with `max`=20; draft kept (not moved); Send disabled until space |
| Session expired | `session_expired` | PIN sheet (R5); on success the send continues automatically; on "Not now" item `queued` |
| Revoked | `code_revoked` | item `waitingCode`; O-03 revoked view |
| Validation (server) | REP-01 `validation` with field errors | each block shows the server's field error mapped to the step's key; nothing lost |
| Server error | 5xx | item stays `queued` and the loop retries it (R4). The screen shows `common.error.server` plus `o11.savedOffline`, then goes Home like the offline case. There is no second Send tap: the report is already in the outbox. |
| Empty | n/a | — |

## Message keys
`ui.stepOf`, `o11.*`, `o05.tile.*`, `o09.sourceSelf`, `o09.sourceTold`, `common.edit`, `common.wat`, `common.showAll`, `common.status.onPhone`, `common.status.notConfirmed`, `common.error.server`, `common.pinSheet.*`, `ui.back`.

## API
- **REP-01** create report, type `incident`. Request: `clientReportId` (idempotency key, from the draft), `categoryId`, `accessBarriers`, `danger`, `pollingUnitId|null`, `wardId`, `observedAt`, `observedPrecision`, `description`, `source`, `nameCheckAcknowledged`, `attachments: [{clientAttachmentId, type, size, durationSeconds}]` (declared so the server can show "3 items expected"), `locale`, `channel: "app"`, reporter (observer session or citizen token from AUTH-06).
- Response: `ref`, `receiptCode`, `receivedAt`, `status: "received"`, `attachments: [{clientAttachmentId, uploadState}]`.
- **REP-06** checked before send when the last known state is paused.
- Data the screen needs and the API must provide: replays must return the same receipt (README flag 2).

## Logic notes
- Send moves the draft into the outbox in one IndexedDB transaction, then sends. Even if the browser kills the tab mid-request, on reopen the item is `unconfirmed` and is resent with the same key (R1).
- After success, report text is deleted from the phone; media stays until each upload completes (R8).
- Citizen first send: AUTH-06 runs first if no token yet; if offline, the citizen item queues with the device secret and the token is fetched on send.

## Accessibility
- Each Change link names its part. Status changes are announced politely; success moves focus to O-12's title.
- Focus never lands on a disabled button.

## Acceptance checks (Redmi)
1. Online: tap Send once; the receipt screen appears only after the server responds (watch the network log: one REP-01).
2. Tap Send five times quickly: still one report on the server.
3. Airplane mode: Send shows "Saved on this phone..." and Home shows 1 unsent; the words "sent" or "received" appear nowhere.
4. Throttle to 2G, tap Send, switch airplane mode on after 1 s: the screen shows "Not confirmed yet"; turn network on: one receipt, no duplicate on the server.
5. Kill the app right after tapping Send online: reopen; within a minute the report shows as Received exactly once.
6. Tap Change on When, change the time, Continue: you return to Check and send with the new time.
