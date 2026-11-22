# O-18 Discussions (list and thread)

**Status:** READY for review · Routes: `/o/discussions`, `/o/discussions/[id]` · Observers only · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Let observers in the same area coordinate on a shared problem, opt-in, text only, identified only by observer code, without ever exposing anyone's reports (plan 4.8).

## Entry and exit
- **Entry:** Home "Discussions" (row exists only when there is an invitation or membership).
- **Exit:** list row → thread; Join → thread; Decline → invitation removed; Leave (thread menu) → list. Back: thread → list → Home.

## Layout

### List (phone 360 px)
1. Title `o18.title`; hint `o18.hint`.
2. Section `o18.invitations` (only if any): each invitation as a bordered block (the one place a bordered block is used on this screen, because it needs a decision): topic (moderator's title, plain text), `o18.invite.from`, `o18.invite.area` (ward or LGA name; never finer), `o18.invite.rules`, buttons secondary `o18.invite.join` and quiet `o18.invite.decline`.
3. Section `o18.joined`: rows with topic, area, `o18.members`, `o18.closesAt` (or `o18.closed`), unread count.
4. No pinned button.

### Thread
1. Title = topic; sub-line area + `o18.closesAt`. Menu: `o18.thread.leave`.
2. Note `o18.thread.shareNote` at the top (`--ink-2`, info icon), always visible.
3. Posts oldest first, paged upward ("Show earlier" as a quiet button). Each post: author as observer code in tabular figures, or `o18.thread.you`, or `o18.thread.moderator` (bold); time; text. Hidden posts show `o18.thread.hidden` in `--ink-3`. Queued posts show `o18.thread.queued`.
4. Composer pinned above the keyboard: `TextArea` `o18.thread.postLabel` with hint `o18.thread.postHint` (shown on first focus), 500-character limit with `ui.charCount`, primary `o18.thread.post` (`o18.thread.posting`). No attachment button exists.

**Tablet 768 px:** list left, thread right.

## States
| State | Trigger | What shows |
|---|---|---|
| Loading | no cache | `o18.loading` |
| Empty | no invitations, no memberships (deep link) | `EmptyState` `o18.empty` |
| Filled | DIS-01 | sections |
| Join / decline sending | DIS-02 | buttons show progress label; on success the block moves to Your discussions / disappears |
| Thread empty | no posts | `o18.thread.empty` |
| Posting | DIS-04 | composer button `o18.thread.posting`; post appears with `queued` until confirmed |
| Offline | no network | cached posts (this session only; R8); new posts queue (`queued`); join/decline/leave disabled with `ui.offline` |
| Validation | > 500 characters → `o18.thread.tooLong`; phone-number pattern or name heuristic (O-09) → the O-09 name warning text `o09.nameWarning` with `o09.nameKeep` | composer |
| Closed | `discussion_closed` or closesAt passed | `o18.closed` banner; composer removed; posts readable until deleted on schedule |
| Removed | `not_member` (moderator removed the observer) | `o18.thread.removed`; back to list |
| Leave confirm | menu Leave | `Sheet` `o18.thread.leaveTitle`, `o18.thread.leaveBody`, primary `o18.thread.leaveConfirm`, secondary `ui.cancel` |
| Server error | fails | `o18.loadError` + `ui.retry` |
| Session / revoked | R5 | as elsewhere |

## Message keys
`o18.*` (all), `o09.nameWarning`, `o09.nameKeep`, `ui.charCount`, `ui.offline`, `ui.cancel`, `ui.retry`, `ui.back`, `ui.menu`.

## API
- **DIS-01** `{invitations: [{id, topic, areaName, closesAt}], joined: [{id, topic, areaName, memberCount, closesAt, closed, unread}]}`.
- **DIS-02** `{id, accept: boolean}`.
- **DIS-03** posts `{id, before?}` → `[{id, author: "OBS-…" | "me" | "moderator", text | null, hidden, createdAt}]`.
- **DIS-04** post `{id, clientPostId, text}` (idempotent).
- **DIS-05** leave `{id}`.
- Polling DIS-03 every 30 s while the thread is open.

## Logic notes
- Nothing in a discussion links to a report, a receipt code, or a place finer than ward. The phone does not offer "share to report": the observer types what they want into their own report (plan 4.8: only deliberate sharing).
- Posts are not cached after the app is closed (shared phones).

## Accessibility
- Posts are a list with each post's author and time read before the text; new posts announced politely ("New post from OBS-3M9Q").
- The composer hint is the field's description.

## Acceptance checks (Redmi)
1. With an invitation, Home shows the Discussions row; the list shows the invitation with the rule that others see your code but never your reports.
2. Join: the discussion moves to Your discussions; posts show authors as observer codes only.
3. Try to attach a photo: there is no way to.
4. Post a phone number: the warning appears; posting anyway works.
5. After the moderator hides a post, it reads "A moderator hid this post."
6. After closing time, the composer is gone and the closed banner shows.
