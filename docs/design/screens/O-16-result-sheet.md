# O-16 Check the result sheet

**Status:** READY for review · Route: `/o/checklist/results/sheet` · Observers only · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Capture the numbers on the **publicly posted** result sheet of the observer's own polling unit, so reviewers can run a consistency check on that one sheet. It must be impossible to mistake this screen for a result.

## Hard safeguards (from plan 4.5; a reviewer rejects any build that breaks one)
- The banner `o16.notResult` ("Consistency check for review. This is not a result.") is pinned at the top of every view of this screen, in every state, and is not dismissible.
- The phone never adds numbers, never shows a total, a difference, a percentage, a ranking or a winner. Party labels come from the organisation's settings (`party_labels`, default `A` to `E`; see contract gap G5 for how the observer app receives them) and are synthetic in all test data.
- The observer is not told whether the numbers "add up". They type what is written; the server checks; only reviewers see flags.
- Nothing from this screen appears on any public surface.

## Entry and exit
- **Entry:** O-15 Results posted → Yes → `o15.checkSheet`.
- **Exit:** Send for review → O-13 (row "Result-sheet check", status per R1). Back → O-15.
- **Back:** photo view → O-15; numbers view → photo view (photo and numbers kept in the draft).

## Layout
Two views in one route (`?view=photo|numbers`).

### Photo view (phone 360 px)
1. Pinned under the top bar: `Banner` info `o16.notResult` (half-filled circle icon, `--info`).
2. Title `o16.title`; text `o16.rules`.
3. Heading `o16.photo.title`; tip `o16.photo.tip`.
4. Large buttons `o16.photo.take` and `o16.photo.file`; after capture: preview (pinch to zoom), `o16.photo.retake`.
5. Quiet link `o16.photo.skip` → numbers view without a photo.
6. Pinned: primary `common.continue` (enabled after a photo exists).

### Numbers view
1. Same pinned banner.
2. Title `o16.numbers.title`; hint `o16.numbers.hint`.
3. If RS-01 returned values: a line `o16.numbers.suggested` with the "Suggested" label style (server reads are suggestions only).
4. Photo thumbnail (tap to view full size beside the fields on tablet; full screen on phone with a Close button).
5. Fields in sheet order, each `Field` with `inputmode="numeric"`, tabular figures, hint `o16.numbers.blank`:
   `o16.numbers.registered`, `o16.numbers.accredited`, one `o16.numbers.party` per party label (`votes.A` … `votes.E` and any other label in `party_labels`), `o16.numbers.rejected`.
   A suggested value (`fields.*.value`) is pre-filled and marked with a small "Suggested" tag until the observer edits or confirms the field (tap on the field counts as seen; the tag changes to nothing once the value is touched). A field whose `confidence` is below 0.75 also carries `o16.numbers.checkThis` ("Check this number", new key, see README). A field with `value: null` (not readable) is left empty and the observer types it.
6. Checkbox `o16.confirm`: ticking it confirms every field the observer has filled against the posted sheet; those names are sent as `result_sheet.confirmed_fields` (`registered`, `accredited`, `votes.A`, …, `rejected`). Fields left out of `confirmed_fields` are still accepted and flagged to the reviewer, so an unticked box could be sent, but this screen still requires the tick.
7. Pinned: primary `o16.send` (`o16.sending`).

**Tablet 768 px:** photo on the left at full height with zoom, fields on the right, so the observer compares side by side.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | arriving | photo view |
| Reading | online, photo taken → RS-01 (the photo goes in the request itself; nothing is uploaded first) | `o16.photo.reading` with honest progress text; the observer may tap skip to type meanwhile |
| Suggestions | RS-01 `201` (or `200` replay) | numbers pre-filled with Suggested tags; `ocr_id` is kept for REP-01; `expires_at` is 24 h away, after which the photo is deleted and the report would have to upload it again |
| Read failed | RS-01 `422 media_unreadable` ("We could not read this photo…"), or every `value` null | `o16.photo.readFailed`; empty fields; the photo is kept to upload with the report |
| Photo rejected | RS-01 `413 payload_too_large` (over 2 MiB), `415 unsupported_media_type`, `422 hash_mismatch` (resend once) | `o10.tooBig` / `o10.wrongType` / `o16.photo.readFailed`; observer may retake or skip |
| Rate limited | RS-01 `429 rate_limited` (20 per hour per observer) | `common.error.tooManyTries`; the observer types the numbers instead |
| Offline | no network | `o16.photo.offline`; empty fields; the report is sent with `entry_method: "manual"` (typed) and the photo goes through MED-01..03 after REP-01; the server then reads the attached photo and shows any disagreement to the reviewer only. (`offline_ocr`, an on-phone reader, is out of scope for the hackathon build.) |
| Validation | non-digits → `o16.numbers.notNumber`; > 99 999 for any field → `o16.numbers.tooBig` (server `max_value`, `limit` 99999); negative (server `min_value`, `limit` 0); checkbox not ticked → `o16.confirmError`; server `422` for `result_sheet.votes` keys that do not match `party_labels` → `common.error.server` (client bug) | errors under fields; no arithmetic validation at all |
| Sending / offline send / not confirmed / paused / session / revoked | REP-01 `kind: "result_sheet"` | same as O-11 (`503 intake_paused`, `401 not_authenticated`, `403 code_revoked`, timeouts); on success → O-13 |
| Server error | `5xx`, `503 service_unavailable` | as O-11 |
| Empty | all fields blank | cannot be sent as blank: REP-01 takes integers 0 to 99 999 for every field (contract gap G6). Until the contract allows `null`, the observer must type a number (0 or more) for each field, or not send. |

## Message keys
`o16.*` (all), `common.continue`, `common.status.*`, `o11.savedOffline`, `o11.notConfirmed`, `o11.intakePaused`, `common.error.server`, `ui.back`, `ui.close`.

## API
- **RS-01** `POST /api/v1/result-sheets/ocr` (`multipart/form-data`: `file`, the photo, ≤ 2 MiB under the photo rules, and `sha256`, hex; `Idempotency-Key`; 20 per hour) → `{ocr_id, expires_at, fields: {registered: {value, confidence}, accredited, votes: {A: {value, confidence}, …}, rejected}, model_version, notice_key: "result_sheet.not_a_result"}`. `value: null` means not read; confidence below 0.75 shows "Check this number". Never totals. The `notice_key` text is the same sentence as `o16.notResult`; the banner always shows it whether or not RS-01 was called. The photo is held 24 h; unused OCR photos are deleted at `expires_at`.
- **REP-01** `POST /api/v1/reports` with `kind: "result_sheet"`, `language`, `occurred_at`, `place`, `device_saved_at`, `related_report_id` (the Results-posted checklist report when there is one), and `result_sheet: {registered, accredited, rejected, votes: {A: …}, confirmed_fields, ocr_id, entry_method}`: `entry_method` is `ocr_confirmed` when RS-01 filled the fields, `manual` otherwise. `ocr_id` attaches the RS-01 photo without uploading it again (it must be the same observer's and unexpired). Without an `ocr_id` the photo follows with **MED-01..03** (`purpose: "evidence"`) after REP-01. There is no per-field source (typed or suggested) in the contract.
- Party labels: REP-01 requires `votes` keys to equal the organisation's `party_labels` (ADM-04, default `A`–`E`). ADM-04 is org_admin only, and REF-01 and AUTH-07 do not carry the labels, so the observer app has no way to read them (contract gap G5).
- Result-sheet check flags are never returned to the observer (REP-03 omits them); only reviewers see them. Nothing from this screen reaches a public surface.

## Accessibility
- The not-a-result banner is the first thing read after the title on each view (`role="note"`), and it is repeated in the Send button's description (`aria-describedby`).
- Each Suggested field has the word "Suggested" in its accessible description until touched.
- Full-screen photo viewer has a visible Close and returns focus to the thumbnail.

## Acceptance checks (Redmi)
1. The sentence "Consistency check for review. This is not a result." is visible on both views, in every language, without scrolling, at 360 px.
2. Enter numbers where accredited is larger than registered: no warning appears on the phone; the report sends (the server's checks are never shown to the observer).
3. Nowhere on the screen is a sum, difference or winner shown.
4. Offline: the photo is kept, the "type the numbers" message shows, and the report queues with `entry_method: "manual"` and the photo.
5. With RS-01 values, each pre-filled field shows "Suggested" until touched, and a field under 0.75 confidence also says "Check this number".
6. Send without ticking the box: the tick error shows and focus moves to the box.
