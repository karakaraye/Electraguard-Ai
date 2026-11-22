# O-17 Messages

**Status:** READY for review · Route: `/o/messages` · Observers only · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
List the reports where a reviewer is waiting for the observer (formal question) or has written something new. The conversation itself lives on O-14; this is the inbox.

## Entry and exit
- **Entry:** Home "Messages".
- **Exit:** a row → O-14 (scrolled to the question block or the newest message). Back → Home.

## Layout
**Phone 360 px** (`AppShell`, title `o17.title`, Back):
1. Hint `o17.hint`.
2. List of rows sorted: open formal questions first (oldest question first, so nothing waits too long), then unread messages (newest first). Each row: category pictogram, category label (`o05.tile.*`), ref in tabular figures, place (ward), and either the attn badge `o17.questionTag` or the count `o17.newMessage`; the first line of the latest reviewer text (one line, with ellipsis; full text on O-14).
3. No pinned button.

**Tablet 768 px:** list left; O-14 conversation on the right at ≥ 900 px.

## States
| State | Trigger | What shows |
|---|---|---|
| Loading | no cache | `o17.loading` |
| Filled | REP-02 filter `needsYou` (or REP-07 list) | rows |
| Empty | none | `EmptyState` `o17.empty` (no action button needed: there is nothing to do) |
| Offline | no network | cached rows + `o17.offline` line |
| Server error | fails | `o17.loadError` + `ui.retry`; cached rows kept |
| Session expired / revoked | R5 | as Home |

## Message keys
`o17.*`, `o05.tile.*`, `ui.retry`, `ui.back`.

## API
- **REP-02** with `filter=needsYou`: rows with `hasOpenQuestion`, `unreadCount`, `latestReviewerSnippet` (≤ 120 characters), `categoryId`, `wardName`, `ref`.
- **MSG-01** not called here (saves data); called on O-14.
- Flag: the snippet is a short piece of the reviewer's own text; it is fetched, shown, and not cached beyond the session (R8).

## Accessibility
- Rows are links: "Question for you, Late or missing materials, report EG-…, Ward 3".
- Count changes announced politely when the list refreshes.

## Acceptance checks (Redmi)
1. A formal question and an ordinary message on two different reports: the question row is first with "Question for you".
2. Open the question row: O-14 opens at the question block.
3. After replying, the row leaves the list on the next refresh.
4. No messages: the empty sentence shows with no button.
