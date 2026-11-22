# C-01 Citizen receipt

**Status:** READY for review · Route: `/r/receipt/[code]` · Citizens · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Give a citizen, who has no account, the one thing they need to follow their report: the receipt code, shown only after the server confirms, with ways to keep it (write it down, copy, save as a picture, keep on this phone) and how to check status, including by SMS.

## Entry and exit
- **Entry:** O-11 in citizen mode after REP-01 success (route replaced).
- **Exit:** `c01.checkStatus` → P-01 with the code filled in; `c01.another` → O-05 (new citizen draft); Back → the public home (P-02).
- Attachments upload in the background exactly as O-12; their status list is shown here too.

## Layout
**Phone 360 px** (`AppShell`, Back):
1. `--ok` tick (once, on the server response) + title `c01.title`.
2. `ReceiptCard`: `c01.codeLabel`, the code in `--t-display` tabular, `c01.receivedAt`, buttons `c01.copy` (→ `c01.copied`) and `c01.saveImage` (→ `c01.saved`).
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
| Success | REP-01 ok | as above |
| Uploading / offline / failed / missing | MED-* | as O-12 |
| Image saved | Save as picture | a PNG (code, received time, short code, app name; no report content) generated on a canvas and offered via the Web Share API or download; label `c01.saved` |
| Keep off | switch off | the code is removed from the phone's saved-codes list immediately; the screen still shows it |
| Error / empty | n/a | this screen only exists after success |

## Message keys
`c01.*` (all), `o12.upload.*`, `o12.keepOpen`, `ui.back`.

## API
- **REP-01** response (receiptCode, receivedAt) only.
- **MED-01..04** for attachments, authorised by the citizen reporter token (AUTH-06).
- Config: the SMS short code is one value in `frontend/lib/config.ts` (`SMS_SHORT_CODE`), shown as is; until a real short code exists it shows the gateway sandbox number used for the demo, and the owner can change it in that one place.

## Logic notes
- **Keep this code on this phone, default on:** losing the code means losing access to the report status, which hurts low-literacy citizens most. Only the code (not the content) is kept, and the switch plus `c01.keepOnPhoneHint` make the shared-phone choice visible. Owner decision requested (open question Q2).
- Citizens can withdraw only from the phone that sent the report, because that phone holds the device secret; P-01 shows Withdraw only there.

## Accessibility
- Focus to the title; the code is read in groups (as O-12).
- Copy/save results announced politely.

## Acceptance checks (Redmi)
1. Send a citizen report online: the receipt code shows only after the server responds.
2. Save as picture: the image in the gallery shows the code and the SMS instruction, and nothing about what was reported.
3. Turn "Keep this code on this phone" off, open Check a report: the code is not in "Codes on this phone".
4. Check status opens P-01 with the code filled in and shows "Received".
5. The SMS line shows the code and the short code from config.
