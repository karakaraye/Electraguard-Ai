# O-20 Settings

**Status:** READY for review · Route: `/o/settings` (opened from the top-bar menu) · Observers only · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Change language, change PIN, read the privacy notice, see what is waiting on this phone, sign out, and on a shared phone sign out and clear everything in one action.

## Entry and exit
- **Entry:** `ui.menu` on any observer screen.
- **Exit:** Language → O-01 list in a `Sheet`; Change PIN → inline form; Privacy notice → O-02 read-only; Sign out → O-03 choose view; Clear → O-01 (the phone is like new). Back → previous screen.

## Layout
**Phone 360 px** (`AppShell`, title `o20.title`, Back). A plain list of rows (no cards):
1. `o20.language` · current language name in its own language → sheet.
2. `o20.pin.change` → expands inline: `Field`s `o20.pin.currentLabel`, `o20.pin.newLabel`, `o20.pin.confirmLabel` (numeric, masked), primary-in-place `o20.pin.save`.
3. `o20.privacy` → O-02 read-only.
4. Line `o20.storage` (counts from the outbox and media bytes), with `o04.sendNow` when items are waiting and online.
5. Rule, then the two sign-out actions:
   - Secondary `o20.signOut.button`.
   - Secondary danger `o20.signOut.clearButton` with hint `o20.signOut.clearHint`.
6. `o20.version` (`--t-small`, tabular).

**Tablet 768 px:** same list, max 34 rem centred.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | open | rows |
| PIN validation | same rules as O-03 set-pin (`o03.signIn.pinFormat`, `o03.setPin.mismatch`, `o03.setPin.tooSimple`) | under fields |
| PIN wrong current | AUTH-07 `wrong_credentials` | `o20.pin.wrongCurrent`; `locked` → `common.error.tooManyTries` |
| PIN saving / saved | AUTH-07 | button progress label; `o20.pin.saved` inline (ok icon), form collapses |
| PIN offline | no network | `common.error.network` variant: `o03.signIn.offline` text; Save disabled |
| Sign out (plain) | tap | if items are queued: `Sheet` warns with `o20.signOut.unsentWarning` and offers `o20.signOut.sendFirst` (online) or confirm; otherwise signs out at once. Plain sign-out **keeps** drafts and queued items for this code on this phone (they reappear when the same code signs in). |
| Clear confirm | tap clear | `Sheet` `o20.signOut.title`, `o20.signOut.body`, `o20.signOut.unsentWarning` if items queued, primary danger `o20.signOut.confirm`, secondary `o20.signOut.sendFirst` (when online and items queued), `ui.cancel` |
| Clearing | confirm | AUTH-05 if online (best effort; clearing never waits on the network), then delete IndexedDB stores, caches with user data, `localStorage` keys (locale too), service-worker user caches; app shell cache kept so the app still opens offline |
| Signed out | done | O-03 / O-01 with `o20.signOut.signedOut` shown once |
| Offline sign-out | no network | local session cleared; AUTH-05 is retried later is **not** possible (no session left), so the server session simply expires; state this in the privacy notice |

## Message keys
`o20.*` (all), `o03.signIn.pinFormat`, `o03.signIn.offline`, `o03.setPin.mismatch`, `o03.setPin.tooSimple`, `common.error.tooManyTries`, `o04.sendNow`, `o01.*` (sheet), `ui.cancel`, `ui.back`.

## API
- **AUTH-07** change PIN `{currentPin, newPin}`.
- **AUTH-05** sign out this device.
- Local only: outbox counts, media bytes (`navigator.storage.estimate()` plus our own byte count).

## Logic notes
- "Clear this phone" removes everything for **all** codes on this phone, not just the current one, because a shared phone should be left clean. The confirm text says drafts and saved reports on this phone will be removed.
- Changing PIN does not end other sessions of the same code (that is revocation's job); flag for the API if the owner prefers it to.

## Accessibility
- The clear sheet starts focus on Cancel; destructive button is last in focus order.
- The inline PIN form, when opened, moves focus to its first field; closing returns focus to the row.

## Acceptance checks (Redmi)
1. Change the PIN with the wrong current PIN: the message shows; with the right one: "Your new PIN is saved" and the next sign-in needs the new PIN.
2. With one queued report, tap Sign out and clear this phone: the sheet warns that 1 report will be lost and offers Send them first.
3. Confirm clear: the app returns to the language screen; DevTools shows the IndexedDB stores are empty; the app still opens in airplane mode.
4. Plain Sign out with a draft, sign in again with the same code: the draft is still there.
5. Sign in with a different code on the same phone: the first code's draft is not visible.
