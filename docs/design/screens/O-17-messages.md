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
2. List of rows sorted: open formal questions first (`has_open_question`, oldest `last_activity_at` first, so nothing waits too long), then unread messages (`unread_messages` > 0, newest `last_activity_at` first). Each row: category pictogram, category label (`o05.tile.*` from `category_observer`), `receipt_code` in tabular figures, place (`area.ward_name`), and either the attn badge `o17.questionTag` or the count `o17.newMessage` (`unread_messages`). A first line of the latest reviewer text is **not shown**: REP-02 has no message text and MSG-01 per report would cost one request per row (contract gap G8); the row opens O-14 for the text.
3. No pinned button.

**Tablet 768 px:** list left; O-14 conversation on the right at ≥ 900 px.

## States
| State | Trigger | What shows |
|---|---|---|
| Loading | no cache | `o17.loading` |
| Filled | REP-02 `has_messages=true`, then the phone keeps rows with `has_open_question` or `unread_messages` > 0 | rows |
| Empty | none | `EmptyState` `o17.empty` (no action button needed: there is nothing to do) |
| Offline | no network | `o17.offline` line; no rows (nothing of a received report is kept on the phone, see O-13 and G9) |
| Server error | `5xx` / `503 service_unavailable` | `o17.loadError` + `ui.retry`; rows already loaded this session kept |
| Session expired / revoked | `401 not_authenticated` / `403 code_revoked` (R5) | as Home |

## Message keys
`o17.*`, `o05.tile.*`, `ui.retry`, `ui.back`.

## API
- **REP-02** `GET /api/v1/reports?has_messages=true&cursor=&limit=`: items with `id`, `receipt_code`, `category_observer`, `area.ward_name`, `has_open_question`, `unread_messages`, `last_activity_at`, `status`; `counts: {open_questions, unread_messages}`. The contract does not say whether `has_messages` means "any message" or "unread or open question", so the phone filters the returned rows itself (contract gap G14).
- **MSG-01** is not called here (saves data); O-14 calls MSG-01.list and MSG-01.mark_read.
- Contract gap G8: no reviewer text in REP-02, so no snippet line.

## Accessibility
- Rows are links: "Question for you, Late or missing materials, report EG-…, Ward 3".
- Count changes announced politely when the list refreshes.

## Acceptance checks (Redmi)
1. A formal question and an ordinary message on two different reports: the question row is first with "Question for you".
2. Open the question row: O-14 opens at the question block.
3. After replying, the row leaves the list on the next refresh.
4. No messages: the empty sentence shows with no button.
