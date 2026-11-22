# O-08 When did it happen? (step 4 of 7)

**Status:** READY for review · Route: `/o/new/when` · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Record the observed time in West Africa Time with the fewest taps; "Just now" is the default.

## Entry and exit
- **Entry:** O-07 Continue; O-11 Change on When.
- **Exit:** Continue → O-09 (or O-11). If the date is more than 7 days ago, a confirmation `Sheet` appears first.
- **Back:** → O-07, value kept.

## Layout
**Phone 360 px** (`AppShell`, `Stepper` 4 of 7):
1. Title `o08.title`.
2. `WhenPicker` segmented control, three full-width stacked options (radio), 56 px each: `o08.justNow` (selected by default), `o08.earlierToday`, `o08.anotherDay`.
3. Earlier today → native `<input type="time">` labelled `o08.timeLabel`, defaulting to the current time rounded down to 5 minutes.
   Another day → `<input type="date">` `o08.dateLabel` (max = today WAT) and `<input type="time">` `o08.timeLabel` (optional; empty means "time unknown").
4. Note `o08.watNote` with clock icon, always visible.
5. Pinned: primary `common.continue`.

**Tablet 768 px:** options in one row of three; inputs below.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | new | Just now selected |
| Filled | option + inputs set | inputs show the values |
| Validation: future | the chosen time (in WAT) is later than now + 5 min tolerance | `o08.future` under the time input; Continue blocked |
| Validation: empty | Earlier today with no time, or Another day with no date | `o08.error` |
| Old date | date more than 7 days before today | `Sheet` `o08.old.title`, `o08.old.body`, primary `o08.old.confirm` → continue; secondary `o08.old.change` → closes sheet, focus to date input |
| Offline | always works | — |
| Sending / server / success / empty | n/a | — |

## Message keys
`ui.stepOf`, `o08.*`, `common.continue`, `ui.back`, `ui.close`.

## API
None on this step. Draft fields: `observedAt` (ISO 8601 with `+01:00`), `observedPrecision: "now" | "time" | "date"`. "Just now" stores the moment Continue is tapped on this step, not the send time, so a report queued for hours keeps the right observed time. Sent with REP-01; the server stores `receivedAt` separately (plan section 3).

## Logic notes
- All comparisons in WAT (UTC+1, no daylight saving) regardless of the phone's time zone setting. If the phone clock is clearly wrong (server `Date` header differs by > 10 min on the last successful call), the server's offset is used for "now" and the future check.
- Never block a date older than 7 days; only confirm.

## Accessibility
- Segmented control is a radio group labelled by the title; revealed inputs are placed directly after the selected option in focus order and announced.
- Native date/time pickers are used for TalkBack compatibility.

## Acceptance checks (Redmi)
1. Continue straight away: the check screen later shows "Just now" with the time.
2. Earlier today, set a time 1 hour ahead: the future message shows and Continue does not pass.
3. Another day, pick a date 10 days ago: the confirmation sheet appears; "Yes, the date is right" continues; "Change the date" returns to the date field.
4. Set the phone's time zone to London: an "Earlier today" time still saves and displays in West Africa Time.
5. Queue a report offline for 2 hours, then send: reviewers see the observed time from step 4, not the send time.
