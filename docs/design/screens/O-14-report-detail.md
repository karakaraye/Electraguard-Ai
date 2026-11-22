# O-14 Report detail

**Status:** READY for review · Route: `/o/reports/[ref]` (queued items: `/o/reports/local-[clientReportId]`) · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Show one report's status, answer a reviewer's formal question, keep a private conversation with the assigned reviewer, see attachment status, and withdraw while review has not started.

## Entry and exit
- **Entry:** O-13 row; O-12 "See this report"; O-17 row; Home question banner "Answer".
- **Exit:** Back → where the observer came from (O-13 by default; Home if opened from the banner).
- After withdraw: stays on this screen in the withdrawn state.

## Layout
**Phone 360 px** (`AppShell`, title `o14.title` with the ref in tabular figures, Back):
1. Status block: `StatusBadge` (large) + plain explanation (`common.status.*Hint` where it exists; closed → outcome `common.outcome.*` + `o14.closedNote`).
2. Times: `o14.observed`, `o14.received` (or `o14.notSentYet` for local items).
3. **Question for you** (only when `hasOpenQuestion`), pinned at the top of the content, attn background, diamond icon:
   heading `o14.question.title`, the reviewer's question text, `TextArea` `o14.question.replyLabel`, button `o14.question.send` (secondary inside the block; it is the main action of this screen while a question is open and is the only filled button: the pinned area is empty in this state).
4. `o14.details` summary: category, place, observed time. Text and media are **not kept on the phone** after receipt (R8): show `o14.contentNotKept` instead of the description.
5. `o14.attachments`: one `UploadItem` per attachment with server state (`o12.upload.*`); thumbnails via MED-05 only when the observer taps a row (saves data).
6. Conversation `o14.conversation.title`: messages oldest first; each bubble labelled `o14.conversation.you` / `o14.conversation.reviewer`, time; formal questions carry the tag `o14.conversation.formalQuestion` and a diamond, and are visually different from ordinary messages (bordered block, not a bubble). Queued messages show `o14.conversation.queued` (wait).
   Composer: `TextArea` `o14.conversation.label`, quiet button `o14.conversation.attach` (photo or voice under O-10 rules), secondary `o14.conversation.send`. When no reviewer is assigned: note `o14.conversation.notAssigned`.
7. Danger zone at the bottom, separated by a rule:
   - Received and `withdrawable`: secondary danger `o14.withdraw.button`.
   - Local (never sent): secondary danger `o14.deleteLocal.button` with note `o14.deleteLocal.note`.

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
| Reply sending / queued / sent | MSG-02 | `o14.question.sending` → `o14.question.sent` (status returns to In review on the server's word) or `o14.question.queued` offline |
| Closed | server | outcome + `o14.closedNote`; composer hidden; Withdraw hidden |
| Withdrawn | server | `o14.withdraw.done`; everything else hidden except times |
| Withdraw confirm | tap Withdraw | `Sheet` `o14.withdraw.title`, `o14.withdraw.body`, primary danger `o14.withdraw.confirm`, secondary `o14.withdraw.keep` |
| Withdraw too late | REP-04 `review_started` | sheet closes; `Banner` `o14.withdraw.tooLate`; status refreshed |
| Withdraw offline | no network | `o14.withdraw.offline` inside the sheet; confirm disabled (withdraw is never queued: the observer must see it succeed) |
| Empty conversation | no messages | `o14.conversation.empty` |
| Offline | no network | cached status + local queued messages; composer works (messages queue) |
| Server error | REP-03 fails | `o14.loadError` + `ui.retry`; cached status kept if any |
| Session expired / revoked | R5 | PIN sheet / revoked view |

## Message keys
`o14.*` (all), `common.status.*`, `common.outcome.*`, `o12.upload.*`, `o04.sendNow`, `o05.tile.*`, `common.discard.*` (local delete), `ui.retry`, `ui.back`, `ui.close`.

## API
- **REP-03** detail: `{ref, receiptCode, status, outcome?, observedAt, receivedAt, categoryId, wardName, pollingUnitName?, withdrawable, attachments: [{id, type, state}], assigned: boolean}`.
- **MSG-01** conversation: `[{id, author: "me" | "reviewer", kind: "message" | "question", text, attachment?, createdAt, open?}]`.
- **MSG-02** send `{ref, clientMessageId, text, replyToQuestionId?, attachment?}`; queued offline with its idempotency key.
- **REP-04** withdraw `{ref}` → `{status: "withdrawn"}` or `review_started`.
- **MED-05** short-lived URL for one thumbnail/audio.
- Polling: REP-03 + MSG-01 every 30 s while open and online (no push in the hackathon build; flag if the API offers SSE).

## Logic notes
- A reply to a formal question is sent with `replyToQuestionId`; the server moves the status back to In review. The phone never changes the status itself.
- Withdraw is server-only (never optimistic, never queued) because it deletes content and must not be undone by a stale queue.
- Message text is cleared from the phone after the server confirms it; the conversation is fetched again when online (R8). Offline, only messages not yet sent are shown with a note.

## Accessibility
- Focus on arrival: the question block's heading if a question is open, otherwise the title.
- New reviewer messages announced politely ("New message from reviewer").
- The withdraw sheet traps focus, starts on "Keep it" (safe default), and returns focus to the Withdraw button when closed.

## Acceptance checks (Redmi)
1. Received report: Withdraw is visible; confirm; the screen says "You withdrew this report", and the reviewer side shows only a stub.
2. After a reviewer starts review, Withdraw is gone; if two phones race, the second sees the "review has started" message.
3. Reviewer sends a formal question: it shows at the top in the attn block; reply; the status becomes Being reviewed.
4. Reviewer sends an ordinary message: it appears as a bubble, status unchanged.
5. Write a message in airplane mode: it shows "On this phone"; with network back it sends once.
6. A queued (never sent) report shows its full text and "Delete from this phone"; a received one shows the "full text is not kept here" line.
