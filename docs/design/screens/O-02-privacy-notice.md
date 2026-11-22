# O-02 What this app keeps

**Status:** READY for review · Route: `/o/start` step 2 · Audience: everyone on first open · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Tell people, before they report, what the app keeps and does not keep, and that it does not send help, in four short lines they can also listen to.

## Entry and exit
- **Entry:** after O-01 on first open. Also reachable from O-20 "Privacy notice" (read-only view, no Continue).
- **Exit:** `o02.continue` → O-03. The fact that this was seen is stored on the device (`eg.noticeSeen=version`); if the notice version changes, it is shown once again.
- **Back:** to O-01 (the language list), keeping nothing else because nothing else was entered.

## Layout
**Phone 360 px** (`AppShell` with `ui.back`):
1. Title `o02.title`.
2. `Button` quiet with play icon: `o02.listen` (only if the recording for the current locale exists; recorded by the owner per plan section 8). While playing the label becomes `ui.stopListening` with a stop icon.
3. Four lines, each a row with a 24 px line icon on the left and `--t-body-lg` text: `o02.line1` (no-person icon), `o02.line2` (photo with crossed pin), `o02.line3` (arrow back), `o02.line4` (phone with 112; text in `--ink`, weight 600, because it is safety information).
4. `Button` quiet link: `o02.privacyLink` → `/privacy` (P-06, phase D3; opens in the same tab, Back returns here).
5. Pinned bottom: primary `o02.continue`.

**Tablet 768 px:** same, text column max 34 rem centred, button pinned to the bottom of the column.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | arriving from O-01 | as above |
| Playing | tap Listen | label `ui.stopListening`; audio plays once; no looping animation; `aria-pressed="true"` |
| Audio missing | no file for the locale | Listen button hidden, not disabled |
| Offline | no network | everything works (notice and audio are cached in the app shell); privacy link opens the cached privacy page or shows the network bar if not cached |
| Read-only (from O-20) | entered from Settings | no pinned button; Back returns to O-20 |
| Error / empty / sending | n/a | none |

## Message keys
`o02.title`, `o02.line1`–`o02.line4`, `o02.listen`, `ui.stopListening`, `o02.privacyLink`, `o02.continue`, `ui.back`.

## API
None.

## Accessibility
- Focus on title, then Listen, the four lines (a list, `<ul>`), the link, Continue.
- Icons are decorative (`aria-hidden`); the text carries the meaning.
- Audio never autoplays.

## Acceptance checks (Redmi)
1. After choosing Yorùbá on O-01, all four lines show in Yorùbá with tone marks, no clipping at 200% text.
2. Tap Listen: the Yorùbá recording plays; tap Stop: it stops. With no recording file present, the button is not shown.
3. Back returns to the language list; choosing a language returns here.
4. Continue goes to "Who are you?"; killing and reopening the app does not show this screen again.
5. Line 4 mentions 112 and that the app does not send help, in every language.
