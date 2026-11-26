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
