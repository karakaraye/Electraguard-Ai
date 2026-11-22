# O-03 Who are you? · Sign in · Choose your PIN · Code revoked

**Status:** READY for review · Route: `/o/start` step 3 (views: `choose`, `sign-in`, `set-pin`, `revoked`) · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Split observers from citizens, sign observers in with the observer code and 6-digit PIN from their card (no email, no phone number), make them choose their own PIN the first time, and handle a revoked code honestly.

## Entry and exit
- **Entry:** after O-02 on first open; after sign-out (O-20); when any API returns `code_revoked` (revoked view); when AUTH-03 on app open says there is no session.
- **Exit:**
  - "I am an accredited observer" → sign-in view.
  - "Report as a citizen" → AUTH-06 runs (in the background, can be offline: the token is fetched on first send) → O-05 in citizen mode.
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
2. `Field` `o03.signIn.codeLabel`, hint `o03.signIn.codeHint`. `autocapitalize="characters"`, `autocomplete="username"`, `inputmode="text"`, `spellcheck="false"`. On blur, normalise: trim, upper-case, remove spaces, insert the hyphen after `OBS` if missing (`obs7k2p` → `OBS-7K2P`).
3. `Field` `o03.signIn.pinLabel`, hint `o03.signIn.pinHint`. `inputmode="numeric"`, `pattern="[0-9]*"`, `maxlength=6`, `autocomplete="current-password"`, masked; a quiet toggle `o03.signIn.showPin` / `o03.signIn.hidePin` (48 px target).
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
| sign-in | validation error | submit with empty code → `o03.signIn.codeEmpty`; code not matching `^OBS-[A-Z0-9]{4,8}$` after normalising → `o03.signIn.codeFormat`; PIN not 6 digits → `o03.signIn.pinFormat` | error under the field, focus to the first bad field; no request sent |
| sign-in | offline | `navigator.onLine` false or network error | `o03.signIn.offline` under the button; button stays enabled to retry |
| sign-in | sending | request in flight | button label `submitting`, disabled, width kept; fields read-only |
| sign-in | wrong code or PIN | AUTH-01 `wrong_credentials` | `o03.signIn.wrong` + `o03.signIn.triesLeft` (when `triesLeft ≤ 3`); PIN cleared, focus to PIN. Never say which of the two was wrong. |
| sign-in | locked | AUTH-01 `locked` | `common.error.tooManyTries` with minutes from `retryAfterSeconds`; button disabled with a live countdown to the minute |
| sign-in | revoked | AUTH-01 `code_revoked` | `o03.signIn.revoked` under the code field |
| sign-in | server error | 5xx | `common.error.server`; values kept |
| sign-in | success | AUTH-01 ok | go to O-04 (no success screen) |
| set-pin | first view | AUTH-01 `pin_setup_required` | two fields |
| set-pin | validation | not 6 digits → `o03.signIn.pinFormat`; mismatch → `o03.setPin.mismatch`; trivially weak (all same digit, ascending/descending run, `123456`, `000000`, or the year pattern `19xx`/`20xx` + 2) → `o03.setPin.tooSimple`; same as card PIN → `o03.setPin.sameAsCard` (server also checks) | error under field |
| set-pin | sending / server error / setup token expired | AUTH-02 | as sign-in; expired token → back to sign-in view with `common.error.sessionExpired` |
| set-pin | success | AUTH-02 ok | `Banner` ok `o03.setPin.done` shown on O-04 once |
| revoked | with / without unsent items | `code_revoked` anywhere | as layout |

## Message keys
`o03.title`, `o03.observer`, `o03.observerHint`, `o03.citizen`, `o03.citizenHint`, `o03.checkStatus`, `o03.signIn.*` (all), `o03.setPin.*` (all), `o03.revoked.*` (all), `common.error.tooManyTries`, `common.error.server`, `common.error.sessionExpired`, `ui.cancel`, `ui.back`.

## API
- **AUTH-01** sign-in (code, PIN) → session cookie (HttpOnly) + `{code, organisationId, expiresAt}` or `pin_setup_required` + setup token, `wrong_credentials` + `triesLeft`, `locked` + `retryAfterSeconds`, `code_revoked`.
- **AUTH-02** set PIN (setup token, new PIN).
- **AUTH-06** citizen token (device secret generated with `crypto.getRandomValues`, 32 bytes, stored in IndexedDB).
- Data needed: none beyond the above. The phone must never store the PIN; only the session cookie.

## Logic notes
- **Shared phones:** the last code is remembered only for convenience and is removed by "Sign out and clear this phone". Drafts and queued items are scoped to the code (README R2).
- **Different code on a phone with another code's queue:** after sign-in, if items from a revoked code exist, O-04 shows the revoked-items banner (R5). Items from a non-revoked other code stay hidden and untouched.
- **Rate limits** are enforced on the server per code and per device; the phone only displays them.
- Citizen mode never asks for a name, phone number or email.

## Accessibility
- Focus order sign-in: title → code → PIN → show PIN → forgot text → Sign in.
- Errors announced assertively; `triesLeft` announced with the error.
- The PIN field is not split into six boxes (they break TalkBack and paste); one numeric field with large digits and `letter-spacing: .3em`.

## Acceptance checks (Redmi)
1. Type `obs 7k2p` and the card PIN: the code shows as `OBS-7K2P` and sign-in proceeds to "Choose your own PIN".
2. On set-pin, `111111` and `123456` are refused with the "too easy" message; two different PINs show the mismatch message.
3. After setting a PIN, kill the app: reopening goes straight to Home.
4. Wrong PIN 3 times: the "tries left" line appears; after the server lock, the button is disabled with the minutes shown.
5. Airplane mode: tapping Sign in shows the "You need network to sign in" message and nothing else changes.
6. Have the admin revoke the code while the app is open with a queued report: the revoked view appears, says 1 report was not sent, and offers sign in with a new code.
7. Tap "Report as a citizen" offline: the category screen opens; no sign-in is asked.
