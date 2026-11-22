# O-07 Where did it happen? (step 3 of 7)

**Status:** READY for review · Route: `/o/new/where` · Shared rules: [README](README.md#shared-rules-every-screen-follows-these-specs-only-note-exceptions)

## Purpose
Record the polling unit, or the ward if the unit is unknown, from a list stored on the phone. Never GPS.

## Entry and exit
- **Entry:** O-06 (No, or Continue after emergency); O-11 Change on Where.
- **Exit:** Continue → O-08 (or O-11 in edit-return mode).
- **Back:** → O-06, selection kept.

## Layout
**Phone 360 px** (`AppShell`, `Stepper` 3 of 7):
1. Title `o07.title`.
2. If the observer filled Checklist "Arrival" today: a secondary full-width button `o07.useToday` (unit name + code). One tap selects it.
3. `PollingUnitPicker`, search mode first:
   - `SearchSelect` `o07.searchLabel`, hint `o07.searchHint`. Matches on polling-unit code (typed with or without dashes or spaces: both sides are compared with those characters removed; codes stay opaque strings and are never parsed, contract 1.1) and on unit name, accent-insensitive (`Ọ̀yọ́` matches `oyo`). Results list max 20 rows, each: unit name, then `polling_unit_code · ward · LGA` in `--t-small`.
   - Divider text `o07.orChoose`.
   - Drill mode: four `Select`s in order `o07.state` → `o07.lga` → `o07.ward` → `o07.unit`, each enabled only when the previous has a value; each defaults to `o07.choose`. Changing a higher level clears the lower ones.
   - Under the Ward select: checkbox-style button `o07.unknownUnit` with note `o07.unknownUnitNote`. When on, the Unit select is disabled and cleared.
4. Selected summary line `o07.selected` (`place` = "Unit name, Ward, LGA" or "Ward, LGA").
5. Quiet note `o07.noGps` with crossed location icon.
6. Pinned: primary `common.continue`.

**Tablet 768 px:** search on the left, drill selects in a 2×2 grid on the right; summary spans both.

## States
| State | Trigger | What shows |
|---|---|---|
| First view | no place chosen | empty search; drill selects at Choose; if a previous report today used a unit, `useToday` button shown |
| Filled | unit or ward chosen | summary line; search field shows the unit name |
| No results | search text with no match | `o07.noResults` with the query |
| Validation error | Continue with no unit, and not (ward + unknownUnit) | `o07.error`, focus to search field |
| List missing | REF-01 data for the chosen state not yet cached (first run offline) | `Banner` `o07.listMissing`; drill selects disabled; Continue still validates (cannot pass). The draft is kept so the observer can come back. |
| Downloading | first run online, state file downloading (REF-01.state) | `o07.listDownloading` with real percent from bytes received against `bytes_gzip` of that state in REF-01.index; picker enabled when done |
| Offline | list cached | works fully |
| Server error | REF-01 download fails (`5xx`, `503 service_unavailable`; `404 not_found` for an unknown state) | `common.error.server` inside the list-missing banner with `ui.retry` |
| Validation (server) | REP-01 `422` with `fields["place.ward_code"].code = unknown_area` or an error on `place.polling_unit_code` | O-11 sends the observer back here with `o07.error` and the picker open; the list is refreshed first (REF-01 `If-None-Match`) |
| Empty / sending / success | n/a | — |

## Message keys
`ui.stepOf`, `o07.*` (all), `common.continue`, `common.error.server`, `ui.retry`, `ui.back`.

## API
- **REF-01.index** `GET /api/v1/reference/areas` → `{dataset_version, source, states: [{state_code, name, lga_count, unit_count, version, bytes_gzip}]}` (about 3 KB). Fetched with `If-None-Match`; `304` keeps the cached copy.
- **REF-01.state** `GET /api/v1/reference/areas/{state_code}` → `{state_code, name, version, lgas: [{lga_code, name, wards: [{ward_code, name, units: [[polling_unit_code, name], ...]}]}]}`. Cacheable (`ETag`, `stale-while-revalidate`). The phone downloads only the state or states the observer chooses; nothing in the contract tells the observer app which states to preload (contract gap G4), so the State select lists every state from the index and downloads the one chosen. Stored in IndexedDB; the search index is built on the phone.
- A report made with an older list version is still accepted if the code exists in any version the server knows; otherwise `unknown_area`. Names are shown as officially written, never translated.
- REP-01 `place`: `polling_unit_code` (or `null` for "I don't know the polling unit") and `ward_code` (required when the unit is null; must contain the unit when both are given). Draft fields: `place.polling_unit_code | null`, `place.ward_code`; the level (unit or ward) is whichever code is set.
- `source: "synthetic"` from REF-01.index is not shown on this screen (it is a footnote on S-05).

## Logic notes
- No `navigator.geolocation` call exists anywhere in the codebase (lint rule recommended).
- "Use my polling unit today" is the unit from the latest checklist Arrival stage on this phone, same calendar day in WAT; cleared at midnight WAT and by "clear this phone".
- Ward-only reports show `o13.unknownPlace` in lists.

## Accessibility
- Search results are a listbox with `aria-activedescendant`; result count announced politely ("5 results").
- Selects are native `<select>` for reliable TalkBack behaviour on low-end Android.
- The summary line is `aria-live="polite"`.

## Acceptance checks (Redmi)
1. Type `KN-04-07-012`, `kn 04 07 012` and `KN0407012`: all find the same unit.
2. Type a Yorùbá place name without tone marks: it still matches.
3. Choose State → LGA → Ward, tap "I don't know the polling unit": summary shows ward only; Continue works.
4. Change the State after choosing a unit: LGA, Ward and Unit clear.
5. First run in airplane mode as a citizen: the list-missing banner shows and Continue cannot pass; draft is kept; turn network on: the download percent shows and the picker works.
6. Confirm in DevTools (remote debugging) that no location permission is ever requested.
