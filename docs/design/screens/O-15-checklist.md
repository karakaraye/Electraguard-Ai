# O-15 Polling-day checklist (stage list and stage form)

**Status:** READY for review · Routes: `/o/checklist` (stage list), `/o/checklist/[stage]` (stage form; route slug ∈ `arrival, opening, accreditation, voting, closing, results`, sent as REP-01 `stage` ∈ `arrival, opening, accreditation, voting, closing_counting, results_posted`) · Observers only · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
A structured, timestamped form per stage of polling day (plan 4.4). Each stage sends as its own report of `kind: "checklist"`, with the same queue, receipt and review. Any "No" offers to report an incident with what, where and when filled in.

## Entry and exit
- **Entry:** Home "Polling-day checklist".
- **Exit:** stage row → stage form; stage form Send → back to the stage list with that stage's state updated; "Report this as an incident" → O-05 with a new prefilled draft (the checklist answers stay in the checklist draft); Results posted "Check the result sheet" → O-16.
- **Back:** stage form → stage list (answers kept in a per-stage draft); stage list → Home.

## Layout

### Stage list (phone 360 px)
1. Title `o15.title`; hint `o15.hint`.
2. Six rows in fixed order (`o15.stage.*`), each 64 px: stage name, `StatusBadge` with `o15.stageState.*` (notStarted none, draft wait, onPhone wait, received ok + `o15.received` time from `received_at`). "Received" comes from REP-02 `kind=checklist` rows whose `checklist_stage` matches and whose `occurred_at` is today (WAT); other days are ignored.
3. No pinned button.

### Stage form (phone 360 px)
1. Title = the stage name (`o15.stage.*`); `Stepper` is **not** used (stages are independent).
2. If the stage is not Arrival and Arrival has no unit yet: `Banner` attn `o15.needUnit` with a link to Arrival; Send disabled.
3. Questions, one block each, label = `o15.q.*` (questions as plain questions), control per question. Question ids and answer values are the contract's (REP-01 checklist table); "Control" says what the screen shows. Every yes/no question has **three** answers in the contract, `yes`, `no` and `not_seen` ("I did not see"), so `YesNo` becomes `YesNoNotSeen` here (new key `o15.answer.notSeen`, see README):

| Stage (`stage`) | Question id | Control |
|---|---|---|
| Arrival (`arrival`) | place (`place.polling_unit_code`, not a question id) | `PollingUnitPicker` (O-07 behaviour, no ward-only option: an observer must be at a unit) |
| Arrival | `arrival_time` (datetime) | time input, default now, WAT, no future |
| Opening (`opening`) | `opened_on_time` | `YesNoNotSeen` |
| Opening | `materials_all_present` | `YesNoNotSeen`; No reveals `materials_missing` checkboxes `o15.material.*`, sent as `ballot_papers`, `result_sheets`, `ballot_boxes`, `voting_cubicles`, `indelible_ink`, `voter_register`, `accreditation_device`, `stamps_seals`, `other` (only when `materials_all_present` is `no`) |
| Opening | `officials_present`, `party_agents_present` | `YesNoNotSeen` |
| Accreditation (`accreditation`) | `device_working` | `YesNoNotSeen` |
| Accreditation | `queue_size` | radio `o15.queue.none/small/medium/large` sending `none`, `under_50`, `50_200`, `over_200` |
| Accreditation | `priority_given` | `YesNoNotSeen` |
| Voting (`voting`) | `secrecy_kept`, `assistance_available` | `YesNoNotSeen` |
| Voting | `disruption`, `inducement_seen` | `YesNoNotSeen` (here **Yes** is the problem answer) |
| Closing (`closing_counting`) | `closed_on_time`, `counting_public`, `agents_signed` | `YesNoNotSeen` |
| Results (`results_posted`) | `sheet_posted` | `YesNoNotSeen`; Yes reveals secondary button `o15.checkSheet` → O-16 |

An optional free `note` (up to 1000 characters) exists in the contract for every stage; this screen has no field for it yet (new key `o15.note`, see README).

4. Under each problem answer (`no`, or `yes` for `disruption` and `inducement_seen`; never for `not_seen`), an inline quiet button `o15.reportThis` with hint `o15.reportThisHint`.
5. Pinned: primary `o15.send` (`o15.sending`).

**Tablet 768 px:** stage list left (sticky), stage form right.

### "Report this as an incident" mapping (prefilled category)
| Problem answer | Category |
|---|---|
| `opened_on_time` = no, `materials_all_present` = no, `officials_present` = no | `late_materials` |
| `device_working` = no | `equipment_failure` |
| `queue_size` = `over_200` | `queues_crowding` (offered only then) |
| `priority_given` = no, `assistance_available` = no | `access_barrier` |
| `secrecy_kept` = no, `counting_public` = no, `agents_signed` = no, `closed_on_time` = no, `party_agents_present` = no | `not_sure` (observer chooses; nothing invented) |
| `disruption` = yes | `intimidation_violence` |
| `inducement_seen` = yes | `vote_buying` |
| `sheet_posted` = no | `lack_of_information` |

The incident draft gets: `category_observer` (above), `place` = the Arrival unit, `occurred_at` = now, and `from_checklist_question` = the question id; when the incident is sent, REP-01 also carries `related_report_id` = the checklist report's `id` (filled at send time, once that checklist has its server id). The observer can change all of them. Only one open incident draft exists (README R2): if one exists already, nothing is discarded; the existing draft opens on its last step with the `Banner` `o15.draftExists` (open question Q7 on whether to allow two drafts).

## States
| State | Trigger | What shows |
|---|---|---|
| First view | no stage started | all rows Not started |
| Draft | any answer in a stage | row Started |
| Unanswered | Send with blank questions | `Sheet` `o15.unanswered` (count), primary `o15.sendAnyway`, secondary `o15.goBack` (focus to first blank). Questions are optional because an observer may arrive late. |
| Need unit | no Arrival unit | banner, Send disabled |
| Sending / success | REP-01 `kind: "checklist"` | Send → `o15.sending`; `201`/`200` → stage list, row Received with time; no separate receipt screen (the `receipt_code` is in My reports / O-14) |
| Offline | no network | `o15.savedOffline`; row On this phone |
| Intake paused / session / revoked / not confirmed | `503 intake_paused`, `401 not_authenticated`, `403 code_revoked`, timeouts and `5xx` (R4, R5) | same as O-11 |
| Server validation | `422 validation_failed`; dotted paths such as `answers.2.answer`, `answers.0.question` (`invalid_choice`, `not_allowed_for_kind`, `duplicate`) | shown under the matching question (the index is the position in the sent `answers` array); a question that does not belong to the stage is a client bug and shows `common.error.server` |
| Already sent | stage Received | the row opens O-14 for that checklist report, not the form: answers are not kept on the phone after receipt (R8). The contract would accept a second report for the same stage, polling unit and day and marks it as superseding the first (REP-01), but this screen does not offer one. |

## Message keys
`o15.*` (all, including `o15.draftExists`; `o15.answer.notSeen` and `o15.note` are new), `o07.*` (picker inside Arrival), `o08.future`, `common.wat`, `common.status.*`, `o11.intakePaused`, `common.pinSheet.*`, `ui.back`.

## API
- **None for the definition:** the stages, question ids, answer values and materials list are fixed by the contract (REP-01 checklist table) and ship with the app; REF-01 carries no checklist definition.
- **REF-01.index / REF-01.state** for the Arrival unit picker (see O-07).
- **REP-01** `POST /api/v1/reports` with `kind: "checklist"`, `language`, `occurred_at`, `place`, `device_saved_at`, `stage`, `answers: [{question, answer}]` (each `question` belongs to the stage, each at most once; `arrival_time` takes a datetime, `queue_size` one of `none | under_50 | 50_200 | over_200`, `materials_missing` a list, every other question `yes | no | not_seen`), `note`, `related_report_id`. `Idempotency-Key` made when the stage goes to the outbox. Response as for incidents. There is no per-question timestamp in the contract.
- **REP-02** `kind=checklist` to show which stages are received today (`checklist_stage`, `received_at`).
- One report per stage per observer per polling unit per day is the counting rule: a second one is accepted and supersedes the first for coverage counts, it is not refused.

## Accessibility
- Each `YesNo` is a radio group labelled by its question; revealed follow-ups are announced and placed right after their question.
- "Report this as an incident" buttons have accessible names including the question ("Report this as an incident: Was the accreditation device working?").

## Acceptance checks (Redmi)
1. Fill Arrival with a unit and send: the row shows Received with a time; My reports shows "Checklist: Arrival".
2. Open Opening before Arrival on a fresh phone: the banner asks to fill Arrival first.
3. Answer "Was the accreditation device working?" No (`device_working` = `no`), tap Report this as an incident: the incident flow opens with Equipment failure (`equipment_failure`) selected and the Arrival unit as the place.
4. Send Voting with two blanks: the sheet says 2 questions have no answer; Send anyway sends it.
5. In airplane mode, send Closing: the row shows On this phone; it becomes Received when network returns.
6. Results posted Yes shows "Check the result sheet".
