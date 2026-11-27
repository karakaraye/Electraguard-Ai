# Light-mode UI audit (26 Nov 2026)

Scope: every screen, light mode only (the product is moving to light mode). Source: the screenshot set in `docs/design/redesign/screens/` and the code. This is the checklist for the finish round in `docs/design/redesign/FINISH-PLAN.md`. Totals: 78 screen defects (16 high, 39 medium, 23 low) and 14 system issues.

## A. Navigation (all three shells)

### Public header (`app/(public)/_components/PublicShell.tsx`, `shell.module.css`)
Problems
- The desktop bar is 104 px tall. A "Language" label is stacked above a 56 px select; the CSS override meant to hide it (`shell.module.css:345-360`) has no effect.
- The current page is not visible: the active state is a text underline (`:105-110`) that does not render.
- Seven items: Home repeats the logo, and Privacy belongs in the footer.
- The Report button exists only on `/`, after the hero scrolls away (`landing/HeaderReport.tsx`). The header is sticky only on the home page, with no border on scroll.
- Phone menu: a bordered "Menu" button that reads as a form control; a `<details>` dropdown whose shadow points up (`--shadow-sheet`); no scrim, no scroll lock, no motion.
- The hero headline starts at x=64 while the column starts at x=88.
- The footer links stack in one 240 px column. The reduced-motion block is duplicated (`:146-156`).

Redesign
- **Desktop.** A 64 px sticky bar on every page; a 1 px `--rule` border appears only after scrolling.
  - Left: 24 px mark and wordmark.
  - Middle: five items — Results · Check a rumour · Ask · Guides · SMS and USSD. Each is 40 px tall with 0 12 px padding, set in the new `--t-nav` (600, 15/1.2).
  - Item states: inactive `--ink-2`; hover `--paper-2` with an 8 px radius; active `--ink` with a 2 px ink bar, 24 px wide, sitting on the bar's bottom edge.
  - Right: a 36 px language chip (globe and "EN", opening a listbox; `LanguageSwitcher` gets a `hideLabel` prop), then the "Report what you saw" button, 40 px, on every page.
- **Phone.** A 56 px bar: the mark, a compact Report button (36 px) and an icon-only 44 px menu button.
  - The menu is a full-height top sheet with a scrim and scroll lock.
  - Rows are 56 px. The current row gets a `--paper-sunk` fill and a 3 px ink left bar.
  - The language radio list sits at the bottom, then the 112 line.
- **Footer.** Links in an inline row with a 24 px gap.

### Observer app bar and menu (`ui/AppShell/*`, `HomeView.tsx`)
Problems
- The centre is not truly centred: the grid is `auto 1fr auto` (`AppShell.module.css:83`), so the mark sits off-centre by 70–90 px on 03, 07, 18 and 30.
- Four different bar layouts. Screens 19–22, 27 and 31 have only Back, so there is no way to reach the menu.
- The centre shows the logo mark instead of the screen name.
- The menu is reachable inside the 7-step report flow, and receipts show Back into a form that has already been sent.
- The outbox badge stacks a ring, an envelope and a count inside 44 px.
- The menu sheet has no Home item and no current mark; Sign out sits above Language; the emergency banner splits the list; the identity card uses the selected-state sun colour; Guides uses the info icon.
- The spec's bottom navigation was deferred, and `ui/BottomNav` is built but unused.

Redesign
- **Bar.** 56 px plus the safe area, on a `1fr auto 1fr` grid.
  - Back on the left: 44 px hit area, 24 px icon.
  - Screen title in the centre, ellipsised.
  - On the right: Menu; Close (with a "Keep this draft and leave?" sheet) inside the report flow; Done on receipts, which also have no Back.
- **Bottom navigation:** Home · Report (+) · My reports · Messages (with count).
  - 56 px plus the safe area, 24 px icons, 12 px/600 labels.
  - The active item gets a `--paper-sunk` 56×32 pill behind its icon.
  - Hidden inside the report flow.
- **Outbox badge.** A 16 px count at the top right with a (-2, -2) offset; the sending ring goes around the count, not the icon; the count turns `--danger-solid` when sending fails.
- **Menu sheet, in this order:**
  1. Identity row on `--paper-2`.
  2. Home, Checklist, Ask, Discussions.
  3. Guides (book icon), Privacy, Settings.
  4. Language row.
  5. A small 112 line in danger text.
  6. Sign out last, in danger text.
  - Title and Close share one 56 px header row.

### Staff rail, header and phone tabs (`ui/StaffShell/*`, `app/(staff)/s/layout.tsx`)
Problems
- The black rail outweighs the work on every screen, and in previews it ends at about 956 px (`StaffShell.module.css:134-139`).
- Ten flat items with no groups, no signed-in user, no role, no election context and no intake status.
- Icons are wrong or duplicated: sliders for both Assign and Settings, a search icon for Rumours, phone-signal bars for Operations.
- Items are 48 px tall, too tall for a desktop list.
- The header is not sticky, has no breadcrumb (the case page shows two titles and no way back), has no search, and has a theme switcher.
- Phone tabs wrap and collide ("Review Queue", "Operations"/"Rumour Desk"); "More" sits off the baseline; the count overlaps the icon. There are three different active styles in one shell.
- The spec wants a top bar and menu sheet under 1024 px, and a 64 px collapsed rail at 1024–1279.

Redesign
- **Rail (≥ 1280).** Light: `--paper-2` with a 1 px `--rule` right border, 240 px wide.
  - Top block: mark, "ElectraGuard" and the election name.
  - Groups:
    - Review: Queue, Assign
    - Monitor: Operations, Rumour desk, Publish
    - Moderate: Discussions
    - Admin: Observer codes, Staff, Settings, Security
  - Items: 36 px, 18 px icon, 14 px/500.
  - Active item: `--paper-raised` fill, `--rule` border, ink text at 600.
  - Counts sit at the right, in tabular figures; urgent counts are a `--danger-bg` chip.
  - Pinned at the bottom: the intake status row ("Receiving reports" or "Intake paused") and the user row (initials, name, role, a menu with Sign out and Shortcuts).
- **Collapsed rail (1024–1279).** 64 px wide with tooltips.
- **Header.** Sticky, 56 px: breadcrumb ("Queue / EG-…"), H1 at 18/700, a 240 px search field with a "/" hint, and "?". No theme switcher.
- **Phone (< 1024).** A top bar with a menu button that opens a left sheet holding the same rail.
- **New icons:** inbox, user-plus, map-pulse, megaphone, upload, chat, key, users, sliders, shield.

### One navigation system
| Element | Rule |
|---|---|
| Bars | Phone: 56 + safe area. Desktop: 64 (public) or 56 (staff). Sticky; the border shows only after scroll, via one shared `useScrolled` hook. |
| Type | `--t-nav` 600 15/1.2. Inactive `--ink-2`, active `--ink`. |
| Icons | One set, one stroke (1.75). 20 px in bars and the rail, 24 px in tabs. No duplicates. |
| Active state | Vertical lists and tabs: `--paper-sunk` fill with ink 600 text (sheets add a 3 px left bar). Horizontal top nav: a 2 px ink bar on the bottom edge. |
| Counts | One Count component: 16–20 px, tabular. Neutral by default, `--danger-bg` when urgent, `--attn-solid` when it needs the person. |
| Sheets | 56 px header row (title on the left, × on the right). 56 px rows, grouped the same way as the desktop nav. |
| Language | A chip in bars, a radio list in sheets. Never a labelled select in a bar. |

## B. Screen defects

| # | Screen | Defect | Fix | Severity |
|---|---|---|---|---|
| 1 | 03, 07, 18, 30 | Centre mark off-centre by 70–90 px | `grid-template-columns: 1fr auto 1fr` | high |
| 2 | 03 | About 300 px of dead space above the pager | Bottom-align the text, or enlarge the art | low |
| 3 | 03 | Dots and "Skip" cramped together | Move Skip to the app bar; centre the dots above Next | medium |
| 4 | 06 | Bare "English" text link in the header | Use the language chip | medium |
| 5 | 06 | "Who are you?" | Change to "How are you reporting?" | low |
| 6 | 07 | Card illustration repeats the inputs and pushes the form down | Remove it, or use a 56 px thumbnail | medium |
| 7 | 07 | Error text is louder than the label | `--t-small` 600, 4 px under the field | low |
| 8 | 10 | Two full banners take about 420 px | One "Needs you (2)" card | high |
| 9 | 10 | A rule runs into the banner button | No divider; action left-aligned | medium |
| 10 | 10, 22 | "Continue" buttons have a leading chevron | Move the icon to the end, or drop it | medium |
| 11 | 10, 19, 21 | Report rows are about 200 px tall | Two lines, about 88 px | medium |
| 12 | 10 | Quick tiles are half empty | 72 px rows | low |
| 13 | 11–17 | Global menu inside the flow | Close with a "keep draft" sheet | medium |
| 14 | 12 | "Yes" tile always has a red border | Neutral until selected | medium |
| 15 | 14 | No helper line; empty space | Add a helper line | low |
| 16 | 13–15 | Three selection styles | One ChoiceTile with a trailing check | high |
| 17 | 13 | Rows both underlined and chevroned | Plain list rows | low |
| 18 | 15 | Label under the hints; mic overlaps the text | Label first; textarea padding | medium |
| 19 | 16 | Lone "Optional" pill | Eyebrow "Step 6 of 7 · Optional" | low |
| 20 | 16, 30, 44, 48 | Toggle off state reads as on | One Switch spec | high |
| 21 | 16 | Retake/Remove are bold links | Quiet 44 px buttons | medium |
| 22 | 17 | Seven loud "Change" links | Small quiet buttons | medium |
| 23 | 17 | Icons on only some values | Remove them | low |
| 24 | 18, 30 | Receipt offers Back into the sent form | Hide Back; show Done | high |
| 25 | 18 | Remove offered on some received items | Remove only before sending | medium |
| 26 | 18 | Art behind the text cuts contrast | Clear the art below the section | medium |
| 27 | 18, 30 | Halo, notches and perforation together | Keep only the perforation | low |
| 28 | 19 | Segment counts stacked, unequal widths | Equal-width segments, inline counts | medium |
| 29 | 19, 21 | Bare "1 new message" line | Make it a badge or count | low |
| 30 | 19–22, 27, 31 | Back-only bar | Full bar | high |
| 31 | 20 | Pictogram inline in the H1 | Disc above the H1 | medium |
| 32 | 20 | Reference has no label or copy button | Label and copy button | low |
| 33 | 20 | Orphan "Open photo 1" link | Whole row tappable | medium |
| 34 | 20 | Two add-media controls; composer not pinned | One control; pin the composer | medium |
| 35 | 20 | Stepper label wraps | Shorten it | low |
| 36 | 21 | Two count styles | One Count component | low |
| 37 | 22 | Progress shown three times; data mismatch | Timeline and summary only; fix the data | medium |
| 38 | 27 | Appearance control | Remove (light only) | high |
| 39 | 27 | Three sign-out controls | One row opening a sheet | medium |
| 40 | 28 | Menu order and marks | Reorder as in A | high |
| 41 | 28 | Outbox badge stacks three layers | Badge spec in A | medium |
| 42 | 28 | Sheet title and Close off-baseline | One header row | low |
| 43 | 28 | Info icon on Guides | Book icon | low |
| 44 | 30 | Three "save the code" prompts | Merge into one | medium |
| 45 | 30 | Loose footnote lines | One footnote block | low |
| 46 | 31 | Saved-code chip; Withdraw too loud | Full-width row; quiet danger link | medium |
| 47 | 32, 33, 37, 51 | 104 px header | Language chip | high |
| 48 | 32, 33 | No current page shown | Active bar | high |
| 49 | 32 | Hero off the column | Align to the column | medium |
| 50 | 32 phone | Faded art band | Full strength, or remove | low |
| 51 | 32, 33, 37, 51 | Footer link column | Inline row | medium |
| 52 | 33 | State bars unsorted | Sort descending | medium |
| 53 | 33 | Disclaimer at the bottom | Move it under the H1 | medium |
| 54 | 37 | Banner touches the header; repeated | 24 px gap; show it once | low |
| 55 | 37 | Step buttons inconsistent | Same button on every step | low |
| 56 | 38 | Dashed disabled button; three identity marks | Solid disabled; simplify | medium |
| 57 | 39 | Filter chips wrap | Segmented control plus a Filters popover | medium |
| 58 | 39 | Location and date wrap | `nowrap` and ellipsis | medium |
| 59 | 39 phone | Two select styles | One Select | medium |
| 60 | 40 | Two titles, no way back | Breadcrumb | high |
| 61 | 40 | RC- vs EG- references | One format | medium |
| 62 | 40 | Blue dashed suggestion cards | Solid neutral card | medium |
| 63 | 38, 40, 43, 47, 48 | Dashed disabled buttons | Solid `--rule`/`--paper-2`/`--ink-3` | high |
| 64 | 42 | Uneven KPI tiles; unclear label | Fixed height; rename | medium |
| 65 | 42, 48 | Date input echoed below itself | One date field | low |
| 66 | 43 | "Harm:" prefixes on chips | Drop the prefixes | medium |
| 67 | 43 | Four disabled buttons wrapping | One primary plus overflow | medium |
| 68 | 44 | Cards three deep | One surface level | medium |
| 69 | 44 | Toggle far from its label | One row | low |
| 70 | 46 | "Reset PINReissueRevoke" runs together | Gap, or an overflow menu | high |
| 71 | 39–46 | Rail labels differ between captures | One message set; recapture | high |
| 72 | 47 phone | Tab labels collide | Short labels, `nowrap` | high |
| 73 | 47 phone | Lone "—" and a disabled action | Hide unavailable actions | low |
| 74 | 48 | Uneven two-column cards | Single 720 px column | medium |
| 75 | 50 | Floating card with no way out | Render inside the shell; Back and search | medium |
| 76 | 51 | Nav had no "Check" item | Restore it | high |
| 77 | 51 | Box inside a card; decorative quote mark | 3 px ink left rule | low |
| 78 | 39–48 | Rail ends at about 956 px in previews | Fix the preview stretch | medium |

## C. System issues
1. **Light only.** The public shell defaults to `system`. Lock every shell to light, remove the theme switchers and the settings control, and keep the dark tokens in the file without connecting them. There is a duplicated `--paper-sunk` line in `tokens.css`.
2. **Missing heavy weight.** Headings ask for weight 800, but only 400–700 is loaded and Noto Sans Display is never loaded. Ship the Display files or set 700.
3. **Nav type sizes.** Ad-hoc sizes in the shells. Add `--t-nav` and `--t-count`.
4. **Radii.** Use 6 (chips and inputs), 10 (buttons and controls), 16 (cards and sheets), and pill (counts only).
5. **Disabled buttons.** Solid, not dashed (`Button.module.css:115-123`).
6. **Switches.** One Switch spec with a clear off state.
7. **Selection and active nav.** One selection grammar and one active-nav grammar.
8. **Sun accent.** The sun is overused. Keep it for the brand and the selected state; notes and icon discs move to `--paper-2`.
9. **Icons.** One set, sized per context.
10. **Shadows.** Add `--shadow-pop` for dropdowns; `--shadow-sheet` points upward.
11. **Font sizes.** `font: var(--t-small)` instead of an invalid `font-size` (`s/layout.tsx:176`).
12. **Chips.** Three kinds only: Status, Tag, Count.
13. **Nesting.** At most one surface level inside a card.
14. **Hygiene.** Duplicate CSS blocks and garbled characters in comments (`tokens.css:25`, `HeaderReport.tsx:9`).

## D. Motion
All motion uses transform and opacity only and drops to an 80 ms fade under reduced motion.
- **Active nav change:** the indicator slides to the new item (200 ms).
- **Bars on scroll:** the border fades in and the observer title fades up (160 ms).
- **Menus and sheets:** a scrim with staggered rows (240/320 ms).
- **Report steps:** the progress bar grows and the content slides 16 px in the direction of travel (240 ms).
- **Choosing an option:** the check pops and a 10 ms vibration fires.
- **Send:** the button closes into a ring, then a tick (400 + 240 ms).
- **Saving offline:** an envelope flies to the outbox badge and the badge bumps.
- **Receipt:** the tick draws itself and the code's characters fade in; Copy changes to "Copied".
- **Status changes:** the chip morphs from "On this phone" to "Received".
- **Checklist:** the timeline fills.
- **Queue:** an "n new" pill appears and new rows get a highlight.
- **Publish:** the status chip morphs and the history row slides in.
- **Pausing intake:** the status row turns amber with a single pulse.
