# Navigation redesign: vision mockups

Static mockups for approval before any build. Light mode only. Each PNG is rendered at 2x from the standalone HTML file with the same name (inline CSS and icons; the fonts load from Google Fonts and the hero art from `../../art/blender/renders/concept-v1.png`). Tokens come from `frontend/ui/tokens.css`. The type is Noto Sans and Noto Sans Display, and the mark is the real `BrandMark` paths.

Place names (Kantudu, Gwammaja, Dala, Zango, Kano) and receipt codes are the synthetic ones used in the product screenshots. The election name "Kano governorship election, 5 Dec 2026" is only a label for the mockup.

## 1. `public-home-desktop.png` (1440 x 1100)
- **New 64 px header.** Mark, five destinations (Results, Check a rumour, Ask, Guides, SMS and USSD), a 36 px "EN" language chip and the one primary action. Home has no active item, because the mark is the way home.
- **Hero.** The headline sits on the left on a 12-column grid, and the art slot bleeds off the right edge. The slot is labelled so nobody mistakes the concept render for final art. The SMS and USSD route stays in the hero, because people without smartphones are a primary audience.
- **Receipt check.** This is now a full-width strip (label above the input, hint inline) instead of a card floating next to the headline. Reviewed results begin above the fold: the total, its timestamp, the "not official results" line and the top categories.

## 2. `public-header-states.png`
- **States.** The desktop bar is shown at rest (no border) and scrolled (a 1 px rule after 8 px). The nav item is shown inactive, on hover (ink text, grey preview bar), active (2 px ink bar, 24 px wide, on the bottom edge) and with keyboard focus (3 px ring, never animated). The language menu lists each language in its own name.
- **Phone bar.** 56 px: lockup, compact "Report", and a 44 px icon-only menu. The X that closes the menu sits exactly where the menu button was.
- **Top sheet with scrim.** Rows are 56 px. The current row has a paper-sunk fill, a 3 px ink leading bar and the words "You are here". The language radio list comes next, then the 112 line. The footer note records that footer links run inline.

## 3. `observer-home-phone.png`
- **"Needs you (2)".** One card replaces the two stacked banners (unsent report, reviewer question), with one action per row. The report card also carries "Continue your draft", so drafts no longer need their own block.
- **88 px report rows.** They form one list with dividers, not a card per row. Each row shows the title, place and time, then a status badge (shape plus word) beside the receipt code.
- **Bottom navigation.** Home, Report (+), My reports and Messages (count). The bar is 56 px plus the safe area. The active item gets a 56 x 32 sunk pill. Report is always the ink pill: it opens the flow and is never "current". **Refinement:** the menu drops Home, My reports and Messages (they now live in the bottom bar). It keeps the identity row, Checklist, Ask and Discussions, then Guides, Privacy and Settings, then the Language row, the 112 line, and Sign out last in danger red.

## 4. `observer-flow-phone.png`
- **App bar.** It uses a true-centre grid (1fr auto 1fr). In the report flow it shows Back, then "New report", then Close. The receipt has no Back; its right slot says Done, and the footer offers "Report something else".
- **Progress and ChoiceTile.** Progress is a seven-segment bar plus "Step 1 of 7, saved on this phone". There is one ChoiceTile component for every single-choice step: a 64 px row with an icon disc and a trailing check. Selected shows a 2 px ink edge, an ink tick and a sun-tint disc.
- **Component strip.** Shows the ChoiceTile states, buttons (disabled is a solid paper-sunk fill, never dashed), the toggle with a clear off and on, the single Count component in two tones (ink = action needed, quiet = total), and the status badge set.

## 5. `staff-queue-desktop.png` (1440 x 900)
- **Light 240 px rail.** Paper-2 with a 1 px rule. The top block has the mark, "ElectraGuard" and the election. Group labels are in sentence case (Review, Monitor, Moderate, Admin) instead of capitals. Items are 36 px; the active one is raised paper, a rule edge and ink 600. Counts are right-aligned. Pinned at the bottom: "Receiving reports" in green, and the user row.
- **Sticky 56 px header.** Breadcrumb plus the H1 "Review queue", a search field with a "/" hint, and "?" for shortcuts. Status tabs use the same 24 px ink bar as the public nav, so there is one active-state grammar across the product.
- **Filter row and table.** The filter row has a priority segmented control, "Filters (2)", and removable tokens for the two active filters plus Clear. The 48 px table rows show priority as a shape plus a coloured word (not a badge), the place as two lines (ward, then LGA), and status as a badge. The selected row is sun-wash. The preview pane holds the flags and "Open case".

## 6. `staff-phone.png`
- **Phone top bar.** Menu, the centred title, and search. Tabs scroll sideways, with a fade showing there are more. Below them sit a "Priority: Any" button and "Filters (2)". Case rows are 96 px.
- **Left sheet.** It is the same rail, unchanged: groups, counts, intake status and user row. A coordinator finds things in the same place on a phone as on a laptop.

## Checks run on every PNG
- 8 px grid (4 px steps only inside controls).
- One type scale: 12, 13, 14, 15, 16, 17, 20, 28, 32 and 60 px.
- True centring of app-bar titles.
- No clipped or ellipsised text (checked with a script after each render).
- Contrast: ink-2 is 9.6:1 and ink-3 5.1:1 on paper; ink-3 is 4.7:1 on paper-2 for the rail labels. Every status pair passes AA.
- No gradient blobs, pill badges or placeholder copy.

---

# Finish round: every other page (26 Nov 2026)

The six approved mockups set the system; these boards apply it to every remaining page with the same tokens, components (Count, Tag, status badge, ChoiceTile, Switch, buttons), bars and 24 px ink active bar. Each HTML file is standalone and is rendered to a 2x PNG with the same name. Empty-state art slots use crops of the Blender renders in `../../art/blender/renders/wip/` and are labelled with the scene they take (`evening`, `story` panel a and b, `sheet`). Figures follow the synthetic set already used in the approved home and the test-database screenshots (1,240 reviewed reports, Kano places, EG- receipt codes, OBS- observer codes); staff emails use `example.org`. Page titles on desktop use the 60 px display step; everything else stays on the approved scale (the 9 px keypad letters on the simulated phone are part of the drawn device).

## 7. `public-pages.png` (desktop 1440 beside phone 390)
- **Header on every page**, current item marked, Report button always present; Privacy moves to the footer and phone menu. Fixes 47, 48, 76.
- **Results.** The "not official results" line sits under the H1 (53). State and category bars are sorted largest first (52); "fewer than 5" is a dashed empty track, never a zero. Hours as columns, outcomes as a short table, the audit fingerprint in one quiet strip. Phone: "Nothing has been published yet" with the `evening` scene.
- **Check a rumour.** The approved answer is a quotation with a 3 px ink rule (77), the approval date and "Not an INEC statement", plus observer and ward check-in evidence with counts under 5 suppressed. Phone: the empty input with a solid disabled button; no match with one action and the "others asked too" note.
- **Ask.** A quoted answer with source section and version; the phone shows the honest "no approved answer".
- **Guides.** A guide at a 68-character measure with a contents rail marking the current section; the phone list uses rows, and "English only" is a neutral Tag instead of a sun pill (system 8).
- **SMS and USSD.** The simulated-number note appears once, 24 px under the bar (54); the device has the same keys on every step (55). The USSD menu text is the backend's own (`phone_channels/text.py`).
- **Privacy.** Long form with the contents rail and the inline footer row (51).

## 8. `observer-pages-phone.png`
- **My reports.** Equal-width segments with inline counts (28, 36), 88 px rows (11).
- **Report detail.** Disc above the H1 (31), labelled receipt code with Copy (32), a four-step status line, the question card with its answer box, whole-row file links (33); full bar with Back and Menu (30).
- **Citizen receipt.** One "Keep this code on this phone" switch replaces three save prompts (44); one footnote block (45); Done and no Back (24).
- **Messages and thread.** Grouped list with one Count (29, 36); the thread pins one composer with one add control (34).
- **Checklist.** One timeline; progress stated once (37).
- **Settings.** No Appearance (38); one Sign out row that opens the keep-or-clear choice (39); the Switch with a clear off state (20).
- **Menu with reports waiting.** Outbox badge spec, a 16 px count at the icon's top right (41), a "Waiting to send" row, book icon on Guides (43).
- **Sign in, wrong PIN.** Language chip in the bar (4), no card illustration (6), the error at 14/600 under the field (7).
- **Close inside the report flow** opens "Keep this draft and leave?" (13).
- **Offline and intake paused** are one strip under the bar (8, 9); the paused report card turns quiet.
- **Empty states** for My reports, Messages and Discussions, each with a labelled art slot; counts leave the bottom bar when there is nothing to count.

## 9. `staff-pages-desktop.png` (eight 1440 x 900 frames in the approved shell)
- **Case review.** Breadcrumb Review / Queue / EG-… (60), one reference format (61), suggestions on a solid neutral surface marked "Suggested, not decided" (62), outcome as three radio tiles, rationale, the evidence confirmation and one primary "Confirm closure"; Previous and Next show their K and J keys.
- **Assign.** One table with each suggested reviewer and the reason, an ink bulk bar with one select and one action, and a workload panel.
- **Operations room.** Six totals at a fixed 104 px with a clearer label (64), one date field (65), the LGA table with coverage, cluster warnings beside it, the coverage summary below, and a new Check-ins tab.
- **Publish.** The hourly switch on its label's row (69), one surface level (68), one primary with Discard in the overflow (67), history with fingerprints.
- **Rumour desk.** Harm and check priority as shape plus word, no "Harm:" prefix (66); one primary on the claim (67).
- **Staff and Observer codes.** Row actions live in one overflow menu, so labels can never run together (70); unavailable actions are hidden, not dashed (63, 73).
- **Settings, intake paused.** One 720 px column (74), every switch beside its label, the rail's intake row in amber.

## 10. `community-screens.png`
Designed against `backend/notices`, `backend/rumours` and `publicdata.observer_area_today`.
- **Check-ins tab, compose.** Ward or LGA, kind (Logistics, Instruction, Safety), a fixed question or a written message, expiry, 280-character count. The content check lists every reason at once and marks the words in place.
- **Results and approval.** Per ward: Yes, No and Not seen as one stacked bar with numbers, then the units that have not answered; "No" answers link to the cases they raised. A safety notice from another coordinator waits with "Approve and send" and "Send back"; nobody approves their own.
- **Rumour desk, "From the public".** Source filter and "Most asked" sort; the ask count with the one-hour trend in the attention colour; asks per hour and the check-in evidence box on the claim (counts under 5 suppressed, six-hour window).
- **Observer.** The check-in joins "Needs you" and leads Messages (only Safety is red). "Dala today" shows reviewed counts at least 60 minutes old with small numbers suppressed. Answering offline uses three ChoiceTiles; the saved state shows the answer, the phone's time and "On this phone", and the Menu badge counts it.

## 11. `motion-studies.html` (interactive), `motion-studies.webm`, `motion-studies.png`
All thirteen effects from audit section D, each on its own stage with Replay and its timing written underneath: nav indicator (200 ms), bar border and title (160 ms), sheet with staggered rows (240 / 320 ms, rows 30 ms apart), report step and progress (240 ms), ChoiceTile check pop (240 ms plus a 10 ms vibration), Send ring then tick (400 + 240 ms), offline envelope to the outbox with a badge bump, receipt tick and code, status chip morph, checklist timeline, queue "n new" pill with highlight, publish chip with the history row, and the single amber intake pulse. Only `transform` and `opacity` move; ticks draw through a scaling mask instead of stroke animation. Easings are the tokens `--ease-out` and `--ease-in-out`. The "Reduced motion" switch (on by default when the system asks) turns every effect into an 80 ms fade to its final state. The webm plays all thirteen, then five again with reduced motion on.

## Checks run on the new boards
- Every PNG inspected after rendering for alignment, centring, spacing and clipped text (a script flags overflow after each render).
- Colour only for status; the sun stays for the selected state and the results bars.
- Specification only: no product code changed.
