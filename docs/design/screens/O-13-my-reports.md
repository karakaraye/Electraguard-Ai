# O-13 My reports

**Status:** READY for review · Route: `/o/reports` · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
One honest list of every report this observer made: what is still on this phone, what is received, and what needs them.

## Entry and exit
- **Entry:** Home "My reports"; O-16 after send; links in banners.
- **Exit:** a row → O-14. Back → Home.

## Layout
**Phone 360 px** (`AppShell`, title `o13.title`, Back):
1. Filter as a 3-option segmented radio: `o13.filter.all` (default), `o13.filter.needsYou` (`has_open_question` or `unread_messages` > 0, filtered on the phone from the REP-02 rows, contract gap G14), `o13.filter.onPhone` (outbox: `on_device`, `not_confirmed`, `needs_attention`, waitingCode). Each option shows its count in brackets when > 0.
2. Freshness line `o13.updated` (`--t-small`), or `o13.offlineList` when offline.
3. List of `ReportRow`: category pictogram, label (`o05.tile.*` from `category_observer`, or `o13.checklistStage` with `o15.stage.*` from `checklist_stage` when `kind` is `checklist`, or `o13.resultSheet` when `kind` is `result_sheet`), place (`area.polling_unit_name` or `o13.unknownPlace` + `area.ward_name`), `occurred_at` (relative within 24 h via `common.time.*`, else date), `StatusBadge` with the status key (R1; `withdrawn` stubs show the withdrawn badge with no category or place). Rows with an open question show the attn badge first. Sorted: needs-you first, then on-phone, then by `last_activity_at` descending (the order REP-02 returns).
4. No pinned button (the list is the content; reporting lives on Home).

**Tablet 768 px:** list on the left (max 420 px), selected report detail (O-14) on the right at ≥ 900 px.

## States
| State | Trigger | What shows |
|---|---|---|
| Loading | first open, REP-02 in flight | `EmptyState`-sized static text `o13.loading` (no spinner shimmer) |
| Filled | REP-02 + local outbox merged | rows; further pages with `next_cursor` (50 per page) |
| Empty | no reports at all | `EmptyState` `o13.empty` with one action: `o04.report` → O-05 |
| Empty filter | filter has no rows | `o13.emptyFilter` |
| Offline | no network | outbox items only, plus the line `o13.offlineList`. The contract says server items are not stored on the phone (1.8), so received reports are not listed offline until contract gap G9 is decided (spec question Q1). |
| Server error | `5xx` / `503 service_unavailable` on REP-02 | rows already loaded this session are kept; `Banner` `o13.loadError` with `ui.retry`; `422 validation_failed` (bad filter) is a client bug and shows the same banner |
| Session expired | REP-02 `401 not_authenticated` | rows kept; PIN sheet (R5) only when the observer pulls to refresh or taps Try again |

## Message keys
`o13.*`, `o05.tile.*`, `o15.stage.*`, `common.status.*`, `common.time.*`, `o04.report`, `ui.retry`, `ui.back`.

## API
- **REP-02** `GET /api/v1/reports?kind=&status=&has_messages=&cursor=&limit=50` (own reports only). Each item: `{id, receipt_code, kind, category_observer, checklist_stage, area, occurred_at, received_at, status, outcome, has_open_question, unread_messages, last_activity_at, media_count}`; response also `next_cursor` and `counts: {open_questions, unread_messages}`. Withdrawn stubs are included with `status: "withdrawn"` and null content fields. The row id for O-14 is `id` (the route `[ref]` is this `id`; `receipt_code` is the human code).
- REP-02 has no `withdrawable` flag: the list does not need it, O-14 reads `can_withdraw` from REP-03.
- Local outbox merged by the draft's `client report id` (UUID, also the `Idempotency-Key`): an outbox item that becomes received is replaced by the server row, never shown twice. The merge is done by `useReportState` (contract REP-02, Offline).
- Server items are kept in memory for the session only (contract 1.8); nothing about a received report is written to IndexedDB unless the observer turns on "Keep copies on this phone" in O-20.

## Logic notes
- Pull-to-refresh and refresh on screen focus (at most once per 30 s).
- The list never shows report text. Whether a minimal index of received reports (id, receipt code, category, ward, status, time) may stay on the phone is contract gap G9 and spec question Q1; until decided, nothing of a received report is kept.

## Accessibility
- Each row is one link; accessible name: "category, place, time, status".
- The filter is a radio group; changing it announces the result count politely.

## Acceptance checks (Redmi)
1. With one queued and two received reports, All shows three rows with the queued one marked "On this phone"; "On this phone" filter shows one.
2. When the queued report is received, it appears once (not twice) as Received.
3. A reviewer's formal question moves that report to the top with "Question for you".
4. Offline: the outbox items still show, with the "Offline. Showing what this phone knows" line; received reports show again when the network returns.
5. A new observer sees "No reports yet" and a Report something button.
