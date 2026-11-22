# O-01 Language

**Status:** READY for review · Route: `/o/start` step 1 · Audience: everyone on first open · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Let anyone pick the language they read best before any other words appear.

## Entry and exit
- **Entry:** first open of the app (no locale stored on the device); O-20 "Language" opens the same list as a `Sheet`.
- **Exit:** tapping a language stores it on the device and goes to O-02 (first open) or closes the sheet and re-renders the current screen (from O-20). No separate Continue button: one tap is one decision.
- **Back:** none on first open (this is the first screen). In the O-20 sheet, Back/Close closes the sheet without changing anything.

## Layout
**Phone 360 px** (`AppShell` without Back; no network bar unless offline):
1. Top bar: app mark + `common.appName` (no menu yet).
2. Title `o01.title` (`--t-title`). Below it `o01.hint` (`--t-body-lg`, `--ink-2`).
3. Five full-width `Button` secondary tiles, 64 px tall, 12 px apart, in this order: `o01.en`, `o01.pcm`, `o01.ha`, `o01.yo`, `o01.ig`. Each label is in its own language and carries `lang` (`en`, `pcm`, `ha`, `yo`, `ig`). A small 24 px speaker icon at the right of each tile plays a 2 s recorded name of the language if the audio file exists; if not, no icon.
4. Nothing pinned at the bottom (the tiles are the action).

**Tablet 768 px:** same order, centred column max 34 rem; tiles stay full column width.

**Default language before the choice:** the title and hint show in English with each tile in its own language, which is enough for any reader to find their language.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | no stored locale | as above; no tile selected |
| Selected (from O-20) | locale already stored | current language tile shows ink 2 px border + tick and `aria-checked="true"` |
| Offline | no network | works fully (message files are in the app shell cache); network bar shown |
| Message file missing for a language | cache lost and offline | tile still selectable; app falls back to English for missing keys (contract 7) |
| Error / empty / sending | n/a | none: this screen makes no request |

## Message keys
`o01.title`, `o01.hint`, `o01.en`, `o01.pcm`, `o01.ha`, `o01.yo`, `o01.ig`, `ui.close` (sheet), `common.network.offline`.

## API
None. Locale is stored on the device only (`localStorage` `eg.locale`, read synchronously before first paint so `<html lang>` is right).

## Logic notes
- Changing language never touches drafts or the outbox; the open screen re-renders in place.
- The chosen language is also sent as `Accept-Language` on API calls so server texts (Ask answers, reviewer templates) can match.

## Accessibility
- The list is a radio group labelled by the title. Focus starts on the title; Tab order: tiles top to bottom, then speaker icons are separate buttons labelled `ui.listen` + language name.
- Each tile's accessible name is the language name in its own language with the correct `lang`, so TalkBack switches voice where it can.

## Acceptance checks (Redmi)
1. Clear site data, open the app: the five languages show in the order above, each in its own spelling (Naijá, Yorùbá with marks).
2. Tap Hausa: the next screen is in Hausa; `<html lang="ha">`.
3. Kill the app and reopen: it opens on O-02/O-04 in Hausa, not on O-01.
4. Airplane mode, clear locale, reopen: O-01 still renders and works.
5. From Settings, change to Igbo while a draft exists: the draft's values are all still there.
6. TalkBack: swipe through the five tiles; each is read as "radio button, 1 of 5" with its name.
