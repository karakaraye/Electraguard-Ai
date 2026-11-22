# O-19 Ask ElectraGuard

**Status:** READY for review · Route: `/o/ask` (public twin `/ask` is P-04, phase D3, same component) · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Answer an observer's question only from approved documents, always with the source, and say plainly when there is no approved answer (plan 4.11). Target: zero unsupported answers.

## Entry and exit
- **Entry:** Home "Ask ElectraGuard".
- **Exit:** `o19.openSource` → the cached guide page (`/guide/[slug]`, P-05) at the cited passage. Back → Home.

## Layout
**Phone 360 px** (`AppShell`, title `o19.title`, Back):
1. `TextArea` (2 rows, grows to 5) labelled `o19.label`, hint `o19.hint`, 300-character limit. `DictationButton` beside it on tablet, under it on phone (same behaviour as O-09).
2. Primary `o19.ask` directly under the field (not pinned, so the answer area stays visible above the keyboard).
3. Answer area (`aria-live="polite"`):
   - The answer as quoted passages from the approved guide (block quote style with a hairline rule on all four sides, not a side stripe), then `o19.source` with the document title and section, and quiet `o19.openSource`.
   - Or `o19.noAnswer` with the coordinator note.
4. Note `o19.note` (`--ink-2`) at the end.
5. Section `o19.savedGuides`: links to the guide documents cached on the phone (titles from the guide index).

**Tablet 768 px:** question and answer left; saved guides right.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | open | empty field; saved guides listed |
| Empty submit | Ask with empty field | `o19.empty` |
| Asking | ASK-01 in flight | button `o19.asking`, disabled |
| Answer | ASK-01 ok with sources | passages + source |
| No approved answer | ASK-01 `no_approved_answer` | `o19.noAnswer` (never a guess) |
| Offline | no network | `o19.offline`; Ask disabled; saved guides remain usable |
| Server error | fails | `o19.error` + `ui.retry` |
| Rate limited | `rate_limited` | `common.error.tooManyTries` |

## Message keys
`o19.*`, `o09.speak`, `o09.listening`, `o09.stop`, `o09.speakUnavailable`, `common.error.tooManyTries`, `ui.retry`, `ui.back`.

## API
- **ASK-01** `{question, locale}` → `{answered: true, passages: [{text, documentId, documentTitle, section, guideSlug, anchor}]}` or `{answered: false}`.
- The guide index and documents are cached by the service worker (contract 7).
- Questions are not stored on the phone after the session.

## Logic notes
- The answer is displayed as retrieved passages, not paraphrased by the phone. If the server returns a passage in another language than the locale (no approved translation), it is shown with a small language label so nobody thinks it was translated by the app.

## Accessibility
- After Ask, focus stays on the button; the answer area announces "Answer ready" or the no-answer sentence.
- Block quotes use `<blockquote cite>`; source link text names the document.

## Acceptance checks (Redmi)
1. Ask "What should I do if the polling unit opens late?": the answer quotes the observer guide and names it as the source.
2. Ask "Who will win?": the no-approved-answer sentence shows; no guess.
3. Airplane mode: Ask is disabled with the offline message, and saved guides still open.
4. Ask in Igbo: the answer shows in Igbo if an approved Igbo passage exists, otherwise in English with a language label.
