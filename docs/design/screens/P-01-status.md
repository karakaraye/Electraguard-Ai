# P-01 Check a report (status lookup)

**Status:** READY for review · Route: `/status` (optional `?code=`) · Public: anyone with a receipt code · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Let anyone holding a receipt code see the report's status in plain words, answer a reviewer's question, and (only on the phone that sent it) withdraw before review starts. Reveal nothing else.

## Entry and exit
- **Entry:** O-03 "Check a report with a receipt code"; C-01 "Check status" (code prefilled); the public home (P-02); a typed or shared link.
- **Exit:** Back → the previous page (or P-02).

## Layout
**Phone 360 px** (`AppShell` public variant, title `p01.title`, Back):
1. `Field` `p01.label`, hint `p01.hint`; `autocapitalize="characters"`, `spellcheck="false"`. Normalise on input: upper-case, strip spaces, accept with or without `EG-` and hyphens; confusable letters mapped (`O`→`0`, `I`/`L`→`1`) if the code alphabet excludes them (flag for API: the code alphabet must exclude O, I, L).
2. Primary `p01.check` directly under the field (`p01.checking`).
3. If codes are kept on this phone: section `p01.savedCodes` with each code as a quiet button (tap = check it) and `p01.removeCode`.
4. Result area (`aria-live="polite"`), when found:
   - `p01.result.status` + large `StatusBadge` + explanation `p01.explain.*` (received, inReview, question, closed + `common.outcome.*`, withdrawn).
   - `p01.result.category` (`o05.tile.*`), `p01.result.received`, `p01.result.updated`.
   - When a question is open: block `p01.question.title`, the question text, `TextArea` `p01.question.replyLabel`, button `p01.question.send` → `p01.question.sent`.
   - When the device holds this report's secret and it is withdrawable: secondary danger `o14.withdraw.button` with the O-14 confirm sheet.
5. Footer line `p01.sms`.

**Tablet 768 px:** form and saved codes left, result right.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | no code | empty field; saved codes if any |
| Prefilled | `?code=` or from C-01 | field filled and checked automatically once |
| Format error | not matching the code pattern after normalising | `p01.formatError`; no request |
| Checking | REP-05 in flight | `p01.checking` |
| Found | REP-05 ok | result area |
| Not found | `not_found` | `p01.notFound` (same message whether the code never existed or belongs to another organisation; no hint) |
| Rate limited | `rate_limited` | `p01.tooMany` with minutes |
| Offline | no network | `p01.offline`; saved codes listed but cannot be checked |
| Reply sending / sent / failed | MSG-02 | as O-14; offline reply is **not** queued here (public page, no outbox for citizens on the web without the app; if the citizen uses the installed app, it queues like O-14) |
| Withdraw | REP-04 | as O-14 |
| Server error | 5xx | `common.error.server` + `ui.retry` |

## Message keys
`p01.*` (all), `o05.tile.*`, `common.status.*`, `common.outcome.*`, `o14.withdraw.*`, `common.error.server`, `ui.retry`, `ui.back`.

## API
- **REP-05** status by code → `{status, categoryId, receivedAt, updatedAt, outcome?, openQuestion?: {id, text}, withdrawable}`. Rate limited per IP/device; no report text, media, place below ward, or reporter details (README flag 6).
- **MSG-02** reply `{receiptCode, replyToQuestionId, clientMessageId, text}` authorised by the receipt code plus the citizen token if present (flag: decide whether code alone may reply; recommendation: yes, because many citizens check from another phone or by SMS, with rate limits and a length cap).
- **REP-04** withdraw, authorised by the citizen reporter token (AUTH-06) of the sending phone only.
- **AUTH-06** token reused from the device if present.

## Accessibility
- After Check, focus moves to the status heading; errors focus the field.
- Saved codes are buttons with accessible names "Check EG-4H7Q-92KD".

## Acceptance checks (Redmi)
1. Enter `eg 4h7q 92kd`: it is read as `EG-4H7Q-92KD` and found.
2. Enter a random valid-looking code: "We could not find a report with this code".
3. Check 20 random codes quickly: the too-many-checks message appears.
4. When a reviewer asks a question on a citizen report, P-01 shows it with a reply box; after sending, the status becomes Being reviewed.
5. On a different phone, the Withdraw button never appears; on the sending phone it appears only while the status is Received.
6. The page never shows the report text, photos, or the polling unit.
