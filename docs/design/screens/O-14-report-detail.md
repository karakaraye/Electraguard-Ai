# O-14 Report detail

**Status:** READY for review · Route: `/o/reports/[id]` (`id` = the report `id` from REP-01/REP-02; queued items: `/o/reports/local-[client report id]`) · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Show one report's status, answer a reviewer's formal question, keep a private conversation with the assigned reviewer, see attachment status, and withdraw while review has not started.

## Entry and exit
- **Entry:** O-13 row; O-12 "See this report"; O-17 row; Home question banner "Answer".
- **Exit:** Back → where the observer came from (O-13 by default; Home if opened from the banner).
- After withdraw: stays on this screen in the withdrawn state.

## Layout
**Phone 360 px** (`AppShell`, title `o14.title` with `receipt_code` in tabular figures, Back):
1. Status block: `StatusBadge` (large) + plain explanation (`common.status.*Hint` where it exists; closed → outcome `common.outcome.*` + `o14.closedNote`).
2. Times: `o14.observed` (`occurred_at`), `o14.received` (`received_at`; or `o14.notSentYet` for local items). A withdrawn report shows only `received_at` and `withdrawn_at` (the stub holds nothing else).
3. **Question for you** (only when `status` is `question`, i.e. REP-03 `open_question` is set), pinned at the top of the content, attn background, diamond icon:
   heading `o14.question.title`, `open_question.body`, `TextArea` `o14.question.replyLabel` (1 to 2000 characters), button `o14.question.send` (secondary inside the block; it is the main action of this screen while a question is open and is the only filled button: the pinned area is empty in this state).
4. `o14.details` summary: category (`category_observer`), place (`area`), observed time, and `description` as returned by REP-03 (kind `incident`; for `checklist` and `result_sheet` the submitted answers or numbers, without any check flags). The text is fetched each time and held in memory only (contract 1.8), never written to the phone unless "Keep copies on this phone" is on (O-20). When REP-03 cannot be fetched (offline) the block shows `o14.contentNotKept` instead of the text.
5. `o14.attachments`: one `UploadItem` per `media[]` entry with server state (`processing` and `ready` show Saved; `failed` shows `o12.upload.missing`, the original was discarded and the observer is asked to add it again); thumbnails and playback via MED-04 (`variant=thumb` for photos, `poster` for video, `display` for audio) only when the observer taps a row (saves data). While `status` is `processing`, MED-04 answers `409 invalid_transition` ("still being prepared") and the row says so. When `can_add_media` is true, `o10.photo` / `o10.video` / `o10.voice` / `o10.file` add more (MED-01..03, same rules as O-12); when `can_withdraw` is true each row has `o10.remove` (MED-05.media).
6. Conversation `o14.conversation.title`: MSG-01.list items oldest first; each bubble labelled by `author` (`observer` → `o14.conversation.you`, `reviewer` → `o14.conversation.reviewer`; the server already sends `author_label` "You" / "Reviewer", never a staff name), time from `created_at`; `kind: "system"` items (for example "Report closed") show as a centred plain line; items with `kind: "formal_question"` carry the tag `o14.conversation.formalQuestion` and a diamond, and are visually different from ordinary messages (bordered block, not a bubble). Queued messages show `o14.conversation.queued` (wait).
   Composer (only when `can_message`): `TextArea` `o14.conversation.label` (1 to 2000 characters, or empty with an attachment), quiet button `o14.conversation.attach` (one photo or one voice note per message, uploaded with MED-01 `purpose: "message"` and counted in the report's 6 items and 60 MiB), secondary `o14.conversation.send`. The note `o14.conversation.notAssigned` cannot be driven: REP-03 does not say whether a reviewer is assigned (contract gap G10), so it is not shown until the contract adds a flag.
7. Danger zone at the bottom, separated by a rule:
   - `can_withdraw` (status `received`): secondary danger `o14.withdraw.button`.
   - Local (`on_device` or `needs_attention`, never sent): secondary danger `o14.deleteLocal.button` with note `o14.deleteLocal.note`; this deletes locally and calls no API (contract 2.3).

**Tablet 768 px:** status, question, details left; conversation right with the composer pinned at the bottom of that column.

## States
| State | Trigger | What shows |
|---|---|---|
| Loading | open with no cache | `o14.loading` text in place of the status block |
| On this phone | local item | badge `onPhone`, `o14.notSentYet`, summary from the local outbox (full text visible, since it has not been sent), Delete from this phone, `o04.sendNow` button when online |
| Not confirmed | local `unconfirmed` | badge + `common.status.notConfirmedHint` |
| Received | server | received explanation; Withdraw visible |
| In review | server | Withdraw hidden; conversation available |
| Question for you | server, open formal question | question block on top; reply required to clear it |
| Reply sending / queued / sent | MSG-02 `kind: "reply"` | `o14.question.sending` → `o14.question.sent` (the screen takes the status from the response's `report_status`, `in_review`) or `o14.question.queued` offline. A queued reply names its `reply_to` question, not a report version (contract 1.6), so unrelated staff changes never break it. |
| Question already closed | MSG-02 `409 question_closed` | the text stays in the box and `o14.question.alreadyAnswered` (new key, see README) offers to send it as an ordinary message (`kind: "message"`, same text and a new key) |
| Writes refused | MSG-02 `409 report_closed` / `409 report_withdrawn` | composer removed; the screen reloads REP-03 and shows Closed or Withdrawn; the unsent text stays visible so it can be copied |
| Closed | server, `status: "closed"` with `outcome` (`corroborated`, `insufficient_evidence`, `out_of_scope`) | outcome + `o14.closedNote`; composer hidden (`can_message` false); Withdraw hidden; existing attachments still open (MED-04), new ones refused (`409 report_closed`) |
| Withdrawn | server (`status: "withdrawn"`, REP-04 `200`, repeated withdraws also `200`) | `o14.withdraw.done`; everything else hidden except `received_at` and `withdrawn_at` |
| Withdraw confirm | tap Withdraw | `Sheet` `o14.withdraw.title`, `o14.withdraw.body`, primary danger `o14.withdraw.confirm` (sends REP-04.observer `{confirm: true}`), secondary `o14.withdraw.keep` |
| Withdraw too late | REP-04.observer `409 withdraw_unavailable` | sheet closes; `Banner` `o14.withdraw.tooLate`; REP-03 refreshed (status is now `in_review`; the conversation is offered) |
| Withdraw of an unconfirmed report | local `not_confirmed` | the phone first replays REP-01 with its key to learn the `id` (contract 2.3), then calls REP-04.observer; if the replay shows the report was never received, it is simply deleted locally |
| Attachment remove too late | MED-05 `409 invalid_transition` | row stays; `o14.withdraw.tooLate` wording for attachments (a reviewer has started) |
| Withdraw offline | no network | `o14.withdraw.offline` inside the sheet; confirm disabled (withdraw is never queued: the observer must see it succeed) |
| Empty conversation | no messages | `o14.conversation.empty` |
| Offline | no network | status and conversation not shown (nothing of a received report is stored, see G9); queued local messages shown with a note; composer works (messages queue and send in order after the report) |
| Server error | `5xx` / `503 service_unavailable` on REP-03 or MSG-01 | `o14.loadError` + `ui.retry`; status already loaded this session is kept; `404 not_found` (not the owner, or never existed) shows `o14.loadError` with no retry |
| Session expired / revoked | `401 not_authenticated` / `403 code_revoked` (R5) | PIN sheet (AUTH-02) / revoked view |

## Message keys
`o14.*` (all), `common.status.*`, `common.outcome.*`, `o12.upload.*`, `o04.sendNow`, `o05.tile.*`, `common.discard.*` (local delete), `ui.retry`, `ui.back`, `ui.close`.

## API
- **REP-03** `GET /api/v1/reports/{id}` → `{id, receipt_code, kind, channel, status, outcome, language, category_observer, access_barrier_details, danger_now, firsthand, description, checklist, result_sheet, area, occurred_at, received_at, closed_at, withdrawn_at, media: [{id, kind, status, size_bytes, duration_ms, blurred, exif_removed, created_at}], open_question: {id, body, asked_at} | null, can_withdraw, can_add_media, can_message}`. `404 not_found` for a report that is not the observer's.
- **MSG-01.list** `GET /api/v1/reports/{id}/messages?cursor=&limit=` (oldest first) → `{items: [{id, kind, author, author_label, body, attachment, question_state, reply_to, created_at, read}], next_cursor}`. `kind`: `formal_question`, `reply`, `message`, `system`; `question_state`: `open`, `answered`, `closed_unanswered`.
- **MSG-01.mark_read** `POST /api/v1/reports/{id}/messages/read` with `{up_to_message_id}` → `204`, sent when the conversation has been on screen (this clears `unread_messages` in REP-02).
- **MSG-02** `POST /api/v1/reports/{id}/messages` with `{kind: "message" | "reply", body, reply_to, attachment_media_id}`; `Idempotency-Key` from when the item entered the outbox, `X-Device-Time` at send. `reply` requires `reply_to` = the open question's id. Response `201`/`200`: `{message, report_status, version}`. Errors: `409 question_closed`, `409 report_closed`, `409 report_withdrawn`, `422` (for example `reply_to` `required`, `attachment_media_id` `invalid`), `404`, `429` (60 per hour).
- **REP-04.observer** `POST /api/v1/reports/{id}/withdraw` with `{confirm: true}` → the withdrawn stub `{id, receipt_code, kind, channel, status: "withdrawn", received_at, withdrawn_at, version}`. Never queued, never optimistic.
- **MED-04** `GET /api/v1/media/{media_id}/content?variant=display|thumb|poster` for the observer's own media (a `302` to a 60-second link or a stream; `<img>`, `<video>` and `<audio>` follow it).
- **MED-01 / MED-02 / MED-03 / MED-05** for adding or removing attachments (see O-12).
- Polling: REP-03 and MSG-01.list every 30 s while open and online. The contract has no push and no `ETag` for these.

## Logic notes
- A reply to a formal question is sent as MSG-02 `kind: "reply"` with `reply_to` = `open_question.id`; the server moves the status back to In review and says so in `report_status`. The phone never changes the status itself.
- Withdraw is server-only (never optimistic, never queued) because it deletes content and must not be undone by a stale queue.
- Message text is cleared from the phone after the server confirms it; the conversation is fetched again with MSG-01.list when online (R8, contract 1.8). Offline, only messages not yet sent are shown with a note. Discussion posts are never copied into a report automatically: the observer types or pastes what they want into a message here.

## Accessibility
- Focus on arrival: the question block's heading if a question is open, otherwise the title.
- New reviewer messages announced politely ("New message from reviewer").
- The withdraw sheet traps focus, starts on "Keep it" (safe default), and returns focus to the Withdraw button when closed.

## Acceptance checks (Redmi)
1. Received report: Withdraw is visible; confirm; the screen says "You withdrew this report", and the reviewer side shows only a stub.
2. After a reviewer starts review, Withdraw is gone (`can_withdraw` false); if a withdraw races it, the observer sees the "review has started" message (`withdraw_unavailable`).
3. Reviewer sends a formal question: it shows at the top in the attn block; reply; the status becomes Being reviewed.
4. Reviewer sends an ordinary message: it appears as a bubble, status unchanged.
5. Write a message in airplane mode: it shows "On this phone"; with network back it sends once.
6. A queued (never sent) report shows its full text and "Delete from this phone"; a received one shows its text only while online (fetched from REP-03), and the "full text is not kept here" line when offline.
