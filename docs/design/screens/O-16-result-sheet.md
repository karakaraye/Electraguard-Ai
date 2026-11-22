# O-16 Check the result sheet

**Status:** READY for review · Route: `/o/checklist/results/sheet` · Observers only · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Capture the numbers on the **publicly posted** result sheet of the observer's own polling unit, so reviewers can run a consistency check on that one sheet. It must be impossible to mistake this screen for a result.

## Hard safeguards (from plan 4.5; a reviewer rejects any build that breaks one)
- The banner `o16.notResult` ("Consistency check for review. This is not a result.") is pinned at the top of every view of this screen, in every state, and is not dismissible.
- The phone never adds numbers, never shows a total, a difference, a percentage, a ranking or a winner. Party labels come from REF-01 and are synthetic (A–E) in all test data.
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
3. If RS-01 returned suggestions: a line `o16.numbers.suggested` with the "Suggested" label style (contract rule 7).
4. Photo thumbnail (tap to view full size beside the fields on tablet; full screen on phone with a Close button).
5. Fields in sheet order, each `Field` with `inputmode="numeric"`, tabular figures, hint `o16.numbers.blank`:
   `o16.numbers.registered`, `o16.numbers.accredited`, one `o16.numbers.party` per label from REF-01 (A, B, C, D, E…), `o16.numbers.rejected`.
   A suggested value is pre-filled and marked with a small "Suggested" tag until the observer edits or confirms the field (tap on the field counts as seen; the tag changes to nothing once the value is touched).
6. Checkbox `o16.confirm`.
7. Pinned: primary `o16.send` (`o16.sending`).

**Tablet 768 px:** photo on the left at full height with zoom, fields on the right, so the observer compares side by side.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | arriving | photo view |
| Reading | online, photo taken → MED upload + RS-01 | `o16.photo.reading` with honest progress text; the observer may tap skip to type meanwhile |
| Suggestions | RS-01 ok | numbers pre-filled with Suggested tags |
| Read failed | RS-01 no fields / low confidence everywhere | `o16.photo.readFailed`; empty fields |
| Offline | no network | `o16.photo.offline`; empty fields; photo kept and uploaded with the report later (on-phone OCR is out of scope for the hackathon build; plan says "later confirmed online") |
| Validation | non-digits → `o16.numbers.notNumber`; > 99 999 for any field → `o16.numbers.tooBig`; checkbox not ticked → `o16.confirmError` | errors under fields; no arithmetic validation at all |
| Sending / offline send / not confirmed / paused / session / revoked | REP-01 | same as O-11; on success → O-13 |
| Server error | 5xx | as O-11 |
| Empty | all fields blank | allowed if the sheet is unreadable; the confirm box still required |

## Message keys
`o16.*` (all), `common.continue`, `common.status.*`, `o11.savedOffline`, `o11.notConfirmed`, `o11.intakePaused`, `common.error.server`, `ui.back`, `ui.close`.

## API
- **REF-01** party labels for the active election (synthetic A–E in test data) and field list.
- **MED-01..04** upload the photo against a temporary result-sheet draft id (or the ref after REP-01; flag: RS-01 needs the image before the report exists, so the contracts author must allow a "pre-report upload" with the draft's idempotency key, or RS-01 accepts the image bytes directly).
- **RS-01** `{imageUploadId}` → `{fields: [{fieldId, value, confidence: "high" | "medium" | "low"}]}`. Never totals.
- **REP-01** type `result_sheet`: `{clientReportId, pollingUnitId, fields: [{fieldId, value | null, source: "typed" | "suggested_confirmed" | "suggested_edited"}], photoAttachmentId?, confirmedAllChecked: true}`.
- The server runs the checks of plan 4.5 step 3; results go to reviewers only.

## Accessibility
- The not-a-result banner is the first thing read after the title on each view (`role="note"`), and it is repeated in the Send button's description (`aria-describedby`).
- Each Suggested field has the word "Suggested" in its accessible description until touched.
- Full-screen photo viewer has a visible Close and returns focus to the thumbnail.

## Acceptance checks (Redmi)
1. The sentence "Consistency check for review. This is not a result." is visible on both views, in every language, without scrolling, at 360 px.
2. Enter numbers where accredited is larger than registered: no warning appears on the phone; the report sends.
3. Nowhere on the screen is a sum, difference or winner shown.
4. Offline: the photo is kept, the "type the numbers" message shows, and the report queues with the photo.
5. With RS-01 suggestions, each pre-filled field shows "Suggested" until touched.
6. Send without ticking the box: the tick error shows and focus moves to the box.
