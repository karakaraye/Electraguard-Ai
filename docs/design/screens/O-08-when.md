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
   Another day → `<input type="date">` `o08.dateLabel` (max = today WAT, min = 30 days ago) and `<input type="time">` `o08.timeLabel` (**required**: REP-01 `occurred_at` is a full date and time and has no "time unknown" form; contract gap G7).
4. Note `o08.watNote` with clock icon, always visible.
5. Pinned: primary `common.continue`.

**Tablet 768 px:** options in one row of three; inputs below.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | new | Just now selected |
| Filled | option + inputs set | inputs show the values |
| Validation: future | the chosen time is later than now + 5 min, using the phone clock corrected by AUTH-07 `server_time` (the server checks against `X-Device-Time` + 5 min) | `o08.future` under the time input; Continue blocked. A server `422` with `fields.occurred_at.code = in_future` returns the observer here from O-11 with the same text. |
| Validation: empty | Earlier today with no time, or Another day with no date or no time | `o08.error` |
| Too old | date more than 30 days before today, or server `422` `fields.occurred_at.code = too_old` | `o08.error` (the date picker's min already prevents it) |
| Old date | date more than 7 days before today | `Sheet` `o08.old.title`, `o08.old.body`, primary `o08.old.confirm` → continue; secondary `o08.old.change` → closes sheet, focus to date input |
| Offline | always works | — |
| Sending / server / success / empty | n/a | — |

## Message keys
`ui.stepOf`, `o08.*`, `common.continue`, `ui.back`, `ui.close`.

## API
None called by this step. Draft field: `occurred_at` (ISO 8601 with an explicit offset; a time without an offset is rejected with `invalid_datetime`). "Just now" stores the moment Continue is tapped on this step, not the send time, so a report queued for hours keeps the right observed time. Sent with REP-01 (and REP-05); the server stores `received_at` separately and returns times in West Africa Time (+01:00). REP-01 also takes `device_saved_at` (set when the draft moves to the outbox) and the `X-Device-Time` header (set at each send); the server uses them to record clock skew for reviewers.
- **AUTH-07** `server_time` (read on app open and at each sign-in) tells the phone when its clock is more than 10 minutes off.

## Logic notes
- All comparisons in WAT (UTC+1, no daylight saving) regardless of the phone's time zone setting. If the phone clock is clearly wrong (AUTH-07 `server_time` differs by more than 10 minutes), the server's offset is applied to "now" and to the future check.
- Dates up to 30 days old are accepted: older than 7 days only asks for confirmation (a client step, contract REP-01); older than 30 days is refused by the server (`too_old`).

## Accessibility
- Segmented control is a radio group labelled by the title; revealed inputs are placed directly after the selected option in focus order and announced.
- Native date/time pickers are used for TalkBack compatibility.

## Acceptance checks (Redmi)
1. Continue straight away: the check screen later shows "Just now" with the time.
2. Earlier today, set a time 1 hour ahead: the future message shows and Continue does not pass.
3. Another day, pick a date 10 days ago: the confirmation sheet appears; "Yes, the date is right" continues; "Change the date" returns to the date field.
4. Set the phone's time zone to London: an "Earlier today" time still saves and displays in West Africa Time.
5. Queue a report offline for 2 hours, then send: reviewers see the observed time from step 4, not the send time.
