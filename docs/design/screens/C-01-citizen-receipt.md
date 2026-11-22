# C-01 Citizen receipt

**Status:** READY for review · Route: `/r/receipt/[code]` · Citizens · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Give a citizen, who has no account, the one thing they need to follow their report: the receipt code, shown only after the server confirms, with ways to keep it (write it down, copy, save as a picture, keep on this phone) and how to check status, including by SMS.

## Entry and exit
- **Entry:** O-11 in citizen mode after REP-05 success (`201`, or `200` on a replay; route replaced).
- **Exit:** `c01.checkStatus` → P-01 with the code filled in; `c01.another` → O-05 (new citizen draft); Back → the public home (P-02).
- Attachments upload in the background exactly as O-12; their status list is shown here too.

## Layout
**Phone 360 px** (`AppShell`, Back):
1. `--ok` tick (once, on the server response) + title `c01.title`.
2. `ReceiptCard`: `c01.codeLabel`, `receipt_code` in `--t-display` tabular, `c01.receivedAt` (from `received_at`), buttons `c01.copy` (→ `c01.copied`) and `c01.saveImage` (→ `c01.saved`).
3. Text `c01.writeDown` (weight 600).
4. Switch `c01.keepOnPhone` (default **on**, see logic) with hint `c01.keepOnPhoneHint`.
5. `c01.next.title` + `c01.next.line1..3`; line `c01.sms` with the code and short code filled in.
6. Upload list (if attachments) using `o12.upload.*` and `o12.keepOpen`.
7. Label `c01.citizenLabel` (`--ink-2`, small), so the reporter knows how reviewers will see it.
8. Pinned: primary `c01.checkStatus`; quiet `c01.another` above.

**Tablet 768 px:** receipt card left, next steps and uploads right.

## States
| State | Trigger | What shows |
|---|---|---|
| Success | REP-05 ok | as above |
| Uploading / offline / failed / missing | MED-01..03, MED-05 with `X-Receipt-Secret` | as O-12 (a wrong or missing secret is `401 receipt_secret_invalid`: the item stops and the row says the photo cannot be added from this phone) |
| Image saved | Save as picture | a PNG (receipt code, received time, short code, app name; no report content and **not** the receipt secret) generated on a canvas and offered via the Web Share API or download; label `c01.saved`. The contract offers this because a cleared phone loses the secret; the code alone still works for status checks (REP-06) but not for replying or withdrawing (contract gap G11). |
| Keep off | switch off | the receipt code **and the receipt secret** are removed from the phone's saved-codes list immediately; the screen still shows the code |
| Error / empty | n/a | this screen only exists after success |

## Message keys
`c01.*` (all), `o12.upload.*`, `o12.keepOpen`, `ui.back`.

## API
- **REP-05** response `{id, receipt_code, kind, channel: "citizen", status: "received", received_at, version, media_upload: {max_items, max_total_bytes}}` is the only source of this screen's top half. The request carried `receipt_secret` (made on the phone, 43 characters, stored by the server only as SHA-256, never returned).
- **MED-01..03** and **MED-05** for attachments, authorised by `X-Receipt-Secret` (no sign-in, no token). MED-01 uses the REP-05 `id` as `report_id`.
- **REP-06** `GET /api/v1/public/receipts/{receipt_code}` for the refresh on this screen: `{receipt_code, status, outcome, has_open_question, received_on, updated_on}` (dates only).
- Config: the SMS short code is one value in `frontend/lib/config.ts` (`SMS_SHORT_CODE`), shown as is; until a real short code exists it shows the gateway sandbox number used for the demo, and the owner can change it in that one place.
- After success the phone keeps only `receipt_code` and the secret (when "Keep this code" is on), so the citizen can reply later on this phone; the draft content is deleted (contract REP-05).

## Logic notes
- **Keep this code on this phone, default on:** losing the code means losing access to the report status, which hurts low-literacy citizens most. Only the code (not the content) is kept, and the switch plus `c01.keepOnPhoneHint` make the shared-phone choice visible. Owner decision requested (open question Q2).
- Citizens can withdraw only from a phone that holds the receipt secret (the one that sent the report), through REP-04.citizen; P-01 shows Withdraw only there. Reports that arrive by SMS or USSD have no secret and cannot be withdrawn here.

## Accessibility
- Focus to the title; the code is read in groups (as O-12).
- Copy/save results announced politely.

## Acceptance checks (Redmi)
1. Send a citizen report online: the receipt code shows only after the server responds to REP-05.
2. Save as picture: the image in the gallery shows the code and the SMS instruction, and nothing about what was reported.
3. Turn "Keep this code on this phone" off, open Check a report: the code is not in "Codes on this phone".
4. Check status opens P-01 with the code filled in and shows "Received".
5. The SMS line shows the code and the short code from config.
