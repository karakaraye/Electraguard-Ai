# O-05 What happened? (incident step 1 of 7)

**Status:** READY for review · Route: `/o/new/what` (observer), `/r/new/what` (citizen) · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Pick the kind of event with one tap on a picture, readable without the label. "Not sure" is a valid answer.

## Entry and exit
- **Entry:** Home "Report something" (new draft) or "Continue your report"; citizen path from O-03; O-15 "Report this as an incident" (draft created with category prefilled, so this screen opens with that tile selected); O-11 "Change" on What happened.
- **Exit:** Continue → O-06. From O-11 Change → back to O-11 after Continue (edit-return mode: every step reached from O-11 returns to O-11).
- **Back:** to Home (observer) / P-02 public home (citizen), draft kept (R3). In edit-return mode Back returns to O-11 without changes.

## Layout
**Phone 360 px** (`AppShell` with `ui.back`, title area, `ui.menu` with "Delete this report"):
1. `Stepper` `ui.stepOf` (1 of 7).
2. Title `o05.title`; hint `o05.hint`.
3. `ChoiceTile` grid, 2 columns, 12 px gap, each tile min 120 px tall: 40 px pictogram above the label (labels wrap to 3 lines; never truncated). Order is fixed:
   1. `o05.tile.materials` (box) · 2. `o05.tile.equipment` (broken device) · 3. `o05.tile.queues` (queue of people) · 4. `o05.tile.intimidation` (raised fist/threat) · 5. `o05.tile.access` (steps/wheelchair) · 6. `o05.tile.information` (speech bubble with ?) · 7. `o05.tile.misinformation` (phone with warning) · 8. `o05.tile.inducement` (hand passing money) · 9. `o05.tile.goodPractice` (thumbs up) · 10. `o05.tile.notSure` (question mark).
   Each tile sends one wire value of `category_observer` (REP-01), so every other screen reads the same ids:

   | Tile key | `category_observer` |
   |---|---|
   | `materials` | `late_materials` |
   | `equipment` | `equipment_failure` |
   | `queues` | `queues_crowding` |
   | `intimidation` | `intimidation_violence` |
   | `access` | `access_barrier` |
   | `information` | `lack_of_information` |
   | `misinformation` | `misinformation` |
   | `inducement` | `vote_buying` |
   | `goodPractice` | `good_practice` |
   | `notSure` | `not_sure` |
4. When `access` is selected, a group expands **inline under the grid** (not a modal): `o05.access.title`, hint `o05.access.hint`, checkboxes `steps`, `distance`, `noAssistance`, `noLargePrint`, `noSignLanguage`, `other`, which send `access_barrier_details` values `steps_no_ramp`, `distance`, `no_assistance`, `no_large_print_braille`, `no_sign_language`, `other` (optional, many; sent only with `access_barrier`, otherwise the server answers `not_allowed_for_kind`).
5. Pinned bottom: primary `common.continue`.

**Tablet 768 px:** 3 columns; at ≥ 1024 px 5 columns (2 rows). Access options in 2 columns.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | new draft | no tile selected; Continue enabled (tapping it validates) |
| Filled | tile chosen | selected tile has 2 px ink border + tick badge; draft created/updated immediately |
| Validation error | Continue with nothing chosen | `o05.error` above the grid, `aria-live="assertive"`, focus to the first tile |
| Offline | no network | works fully (no request) |
| Prefilled | from O-15 | the mapped tile is selected (see O-15 mapping) |
| Sending / server error / success / empty | n/a | none on this step |

## Message keys
`ui.stepOf`, `o05.title`, `o05.hint`, `o05.tile.*` (10), `o05.access.*`, `o05.error`, `common.continue`, `ui.back`, `ui.menu`, `incident.discard`, `common.discard.*`.

Category labels in `o05.tile.*` are reused by every list and summary (O-11, O-13, O-14, O-17, P-01). Do not create copies.

## API
- **None called by this step.** The ten categories and their order are fixed by the contract (REP-01 `category_observer`) and ship with the app; REF-01 carries no category list and cannot disable one, so no tile is ever hidden by the server.
- Draft fields (wire values, so REP-01 needs no mapping): `category_observer` (one of `late_materials, equipment_failure, queues_crowding, intimidation_violence, access_barrier, lack_of_information, misinformation, vote_buying, good_practice, not_sure`), `access_barrier_details: string[]`.
- Citizen mode sends the same fields with REP-05.

## Logic notes
- Changing the category later never clears other steps, except that leaving `access_barrier` clears `access_barrier_details`.
- `intimidation` pre-selects nothing on O-06; the danger question is always asked for every category, because danger is not only violence.
- "Not sure" is stored as `not_sure` (observer only: triage never suggests it); the server's AI suggestion is shown to reviewers only as "Suggested" (contract REP-01, server-side work after commit), never to the reporter as a decision.

## Accessibility
- Radio group labelled by the title; arrow keys move between tiles; each tile's accessible name is its label (pictograms `aria-hidden`).
- The access group, when it expands, is announced ("What kind of barrier?, group") and placed directly after the selected tile in focus order.

## Acceptance checks (Redmi)
1. All ten tiles show in the order above in 2 columns at 360 px; no label is cut off in Hausa or Yorùbá at 200% text.
2. Continue with nothing chosen shows the error and moves focus to the first tile.
3. Choose Access barrier: the barrier options appear under the grid; choose two; go to the next step and back: both are still ticked.
4. Kill the app after choosing a tile: reopening shows "Continue your report" on Home.
5. Menu → Delete this report → Delete: Home no longer shows the draft.
