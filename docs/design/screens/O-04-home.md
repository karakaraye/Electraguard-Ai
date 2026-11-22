# O-04 Home

**Status:** READY for review · Route: `/o` · Audience: signed-in observers (citizen mode has no Home; see below) · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Put "Report something" under the thumb, and show at a glance what needs the observer: unsent reports, questions from reviewers, a draft to continue.

## Entry and exit
- **Entry:** after sign-in; app open with a valid session; `ui.back` from any top-level screen (O-13, O-15, O-17, O-18, O-19, O-20); after send from O-11 when the report stays on the phone; from O-12 "Back to home".
- **Exit:** Report something / Continue your report → O-05 (or the draft's last step); Checklist → O-15; My reports → O-13; Messages → O-17; Discussions → O-18; Ask → O-19; Menu → O-20 and Language sheet.
- **Back:** Android Back on Home leaves the app (default browser behaviour); no confirm, because nothing is lost.

## Layout
**Phone 360 px** (`AppShell`: no Back; title `common.appName`; right side `ui.menu` button):
1. Under the top bar, in this priority order (each a `Banner`, never auto-dismissed except `back`):
   1. Network bar (R6).
   2. Revoked-items banner (R5) if items wait from a revoked code.
   3. `o04.intakePaused` (attn) when REP-06 says paused.
   4. `o04.unsent` (wait) with action `o04.sendNow` when ≥ 1 item is `queued`/`unconfirmed`. It stays visible while offline, with Send now disabled and `ui.offline` beside it, so the observer always knows the count.
   5. `o04.questionBanner` (attn, diamond) with action `o04.answer` → the oldest report with an open question (O-14), when count ≥ 1.
2. Line `o04.signedInAs` (`--t-small`, tabular) so the holder can see which code is active on a shared phone.
3. If a draft exists: a card `o04.continueDraft` with the draft's category pictogram, `o04.draftSaved`, as a **secondary** full-width button above the primary. Otherwise nothing.
4. Primary `Button` `o04.report`, full width, 64 px, with the plus-in-square pictogram. It sits in the content (not the bottom bar) so it is the first thing after the banners; it is also the only primary on the screen.
5. A plain list (rows separated by `--rule`, not cards), each row 64 px, pictogram + label + right-aligned meta:
   - `o04.checklist` · meta `o04.checklistProgress` (hidden before any stage is started).
   - `o04.myReports` · meta `o04.myReportsCount`.
   - `o04.messages` · meta `o04.messagesCount`, `StatusBadge` attn when > 0.
   - `o04.discussions` · meta `o04.discussionsInvite` (row shown only if DIS-01 returns at least one invitation or membership).
   - `o04.ask` · meta `o04.askHint`.
6. Install prompt (once, after the first successful sign-in, only when the browser offers `beforeinstallprompt` and the app is not installed): `Banner` at the bottom of the list with `o04.install.title`, `o04.install.body`, actions `o04.install.add` / `o04.install.notNow`. Dismissal is stored; never shown again.

**Tablet 768 px:** two columns at ≥ 720 px: left column banners + draft + primary button; right column the list. Max width 960 px.

## States
| State | Trigger | What shows |
|---|---|---|
| First view (new observer) | no reports, no draft | primary + list with `o04.myReportsCount` =0 form, Messages "Nothing new", no Discussions row |
| Filled | REP-07 data | counts and banners as above |
| Loading | REP-07 in flight on open | list renders immediately from the cached summary (last values) with no spinner; counts update in place; if no cache yet, meta text is empty (no fake zeros) |
| Offline | R6 | network bar; counts from cache; Discussions row from cache; Ask still opens (O-19 handles offline) |
| Server error | REP-07 5xx | cached counts kept; no error banner on Home (non-critical); retried with the sync loop |
| Session expired | AUTH-03 `session_expired` | Home still renders from cache; PIN sheet appears only when something needs to send (R5) or when opening a server-only screen |
| Revoked | `code_revoked` | O-03 revoked view replaces Home |
| Intake paused | REP-06 | banner 1.3; Report something still works (reports queue) |
| Empty | n/a | covered by first view |

## Citizen mode
Citizens have no Home: after C-01 "Report something else" goes to O-05, and "Check status" to P-01. The public home page (P-02, phase D3) is their start point.

## Message keys
`common.appName`, `ui.menu`, `o04.*` (all except none), `common.network.*`, `common.status.waitingCode`, `ui.offline`, `incident.draftKept`.

## API
- **AUTH-03** on app open (cheap; skipped when offline).
- **REP-07** home summary: `{reportsCount, openQuestions, unreadReports, discussionInvites, discussionsJoined, checklistStagesSent}`.
- **REP-06** intake state (also included in REP-07 if the contracts author prefers one call; flag in README).
- **DIS-01** only if REP-07 does not include discussion counts.
- Local: outbox counts, draft presence (IndexedDB).

## Accessibility
- Focus on load: the first banner if any critical banner (revoked, question) is present, else the primary button's heading context (the page `h1` is visually the app name; the `h1` text for screen readers is `o04.title`).
- Each list row is one link with its meta in the accessible name ("My reports, 3 reports").
- Banners use `role="status"`; the question banner uses `role="alert"` only when it first appears in a session.

## Acceptance checks (Redmi)
1. Fresh observer: Home shows Report something, Checklist, My reports (No reports yet), Messages (Nothing new), Ask; no Discussions row.
2. Start a report, choose a category, press Back: Home shows "Continue your report" above Report something; tapping either opens the same draft.
3. Airplane mode, send a report: Home shows "1 report is on this phone and not sent yet." Turn network on: the banner disappears after the receipt arrives, and My reports shows 1.
4. Reviewer asks a formal question: on reopen Home shows the question banner; Answer opens that report.
5. Organisation pauses intake: banner shows; a new report can still be written and queues.
6. 200% text at 320 px: no row truncates its label; meta wraps under the label.
