# O-06 Is anyone in danger right now? (step 2 of 7) + Get safe first

**Status:** READY for review · Route: `/o/new/danger` (view `emergency` at `/o/new/danger?help`) · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Ask one yes/no question. If yes, show emergency guidance at once (move to safety, call 112) and say plainly that the app does not send help. Then let the person continue or finish later.

## Entry and exit
- **Entry:** Continue on O-05; O-11 Change on Danger.
- **Exit:**
  - "No" → saves `danger=false` and goes straight to O-07 (no Continue tap needed; one tap is one answer).
  - "Yes" → saves `danger=true`, sets urgency to top, and shows the emergency view.
  - Emergency view: `o06.emergency.continue` → O-07; `o06.emergency.later` → Home with the draft kept (the draft card on Home says "Continue your report").
  - `tel:112` link opens the phone dialler (works without data; the browser leaves the app, the draft is already saved).
- **Back:** question view → O-05. Emergency view → question view (answer kept, shown selected).

## Layout
### Question view (phone 360 px)
1. `Stepper` 2 of 7.
2. Title `o06.title`; hint `o06.hint`.
3. `YesNo`: two full-width buttons stacked, 64 px each, 16 px apart: `o06.yes` (danger triangle icon, `--danger` outline), `o06.no`.
4. No pinned primary (YesNo is the action).

### Emergency view
1. Title `o06.emergency.title` with `--danger` triangle icon.
2. Ordered list, `--t-body-lg`, numbers in tabular figures: `step1`, `step2`, `step3`.
3. Large `Button` danger: `o06.emergency.call` as `<a href="tel:112">`, 64 px, phone icon.
4. Paragraph `o06.emergency.noDispatch` (`--ink`, weight 600). This line is never hidden or collapsed.
5. Pinned bottom: primary `o06.emergency.continue`; quiet `o06.emergency.later` above it.

**Tablet 768 px:** YesNo side by side; emergency content centred max 34 rem.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | arriving from O-05 | neither selected |
| Filled (returning) | Back from O-07 or edit-return | previous answer selected |
| Validation error | n/a (no Continue); in edit-return mode, if somehow empty, `o06.error` | — |
| Emergency | Yes | emergency view; `aria-live` not used, focus moves to its title |
| Offline | always works | 112 link works without data |
| Server / sending / success / empty | n/a | none |

## Message keys
`ui.stepOf`, `o06.title`, `o06.hint`, `o06.yes`, `o06.no`, `o06.error`, `o06.emergency.*`, `ui.back`.

## API
None on this step. The draft field `danger: boolean` is sent with REP-01; the server sets urgency. The app never calls any emergency service, never shares location, and never shows a "help is coming" message.

## Logic notes
- Changing Yes → No later (from O-11) clears the urgency flag; the emergency view is not shown again for No.
- Choosing Yes again from O-11 shows the emergency view again (safety over speed).
- The 112 number is a constant in one config file (`frontend/lib/config.ts`, `EMERGENCY_NUMBER`), so it is changed in one place if needed.

## Accessibility
- YesNo is a radio group labelled by the title; selecting an option moves on, and focus lands on the next screen's title.
- The Call button's accessible name is "Call 112" in the locale; it is a link, so TalkBack says "link".

## Acceptance checks (Redmi)
1. Tap No: the Where step opens immediately.
2. Tap Yes: "Get safe first" opens with three steps, a Call 112 button and the sentence that the app does not send help.
3. Tap Call 112 in airplane mode: the dialler opens with 112 filled in (do not place the call during tests; cancel it). Return to the app: the draft is intact.
4. Tap "Finish the report later": Home shows "Continue your report"; continuing opens Where (the answer Yes is kept).
5. In every language, the no-dispatch sentence is visible without scrolling at 360 px and 100% text.
