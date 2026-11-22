# O-09 Tell us what happened (step 5 of 7)

**Status:** READY for review · Route: `/o/new/describe` · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Capture a short description by typing or speaking, guide the reporter to describe roles not names, and record whether they saw it themselves.

## Entry and exit
- **Entry:** O-08 Continue; O-11 Change on What you wrote / How you know.
- **Exit:** Continue → O-10 (or O-11).
- **Back:** → O-08; text kept (saved on every keystroke, debounced 300 ms).

## Layout
**Phone 360 px** (`AppShell`, `Stepper` 5 of 7; bottom action area follows `visualViewport` so Continue stays above the keyboard):
1. Title `o09.title`.
2. Three hint lines as a short list above the box (`--ink-2`): `o09.hint1`, `o09.hint2`, `o09.hint3`.
3. `TextArea` labelled `o09.label`, min 6 rows, grows to 12, `maxlength` = 2000, character count `ui.charCount` (shown from 1 500 characters up). `lang` set to the locale; `autocorrect` on.
4. `DictationButton` directly under the box, full width, 56 px: `o09.speak` (mic icon). While listening: label `o09.listening`, a large `o09.stop` button, and recognised words appear in the box at the cursor as editable text.
5. Name-check `Banner` (attn), appears under the box only when triggered (see logic): `o09.nameWarning` with action `o09.nameKeep`.
6. Radio group `o09.source`: `o09.sourceSelf`, `o09.sourceTold` (two 56 px rows).
7. Pinned: primary `common.continue`.

**Tablet 768 px:** hints on the left (narrow column), box and controls on the right.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | empty draft | empty box, no source selected |
| Filled | text + source | count hidden below 1 500 |
| Listening | Speak tapped and permission granted | listening label, Stop, words stream in; auto-stops after 60 s of speech or 8 s of silence |
| Dictation unavailable | no Web Speech API, or locale not supported by the engine (likely for pcm/ha/yo/ig) | tapping Speak shows `o09.speakUnavailable` inline under the button (no error colour); the button stays to re-read the tip |
| Mic denied | permission denied | `o09.micDenied` inline; typing still works |
| Validation: short | Continue with fewer than 20 characters (trimmed) | `o09.tooShort` with `min`=20 |
| Validation: long | paste beyond 2000 | text kept, `o09.tooLong` with `max`=2000; Continue blocked until shortened |
| Validation: source | no source selected | `o09.sourceError` |
| Name check | on Continue, text matches the name heuristic and has not been acknowledged | warning banner shown, Continue blocked once; `o09.nameKeep` acknowledges (stored per text hash) and continues; editing the text re-enables the check |
| Offline | always works (dictation may need network on some phones; then "unavailable" state) | — |
| Sending / server / success / empty | n/a | — |

## Message keys
`ui.stepOf`, `o09.*` (all), `ui.charCount`, `common.continue`, `ui.back`.

## API
None on this step. Draft fields: `description` (string, ≤ 2000), `source: "self" | "told"`, `nameCheckAcknowledged: boolean`. The server runs its own personal-data check on REP-01 and reviewers see a flag; the phone check is only a prompt.

## Logic notes
- **Name heuristic (on the phone, no network):** two or more consecutive capitalised words not at sentence start and not in a stop list (place names from REF-01, category words, common titles like "INEC", "Presiding Officer"); honorific + word (`Mr`, `Mrs`, `Alhaji`, `Chief`, `Hon.`, `Oga`, `Mama`, `Baba`, `Chief`); or a Nigerian phone number pattern (`0[789][01]\d{8}`, `+234...`). It warns once; it never blocks or rewrites.
- Dictation only inserts text; nothing is sent to any server by the app itself (the browser's speech engine may use Google's service; this is stated in the privacy notice, see open question Q6).

## Accessibility
- The three hints are referenced by the text box's `aria-describedby` so TalkBack reads them on focus.
- Listening state is announced politely; Stop receives focus while listening.
- The name warning is `role="alert"` when it appears; focus moves to it; "It is not a name, keep it" is the next focus stop.

## Acceptance checks (Redmi)
1. Type 10 letters and Continue: the "write a little more" message shows.
2. Type "Mr Okafor gave money to voters" and Continue: the roles-not-names warning appears; "It is not a name, keep it" continues; editing the text and Continue again shows it again.
3. Tap Speak in English: words appear in the box and can be edited. Switch to Hausa: if the phone cannot dictate Hausa, the keyboard-microphone tip shows instead of an error.
4. Deny the microphone: the "cannot use the microphone" line shows; typing works.
5. With the keyboard open, Continue stays visible above the keyboard.
6. Kill the app mid-sentence, reopen and continue the draft: the text is there.
