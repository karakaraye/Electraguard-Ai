# Final verification, 2026-11-26

Phase 7 of the ElectraGuard redesign. Every screen and state from the dev viewers and the real public routes was captured with Playwright (Chromium headless, reduced motion, light mode), then checked with axe-core (WCAG 2.1 A and AA plus best-practice), horizontal overflow, clipped text and console errors. The five languages were checked on a sample of key screens.

Screenshots: `docs/design/redesign/screens-final/<area>/<screen>-<state>-<width>.png` (language pass in `screens-final/lang/`). Observer screens at 390 and 360 wide; public pages at 1440 and 390; staff at 1440, 1100 and 390; full page.

## Totals

| | Before | After |
|---|---|---|
| Captures (screen x state x width) | 925 | 925 |
| Distinct screen/state pairs | 384 | 384 |
| axe nodes, product code | 986 | 6 |
| axe nodes, raw (includes dev-viewer harness noise) | 1702 | 314 |
| Captures with horizontal overflow | 27 | 1 |
| Console errors | 481 | 35 |
| Language sample captures with truncated or overflowing text | see below | 0 |

"Product" axe nodes exclude findings that only come from the development viewers: the viewers' own navigation bar outside a landmark, the viewers' nesting of a second main landmark inside the public shell, and the missing level-one heading on viewer pages that the real routes supply. The real public routes (`/`, `/results`, `/check`, `/ask`, `/guide`, `/phone`, `/privacy`, `/status`) had 0 axe violations before and after.

Console errors that remain are API connection failures because no backend runs for this server (all 27 are the 500 responses on the case review screen, S-03, whose fixtures call the API), plus a small number of intermittent development-mode hydration warnings (observer o19 asking, o20, real home and status, staff s10 create-duplicate; they did not reproduce on single reloads) and one hydration error on the viewer-only state `public-dev/check/checked_english_only`, which forces a different language than the page default.

## Findings fixed

| Finding | Where | Fix |
|---|---|---|
| Page content outside any landmark (action bars, composer, welcome dots) | Observer app shell action area, 20+ screens | Action area is now a labelled region (`ui.actionArea`, five languages) |
| Heading levels skipped (h1 to h3) | Staff case review S-03 | Column titles are h2, card titles h3 |
| Complementary landmark nested inside main | Staff publish S-07 (exclusions) | Section with its own label instead of aside |
| Scrollable table not keyboard reachable | Staff operations room, check-in results | Scroll wrapper is a focusable labelled region |
| Page scrolled sideways at 390 (up to 789 px wide) | Staff observer codes S-09, staff accounts S-10 | A hidden screen-reader label inside the table escaped its scroll box; scroller is now the positioning context |
| Staff preview shell had no main landmark | Staff viewer | Shell always renders main, which also removed 429 viewer-only landmark findings and a duplicate banner |
| Report titles cut off with an ellipsis in long languages | Report rows (my reports, home) | Titles wrap to two lines |
| Bottom-bar label truncated (Yorùbá) | Bottom navigation | Labels wrap and balance instead of truncating |
| "On this phone" filter wrapped to three lines (Yorùbá, Hausa) | My reports filter | Shorter filter labels in pcm, ha, yo, ig |
| SMS short code and USSD code shown as if live | Home hero and three ways, on-screen phone (dial, SMS, how to try), receipt, status | One flag `SMS_SHORT_CODE_IS_TEST` in `frontend/lib/config.ts`; `TestNumberNote` prints "Test number for this prototype" in all five languages; setting the flag to false removes every label |

## Remaining

- Observer splash has no main or level-one heading (it is a short-lived overlay on the page behind it) and observer notice "gone" (o21) has no level-one heading.
- Component gallery `/dev/ui` is 407 px wide at 390 (gallery layout, not a product screen). Its dark pane has one contrast finding; the product is light only.
- Intentional single-line truncation remains in dense staff tables (rumour desk claim text, long place names in the queue at 390) and line clamps on long report text; full text is on the detail screens.
- Hausa "Jerin abubuwan ranar zaɓe" is 3 px wider than its box at 390 (no visible clipping).

## Language sample (en, pcm, ha, yo, ig)

Screens: observer o01, o03, o04, o05, o09, o10, o12, o13, o15, o17, o20, c01, p01; public home, phone, check, ask; staff s01, s02. Before: filter label wrapping (ha, yo), truncated report titles (ha, pcm), truncated bottom-bar label (yo). After: no overflow, no truncated labels. Place names in staff fixtures stay in English because they are data.

## Every screen and state

Columns: axe product nodes before and after, raw axe nodes after, overflow (width that overflowed), console errors after.

| Area | Screen | State | Widths | axe before | axe after | axe raw after | Overflow | Console |
|---|---|---|---|---|---|---|---|---|
| dev-gallery | motion | default | 1440/390 | 0 | 0 | 2 | no | 0 |
| dev-gallery | system | default | 1440/390 | 0 | 0 | 0 | no | 0 |
| dev-gallery | ui | default | 1440/390 | 0 | 0 | 29 | yes 390 | 0 |
| observer | c01 | keep-off | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | c01 | success | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | c01 | uploading | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o01 | first | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o01 | offline | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o01 | selected | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o02 | first | 360/390 | 2 | 0 | 0 | no | 0 |
| observer | o02 | offline | 360/390 | 2 | 0 | 0 | no | 0 |
| observer | o03-choose | first | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o03-revoked | none | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o03-revoked | unsent | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o03-setpin | first | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o03-setpin | mismatch | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o03-setpin | sending | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o03-setpin | too-simple | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o03-signin | code-format | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o03-signin | empty | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o03-signin | locked | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o03-signin | offline | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o03-signin | pin-format | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o03-signin | revoked | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o03-signin | sending | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o03-signin | server | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o03-signin | wrong | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o04 | after-closing | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o04 | checkin | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o04 | filled | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o04 | intake-paused | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o04 | network-back | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o04 | new | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o04 | offline | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o04 | outbox | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o04 | waiting-code | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o05 | access | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o05 | citizen | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o05 | error | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o05 | first | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o05 | offline | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o06 | emergency | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o06 | first | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o06 | yes | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o07 | citizen | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o07 | downloading | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o07 | empty | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o07 | error | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o07 | list-missing | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o07 | no-index | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o07 | selected | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o07 | server-error | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o07 | today-selected | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o07 | today | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o07 | ward-only | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o08 | another-day | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o08 | earlier-today | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o08 | empty | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o08 | future | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o08 | just-now | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o08 | network-time | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o08 | old | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o09 | denied | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o09 | empty | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o09 | filled | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o09 | listening | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o09 | name-warning | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o09 | note | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o09 | source-error | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o09 | too-long | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o09 | too-short | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o09 | unavailable | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o10 | empty | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o10 | items | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o10 | limit | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o10 | mic-denied | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o10 | offline | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o10 | processing | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o10 | recording | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o10 | too-big | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o10 | too-long | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o11 | access | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o11 | citizen | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o11 | first | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o11 | incomplete | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o11 | intake-paused | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o11 | long-text | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o11 | needs-attention | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o11 | not-confirmed | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o11 | offline | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o11 | queue-full | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o11 | saved-offline | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o11 | sending | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o11 | server | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o12 | all-saved | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o12 | citizen | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o12 | failed | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o12 | no-attachments | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o12 | offline | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o12 | uploading | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o13 | empty | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o13 | error | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o13 | filled | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o13 | loading | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o13 | needs-you | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o13 | offline | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o14 | closed | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o14 | in-review | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o14 | loading | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o14 | not-found | 360/390 | 2 | 0 | 0 | no | 0 |
| observer | o14 | offline | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o14 | on-phone | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o14 | question | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o14 | received | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o14 | too-late | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o14 | withdraw-sheet | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o14 | withdrawn | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o15 | list-all-done | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o15 | list-not-started | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o15 | list | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o15 | need-unit | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o15 | opening | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o15 | saved-offline | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o15 | unanswered | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o15 | voting | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o16 | errors | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o16 | photo | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o16 | reading | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o16 | suggested | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o17 | empty | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o17 | filled | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o17 | loading | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o17 | notices-only | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o17 | notices | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o17 | offline | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o17 | preview | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o17 | unavailable | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o18 | closed | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o18 | empty | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o18 | flag | 360/390 | 6 | 0 | 0 | no | 0 |
| observer | o18 | list | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o18 | name-warning | 360/390 | 6 | 0 | 0 | no | 0 |
| observer | o18 | thread | 360/390 | 6 | 0 | 0 | no | 0 |
| observer | o19 | answer | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o19 | asking | 360/390 | 0 | 0 | 0 | no | 1 |
| observer | o19 | first | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o19 | no-answer | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o19 | offline | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o20 | clear-sheet | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o20 | first | 360/390 | 0 | 0 | 0 | no | 1 |
| observer | o20 | pin | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o21 | answering | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o21 | closed | 360/390 | 2 | 0 | 0 | no | 0 |
| observer | o21 | gone | 360/390 | 4 | 2 | 2 | no | 0 |
| observer | o21 | not-counted | 360/390 | 2 | 0 | 0 | no | 0 |
| observer | o21 | offline | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o21 | safety | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | o21 | saved-offline | 360/390 | 2 | 0 | 0 | no | 0 |
| observer | o21 | sent | 360/390 | 2 | 0 | 0 | no | 0 |
| observer | ob1 | first | 360/390 | 2 | 0 | 0 | no | 0 |
| observer | ob1 | offline | 360/390 | 2 | 0 | 0 | no | 0 |
| observer | ob3 | first | 360/390 | 2 | 0 | 0 | no | 0 |
| observer | ob3 | offline | 360/390 | 2 | 0 | 0 | no | 0 |
| observer | p01 | closed | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | p01 | first | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | p01 | format | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | p01 | found | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | p01 | no-secret | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | p01 | not-found | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | p01 | question | 360/390 | 0 | 0 | 0 | no | 0 |
| observer | pending | needs-attention | 360/390 | 2 | 0 | 0 | no | 0 |
| observer | pending | not-confirmed | 360/390 | 2 | 0 | 0 | no | 0 |
| observer | pending | on-phone | 360/390 | 2 | 0 | 0 | no | 0 |
| observer | pending | unknown | 360/390 | 2 | 0 | 0 | no | 0 |
| observer | splash | first | 360/390 | 4 | 4 | 4 | no | 0 |
| public-dev | ask | abstained | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | ask | answered | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | ask | default | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | ask | empty | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | ask | error | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | ask | offline | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | check | checked_english_only | 1440/390 | 0 | 0 | 6 | no | 2 |
| public-dev | check | checked_support | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | check | checked | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | check | default | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | check | error_network | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | check | error_rate_limited | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | check | invalid | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | check | matched | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | check | not_checked | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | check | queued | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | check | safety | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | check | typing | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | guide-doc | default | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | guide-doc | error | 1440/390 | 0 | 0 | 8 | no | 0 |
| public-dev | guide | default | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | guide | empty | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | guide | error | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | home | default | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | home | empty | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | home | error | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | phone | default | 1440/390 | 0 | 0 | 8 | no | 0 |
| public-dev | phone | disabled | 1440/390 | 0 | 0 | 8 | no | 0 |
| public-dev | phone | inbox | 1440/390 | 0 | 0 | 8 | no | 0 |
| public-dev | phone | invalid | 1440/390 | 0 | 0 | 8 | no | 0 |
| public-dev | phone | network | 1440/390 | 0 | 0 | 8 | no | 0 |
| public-dev | phone | server | 1440/390 | 0 | 0 | 8 | no | 0 |
| public-dev | phone | sms | 1440/390 | 0 | 0 | 8 | no | 0 |
| public-dev | phone | starting | 1440/390 | 0 | 0 | 8 | no | 0 |
| public-dev | phone | too_many | 1440/390 | 0 | 0 | 8 | no | 0 |
| public-dev | phone | ussd | 1440/390 | 0 | 0 | 8 | no | 0 |
| public-dev | privacy | default | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | results | default | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | results | empty | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-dev | results | error | 1440/390 | 0 | 0 | 6 | no | 0 |
| public-real | ask | live | 1440/390 | 0 | 0 | 0 | no | 0 |
| public-real | check | live | 1440/390 | 0 | 0 | 0 | no | 0 |
| public-real | guide | live | 1440/390 | 0 | 0 | 0 | no | 0 |
| public-real | home | live | 1440/390 | 0 | 0 | 0 | no | 2 |
| public-real | phone | live | 1440/390 | 0 | 0 | 0 | no | 0 |
| public-real | privacy | live | 1440/390 | 0 | 0 | 0 | no | 0 |
| public-real | results | live | 1440/390 | 0 | 0 | 0 | no | 0 |
| public-real | status | live | 1440/390 | 0 | 0 | 0 | no | 1 |
| staff-roles | s02 | default-coordinator | 1440/390 | 10 | 0 | 0 | no | 0 |
| staff-roles | s02 | default-moderator | 1440/390 | 10 | 0 | 0 | no | 0 |
| staff-roles | s02 | default-org_admin | 1440/390 | 10 | 0 | 0 | no | 0 |
| staff-roles | s02 | default-reviewer | 1440/390 | 10 | 0 | 0 | no | 0 |
| staff | s01 | account_locked | 1100/1440/390 | 0 | 0 | 0 | no | 0 |
| staff | s01 | default | 1100/1440/390 | 0 | 0 | 0 | no | 0 |
| staff | s01 | enrol | 1100/1440/390 | 0 | 0 | 0 | no | 0 |
| staff | s01 | invalid_credentials | 1100/1440/390 | 0 | 0 | 0 | no | 0 |
| staff | s01 | invite_fair | 1100/1440/390 | 0 | 0 | 0 | no | 0 |
| staff | s01 | invite_invalid | 1100/1440/390 | 0 | 0 | 0 | no | 0 |
| staff | s01 | invite_short | 1100/1440/390 | 0 | 0 | 0 | no | 0 |
| staff | s01 | invite_strong | 1100/1440/390 | 0 | 0 | 0 | no | 0 |
| staff | s01 | invite | 1100/1440/390 | 0 | 0 | 0 | no | 0 |
| staff | s01 | loading | 1100/1440/390 | 0 | 0 | 0 | no | 0 |
| staff | s01 | rate_limited | 1100/1440/390 | 0 | 0 | 0 | no | 0 |
| staff | s01 | totp_invalid | 1100/1440/390 | 0 | 0 | 0 | no | 0 |
| staff | s01 | totp_typing | 1100/1440/390 | 0 | 0 | 0 | no | 0 |
| staff | s01 | totp | 1100/1440/390 | 0 | 0 | 0 | no | 0 |
| staff | s02 | default | 1100/1440/390 | 15 | 0 | 0 | no | 0 |
| staff | s02 | empty_filtered | 1100/1440/390 | 15 | 0 | 0 | no | 0 |
| staff | s02 | empty | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s02 | error | 1100/1440/390 | 12 | 0 | 0 | no | 0 |
| staff | s02 | forbidden | 1100/1440/390 | 12 | 0 | 0 | no | 0 |
| staff | s02 | loading | 1100/1440/390 | 12 | 0 | 0 | no | 0 |
| staff | s02 | more | 1100/1440/390 | 15 | 0 | 0 | no | 0 |
| staff | s02 | new | 1100/1440/390 | 15 | 0 | 0 | no | 0 |
| staff | s03 | closed | 1100/1440/390 | 9 | 0 | 0 | no | 3 (3 API) |
| staff | s03 | closure_evidence_changed | 1100/1440/390 | 9 | 0 | 0 | no | 3 (3 API) |
| staff | s03 | default | 1100/1440/390 | 9 | 0 | 0 | no | 3 (3 API) |
| staff | s03 | error | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s03 | in_review | 1100/1440/390 | 9 | 0 | 0 | no | 3 (3 API) |
| staff | s03 | invalid_transition | 1100/1440/390 | 9 | 0 | 0 | no | 3 (3 API) |
| staff | s03 | loading | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s03 | pending_help | 1100/1440/390 | 9 | 0 | 0 | no | 3 (3 API) |
| staff | s03 | result_sheet | 1100/1440/390 | 9 | 0 | 0 | no | 3 (3 API) |
| staff | s03 | stale_version | 1100/1440/390 | 9 | 0 | 0 | no | 3 (3 API) |
| staff | s03 | validation | 1100/1440/390 | 9 | 0 | 0 | no | 3 (3 API) |
| staff | s04 | default | 1100/1440/390 | 3 | 0 | 3 | no | 0 |
| staff | s04 | empty | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s04 | error | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s04 | loading | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s04 | results | 1100/1440/390 | 3 | 0 | 3 | no | 0 |
| staff | s05 | checkins-approval | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s05 | checkins-mine | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s05 | checkins | 1100/1440/390 | 11 | 0 | 3 | no | 0 |
| staff | s05 | default | 1100/1440/390 | 9 | 0 | 3 | no | 0 |
| staff | s05 | empty | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s05 | error | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s05 | loading | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s05 | partial | 1100/1440/390 | 9 | 0 | 3 | no | 0 |
| staff | s06 | action_error | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s06 | approved | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s06 | default | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s06 | empty | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s06 | error | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s06 | filtered | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s06 | loading | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s06 | matches_loading | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s06 | new_claim | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s06 | no_matches | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s06 | notice | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s06 | public-no-evidence | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s06 | public | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s06 | same_person | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s07 | auto_release_on | 1100/1440/390 | 6 | 0 | 0 | no | 0 |
| staff | s07 | auto_release_unknown | 1100/1440/390 | 6 | 0 | 0 | no | 0 |
| staff | s07 | confirm_sheet | 1100/1440/390 | 6 | 0 | 0 | no | 0 |
| staff | s07 | confirm_stale | 1100/1440/390 | 6 | 0 | 0 | no | 0 |
| staff | s07 | cutoff_too_recent | 1100/1440/390 | 6 | 0 | 0 | no | 0 |
| staff | s07 | default | 1100/1440/390 | 6 | 0 | 0 | no | 0 |
| staff | s07 | discard_sheet | 1100/1440/390 | 6 | 0 | 0 | no | 0 |
| staff | s07 | discarded | 1100/1440/390 | 6 | 0 | 0 | no | 0 |
| staff | s07 | empty | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s07 | error | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s07 | forbidden | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s07 | history | 1100/1440/390 | 6 | 0 | 0 | no | 0 |
| staff | s07 | loading | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s07 | not_ready | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s07 | preview_ready | 1100/1440/390 | 6 | 0 | 0 | no | 0 |
| staff | s07 | published | 1100/1440/390 | 6 | 0 | 0 | no | 0 |
| staff | s07 | schedule_sheet | 1100/1440/390 | 6 | 0 | 0 | no | 0 |
| staff | s07 | superseded | 1100/1440/390 | 6 | 0 | 0 | no | 0 |
| staff | s07 | suppressed | 1100/1440/390 | 6 | 0 | 0 | no | 0 |
| staff | s08 | close_closed | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s08 | close_sheet | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s08 | create_filled | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s08 | create_sheet | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s08 | default | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s08 | empty | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s08 | error | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s08 | forbidden | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s08 | hidden | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s08 | hide_done | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s08 | hide_sheet | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s08 | loading | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s08 | name_detected | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s08 | not_ready | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s08 | remove_sheet | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | batch_created | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | confirm_failed | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | confirm_required | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | create_invalid | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | create_rate_limited | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | create_sheet | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | default | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | empty | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | error | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | filter_locked | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | forbidden | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | loading | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | not-ready | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | print | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | reissue_sheet | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | reset_sheet | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | revoke_already_revoked | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | revoke_sheet | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | search_no_match | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s09 | single_card | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s10 | create-duplicate | 1100/1440/390 | 3 | 0 | 0 | no | 1 |
| staff | s10 | create-invalid | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s10 | create | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s10 | default | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s10 | empty | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s10 | error | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s10 | forbidden | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s10 | invite | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s10 | loading | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s10 | not-ready | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s10 | offboard-last-admin | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s10 | offboard-self | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s10 | offboard-stale | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s10 | offboard | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s10 | reset-stale | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s10 | reset | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s11 | default | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s11 | empty | 1100/1440/390 | 3 | 0 | 0 | no | 0 |
| staff | s11 | error | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s11 | loading | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s11 | parties_locked | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s11 | pause_sheet | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s11 | paused | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s11 | resume_sheet | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s11 | retention_confirm | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s11 | retention_no_count | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s11 | saved | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s11 | stale | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s12 | acknowledged | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s12 | chain_broken | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s12 | default | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s12 | empty | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s12 | error | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s12 | export_range | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s12 | forbidden | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s12 | loading | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s12 | more | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s12 | not_ready | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s12 | not_run | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s12 | resolved | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s12 | update_sheet | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s12 | update_stale | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
| staff | s12 | verifying | 1100/1440/390 | 9 | 0 | 0 | no | 0 |
