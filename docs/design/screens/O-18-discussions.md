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
2. Section `o18.invitations` (only DIS-01 items with `membership: "invited"`): each invitation as a bordered block (the one place a bordered block is used on this screen, because it needs a decision): `title` (the moderator's title, plain text), `o18.invite.from` (always "Moderator"; staff are never named), `o18.invite.area` (`area.ward_name` or `area.lga_name`; never finer), `o18.invite.rules`, buttons secondary `o18.invite.join` and quiet `o18.invite.decline`. An invited observer can open the thread but sees only the title and area, no posts (DIS-02).
3. Section `o18.joined` (`membership: "member"`): rows with `title`, area, `o18.members` (`member_count`), `o18.closesAt` (`closes_at`, or `o18.closed` when `status: "closed"`), `unread_posts`. Observers never receive `left` or `removed` discussions.
4. No pinned button.

### Thread
1. Title = `discussion.title`; sub-line `discussion.topic`, area and `o18.closesAt`. Menu: `o18.thread.leave` and, on a post, `o18.thread.flag` (new key, see README).
2. Note `o18.thread.shareNote` at the top (`--ink-2`, info icon), always visible.
3. Posts oldest first. The thread loads from the first post and pages forward with `after` and `next_after` (quiet button `o18.thread.more`, new key, replaces `o18.thread.earlier`: DIS-02 has no way to page backwards). Each post: `author_label` (an observer code in tabular figures, or `Moderator` shown bold as `o18.thread.moderator`) or `o18.thread.you` when `is_me`; time from `created_at`; `body`. A post with `state: "hidden"` (its `body` is `null`) keeps its place and shows `o18.thread.hidden` in `--ink-3`. Queued posts show `o18.thread.queued`. Each post of another member has a quiet `o18.thread.flag` action (DIS-03.flag) with the four reasons `names_a_person`, `too_specific_location`, `abusive`, `other` (new keys, see README).
4. Composer pinned above the keyboard: `TextArea` `o18.thread.postLabel` with hint `o18.thread.postHint` (shown on first focus), 1000-character limit (DIS-03) with `ui.charCount` shown from 800, primary `o18.thread.post` (`o18.thread.posting`). No attachment button exists.

**Tablet 768 px:** list left, thread right.

## States
| State | Trigger | What shows |
|---|---|---|
| Loading | no cache | `o18.loading` |
| Empty | no invitations, no memberships (deep link) | `EmptyState` `o18.empty` |
| Filled | DIS-01 `GET /api/v1/discussions?status=open` | sections |
| Join / decline sending | DIS-04 `{action: "accept" | "decline"}` | buttons show progress label; on success (`membership: "member"` after accept, `"declined"` after decline) the block moves to Your discussions / disappears; repeating the action returns the same result |
| Join refused | DIS-04 `409 invalid_transition` (for example accepting after removal), `409 discussion_closed`, `404 not_found` | the invitation block is removed and `o18.thread.removed` or `o18.closed` explains |
| Thread empty | no posts | `o18.thread.empty` |
| Posting | DIS-03.post | composer button `o18.thread.posting`; post appears with `queued` until confirmed (`201`, or `200` replay, `{post}`) |
| Offline | no network | posts already loaded this session; new posts queue (`queued`) and send in order with their `Idempotency-Key`; join, decline and leave are disabled with `ui.offline` (DIS-04 is a live action) |
| Validation | > 1000 characters → `o18.thread.tooLong` (server `max_length`); a polling-unit code in the text → server `422` `fields.body.code = contains_polling_unit_code` ("Name the ward, not the polling unit.", new key `o18.thread.noUnitCode`, see README); phone-number pattern or name heuristic (O-09) → the O-09 name warning text `o09.nameWarning` with `o09.nameKeep` (the server's own name check only flags a post for the moderator, it does not block) | composer |
| Closed | DIS-03 / DIS-04 `409 discussion_closed`, or `status: "closed"` / `closes_at` passed | `o18.closed` banner; composer removed; posts readable until the retention purge deletes them |
| Removed | DIS-03 `409 not_a_member`, or DIS-02 `404 not_found` after the moderator removed the observer | `o18.thread.removed`; back to list |
| Leave confirm | menu Leave | `Sheet` `o18.thread.leaveTitle`, `o18.thread.leaveBody`, primary `o18.thread.leaveConfirm` (DIS-04 `{action: "leave"}` → `membership: "left"`), secondary `ui.cancel` |
| Server error | `5xx` / `503 service_unavailable` | `o18.loadError` + `ui.retry`; `429 rate_limited` on posting (30 posts per hour per member) shows `common.error.tooManyTries` and keeps the text |
| Session / revoked | `401 not_authenticated` / `403 code_revoked` (R5) | as elsewhere |

## Message keys
`o18.*` (all; `o18.thread.flag`, the flag reasons, `o18.thread.more` and `o18.thread.noUnitCode` are new), `o09.nameWarning`, `o09.nameKeep`, `ui.charCount`, `ui.offline`, `ui.cancel`, `ui.retry`, `ui.back`, `ui.menu`.

## API
- **DIS-01** `GET /api/v1/discussions?status=open|closed&cursor=&limit=` → `{items: [{id, title, area, status, membership, member_count, unread_posts, last_post_at, closes_at}], next_cursor}`. `membership`: `invited`, `member` (observers do not see `left` or `removed`).
- **DIS-02** `GET /api/v1/discussions/{id}?after=<post_id>&limit=` → `{discussion: {id, title, topic, area, status, membership, closes_at}, posts: [{id, author_label, is_me, body, state, created_at}], next_after}`. For an invited observer: title and area only, no posts. `404 not_found` for a non-member who is not invited.
- **DIS-03.post** `POST /api/v1/discussions/{id}/posts` with `{body}` (1 to 1000), `Idempotency-Key` from when the post entered the queue → `{post}`. **DIS-03.flag** `POST /api/v1/discussions/{id}/posts/{post_id}/flag` with `{reason}` → `204`.
- **DIS-04** `POST /api/v1/discussions/{id}/membership` with `{action: "accept" | "decline" | "leave"}` → `{discussion_id, membership}`.
- Moderators use DIS-05 (S-08); this screen never calls it.
- Polling: DIS-02 with `after` = the last post id every 30 s while the thread is open.
- How `unread_posts` goes back to zero is not defined (no mark-read call, and DIS-02 does not say it marks posts read): contract gap G13. Until decided, the count clears only when the screen opens the thread and the phone treats the posts it has shown as read locally for the session.

## Logic notes
- Nothing in a discussion links to a report, a receipt code, or a place finer than ward. The phone does not offer "share to report": the observer types what they want into their own report (plan 4.8: only deliberate sharing).
- Posts are not cached after the app is closed (shared phones). Discussion posts are text only and carry no report data (contract DIS).

## Accessibility
- Posts are a list with each post's author and time read before the text; new posts announced politely ("New post from OBS-3M9Q").
- The composer hint is the field's description.

## Acceptance checks (Redmi)
1. With an invitation, Home shows the Discussions row; the list shows the invitation with the rule that others see your code but never your reports.
2. Join: the discussion moves to Your discussions; posts show authors as observer codes only.
3. Try to attach a photo: there is no way to.
4. Post a phone number: the warning appears; posting anyway works. Post a text containing a polling-unit code: the server refuses it with "Name the ward, not the polling unit."
5. After the moderator hides a post, it reads "A moderator hid this post."
6. After closing time, the composer is gone and the closed banner shows.
