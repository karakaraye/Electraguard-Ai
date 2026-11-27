# ElectraGuard finish plan (26 Nov 2026)

The owner approved the vision mockups on 26 Nov with one change: the hero art must blend into the page instead of sitting in a frame. This plan turns those mockups into the shipped product. Deadline: the prototype is due 13 Dec 2026.

## 1. The vision (approved)

The mockups are the specification. Each one is in `docs/design/redesign/vision/`, as a rendered PNG with the HTML and CSS it was built from.

| Mockup | What it fixes |
|---|---|
| `public-home-desktop.png` | 64 px header with five items, a language chip and the Report button on every page; headline on the left; receipt check as a full-width strip; reviewed results start above the fold |
| `public-header-states.png` | Header at rest and scrolled, item states (hover, active bar, focus), phone bar, phone menu sheet |
| `observer-home-phone.png` | One "Needs you" card instead of two banners; 88 px report rows; a bottom bar (Home · Report · My reports · Messages); reordered menu |
| `observer-flow-phone.png` | True-centred app bar; Close inside the report flow and Done on the receipt; one ChoiceTile; solid disabled buttons; clear toggles |
| `staff-queue-desktop.png` | Light grouped sidebar with intake status and the signed-in user; breadcrumb, search and "?"; segmented priority and a Filters button; preview panel |
| `staff-phone.png` | Staff top bar, with the sidebar as a left sheet |

**Hero art, with the change:** the polling-unit scene is rendered in Blender (flat colour from our tokens, ink lines from Freestyle) and sits directly on the page. The sky is exactly the paper colour, there is no frame or box, and the edges fade into paper. The left side, behind the headline, is almost empty paper. Renders: `docs/design/art/blender/renders/vision/`.

## 2. What "done" means
1. Every screen matches the vision's system: navigation, type, spacing, components, states.
2. All 78 screen defects and 14 system issues in `docs/reviews/2026-11-26-light-mode-ui-audit.md` are fixed.
3. Light mode only. The dark tokens stay in `tokens.css`, but nothing switches to them; the theme pickers are removed.
4. Art made in Blender, rendered in our palette, blended into the page, with motion that respects reduced motion and Save Data.
5. The community-features screens are built against the merged community backend.
6. Verification: every flow tested against the real backend, all screens recaptured, axe clean, home page fast on slow 4G, finish-gate review passed. CI is green on `production-readiness`.

## 3. Work, in order

### Phase 1: Foundation (one builder, first, because everything depends on it)
- **Light only.** One setting in `ui/theme.ts` (`THEME_LOCK = "light"`). `useThemePreference` returns light; both shells and the public shell render `data-theme="light"`. Remove the observer Appearance control and the staff ThemeSwitcher. The browser theme colour becomes a single light value. The dark token blocks stay unused.
- **Tokens:**
  - `--t-nav` (600 15/1.2) and `--t-count`;
  - radii trimmed to 6, 10, 16 and pill;
  - `--shadow-pop` for drop-downs;
  - headings at weight 700, matching the font files we load;
  - the duplicate `--paper-sunk` line removed.
- **Shared components:**
  - Button: solid disabled state.
  - Switch: clear off and on.
  - New Count component.
  - Status badge, Tag and Count as the only three chip kinds.
  - ChoiceTile with a trailing check, used by every single-choice step.
  - One icon set: book, megaphone, user-plus, map-pulse and the rest from the audit, at one stroke width.
  - A shared `useScrolled` hook for bar borders.

### Phase 2: Navigation, three builders in parallel (each owns one shell)
- **Public** (`PublicShell`, `shell.module.css`, `landing/HeaderReport`, `LanguageSwitcher hideLabel`):
  - a 64 px sticky header on every page with five items and an active bar;
  - the language chip and Report button;
  - the phone top sheet with scrim and scroll lock;
  - footer links in an inline row.
- **Observer** (`AppShell`, `BottomNav`, `OutboxBadge`, the menu sheet):
  - a 1fr/auto/1fr bar with the screen title;
  - Close in the flow, Done on receipts;
  - the bottom bar;
  - the reordered menu;
  - the outbox badge spec.
- **Staff** (`StaffShell`, `s/layout.tsx`):
  - the light grouped sidebar with intake status and the user row;
  - a 64 px collapsed sidebar at 1024–1279;
  - a sticky header with breadcrumb, search ("/") and "?";
  - the phone top bar and left sheet;
  - corrected icons.

### Phase 3: Screen polish, the same three lanes
Each lane works through its rows of audit table B:
- **observer:** rows 1–46;
- **public:** rows 47–55 and 76–77;
- **staff:** rows 56–75 and 78.

Each lane follows its vision mockup where one exists.

### Phase 4: Art (runs alongside phases 1–3)
1. Blender concept → final scenes: the hero (desktop and phone), "How a report travels", the evening footer, the character sheet.
2. Each scene is exported as a transparent PNG with WebP and AVIF versions (largest phone image about 120 KB). The vector line layer is exported through the Freestyle SVG exporter where it stays under budget.
3. Characters are rendered in separate layers (walkers, queue, observer), so the web page can move them gently: walkers arrive, the queue steps forward, the observer's phone sends. Movement uses transforms only; it is static under reduced motion or Save Data.
4. The scenes replace the generated vector art on the home page and the observer plates (onboarding, empty states, receipt).

### Phase 5: Community-features screens (after the navigation lands)
- **Coordinator, in the operations room:**
  - a Check-ins tab to write a ward question, from the fixed list or as free text, filtered by the content checks;
  - a second coordinator approves safety notices;
  - results per ward (yes, no, not seen) and the units that have not answered.
- **Observer:**
  - the notice appears in "Needs you" and in Messages;
  - answer Yes / No / Not seen, including offline (queued in the outbox with the phone's time);
  - a "Your LGA today" card on home (reviewed counts, numbers under 5 suppressed).
- **Rumour desk:**
  - a "From the public" filter;
  - an ask count with a one-hour trend;
  - a check-in evidence box on each claim.
- **Strings:** every new string in all five languages.

### Phase 6: Motion (one pass across all shells, from audit section D)
- **Navigation:** the active-item indicator slides to the new item.
- **Bars:** the border fades in on scroll; the observer title fades up.
- **Sheets:** they open with staggered rows.
- **Report steps:** the progress bar grows and the step slides in.
- **Choices:** the check pops when picked.
- **Send:** the button turns into a ring, then a tick.
- **Offline save:** an envelope flies to the outbox.
- **Receipt:** the tick draws in, then the code appears.
- **Status chips:** they change in place.
- **Checklist:** the timeline fills.
- **Staff queue:** new cases arrive with a highlight.

All motion uses transform and opacity, and falls back to a short fade under reduced motion.

### Phase 7: Verification and finish gate
- **End to end against the real backend:** all five staff roles, an observer report from start to receipt, assignment and review, the SMS simulator, the rumour check, check-ins (compose, approve, answer offline, results).
- **Screenshots:** every screen and state recaptured at phone and desktop width in light mode; axe; no horizontal overflow; reduced-motion run; slow-4G home page check.
- **Code checks:** tsc, eslint, `npm run check`, the backend suite, CI.
- **Final review:** an independent finish-gate review of every screenshot against the mockups; fix, then pass.

## 4. Who builds what
- **Design direction, reviews and integration:** this session, on opus.
- **Builders:** sonnet, one per lane, each in its own worktree branch merged here, so parallel lanes never overwrite each other. New strings go through the lane's own message block and are merged here.
- **Art:** an opus art director running Blender headless; a sonnet builder wires the art into the page.
- **Finish gate:** a separate opus reviewer, who has not seen the build.

## 5. Schedule (prototype due 13 Dec)
| Dates | Work |
|---|---|
| 26–27 Nov | Phase 1 foundation; art finals start |
| 27–29 Nov | Phase 2 navigation (three lanes) |
| 29 Nov–2 Dec | Phase 3 polish (three lanes); art wired into the home page |
| 2–5 Dec | Phase 5 community screens |
| 5–6 Dec | Phase 6 motion |
| 7–10 Dec | Phase 7 verification, recapture, finish gate, fixes |
| 11–12 Dec | Buffer, demo script, README results |

## 6. Decisions taken (owner gave full autonomy)
- **Polling-unit data:** the prototype keeps the synthetic reference list, which is what a competition demo should use. INEC publishes no downloadable list; the full list is a paid request, and a volunteer platform exists. Loading real data is a production task after the competition, through the existing `load_reference_areas` format.
- **Translations:** the strings are written in all five languages; native-speaker review comes after the competition, as the owner said.
- **Election name** in the staff sidebar comes from organisation settings (shown as the organisation name until an election name field exists).
- **Gold (sun) use:** the hero sun, the observer home "Report something" sun motif, and the selected-choice and dictation icon discs from the approved mockups. Everything else, including charts and result bars, is ink on paper.
