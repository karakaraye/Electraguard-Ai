# O-13 My reports

**Status:** READY for review · Route: `/o/reports` · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
One honest list of every report this observer made: what is still on this phone, what is received, and what needs them.

## Entry and exit
- **Entry:** Home "My reports"; O-16 after send; links in banners.
- **Exit:** a row → O-14. Back → Home.

## Layout
**Phone 360 px** (`AppShell`, title `o13.title`, Back):
1. Filter as a 3-option segmented radio: `o13.filter.all` (default), `o13.filter.needsYou` (open question or unread message), `o13.filter.onPhone` (queued, unconfirmed, waitingCode). Each option shows its count in brackets when > 0.
2. Freshness line `o13.updated` (`--t-small`), or `o13.offlineList` when offline.
3. List of `ReportRow`: category pictogram, label (`o05.tile.*`, or `o13.checklistStage` with `o15.stage.*`, or `o13.resultSheet`), place (unit name or `o13.unknownPlace` + ward), observed time (relative within 24 h via `common.time.*`, else date), `StatusBadge` with the status key (R1). Rows with an open question show the attn badge first. Sorted: needs-you first, then on-phone, then newest received.
4. No pinned button (the list is the content; reporting lives on Home).

**Tablet 768 px:** list on the left (max 420 px), selected report detail (O-14) on the right at ≥ 900 px.

## States
| State | Trigger | What shows |
|---|---|---|
| Loading | first open with no cache | `EmptyState`-sized static text `o13.loading` (no spinner shimmer) |
| Filled | REP-02 + local outbox merged | rows |
| Empty | no reports at all | `EmptyState` `o13.empty` with one action: `o04.report` → O-05 |
| Empty filter | filter has no rows | `o13.emptyFilter` |
| Offline | no network | cached index (R8) + outbox items; line `o13.offlineList` |
| Server error | REP-02 fails | cached rows kept; `Banner` `o13.loadError` with `ui.retry` |
| Session expired | REP-02 `session_expired` | cached rows; PIN sheet only when the observer pulls to refresh or taps Try again |

## Message keys
`o13.*`, `o05.tile.*`, `o15.stage.*`, `common.status.*`, `common.time.*`, `o04.report`, `ui.retry`, `ui.back`.

## API
- **REP-02** list: per report `{ref, type, categoryId, checklistStage?, wardName, pollingUnitName?, observedAt, receivedAt, status, outcome?, hasOpenQuestion, unreadCount, withdrawable}`. Paged (50), newest first.
- Local outbox and minimal index merged by `clientReportId` (an outbox item that becomes received is replaced by the server row, never shown twice).

## Logic notes
- Pull-to-refresh and refresh on screen focus (at most once per 30 s).
- Only the minimal index of received reports is cached (R8); the list never shows report text.

## Accessibility
- Each row is one link; accessible name: "category, place, time, status".
- The filter is a radio group; changing it announces the result count politely.

## Acceptance checks (Redmi)
1. With one queued and two received reports, All shows three rows with the queued one marked "On this phone"; "On this phone" filter shows one.
2. When the queued report is received, it appears once (not twice) as Received.
3. A reviewer's formal question moves that report to the top with "Question for you".
4. Offline: the list still shows, with the "Offline. Showing what this phone knows" line.
5. A new observer sees "No reports yet" and a Report something button.
