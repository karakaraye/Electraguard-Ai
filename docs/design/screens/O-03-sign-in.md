# O-03 Who are you? · Sign in · Choose your PIN · Code revoked

**Status:** READY for review · Route: `/o/start` step 3 (views: `choose`, `sign-in`, `set-pin`, `revoked`) · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Split observers from citizens, sign observers in with the observer code and 6-digit PIN from their card (no email, no phone number), make them choose their own PIN the first time, and handle a revoked code honestly.

## Entry and exit
- **Entry:** after O-02 on first open; after sign-out (O-20); when any API returns `code_revoked` (revoked view); when AUTH-07 on app open says `authenticated: false`.
- **Exit:**
  - "I am an accredited observer" → sign-in view.
  - "Report as a citizen" → O-05 in citizen mode. No call is made: the phone makes the receipt secret locally (`crypto.getRandomValues`, 32 bytes, base64url, 43 characters) before the first send and sends it once with REP-05. Works offline.
  - "Check a report with a receipt code" → P-01.
  - Sign-in success → O-04. Sign-in success with `pin_setup_required` → set-pin view → O-04.
- **Back:** sign-in / set-pin → choose view (typed code is kept, PIN fields are cleared for safety). Choose view → O-02.

## Layout

### View `choose` (phone 360 px)
1. Title `o03.title`.
2. Two large `ChoiceTile`-style buttons stacked (single column, 96 px tall, pictogram 40 px on the left):
   - Badge pictogram + `o03.observer`, hint `o03.observerHint`.
   - Person pictogram + `o03.citizen`, hint `o03.citizenHint`.
3. Quiet link `o03.checkStatus`.
4. No pinned primary (each tile is the action).

### View `sign-in`
1. Title `o03.signIn.title`.
2. `Field` `o03.signIn.codeLabel`, hint `o03.signIn.codeHint`. `autocapitalize="characters"`, `autocomplete="username"`, `inputmode="text"`, `spellcheck="false"`. On blur, normalise as contract 1.1: trim, upper-case, drop spaces and hyphens, `O`→`0`, `I`→`1`, `L`→`1`, then re-insert the hyphen after `OBS` (`obs 7k2p9d` → `OBS-7K2P9D`). An observer code is `OBS-` plus six characters (five random plus a check symbol).
3. `Field` `o03.signIn.pinLabel`, hint `o03.signIn.pinHint`. `inputmode="numeric"`, `pattern="[0-9]*"`, `maxlength=8`, `autocomplete="current-password"`, masked; accepts 6 digits (the personal PIN) or 8 digits (the one-time setup PIN printed on the card, contract D15); a quiet toggle `o03.signIn.showPin` / `o03.signIn.hidePin` (48 px target).
4. Text `o03.signIn.forgot` (`--ink-2`).
5. Pinned bottom: primary `o03.signIn.submit` (label `o03.signIn.submitting` while waiting).

### View `set-pin`
1. Title `o03.setPin.title`; body `o03.setPin.body`.
2. `Field` `o03.setPin.newLabel` and `Field` `o03.setPin.confirmLabel` (both numeric, masked, `autocomplete="new-password"`, one shared show/hide toggle).
3. Pinned: primary `o03.setPin.submit` (`o03.setPin.submitting`).

### View `revoked`
1. `--danger` triangle icon + title `o03.revoked.title`; body `o03.revoked.body`.
2. If items are on the phone for that code: `Banner` (attn) `o03.revoked.unsent` + `o03.revoked.unsentHint`.
3. Pinned: primary `o03.revoked.signInNew` → sign-in view. Secondary (only when items exist) `o03.revoked.clear` → confirm `Sheet` `o03.revoked.clearTitle`, `o03.revoked.clearBody`, primary danger `o03.revoked.clearConfirm`, secondary `ui.cancel`; then deletes them.

**Tablet 768 px:** each view is a single centred column (max 28 rem for forms); the choose tiles sit side by side (2 columns) with the link under them.

## States
| View | State | Trigger | What shows |
|---|---|---|---|
| choose | first view | — | two tiles |
| sign-in | first view | — | empty fields (code pre-filled if the phone remembers the last code used *on this phone and the user didn't clear it*) |
| sign-in | validation error | submit with empty code → `o03.signIn.codeEmpty`; code not matching `^OBS-[0-9A-HJKMNP-TV-Z]{6}$` after normalising, or failing its check symbol (contract 1.1; computed on the phone so a typo is caught offline) → `o03.signIn.codeFormat`; PIN not exactly 6 or exactly 8 digits → `o03.signIn.pinFormat` | error under the field, focus to the first bad field; no request sent |
| sign-in | offline | `navigator.onLine` false or network error | `o03.signIn.offline` under the button; button stays enabled to retry |
| sign-in | sending | request in flight | button label `submitting`, disabled, width kept; fields read-only |
| sign-in | wrong code or PIN | AUTH-02 `401 invalid_credentials` | `o03.signIn.wrong`; PIN cleared, focus to PIN. Never say which of the two was wrong. The contract returns no tries-left count, so `o03.signIn.triesLeft` is not shown (contract gap G1). |
| sign-in | locked | AUTH-02 `423 code_locked` (`Retry-After: 900`) | `common.error.tooManyTries` with minutes from `Retry-After`; button disabled with a live countdown to the minute. After 10 failures in 24 h the lock lasts until an admin resets the PIN (ADM-02): then `Retry-After` is absent and the text points to the coordinator. |
| sign-in | revoked | AUTH-02 `403 code_revoked` (only after a correct PIN) | `o03.signIn.revoked` under the code field |
| sign-in | server error | `503 service_unavailable` or `5xx` | `common.error.server`; values kept |
| sign-in | rate limited | `429 rate_limited` (30 attempts per IP per 10 min, many phones share one address) | `common.error.tooManyTries` with `Retry-After`; values kept |
| sign-in | validation (server) | `422 validation_failed` with `fields.code` or `fields.pin` | the same text as the local format errors |
| sign-in | success | AUTH-02 `200 status: signed_in` | the phone fetches AUTH-01 again (the CSRF token rotates at sign-in), then goes to O-04 (no success screen). `me` from the response gives the code and organisation name. |
| set-pin | first view | AUTH-02 `200 status: pin_setup_required` (an 8-digit setup PIN was used; no session exists yet) | two fields; the `setup_token` is held in memory only, valid 10 minutes |
| set-pin | validation | local rules, then AUTH-03 `422 validation_failed` | not 6 digits → `o03.signIn.pinFormat`; mismatch → `o03.setPin.mismatch` (local); trivially weak (all same digit, ascending/descending run, `123456`) → `o03.setPin.tooSimple` (server: `fields.new_pin.code = pin_too_simple`; the phone also checks `000000` and the year pattern); same as the start of the card PIN → `o03.setPin.sameAsCard` (server: field code `pin_reused`; contract gap G2 asks AUTH-03 to say which code it returns) | error under field |
| set-pin | sending / server error / setup token expired | AUTH-03 | as sign-in; `401 invalid_credentials` on AUTH-03 means the token is unknown, used or older than 10 minutes, or 5 attempts were used → back to sign-in view with `common.error.sessionExpired`. A lost response after success is handled by AUTH-07: if a session exists, go to O-04. |
| set-pin | success | AUTH-03 `200 status: signed_in` | the phone fetches AUTH-01 again, then `Banner` ok `o03.setPin.done` shown on O-04 once. The setup PIN stops working. |
| revoked | with / without unsent items | `code_revoked` anywhere | as layout |

## Message keys
`o03.title`, `o03.observer`, `o03.observerHint`, `o03.citizen`, `o03.citizenHint`, `o03.checkStatus`, `o03.signIn.*` (all; `o03.signIn.triesLeft` unused until G1; `pinHint`/`pinFormat` must say 6 or 8 digits), `o03.setPin.*` (all), `o03.revoked.*` (all), `common.error.tooManyTries`, `common.error.server`, `common.error.sessionExpired`, `ui.cancel`, `ui.back`.

## API
- **AUTH-02** `POST /api/v1/auth/observer/sign-in` with `{code, pin}` (6 or 8 digits). `200`: `{status: "signed_in", me}` (a `me` object as AUTH-07: `user.observer_code`, `user.organisation`, `session_expires_at`) or `{status: "pin_setup_required", setup_token, setup_token_expires_at}`. Errors: `401 invalid_credentials`, `403 code_revoked`, `423 code_locked`, `422 validation_failed`, `429 rate_limited`, `503 service_unavailable`.
- **AUTH-03** `POST /api/v1/auth/observer/pin` with `{setup_token, new_pin}` (exactly 6 digits). `200`: `{status: "signed_in", me}`. Errors: `422 validation_failed` (`fields.new_pin`: `pin_too_simple`, `pin_reused`), `401 invalid_credentials`, `429`.
- **AUTH-01** `GET /api/v1/auth/csrf` → `{csrf_token}`: before the first POST on this page, and again after AUTH-02, AUTH-03 and AUTH-06.
- **AUTH-07** `GET /api/v1/auth/me` on app open (skipped when offline): `authenticated: false` means no session; the revoked view comes from `403 code_revoked` on any call.
- Citizen path: no API call here; the receipt secret is made on the phone (see Exit). REP-05 carries it.
- Observer sessions last 24 h idle and 7 days absolute in a persistent cookie, so a phone closed and reopened all day stays signed in (contract 1.2). The phone never stores the PIN; only the session cookie.
- Staff never use this screen (AUTH-04, AUTH-05).

## Logic notes
- **Shared phones:** the last code is remembered only for convenience and is removed by "Sign out and clear this phone". Drafts and queued items are scoped to the code (README R2).
- **Different code on a phone with another code's queue:** after sign-in, if items from a revoked code exist, O-04 shows the revoked-items banner (R5). Items from a non-revoked other code stay hidden and untouched.
- **Rate limits** are enforced on the server (5 failures per code per 15 minutes, 10 per 24 hours, 30 attempts per IP per 10 minutes); the phone only displays them.
- Citizen mode never asks for a name, phone number or email.

## Accessibility
- Focus order sign-in: title → code → PIN → show PIN → forgot text → Sign in.
- Errors announced assertively; `triesLeft` announced with the error.
- The PIN field is not split into six boxes (they break TalkBack and paste); one numeric field with large digits and `letter-spacing: .3em`.

## Acceptance checks (Redmi)
1. Type `obs 7k2p9d` and the 8-digit setup PIN from the card: the code shows as `OBS-7K2P9D` and sign-in proceeds to "Choose your own PIN". With a 6-digit personal PIN it goes straight to Home.
2. On set-pin, `111111` and `123456` are refused with the "too easy" message; two different PINs show the mismatch message.
3. After setting a PIN, kill the app: reopening goes straight to Home.
4. Wrong PIN 5 times: the code is locked; the button is disabled with the minutes from `Retry-After` shown.
5. Airplane mode: tapping Sign in shows the "You need network to sign in" message and nothing else changes.
6. Have the admin revoke the code while the app is open with a queued report: the revoked view appears, says 1 report was not sent, and offers sign in with a new code.
7. Tap "Report as a citizen" offline: the category screen opens; no sign-in is asked.
