# O-12 Report received (observer receipt)

**Status:** READY for review · Route: `/o/reports/[ref]?just-sent` (a state of the report route, so a reload shows O-14) · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Confirm, only after the server says so, that the report is received: show the receipt code, the received time, what happens next, and the honest per-item upload status. A failed attachment never hides the receipt.

## Entry and exit
- **Entry:** O-11 after REP-01 success (`201` or `200`) (route replaced, so Back cannot return to the sent draft). Also when a queued report becomes received **while the observer is still on O-11** (not-confirmed state).
- **Exit:** `o12.viewReport` → O-14; `o12.another` → O-05 (new draft); `o12.home` → O-04. Back → O-04.
- Uploads continue in the background whatever the observer does; the sync loop owns them.

## Layout
**Phone 360 px** (`AppShell`, Back to Home, no Stepper):
1. `--ok` tick (draws once in 320 ms on arrival; instant with reduced motion) + title `o12.title`.
2. `ReceiptCard`: label `o12.codeLabel`, `receipt_code` in `--t-display` tabular (e.g. `EG-4H7Q-92KD`), `o12.receivedAt` from `received_at` (WAT), `Button` quiet `o12.copy` → label `o12.copied` for 3 s (inline text, not a toast).
3. `o12.next.title` and three lines `o12.next.line1..3`.
4. Only when the report has attachments: heading `o12.attachments`, then one `UploadItem` per item: thumbnail/type, status text + badge:
   - `o12.upload.waiting` (wait), `o12.upload.uploading` with a real progress rule from `received_bytes` / `size_bytes` (MED-02), `o12.upload.saved` (ok), `o12.upload.failed` (danger) with action `o12.upload.retry`, or `o12.upload.missing` with action `o12.upload.chooseAgain` (opens file chooser for that item).
   - Each item also has `o10.remove` (MED-05, `media` while the item is saved, `upload` while it is still sending), allowed only while the report is `received`; if a reviewer has started, the server answers `409 invalid_transition` and the row says so.
   - Server states after MED-03 (REP-03 `media[].status`): `processing` still shows **Saved** (the bytes are safe and verified); `ready` stays Saved and the row adds `blurred` / `exif_removed` ticks when true; `failed` shows `o12.upload.missing` with Choose file again (the original was discarded by the server).
   - While any item is not Saved: note `o12.keepOpen`.
5. Pinned bottom: primary `o12.viewReport`; quiet `o12.another` and `o12.home` above it.

**Tablet 768 px:** receipt card left, next steps and uploads right.

## States
| State | Trigger | What shows |
|---|---|---|
| Success, no attachments | REP-01 ok, 0 items | receipt + next steps |
| Uploading | items pending | per-item status as above; progress from MED-02 `received_bytes` (send) or `progress` |
| Offline mid-upload | network lost | items go to `waiting`; network bar; resumes from `received_bytes` (MED-02.progress) when back, never from zero |
| Item failed | 3 automatic retries failed, or a rejection: MED-01 `413 payload_too_large`, `415 unsupported_media_type`, `409 media_limit_reached`, `409 report_closed`, `409 report_withdrawn`; MED-03 `415`, `422 media_unreadable` (session deleted), `422 hash_mismatch` (session reset to 0: resent automatically, once) | `failed` + Try again for network and `5xx` cases; rejections show `o10.tooBig` / `o10.wrongType` / `o12.upload.failed` text and offer Remove. `409 offset_mismatch` is not a failure: the phone reads MED-02.progress and continues. `409 upload_expired` (24 h after the last chunk): the phone starts a new session with MED-01 and a **new** `Idempotency-Key` and resends (contract gap G15: a replay of the old key is not defined). |
| File missing | blob gone from IndexedDB (storage cleared by the OS) | `missing` + Choose file again |
| All saved | every item `saved` | keep-open note removed; announcement "Saved" once |
| App killed during upload | reopen | O-14 shows the same item list; uploads resume from MED-02.progress `received_bytes` (MED-01 replayed with the same key also returns the current `received_bytes`) |
| Session expired | `401 not_authenticated` on any MED call | items wait; PIN sheet (R5, AUTH-02); resume with the same keys |
| Revoked | `403 code_revoked` | uploads stop; items go to `waitingCode` like queued reports (R5). After a new code signs in on this phone, they can be sent (attached to the original `id`, same keys) or deleted. See open question Q3. |
| Error / empty | n/a | receipt itself cannot be in error: this screen only exists after success |

## Message keys
`o12.*` (all), `o10.tooBig`, `o10.wrongType`, `o10.remove`, `common.status.*`, `common.network.*`, `ui.back`.

## API
Sequence per attachment, after REP-01 returned `id` (contract 1.7: report, then its media, then its messages; one `Idempotency-Key` per item, made when it entered the outbox):
- **MED-01** `POST /api/v1/reports/{report_id}/uploads` with `{kind, purpose: "evidence", content_type, size_bytes, sha256, duration_ms, blur_faces, client_media_id}` → `{upload: {id, chunk_bytes (262144), received_bytes, status: "open", expires_at}, media: null}`. If the same `sha256` is already saved on this report the answer is `200` with `upload: null` and a `media` object: the item is Saved, nothing to send.
- **MED-02.send** `PATCH /api/v1/uploads/{upload_id}` with `Upload-Offset` and raw bytes (`application/offset+octet-stream`, 1 byte to 1 MiB, normally `chunk_bytes`) → `{id, received_bytes, size_bytes, status}`. No `Idempotency-Key`: offsets make it safe. Optional `Upload-Chunk-Sha256`; a mismatch is `422 hash_mismatch` and the chunk is dropped (resend it).
- **MED-02.progress** `GET /api/v1/uploads/{upload_id}` → the `upload` object; used after a lost response, an app kill, or `409 offset_mismatch`.
- **MED-03** `POST /api/v1/uploads/{upload_id}/complete` with `{}` → `{media: {id, kind, status: "processing", size_bytes, duration_ms, blurred, exif_removed, created_at}, client_media_id}`. The row turns **Saved** and the blob is deleted from the phone now (R8).
- **MED-05.media / MED-05.upload** `DELETE` to remove a saved item or cancel an unfinished upload (only while the report is `received`); `204`, also when already removed.
- **REP-03** polled every 30 s while open for `media[].status` (`processing`, `ready`, `failed`).
- The receipt's top half comes only from the REP-01 response (`id`, `receipt_code`, `received_at`).
- Limits shown to the observer come from the REP-01 response `media_upload` (`max_items` 6, `max_total_bytes` 62914560).

## Accessibility
- Focus to the title on arrival; the receipt code is read digit-group by digit-group (`aria-label` with spaces: "E G, 4 H 7 Q, 9 2 K D").
- Upload progress announced at start, at 50%, and at Saved, not every percent.
- Copy result is announced politely.

## Acceptance checks (Redmi)
1. Send a report with two photos on 3G: the receipt shows first, then each photo goes Waiting → Sending n% → Saved.
2. Turn on airplane mode at 40%: the item shows Waiting for network; turn off: it continues from about 40%, not from zero (check `Upload-Offset` values in the server log).
3. Kill the app at 40% and reopen the report: the upload resumes.
4. Clear the app's storage between send and upload (simulate): the item shows "Choose the file again".
5. Copy code: the button says "Code copied" for a few seconds, and the code pastes correctly into SMS.
6. Press Back: Home opens; the sent report does not reappear as a draft.
