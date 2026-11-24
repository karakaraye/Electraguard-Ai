# Full-system integration, 24 November 2026

Testing branch `integrate/full-system`.

## Merge order

| Order | Source | Tip | Integration |
| --- | --- | --- | --- |
| 1 | `backend/v1-observer-extras` | `113a46e` | `f482fc3` |
| 2 | `backend/v1-intelligence` | `081d18a` | `4f00685` |
| 3 | `backend/v1-staff-extras` | `0f3df18` | Already reachable |
| 4 | PR #18 head | `c7dad87` | `e61960c` |
| 5 | `integrate/observer-e2e` | `e5e253f` | `1a40cc0` |
| 6 | `logic/observer-hardening` | `efbbb95` | `707539c` |
| 7 | `design/observer-screens-2` | `78f1185` | `073cb9a` |
| 8 | `design/staff-screens` | `f6f3d51` | `286fdba` |
| 9 | `design/public-pages` | `4d7760f` | `7f39599` |
| 10 | `design/art-v2` | `48d4198` | `f3e371c` |

## Conflict resolutions

- Combined staff, observer, phone and risk URL registrations and app settings. Kept all of the overlapping update-log entries.
- Kept the shared media queryset and both observer ownership and assigned-reviewer access rules. The reviewer detail retains result-sheet flags and supplies photo, video and audio counts to triage.
- Added `reports.0015_merge_media_and_observer_triage` to join the media leaf with the existing observer-and-triage merge. An empty database applied the resulting graph in one pass.
- Kept session refresh from observer hardening and pending report and sign-out recovery from the observer screen branch.
- Combined translation keys recursively in all five locales. Verified 1,304 English keys and 1,305 keys in each of Hausa, Igbo, Nigerian Pidgin and Yoruba against the union. The overlapping keys had identical text.
- Moved citizen status and receipt into a separate route group so their offline runtime and existing URLs remained intact. The server-rendered public pages keep their own layout.
- Bounded media streams now close their files when the response closes, including unsuccessful audit logging. Download checks consume streamed responses so temporary storage can be cleaned on Windows.
- The incident form transfers focus to the first heading when draft storage becomes ready. On a new report, the route and draft ID can stay the same while the heading first appears.
- Yes/no groups expose their invalid state alongside the existing field-specific error description. The report form uses this for an unanswered firsthand question.
- Coverage reads the area name from the imported reference schema and retains `lga_name` in its response. The checklist coverage regression seeds its own reference data and checks the name.

## Verification

The configured PostgreSQL server on port 55450 rejected the supplied credentials. Verification used an isolated PostgreSQL 18 cluster on loopback port 55454 with a fresh UTF-8 `electraguard_full` database.

- Fresh migrations passed. `makemigrations --check` reported no changes.
- The synthetic reference import loaded all 900 polling units under release `2026-11-23.2`.
- The fresh all-app suite collected 247 cases across all 13 apps on PostgreSQL port 55454 and finished in 275.208 seconds with 246 passed and one skip (`Ran 247 tests in 275.208s - OK (skipped=1)`).
- The Playwright real-observer end-to-end integration test (`01-happy-path.spec.ts`) executed against the running stack on port 3341 with Django on port 8141, verifying observer PIN setup, report creation with photo upload, receipt issuance, and persistence on the backend database.
- The four focused regression cases passed. They cover case closure, voice-note access, result-sheet photo download integrity and access reassignment.
- Frontend lint exited successfully with one existing unused-variable warning in `e2e/observer/flow.cjs`. Type checking and the production build passed.

## Production smoke

All 18 smoke checks passed against the production frontend on port 3341 and Django on port 8141. The pages `/`, `/results`, `/ask`, `/phone`, `/guide`, `/privacy`, `/status`, `/o/start`, `/o/reports`, `/o/settings` and `/s/sign-in` returned HTTP 200. The frontend proxy also returned HTTP 200 from `/api/v1/auth/csrf` and `/api/v1/public/results`. `/dev/art`, `/dev/observer`, `/dev/public`, `/dev/staff` and `/dev/ui` each returned HTTP 404.
