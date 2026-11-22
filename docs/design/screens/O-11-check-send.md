# O-11 Check and send (step 7 of 7)

**Status:** READY for review · Route: `/o/new/check` · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Show everything once with a Change link per part, then send. Be honest about what happened: received, saved on this phone, or not confirmed yet.

## Entry and exit
- **Entry:** O-10 Continue / Continue without.
- **Exit:**
  - Online, REP-01 success → observer O-12, citizen C-01.
  - Offline, intake paused, session expired with "Not now", revoked → Home (observer) with the unsent banner; citizen: stays on this screen in the "saved on this phone" state with a Home link to P-02.
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
   - `o11.source`: `o09.sourceSelf` / `o09.sourceTold` (`firsthand` true / false).
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
| Success | REP-01 (observer) or REP-05 (citizen): `201`, or `200` on a replay (treated alike) | navigate (replace) to O-12 / C-01 with `id` and `receipt_code`. A `200` whose body has `status: "withdrawn"` means the report was withdrawn meanwhile: no receipt; the screen explains and offers Home. |
| Offline | no network at tap | item `queued`; status `o11.savedOffline` (wait badge `common.status.onPhone`); observer is taken to Home after 2 s showing the same message in the banner; nothing says "sent" |
| Not confirmed | timeout (20 s on 2G), network error, `5xx` or `503 service_unavailable` after the request left | status `o11.notConfirmed`, badge `common.status.notConfirmed`; automatic retry with the **same** `Idempotency-Key`, back-off 2 s, 4 s, 8 s up to 5 min with jitter, and at once on the browser `online` event (R4). `409 request_in_progress` and `429 rate_limited` wait for `Retry-After` and show the same state. |
| Intake paused | `503 intake_paused` (`Retry-After: 600`; only for a new key, a replay of an already received report still returns `200`) | `o11.intakePaused`; item `queued`, retried after `Retry-After` |
| Queue full | 20 items already queued | `o11.queueFull` with `max`=20; draft kept (not moved); Send disabled until space |
| Session expired | `401 not_authenticated` (observer only) | PIN sheet (R5, AUTH-02); on success the send continues automatically with the same keys; on "Not now" item `queued` |
| Revoked | `403 code_revoked` | item `waitingCode`; O-03 revoked view |
| Validation (server) | `422 validation_failed` with `fields` | item stops with *Needs your attention* (outbox state `needs_attention`, contract 1.7); each block shows the server's field error mapped to the step's key (dotted paths: `occurred_at` → When, `place.ward_code` and `place.polling_unit_code` → Where, `description` → What you wrote, `firsthand` → How you know, `danger_now` → Danger, `category_observer` and `access_barrier_details` → What happened; field codes `required`, `max_length`, `in_future`, `too_old`, `unknown_area`, `not_allowed_for_kind`); nothing lost, and Send resends with the same key (a 4xx stores nothing, so the key stays valid) |
| Key reused | `409 idempotency_key_reused` | item stops with *Needs your attention*; this is a client bug, so the screen offers `ui.retry` only after copying the draft to a new key |
| Bad request | `400 bad_request` / `400 idempotency_key_required` | same as key reused; never expected from the typed client |
| Too large | `413 payload_too_large` (body over 64 KB) | `o09.tooLong` on the description block |
| Rate limited | `429 rate_limited` (observer 60 new reports per hour; citizen 30 per 10 min per IP) | item stays `queued`, retried after `Retry-After` |
| Server error | `5xx`, `503 service_unavailable` | item stays `queued` and the loop retries it (R4). The screen shows `common.error.server` plus `o11.savedOffline`, then goes Home like the offline case. There is no second Send tap: the report is already in the outbox. |
| Empty | n/a | — |

## Message keys
`ui.stepOf`, `o11.*`, `o05.tile.*`, `o09.sourceSelf`, `o09.sourceTold`, `common.edit`, `common.wat`, `common.showAll`, `common.status.onPhone`, `common.status.notConfirmed`, `common.error.server`, `common.pinSheet.*`, `ui.back`.

## API
- **REP-01** `POST /api/v1/reports` (observer; `Idempotency-Key` from the draft, made once when the item enters the outbox; `X-Device-Time` set at each send). Body for `kind: "incident"`: `kind`, `language` (the UI language now), `occurred_at`, `place: {polling_unit_code | null, ward_code}`, `device_saved_at`, `category_observer`, `access_barrier_details` (only with `access_barrier`), `danger_now`, `firsthand`, `description`, `input_method`, and `related_report_id` plus `from_checklist_question` when the incident was raised from a checklist answer on O-15 (the phone fills `related_report_id` at send time, once that checklist report has its server `id`; the outbox sends oldest first, so it has).
- **REP-05** `POST /api/v1/public/reports` for citizens (anonymous, CSRF from AUTH-01): the same incident fields, `kind` must be `"incident"`, plus `receipt_secret` (43 characters, made on the phone). No `related_report_id`.
- Response `201` (or `200` replay): `{id, receipt_code, kind, status: "received", received_at, version: 0, media_upload: {max_items, max_total_bytes}}` (REP-05 adds `channel: "citizen"`). That is all the receipt needs; the phone already has the content. Media are not declared in the request: they follow on O-12 with MED-01.
- The phone-side outbox states are `draft`, `on_device`, `not_confirmed`, `needs_attention` (contract 2.1); R1 maps them to the screen words.
- Intake pause, session expiry and revocation reach this screen as error codes (table above), not from a separate intake call.
- Data the screen needs and the contract provides: a replay returns the same `id` and `receipt_code` with `200` (never `409`).

## Logic notes
- Send moves the draft into the outbox in one IndexedDB transaction, then sends. Even if the browser kills the tab mid-request, on reopen the item is `unconfirmed` and is resent with the same key (R1).
- After success, report text is deleted from the phone; media stays until each upload completes (R8). Media are sent only after the report has its server `id` (contract 1.7).
- Citizen first send: the receipt secret already exists in IndexedDB (made when the draft was created) and travels in the REP-05 body; the CSRF token (AUTH-01) is fetched at send time. If offline, the item queues with its key and secret.

## Accessibility
- Each Change link names its part. Status changes are announced politely; success moves focus to O-12's title.
- Focus never lands on a disabled button.

## Acceptance checks (Redmi)
1. Online: tap Send once; the receipt screen appears only after the server responds (watch the network log: one REP-01, or one REP-05 for a citizen).
2. Tap Send five times quickly: still one report on the server.
3. Airplane mode: Send shows "Saved on this phone..." and Home shows 1 unsent; the words "sent" or "received" appear nowhere.
4. Throttle to 2G, tap Send, switch airplane mode on after 1 s: the screen shows "Not confirmed yet"; turn network on: one receipt, no duplicate on the server.
5. Kill the app right after tapping Send online: reopen; within a minute the report shows as Received exactly once.
6. Tap Change on When, change the time, Continue: you return to Check and send with the new time.
