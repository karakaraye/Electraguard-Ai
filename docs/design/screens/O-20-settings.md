# O-20 Settings

**Status:** READY for review · Route: `/o/settings` (opened from the top-bar menu) · Observers only · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Change language, change PIN, read the privacy notice, choose whether this phone keeps copies of received reports, see what is waiting on this phone, sign out, and on a shared phone sign out and clear everything in one action.

## Entry and exit
- **Entry:** `ui.menu` on any observer screen.
- **Exit:** Language → O-01 list in a `Sheet`; Change PIN → inline form; Privacy notice → O-02 read-only; Sign out → O-03 choose view; Clear → O-01 (the phone is like new). Back → previous screen.

## Layout
**Phone 360 px** (`AppShell`, title `o20.title`, Back). A plain list of rows (no cards):
1. `o20.language` · current language name in its own language → sheet.
2. `o20.pin.change` (**no contract exists for this action**, see gap G12; the row is hidden until it does) → expands inline: `Field`s `o20.pin.currentLabel`, `o20.pin.newLabel`, `o20.pin.confirmLabel` (numeric, masked), primary-in-place `o20.pin.save`.
3. `o20.privacy` → O-02 read-only.
3a. Switch `o20.keepCopies` (new key, see README) "Keep copies on this phone", default off: when on, received reports' text and media may be stored locally (never sent anywhere); when off, nothing of a received report stays on the phone (contract 1.8).
4. Line `o20.storage` (counts from the outbox and media bytes), with `o04.sendNow` when items are waiting and online.
5. Rule, then the two sign-out actions:
   - Secondary `o20.signOut.button` (AUTH-06 `{everywhere: false}`) and, below it, quiet `o20.signOut.everywhere` (new key: AUTH-06 `{everywhere: true}` ends every session of this code on every device).
   - Secondary danger `o20.signOut.clearButton` with hint `o20.signOut.clearHint`.
6. `o20.version` (`--t-small`, tabular).

**Tablet 768 px:** same list, max 34 rem centred.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | open | rows |
| PIN validation | same rules as O-03 set-pin (`o03.signIn.pinFormat`, `o03.setPin.mismatch`, `o03.setPin.tooSimple`) | under fields |
| PIN wrong current | change-PIN call (gap G12) | `o20.pin.wrongCurrent` for a wrong current PIN, `common.error.tooManyTries` when locked; the exact codes cannot be named until the contract defines the call |
| PIN saving / saved | change-PIN call (gap G12) | button progress label; `o20.pin.saved` inline (ok icon), form collapses |
| PIN offline | no network | `o03.signIn.offline` text; Save disabled |
| Sign out (plain) | tap | if the outbox is not empty: `Sheet` warns with `o20.signOut.unsentWarning` ("2 reports are not sent yet") and offers `o20.signOut.sendFirst` (online) or confirm; otherwise AUTH-06 and sign out at once (`204`, also for an already signed-out client). Plain sign-out **keeps** drafts and queued items for this code on this phone (they reappear when the same code signs in); the phone fetches AUTH-01 again afterwards. |
| Clear confirm | tap clear | `Sheet` `o20.signOut.title`, `o20.signOut.body`, `o20.signOut.unsentWarning` if items queued, primary danger `o20.signOut.confirm`, secondary `o20.signOut.sendFirst` (when online and items queued), `ui.cancel` |
| Clearing | confirm | AUTH-06 if online (best effort; clearing never waits on the network), then delete IndexedDB stores, caches with user data, `localStorage` keys (locale too), service-worker user caches (the Cache Storage entries for report data); app shell cache kept so the app still opens offline |
| Signed out | done | O-03 / O-01 with `o20.signOut.signedOut` shown once |
| Offline sign-out | no network | the phone clears its local data and locks at once, but the session cookie is HttpOnly and persistent (24 h idle, 7 days absolute), so the server session is still open. The phone keeps one "sign out pending" flag and sends AUTH-06 when the browser fires `online` (AUTH-06 is idempotent and needs a fresh CSRF token from AUTH-01). The privacy notice says the session ends only then. |

## Message keys
`o20.*` (all), `o03.signIn.pinFormat`, `o03.signIn.offline`, `o03.setPin.mismatch`, `o03.setPin.tooSimple`, `common.error.tooManyTries`, `o04.sendNow`, `o01.*` (sheet), `ui.cancel`, `ui.back`.

## API
- **AUTH-06** `POST /api/v1/auth/sign-out` with `{everywhere: false | true}` → `204`. Client duty (contract AUTH-06): "clear this phone" deletes IndexedDB drafts, the outbox, cached reports and the Cache Storage entries for report data, and **asks first** when the outbox is not empty.
- **AUTH-01** CSRF token before the call, and again after it.
- **AUTH-07** `GET /api/v1/auth/me` for `user.observer_code` and `session_expires_at` shown in this screen's header.
- **Change PIN:** no contract exists (AUTH-03 sets the first personal PIN from a setup token and nothing else). See contract gap G12.
- Local only: outbox counts, media bytes (`navigator.storage.estimate()` plus our own byte count), the `keepCopies` choice.

## Logic notes
- "Clear this phone" removes everything for **all** codes on this phone, not just the current one, because a shared phone should be left clean. The confirm text says drafts and saved reports on this phone will be removed.
- Whether changing the PIN should end other sessions cannot be decided until a change-PIN contract exists (gap G12); revocation (ADM-02) ends a code's sessions.

## Accessibility
- The clear sheet starts focus on Cancel; destructive button is last in focus order.
- The inline PIN form, when opened, moves focus to its first field; closing returns focus to the row.

## Acceptance checks (Redmi)
1. (Blocked until gap G12 is closed.) Change the PIN with the wrong current PIN: the message shows; with the right one: "Your new PIN is saved" and the next sign-in needs the new PIN.
2. With one queued report, tap Sign out and clear this phone: the sheet warns that 1 report will be lost and offers Send them first.
3. Confirm clear: AUTH-06 is called, the app returns to the language screen; DevTools shows the IndexedDB stores are empty; the app still opens in airplane mode.
4. Plain Sign out with a draft, sign in again with the same code: the draft is still there.
5. Sign in with a different code on the same phone: the first code's draft is not visible.
