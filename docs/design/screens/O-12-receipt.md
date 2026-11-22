# O-12 Report received (observer receipt)

**Status:** READY for review · Route: `/o/reports/[ref]?just-sent` (a state of the report route, so a reload shows O-14) · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Confirm, only after the server says so, that the report is received: show the receipt code, the received time, what happens next, and the honest per-item upload status. A failed attachment never hides the receipt.

## Entry and exit
- **Entry:** O-11 after REP-01 success (route replaced, so Back cannot return to the sent draft). Also when a queued report becomes received **while the observer is still on O-11** (not-confirmed state).
- **Exit:** `o12.viewReport` → O-14; `o12.another` → O-05 (new draft); `o12.home` → O-04. Back → O-04.
- Uploads continue in the background whatever the observer does; the sync loop owns them.

## Layout
**Phone 360 px** (`AppShell`, Back to Home, no Stepper):
1. `--ok` tick (draws once in 320 ms on arrival; instant with reduced motion) + title `o12.title`.
2. `ReceiptCard`: label `o12.codeLabel`, the code in `--t-display` tabular (e.g. `EG-4H7Q-92KD`), `o12.receivedAt` (WAT), `Button` quiet `o12.copy` → label `o12.copied` for 3 s (inline text, not a toast).
3. `o12.next.title` and three lines `o12.next.line1..3`.
4. Only when the report has attachments: heading `o12.attachments`, then one `UploadItem` per item: thumbnail/type, status text + badge:
   - `o12.upload.waiting` (wait), `o12.upload.uploading` with a real progress rule from bytes acknowledged, `o12.upload.saved` (ok), `o12.upload.failed` (danger) with action `o12.upload.retry`, or `o12.upload.missing` with action `o12.upload.chooseAgain` (opens file chooser for that item).
   - While any item is not Saved: note `o12.keepOpen`.
5. Pinned bottom: primary `o12.viewReport`; quiet `o12.another` and `o12.home` above it.

**Tablet 768 px:** receipt card left, next steps and uploads right.

## States
| State | Trigger | What shows |
|---|---|---|
| Success, no attachments | REP-01 ok, 0 items | receipt + next steps |
| Uploading | items pending | per-item status as above; progress from MED-02 acknowledgements |
| Offline mid-upload | network lost | items go to `waiting`; network bar; resumes from the last acknowledged chunk (MED-04) when back |
| Item failed | 3 automatic retries failed or MED-03 rejected (`too_large`, `unsupported_type`) | `failed` + Try again (rejections show `o10.tooBig` / `o10.wrongType` text instead and offer Remove) |
| File missing | blob gone from IndexedDB (storage cleared by the OS) | `missing` + Choose file again |
| All saved | every item `saved` | keep-open note removed; announcement "Saved" once |
| App killed during upload | reopen | O-14 shows the same item list; uploads resume via MED-04 offsets |
| Session expired | MED-* `session_expired` | items wait; PIN sheet (R5) |
| Revoked | `code_revoked` | uploads stop; items go to `waitingCode` like queued reports (R5). After a new code signs in on this phone, they can be sent (attached to the original ref) or deleted. See open question Q3. |
| Error / empty | n/a | receipt itself cannot be in error: this screen only exists after success |

## Message keys
`o12.*` (all), `o10.tooBig`, `o10.wrongType`, `o10.remove`, `common.status.*`, `common.network.*`, `ui.back`.

## API
- **REP-01** response (ref, receiptCode, receivedAt) is the only source of this screen's top half.
- **MED-01** start upload `{ref, clientAttachmentId, type, size, blurFaces}` → `{uploadId, chunkSize, offset}`; idempotent on `clientAttachmentId`.
- **MED-02** upload chunk `{uploadId, offset, bytes}` → `{offset}`.
- **MED-03** complete → `{state: "saved" | "rejected", reason}`.
- **MED-04** status/resume `{uploadId}` → `{offset, state}`.
- **REP-03** polled every 30 s while open to pick up server-side states (e.g. scan rejected).
- Each media blob is deleted from the phone right after MED-03 returns `saved` (R8).

## Accessibility
- Focus to the title on arrival; the receipt code is read digit-group by digit-group (`aria-label` with spaces: "E G, 4 H 7 Q, 9 2 K D").
- Upload progress announced at start, at 50%, and at Saved, not every percent.
- Copy result is announced politely.

## Acceptance checks (Redmi)
1. Send a report with two photos on 3G: the receipt shows first, then each photo goes Waiting → Sending n% → Saved.
2. Turn on airplane mode at 40%: the item shows Waiting for network; turn off: it continues from about 40%, not from zero (check MED-02 offsets in the server log).
3. Kill the app at 40% and reopen the report: the upload resumes.
4. Clear the app's storage between send and upload (simulate): the item shows "Choose the file again".
5. Copy code: the button says "Code copied" for a few seconds, and the code pastes correctly into SMS.
6. Press Back: Home opens; the sent report does not reappear as a draft.
