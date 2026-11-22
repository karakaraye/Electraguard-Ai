# P-01 Check a report (status lookup)

**Status:** READY for review · Route: `/status` (optional `?code=`) · Public: anyone with a receipt code · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Let anyone holding a receipt code see the report's status in plain words, answer a reviewer's question, and (only on the phone that sent it) withdraw before review starts. Reveal nothing else.

## Entry and exit
- **Entry:** O-03 "Check a report with a receipt code"; C-01 "Check status" (code prefilled); the public home (P-02); a typed or shared link.
- **Exit:** Back → the previous page (or P-02).

## Layout
**Phone 360 px** (`AppShell` public variant, title `p01.title`, Back):
1. `Field` `p01.label`, hint `p01.hint`; `autocapitalize="characters"`, `spellcheck="false"`. Normalise on input as contract 1.1: upper-case, drop spaces and hyphens, `O`→`0`, `I`→`1`, `L`→`1`, then re-insert hyphens to `EG-XXXX-XXXX` (the code alphabet is Crockford base32 without I, L, O, U; the last character is a check symbol, which the phone can also verify before asking).
2. Primary `p01.check` directly under the field (`p01.checking`).
3. If codes are kept on this phone: section `p01.savedCodes` with each code as a quiet button (tap = check it) and `p01.removeCode`.
4. Result area (`aria-live="polite"`), when found:
   - `p01.result.status` + large `StatusBadge` + explanation `p01.explain.*` (received, inReview, question, closed + `common.outcome.*`, withdrawn).
   - `p01.result.received` and `p01.result.updated` as **dates only** (`received_on`, `updated_on`; the contract withholds times on purpose). There is no category line: REP-06 returns none (anyone who sees a code can look it up), so `p01.result.category` is not shown.
   - When `has_open_question` is true and this phone holds the receipt secret (or the citizen pastes the saved secret): the phone reads the question with REP-07.read and shows block `p01.question.title`, the question text, `TextArea` `p01.question.replyLabel` (1 to 2000 characters), button `p01.question.send` → `p01.question.sent`. Without the secret the block shows only `p01.explain.question` (a question is waiting) and no text, because REP-06 carries no question text (contract gap G11). Citizen photo or voice replies are not supported.
   - When this phone holds the secret and the status is `received`: secondary danger `o14.withdraw.button` with the O-14 confirm sheet. REP-06 has no withdrawable flag; the phone decides from `status`.
5. Footer line `p01.sms`.

**Tablet 768 px:** form and saved codes left, result right.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | no code | empty field; saved codes if any |
| Prefilled | `?code=` or from C-01 | field filled and checked automatically once |
| Format error | not matching `EG-XXXX-XXXX` after normalising, or the check symbol fails locally, or server `422 receipt_code_invalid` ("Check the code") | `p01.formatError`; no request for a local failure |
| Checking | REP-06 in flight | `p01.checking` |
| Found | REP-06 `200` | result area |
| Not found | REP-06 `404 not_found` (unknown code; same timing as found) | `p01.notFound` (same message for a code that never existed and for any other reason; no hint) |
| Rate limited | `429 rate_limited` (30 per minute per IP; 10 per minute per receipt code on REP-07) | `p01.tooMany` with minutes from `Retry-After` |
| Offline | no network | `p01.offline`; saved codes listed but cannot be checked |
| Reply sending / sent / failed | REP-07.reply `{question_id, body}` | `p01.question.send` → `p01.question.sent` on `201`/`200` (`{message, status: "in_review", version}`); offline reply is **not** queued here (public page, no outbox for citizens on the web without the app; if the citizen uses the installed app, it queues like O-14 with its `Idempotency-Key`). `409 question_closed` → the screen reloads REP-07.read and shows the question as answered or closed; `409 report_closed` / `409 report_withdrawn` → the status is refreshed; `401 receipt_secret_invalid` → `p01.question.needSecret` (new key, see README). |
| Withdraw | REP-04.citizen `{confirm: true}` with `X-Receipt-Secret` | as O-14; `409 withdraw_unavailable` shows `o14.withdraw.tooLate`; `401 receipt_secret_invalid` hides the button; `200` returns the stub with `status: "withdrawn"` (repeat withdraws also `200`) |
| Server error | `5xx` / `503 service_unavailable` | `common.error.server` + `ui.retry` |

## Message keys
`p01.*` (all; `p01.result.category` unused; `p01.question.needSecret` new), `common.status.*`, `common.outcome.*`, `o14.withdraw.*`, `common.error.server`, `ui.retry`, `ui.back`.

## API
- **REP-06** `GET /api/v1/public/receipts/{receipt_code}` (anyone; no secret) → `{receipt_code, status, outcome, has_open_question, received_on, updated_on}`. No category, place, text, channel, media or organisation. `422 receipt_code_invalid`, `404 not_found`, `429`. 30 per minute per IP.
- **REP-07.read** `GET /api/v1/public/receipts/{receipt_code}/conversation` with `X-Receipt-Secret` → `{receipt_code, status, messages: [Message]}` (messages without attachments), used only to show the open question's text. **REP-07.reply** `POST /api/v1/public/receipts/{receipt_code}/reply` with `{question_id, body}`, `Idempotency-Key`, CSRF → `{message, status, version}`. `401 receipt_secret_invalid`, `409 question_closed`, `409 report_withdrawn`, `409 report_closed`, `422`, `404`, `429`.
- **REP-04.citizen** `POST /api/v1/public/receipts/{receipt_code}/withdraw` with `{confirm: true}`, `X-Receipt-Secret`, `Idempotency-Key`, CSRF → the withdrawn stub.
- **AUTH-01** CSRF token before any POST (citizens included); **AUTH-07** `citizen_intake_open` is not needed here.
- The receipt secret is the one made on the sending phone (kept in IndexedDB while "Keep this code" is on, C-01) or pasted by the citizen from their own record; it is never shown by the server again.

## Accessibility
- After Check, focus moves to the status heading; errors focus the field.
- Saved codes are buttons with accessible names "Check EG-4H7Q-92KD".

## Acceptance checks (Redmi)
1. Enter `eg 4h7q 92kd`: it is read as `EG-4H7Q-92KD` and found.
2. Enter a random valid-looking code: "We could not find a report with this code".
3. Check 20 random codes quickly: the too-many-checks message appears.
4. When a reviewer asks a question on a citizen report, P-01 on the sending phone shows it with a reply box; after sending, the status becomes Being reviewed. On another phone without the secret it says a question is waiting but shows no text and no reply box.
5. On a different phone (no secret), the Withdraw button never appears; on the sending phone it appears only while the status is Received.
6. The page never shows the report text, photos, category, polling unit, or a time of day.
