# O-15 Polling-day checklist (stage list and stage form)

**Status:** READY for review · Routes: `/o/checklist` (stage list), `/o/checklist/[stage]` (stage form; stage ∈ `arrival, opening, accreditation, voting, closing, results`) · Observers only · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
A structured, timestamped form per stage of polling day (plan 4.4). Each stage sends as its own report of type `checklist`, with the same queue, receipt and review. Any "No" offers to report an incident with what, where and when filled in.

## Entry and exit
- **Entry:** Home "Polling-day checklist".
- **Exit:** stage row → stage form; stage form Send → back to the stage list with that stage's state updated; "Report this as an incident" → O-05 with a new prefilled draft (the checklist answers stay in the checklist draft); Results posted "Check the result sheet" → O-16.
- **Back:** stage form → stage list (answers kept in a per-stage draft); stage list → Home.

## Layout

### Stage list (phone 360 px)
1. Title `o15.title`; hint `o15.hint`.
2. Six rows in fixed order (`o15.stage.*`), each 64 px: stage name, `StatusBadge` with `o15.stageState.*` (notStarted none, draft wait, onPhone wait, received ok + `o15.received` time).
3. No pinned button.

### Stage form (phone 360 px)
1. Title = the stage name (`o15.stage.*`); `Stepper` is **not** used (stages are independent).
2. If the stage is not Arrival and Arrival has no unit yet: `Banner` attn `o15.needUnit` with a link to Arrival; Send disabled.
3. Questions, one block each, label = `o15.q.*` (questions as plain questions), control per question:

| Stage | Question key | Control |
|---|---|---|
| Arrival | `arrivalUnit` | `PollingUnitPicker` (O-07 behaviour, no ward-only option: an observer must be at a unit) |
| Arrival | `arrivalTime` | time input, default now, WAT, no future |
| Opening | `openedOnTime` | `YesNo` |
| Opening | `materialsPresent` | `YesNo`; No reveals `materialsList` checkboxes `o15.material.*` |
| Opening | `officialsPresent`, `agentsPresent` | `YesNo` |
| Accreditation | `deviceWorking` | `YesNo` |
| Accreditation | `queueSize` | radio `o15.queue.none/small/medium/large` |
| Accreditation | `priority` | `YesNo` |
| Voting | `secrecy`, `assistance` | `YesNo` |
| Voting | `disruption`, `inducementSeen` | `YesNo` (here **Yes** is the problem answer) |
| Closing | `closedOnTime`, `countPublic`, `agentsSigned` | `YesNo` |
| Results | `sheetPosted` | `YesNo`; Yes reveals secondary button `o15.checkSheet` → O-16 |

4. Under each problem answer, an inline quiet button `o15.reportThis` with hint `o15.reportThisHint`.
5. Pinned: primary `o15.send` (`o15.sending`).

**Tablet 768 px:** stage list left (sticky), stage form right.

### "Report this as an incident" mapping (prefilled category)
| Problem answer | Category |
|---|---|
| openedOnTime = No, materialsPresent = No, officialsPresent = No | `materials` |
| deviceWorking = No | `equipment` |
| queueSize = large | `queues` (offered only when large) |
| priority = No, assistance = No | `access` |
| secrecy = No, countPublic = No, agentsSigned = No, closedOnTime = No, agentsPresent = No | `notSure` (observer chooses; nothing invented) |
| disruption = Yes | `intimidation` |
| inducementSeen = Yes | `inducement` |
| sheetPosted = No | `information` |

The incident draft gets: category (above), place = Arrival unit, observed time = now. The observer can change all of them. Only one open incident draft exists (README R2): if one exists already, nothing is discarded; the existing draft opens on its last step with the `Banner` `o15.draftExists` (open question Q7 on whether to allow two drafts).

## States
| State | Trigger | What shows |
|---|---|---|
| First view | no stage started | all rows Not started |
| Draft | any answer in a stage | row Started |
| Unanswered | Send with blank questions | `Sheet` `o15.unanswered` (count), primary `o15.sendAnyway`, secondary `o15.goBack` (focus to first blank). Questions are optional because an observer may arrive late. |
| Need unit | no Arrival unit | banner, Send disabled |
| Sending / success | REP-01 | Send → `o15.sending`; success → stage list, row Received with time; no separate receipt screen (the receipt code is in My reports / O-14) |
| Offline | no network | `o15.savedOffline`; row On this phone |
| Intake paused / session / revoked / not confirmed | R4, R5 | same as O-11 |
| Server validation | field errors | shown under questions |
| Already sent | stage Received | the row opens O-14 for that checklist report, not the form: answers are not kept on the phone after receipt (R8). |

## Message keys
`o15.*` (all, including `o15.draftExists`), `o07.*` (picker inside Arrival), `o08.future`, `common.wat`, `common.status.*`, `o11.intakePaused`, `common.pinSheet.*`, `ui.back`.

## API
- **REF-01** checklist definition (stages, question ids, control types, materials list) so the server and phone agree; the phone ships the default.
- **REP-01** type `checklist`: `{clientReportId, stage, pollingUnitId, answers: {questionId: value}, answeredAt per question, observedAt}`. One report per stage per observer per election day; a second send of the same stage after receipt is refused by the phone (row opens O-14) and by the server (`validation`).
- Data needed back: same receipt fields as incidents.

## Accessibility
- Each `YesNo` is a radio group labelled by its question; revealed follow-ups are announced and placed right after their question.
- "Report this as an incident" buttons have accessible names including the question ("Report this as an incident: Was the accreditation device working?").

## Acceptance checks (Redmi)
1. Fill Arrival with a unit and send: the row shows Received with a time; My reports shows "Checklist: Arrival".
2. Open Opening before Arrival on a fresh phone: the banner asks to fill Arrival first.
3. Answer "Was the accreditation device working?" No, tap Report this as an incident: the incident flow opens with Equipment failure selected and the Arrival unit as the place.
4. Send Voting with two blanks: the sheet says 2 questions have no answer; Send anyway sends it.
5. In airplane mode, send Closing: the row shows On this phone; it becomes Received when network returns.
6. Results posted Yes shows "Check the result sheet".
