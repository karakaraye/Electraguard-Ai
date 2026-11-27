# ElectraGuard AI: production design specification

**Version 1 · 24 November 2026 · Owner of this document: the design lead**
**Applies to:** the working system on `origin/production-readiness`. The logic stays and the design is rebuilt.
**Companion:** `REDESIGN-PLAN.md` (order of work and calendar). This file is the *what* and the *why*. Everything a builder needs to make a screen production-ready is here. If something is not here, the builder asks and does not guess.

---

## Part A · Why the design is the way it is

### A1. Who we design for, and where they are

| Person | Where and when | What gets in their way | What the design must do |
|---|---|---|---|
| **Accredited observer** | Standing outside a polling unit, 06:30 to 20:00, phone in one hand, sun glare, crowd noise, battery dropping, network coming and going | Fear of being seen reporting; not knowing what to choose; losing work when the network drops; small text | One decision per screen; very large type and targets; work saved at every tap; visible proof that nothing identifying is sent |
| **Citizen (voter)** | Same place, no account, often a first-time user, may read best in Hausa, Yorùbá, Igbo or Naijá | Distrust ("will this get me in trouble?"), low data | No sign-up, no name, a receipt code instead; reassurance said once, plainly; a flow that takes under 90 seconds |
| **Public (press, civil society)** | Phone or laptop, reading reviewed totals | Confusing statistics with official results | Totals clearly labelled "Reviewed observations only. Not official results. Independent of INEC."; small counts hidden |
| **Reviewer** | Laptop in a situation room, 8 to 12 hours | Volume, fatigue, AI over-trust | Keyboard-first desk; AI shown as a labelled suggestion with its reason; the person decides |
| **Coordinator / org admin / security** | Laptop | Making sure every area is covered; issuing codes; spotting abuse | Clear overviews with no decoration; safe defaults; confirmations on destructive actions |

### A2. Design principles (in priority order: when two clash, the higher one wins)

1. **Safe before anything.** Never ask for or show what could identify or endanger a reporter: no GPS, no names, faces blurred, places only to polling-unit level for the reporter and LGA level in public. Safety copy is shown where the worry happens, not hidden in a policy.
2. **Calm under pressure.** One question per screen, one primary action, nothing moving unless it means something. High contrast for sunlight. Every tap is saved, so a lost network or a closed tab loses nothing.
3. **Show, don't claim.** Promises are made visible: the receipt code, "Location removed" on a photo, "Faces we can detect are blurred", what happens next, who is reviewing.
4. **Neutral by construction.** No party colours, flags, slogans or candidate imagery. Gold is the sun, not a party. Green and red appear only as status, always with a shape and a word.
5. **Everyone can use it.** Five languages written natively, reading age 9 to 11, icons always paired with words, WCAG 2.2 AA, works with TalkBack, at 200 % text and on a 360-px phone.
6. **Delight through response, not decoration.** The fun comes from the interface answering you: a tile that fills with sunlight when chosen, a sun that moves across the day, a receipt that prints itself, an envelope that flies out when the network returns. No confetti, no mascots, no game mechanics.
7. **Sophisticated means restrained.** Black ink, warm paper, one gold, real art. Fewer elements done perfectly beats many done loudly.

### A3. The idea that ties it together: "the polling day"

The product is a day at a polling unit, from the first queue at dawn to the result sheet at dusk. The design borrows that day:

- **The sun is the system's one accent.** It marks progress: the day arc on home, the checklist timeline, the progress of an upload, a selected choice. Where the sun is, things are happening.
- **Paper and ink are the record.** Reports, receipts and result sheets are documents. Cards look like paper on a desk, codes are printed in ink, and the receipt is a torn ticket.
- **The art is the place.** Hand-drawn sepia scenes of a polling unit, the queue and the officials' tent set the scene on welcome, empty and finished screens. They never appear inside a task, where they would distract.

---

## Part B · Foundations

### B0. Token names in code (binding)

The code's names are the contract; where this spec uses another name, read it as the code name. Change on 24 Nov 2026 after the Phase 0 finish-gate review, because renaming 125 existing uses would put working screens at risk.

| Spec name | Code name (`frontend/ui/tokens.css`) |
|---|---|
| `--paper-raised`, `--paper-sunk` | same; `--paper-2` remains for older screens (inputs, page fills) |
| `--ink-inverse` | `--on-ink` |
| `--rule-strong` | `--rule-control` |
| `--sun-wash`, `--sun-tint`, `--sun-ink`, `--sun-strong` | same, plus `--sun-line` (question-card border) |
| status ink and fill | `--ok`/`--ok-bg`, `--info`/`--info-bg`, `--attn`/`--attn-bg`, `--wait`/`--wait-bg`, `--danger`/`--danger-bg`; solid shapes `--*-solid` |
| colours that never flip | `--fixed-ink`, `--fixed-paper`, `--hero-ink`, `--hero-ink-2` |
| `--r-sm` / `--r-md` / `--r-lg` / `--r-xl` / `--r-pill` | `--radius-sm` 10 / `--radius` 14 / `--radius-lg` 18 / `--radius-xl` 22 / `--radius-pill` |
| `--m-instant` / `--m-quick` / `--m-base` / `--m-enter` / `--m-exit` / `--m-scene` | `--dur-press` 80 / `--dur-fade` 160 / `--dur-step` 240 / `--dur-sheet` 320 / `--dur-exit` 200 / `--dur-scene` 800 (`--dur-tick` 400 for check draws); easing `--ease-out`, `--ease-enter`, `--ease-exit`, `--ease-pop` |
| spacing `--s-1`…`--s-16` | `--s-1` 4 · `--s-2` 8 · `--s-3` 12 · `--s-4` 16 · `--s-5` 24 · `--s-6` 32 · `--s-7` 48 · `--s-8` 64; there is no 20 or 40 step, so use `--gutter` (20 on phones, 16 under 360, 24 from 600) for side margins |

### B1. Colour

All colours are CSS custom properties in `frontend/ui/tokens.css`. Components never use raw hex. Dark mode is set by `[data-theme="dark"]` or by system preference when the user's setting is "System".

**Surfaces and ink**

| Token | Light | Dark | Contrast rule | Use |
|---|---|---|---|---|
| `--paper` | #FAF8F3 | #121110 | base | Page ground |
| `--paper-raised` | #FFFFFF | #1B1A17 | | Cards, sheets, inputs on paper |
| `--paper-sunk` | #F2EFE7 | #0C0B0A | | Segmented track, skeletons, inactive chips |
| `--ink` | #0E0D0B | #F4F1EA | ≥ 15:1 on paper | Headings, body, primary buttons, icons |
| `--ink-2` | #45413A | #CFC9BE | ≥ 7:1 | Secondary text, descriptions |
| `--ink-3` | #6E6A62 | #9F998E | ≥ 4.5:1 | Meta (time, step count). Never for anything the user must read to act. |
| `--ink-inverse` | #FAF8F3 | #121110 | | Text on `--ink` fills |
| `--rule` | #E6E1D5 | #312E28 | decorative | Card borders, dividers |
| `--rule-strong` | #8A857A | #7D776C | ≥ 3:1 on paper | Input and control borders (WCAG 1.4.11) |
| `--hero` | #0E0D0B | #26231E | | The "Report something" card and the staff rail |

**The sun (the only accent)**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--sun` | #E3B060 | #E3B060 | Fills only: the sun disc, progress, the selected-tile sweep, active node. Never text, never a border that carries meaning on its own. |
| `--sun-strong` | #C98F2E | #F0C77E | Sun-coloured strokes on paper (arc progress line, focus inside dark hero) |
| `--sun-ink` | #7A4E0E | #F0C77E | The only gold allowed for text (eyebrows such as "REVIEWER QUESTION"), ≥ 6:1 |
| `--sun-tint` | #F6E7C6 | #3A2E18 | Icon discs, selected tile fill |
| `--sun-wash` | #FBF4E4 | #211B12 | Question card, info notices, the outer receipt ring |

**Status (meaning only, always with a shape and a word)**

| Status | Shape | Ink (light / dark) | Fill (light / dark) |
|---|---|---|---|
| Received, Closed, Success | filled circle + tick | #1B5E20 / #8FD694 | #E7F3E8 / #16291A |
| In review | circle half-filled | #0D4A94 / #9CC8F5 | #E3EEFB / #13283E |
| Question for you, Attention | diamond | #8A3B00 / #FFC371 | #FFF1DC / #38250E |
| On this phone (not yet sent) | hollow circle | #45413A / #CFC9BE | #EEEBE4 / #24221E |
| Danger, Failed | triangle | #A3161A / #FF9A94 | #FDECEC / #3B1B1C |
| Withdrawn, Removed | dashed circle | #6E6A62 / #9F998E | transparent |

- Fill colours are backgrounds of chips and banners. The ink colour is used for the shape and the word.
- The solid shape colours used in the status journey: green #2E7D32, blue #1565C0, amber #E0A13B, red #C62828.
- **A CI test** (`scripts/check-contrast.ts`) reads the tokens and fails the build if any pair listed above drops below its rule, in both themes.

### B2. Typography

**Families.** Noto Sans Display (headings, codes, big numbers) and Noto Sans (everything else). Both are self-hosted woff2, subset to Latin, Latin Extended-A/B, IPA Extensions (Hausa ɓ ɗ ƙ ƴ), Latin Extended Additional (ẹ ọ ṣ ị ụ ṅ) and combining marks U+0300–0303, U+0323. Two files are preloaded: Display 800 (about 30 KB) and Sans variable 400–700 (about 70 KB). `font-display: swap` with a `size-adjust`ed system fallback, so there is no visible layout shift when the font arrives.

**Roles (observer and citizen; staff is one step smaller)**

| Role token | Size / line height | Weight, tracking | Use | Max lines before wrap is a bug |
|---|---|---|---|---|
| `--type-hero` | 40 / 44 | Display 800, −0.02em | Splash name, receipt code | 2 |
| `--type-title` | 32 / 36 | Display 800, −0.02em | The screen's question ("What happened?") | 3 |
| `--type-headline` | 24 / 30 | Display 700, −0.01em | Card titles in the hero, result numbers | 3 |
| `--type-heading` | 20 / 26 | Display 700 | Section headings ("My reports") | 2 |
| `--type-body-lg` | 18 / 27 | Sans 400 | Default body for observers and citizens | none |
| `--type-body` | 16 / 24 | Sans 400 | Descriptions, card text, staff body | none |
| `--type-label` | 16 / 20 | Sans 600 | Buttons, tile labels, field labels | 2 |
| `--type-small` | 14 / 20 | Sans 400 | Meta: times, place lines | 2 |
| `--type-eyebrow` | 13 / 16 | Sans 700, +0.08em, uppercase | Card eyebrows in `--sun-ink` or `--ink-2` | 1 |

**Rules**
- Hausa and Igbo strings run up to 1.4× the English length. Every layout is tested with the longest of the five, and titles may wrap to 3 lines. Nothing is truncated on observer, citizen or public screens. Staff table cells may truncate with a full-text tooltip.
- Figures are tabular (`font-variant-numeric: tabular-nums`) for codes, times and counts.
- Codes are printed in Display 800 with +0.02em tracking and grouped by hyphen (`EG-4H7Q-92KD`, `OBS-7K2P9X`). Screen readers get them spelled out with `aria-label="E G, 4 H 7 Q, 9 2 K D"`.
- Each element in another language carries its own `lang` attribute (`ha`, `yo`, `ig`, `pcm`, `en`), so TalkBack switches voice.

### B3. Space, grid and layout

- **Spacing scale (4-pt):** `--s-1` 4 · `--s-2` 8 · `--s-3` 12 · `--s-4` 16 · `--s-5` 20 · `--s-6` 24 · `--s-8` 32 · `--s-10` 40 · `--s-12` 48 · `--s-16` 64.
- **Phone (360–599):** side margin 20 (16 below 360), single column. Gap between cards 12, between sections 32.
- **Tablet (600–899):** content column max 560, centred.
- **Public desktop (≥ 900):** 12-column grid, max width 1200, gutter 24.
- **Staff desk (≥ 1024):** left rail 240, main area fluid, a detail pane 400–480 when one is open. Under 1024 the rail becomes a top bar with a menu sheet, and the detail pane opens as a full screen.
- **The action bar.** In task flows the primary button sits in a sticky bottom bar: 16 px above, 24 px below plus the safe-area inset. The scroll area gets `scroll-padding-bottom` equal to the bar height, so a focused field or the last tile is never hidden behind it.
- **Safe areas:** `env(safe-area-inset-*)` on the app bar, the action bar and the bottom nav.

### B4. Shape, borders and depth

| Token | Value | Use |
|---|---|---|
| `--r-sm` | 10 | Chips inside cards, thumbnails |
| `--r-md` | 14 | Buttons, inputs |
| `--r-lg` | 18 | Tiles, list cards |
| `--r-xl` | 22 | Hero card, sheets, the receipt ticket |
| `--r-pill` | 999 | Status chips, segmented control |

- **Depth level 0 (default):** a flat 1 px `--rule` border, no shadow. This is the paper look.
- **Level 1:** the hero card and a floating "new items" pill. Shadow `0 8 24 rgba(14,13,11,.14)`.
- **Level 2:** bottom sheets and dialogs. Shadow `0 -8 32 rgba(14,13,11,.18)` and a 40 % ink scrim.
- **Level 3:** toasts. Ink fill, inverse text.
- **Focus:** a 3 px `--ink` ring with a 2 px `--paper` offset on paper. Inside the dark hero card the ring is `--sun-strong`. It is always visible on keyboard focus, never on touch.

### B5. Icons and pictograms

- **Interface icons:** 24 px grid, 1.75 px stroke, round caps and joins, drawn in `currentColor`. One set, in `frontend/ui/icons/`. An icon is never the only label, except back, close and menu, which carry an `aria-label`.
- **Category pictograms:** 40 px grid, 1.75 px stroke, shown inside a sun-tint disc (48 on tiles, 44 in lists). The existing set is redrawn to this stroke. There is one pictogram per report category and per checklist stage.
- **Icon discs:** 40, 44, 48 or 56 px circles in `--sun-tint`. When a tile is selected, the disc turns `--paper-raised` and the tile turns `--sun-tint`, an inversion that reads clearly in sunlight.

### B6. Illustration system

**Plates** (full scenes, hand-drawn sepia, one gold sun):

| Plate | Scene | Where | Size and crop |
|---|---|---|---|
| A · Queue | Polling unit building ("POLLING UNIT" sign), shade tree, a diverse queue (older man in a cap, woman in a hijab, wheelchair user, young woman, man in an agbada, mother and child), an official at a table | Splash (bottom band), onboarding 1, choose role (top), public home hero | 3:1 master, 2400 px; crops at 390×200, 390×240, 1200×400 |
| B · Polling day | School building with no readable name, canopy tent with officials, palm and shade trees, a short queue; empty sky for the sun path | Checklist | 16:9 master; crop 390×220 |
| C · Vignette | House on a hill line with a tree, light on dark | Home hero card (decorative) | 2:1, single-colour SVG trace |
| D · Safe | Hand holding a phone whose photo shows blurred faces; faint shield | Onboarding 2, privacy notice header | 1:1 |
| E · Offline | Phone on a table, three paper envelopes waiting, sun rising behind | Onboarding 3, outbox empty state | 1:1 |

**Spots** (small, 120–160 px, same hand, for empty and finished states): no reports yet (empty notebook and pencil) · no messages (folded note) · all stages done (sun setting over the school roof) · nothing published yet (closed ballot box with a clock) · offline (phone with the sun behind a cloud) · not found (an empty path).

**Rules**
- Words in art only on the polling-unit sign. No slogans, party colours, flags, logos, recognisable people or real place names.
- The art never sits behind text that must be read.
- It is never inside a task step (category, place, time, describe, evidence, check), where it would compete with the question.

**Pipeline**
1. Masters go in `design/art/masters/`.
2. `frontend/scripts/art/build.mjs` (uses `sharp`) crops each master, tone-maps it to the palette (sepia curve with ink black and paper white points), and writes AVIF + WebP at 1× and 2× to `frontend/public/art/`. Each file is at most 70 KB at 1×.
3. The service worker precaches plates A, D and E and every spot, so first run and empty states work offline.

**Dark mode:** the plate is shown inside a rounded "paper window" (`--r-xl`, 1 px `--rule`) with a 24 px inner fade, like an old photograph on a dark desk. There are no separate dark masters. Spots invert their line colour to `--ink-2`.

**Alt text:** plates are decorative (`alt=""`) when the screen's words already carry the meaning, which is everywhere except the public home hero. That one gets a one-sentence description in five languages.

---

## Part C · Interaction and motion

### C1. Motion tokens

| Token | Duration | Easing | Use |
|---|---|---|---|
| `--m-instant` | 80 ms | linear | Colour and opacity changes on press |
| `--m-quick` | 160 ms | `cubic-bezier(.2,0,0,1)` | Chip and toggle state, check badge pop |
| `--m-base` | 240 ms | `cubic-bezier(.2,0,0,1)` | Tile fill sweep, step transitions, sheet content |
| `--m-enter` | 320 ms | `cubic-bezier(.05,.7,.1,1)` | Sheets, toasts, screens entering |
| `--m-exit` | 200 ms | `cubic-bezier(.3,0,.8,.15)` | Leaving |
| `--m-scene` | 600–1200 ms | `cubic-bezier(.2,0,0,1)` | Splash, receipt moment, bars growing (once each) |

**Rules**
1. Only `transform`, `opacity`, `clip-path` and `stroke-dashoffset` animate. No layout properties.
2. In a task flow, a transition never lasts more than 320 ms, and nothing blocks input while moving.
3. Only one thing at a time draws the eye. A screen enters, then its content is still.
4. Nothing loops forever, except a real live state (listening for dictation, uploading, syncing) and the progress indicator of a real wait. All of these stop when the page is hidden (`visibilitychange`).
5. **Reduced motion** (`prefers-reduced-motion: reduce`, or the in-app setting): every movement becomes an 80 ms cross-fade or an instant change. Counters show the final number. The sun appears in place.
6. Built with CSS transitions and the Web Animations API through one helper, `frontend/ui/motion.ts` (`animate(el, keyframes, token)`, which checks reduced motion and the page's visibility). **No animation library is added**: the observer bundle must stay small for low-end Android.

### C2. Touch, gestures and haptics

- **Targets:** observer and citizen controls are at least 56 px tall and tiles at least 112 px. Staff controls are 44 px visible inside a 48 px hit area, with at least 8 px between targets.
- **Press feedback:** every tappable thing shows it is pressed within 80 ms: scale 0.98 and a slightly darker fill. On release it springs back over 160 ms.
- **Gestures:** each has a button alternative, because gestures are never the only way to do something.
  - Swipe between onboarding slides (30 % of the width or a fast flick).
  - Pull to refresh on My reports and Messages.
  - Swipe down to close a sheet.
- **Haptics (Android):**
  - `navigator.vibrate(8)` when a choice is selected;
  - `[16, 60, 16]` when a report is sent or saved to the outbox;
  - `[40]` on the danger screen.
  - All off when reduced motion is on or the in-app "Vibration" setting is off. Feature-detected, so iOS simply does nothing.
- **Sound:** none, ever. Observers must stay discreet.

### C3. The interaction catalogue (what makes it feel alive)

Each one has a reason. If a builder cannot say how a moment helps the user, it is cut.

| # | Moment | What happens | Why it is there |
|---|---|---|---|
| I-1 | **Splash** | The mark's sun disc scales from 0.85 to 1. Three rings expand outward in turn, 120 ms apart, then settle, 1.2 s total. A tap skips it. It shows once per install and never offline-blocks. | The first impression of warmth and craft, gone before it becomes a wait |
| I-2 | **Onboarding carousel** | Swipe or tap Next. The art moves at 0.3× the swipe speed (light parallax). The active dot stretches into a pill. Skip is always visible. | It feels like turning pages; the user controls the pace |
| I-3 | **Choice tile selected** | Sunlight sweeps out from the icon disc and fills the tile (`clip-path: circle()` growing, 240 ms). The disc turns white, a black check badge pops (scale 0.6 to 1, 160 ms), and a light haptic tick. The previous tile fades back. | A clear, satisfying "yes, that one", readable in sun glare |
| I-4 | **Step change** | The progress bar grows to the new step (240 ms). The new question slides in 16 px from the right with a fade, and from the left when going back. | Shows where you are and which way you went |
| I-5 | **Polling-unit search** | Results appear 30 ms apart. The typed letters are bolded in each result. "Your polling unit" stays pinned on top. | Fast to scan; one tap for the usual answer |
| I-6 | **Dictation** | While listening, a ring around the mic button scales with the live audio level. A one-time note explains the phone's speech service. | Proves the phone is hearing you |
| I-7 | **Upload** | Each attachment shows a ring that fills with real progress. "Processing" shows a slow shimmer. When the server finishes blurring, the thumbnail cross-fades from a pixelated preview to the blurred final. | Makes the safety promise visible |
| I-8 | **Send** | The Send button narrows into a circle with a progress ring, then a tick. **Online:** goes to the receipt. **Offline:** a small envelope flies from the button to the outbox badge in the app bar, which bumps and shows "1". | Turns "will it send?" into something you can watch |
| I-9 | **Receipt moment** | The check draws itself (stroke, 400 ms). The rings ripple once. The ticket rises 24 px into place and settles. "Copy code" changes to "Copied ✓" for 2 s. "Save as image" makes a PNG of the ticket and opens the phone's share sheet (Web Share), falling back to a download. | The one moment of celebration, earned |
| I-10 | **Back online** | When the outbox sends, envelopes fly from the badge, a toast says "2 reports sent", and their rows in My reports change from "On this phone" to "Received" with a cross-fade. | Closes the loop without the user having to check |
| I-11 | **The living day** | On home and the checklist, the sun's position on the arc follows the real WAT clock (07:30 at the left, 16:00 at the right). Before dawn it sits below the line and the arc is dim; after closing it sets. A stage done fills its segment gold. | The product knows what time of day it is for you |
| I-12 | **Pull to refresh** | Pulling down raises a small sun from below the app bar. When released it spins once, and the list refreshes. | A tiny reward for a routine action, on-motif |
| I-13 | **Status journey** | When the user opens a report whose status changed since the last visit, the new node pulses once and its connecting line draws in. | "Something happened" without a notification |
| I-14 | **Question card** | When a reviewer asks something, the card arrives at the top with a soft gold wash. The answer field grows as you type. | The one thing that needs you is unmissable |
| I-15 | **Checklist stage** | Completing a stage fills its node with a tick, and the sun hops along the arc to the next stage. | Progress through the day is felt |
| I-16 | **Result-sheet reading** | After the photo, a thin gold scan line passes over it while the reading runs. The fields then appear one by one, each with a "Can't read" switch. | Honest about a machine step, and shows it is working |
| I-17 | **Public numbers** | When the totals scroll into view, the bars grow and the numbers count up (600 ms, once). Tapping a state opens a sheet with its breakdown. | Data feels alive and invites exploring |
| I-18 | **Staff queue** | New cases do not jump in. A "3 new cases" pill appears and inserts them when clicked. J/K move the focus, Enter opens. Actions are optimistic with a 5 s "Undo" toast. | Fast work without losing your place |

### C4. Feedback patterns

- **Toasts:** ink fill, bottom of the screen above the action bar, 4 s, at most one at a time. Used for "Copied", "Saved on this phone" and "2 reports sent". Undo toasts last 5 s. Announced with `aria-live="polite"`.
- **Banners:** full-width, under the app bar, for states that last: offline, intake paused, session ending, update available. Each has an icon, one sentence and at most one action.
- **Inline errors:** under the field, ink-coloured text with the danger triangle. Say what happened and what to do ("Choose a time that is not in the future."). Focus moves to the first error on submit.
- **Confirm sheets** (not dialogs), for destructive or irreversible actions such as withdrawing a report, removing a photo, signing out with unsent reports, or revoking codes. The sheet states the consequence in one sentence. The destructive button is outlined in danger ink and is never the default.
- **Skeletons:** `--paper-sunk` blocks in the shape of the coming content, with a shimmer of at most 1.2 s per cycle, stopped under reduced motion. They are shown only after 300 ms, so fast loads don't flash.

---

## Part D · Component library (`frontend/ui/`)

Every component keeps its current props where it exists, so the screens' logic does not change. Each item below lists its anatomy, variants, states and accessibility notes. Each component gets a page in the dev gallery (`/dev/ui`) showing every state in both themes and at 200 % text, and a Playwright screenshot test.

| Component | Anatomy and variants | States | Accessibility and notes |
|---|---|---|---|
| **AppBar** | Mark (28) + "ElectraGuard AI" or the screen title; left slot (Back); right slot (menu, outbox badge, language). Variants: `home` (mark + name), `task` (Back + "Step n of 7"), `plain` (Back + title) | Scrolled: adds a bottom `--rule` and the title condenses to 18 px | `<header>` landmark; Back is a real link with the destination's name in `aria-label` |
| **OutboxBadge** | Envelope icon + count dot | 0 (hidden), n waiting, sending (the ring spins), failed (triangle) | `aria-label="2 reports waiting to send"`; tapping opens the Outbox sheet |
| **Button** | `primary` (ink fill), `secondary` (1.5 px ink outline), `quiet` (underlined text, 48 px target), `danger` (outline in danger ink), `on-ink` (white fill on the hero). Sizes: `lg` 56 (observer), `md` 48, `sm` 40 (staff) | Default, pressed, focus, disabled (dashed outline on a sunk fill, text in `--ink-3`; keeps 4.5:1, unlike 40 % opacity, and a reason is shown nearby), loading (spinner replaces the label, width locked), success (tick, 1 s) | Real `<button>` or `<a>`. A loading button carries `aria-busy`. A disabled button is not the only feedback. |
| **ActionBar** | Sticky bottom container for 1 primary + an optional quiet link | Raised (a `--rule` top border) when the content scrolls under it | Sets `scroll-padding-bottom` on its scroll parent |
| **ChoiceTile** | Icon disc + label (+ optional hint). Grid of 2 columns (1 column at 200 % text). Variants: `tile` (category), `row` (full-width option with a radio) | Default, pressed, selected (I-3), disabled, focus | `role="radio"` inside `role="radiogroup"` with a label. Arrow keys move. The selection is announced. |
| **YesNo** | Two or three large choices (Yes / No / Not sure) | Selected uses the I-3 sweep | Radio group |
| **Stepper** | "Step 3 of 7" + 4 px bar | Animates per I-4 | The text is real, the bar is `aria-hidden` |
| **Field / TextInput / TextArea / PinInput / CodeInput** | Label above, optional hint, control (`--paper-raised`, 1 px `--rule-strong`, `--r-md`, 56 tall), error under it. CodeInput formats `OBS-` groups as you type and uppercases. PinInput is 6 boxes, numeric keyboard, show/hide. TextArea grows and has a counter. | Default, focus (2 px ink border), error (danger triangle + message), disabled, read-only | Label tied by `for`. `aria-describedby` points to the hint and the error. PIN: `autocomplete="off"`, `inputmode="numeric"`. The counter is announced only near the limit. |
| **SearchSelect / PollingUnitPicker** | Search field + results list + a pinned "Your polling unit" card; "Choose by state, LGA and ward" opens a sheet of three labelled selects | Typing, results, no results ("Try the ward name"), offline (uses the cached reference data) | Combobox pattern. Each select is announced with its own label (this fixes the "Choose" bug). |
| **WhenPicker** | Chips "Now / Earlier today / Another day" + time and date fields + "I don't know the exact time" | Future-time error | Uses native time and date inputs for accessibility |
| **MediaCapture / UploadItem** | Three source tiles (Photo, Video up to 60 s, Voice note up to 120 s); attachment rows with thumbnail, progress ring, status and remove | Queued, uploading n %, processing, ready (blurred), failed (retry), not supported | Progress announced at 25 % steps. Remove asks to confirm after review has started. |
| **DictationButton** | Mic button in the TextArea corner | Idle, listening (I-6), unsupported (hidden), permission denied (inline message) | `aria-pressed` while listening |
| **StatusChip** | Pill with a shape and a word (B1) | — | The shape is decorative; the word is the label |
| **StatusJourney** | 4 nodes (Received · In review · Question for you · Closed) joined by lines; the done line is solid, the future dashed | Each node can be done, current or future; Withdrawn replaces the row with one chip | Ordered list; the current step carries `aria-current="step"` |
| **ListCard / ReportRow** | Icon disc, title (category), meta (place · time), status chip, chevron; optional unread line ("1 new message") | Default, pressed, unread (bold title + dot), on-this-phone (hollow chip) | The whole card is one link; the chip is part of its name |
| **HeroCard** | Ink card with title, sentence, Plate C vignette, sun disc and a white circular + button | Pressed (sun rises 4 px), intake paused (sun greyed, card says why, not tappable) | One link; the + is decorative |
| **DayArc** | An arc of the 6 checklist stages as dots, with the next stage named under it (names do not fit at 360 px); the sun rides the arc per I-11 | Before day, during, after; each node done, current or future | A list of stages for screen readers ("Opening, done. Voting in progress, now.") |
| **Timeline** | A vertical version of DayArc for the checklist: node, title · time, sub-line, optional action | As DayArc | Ordered list |
| **ReceiptTicket** | Eyebrow, code (hero type), time, dashed tear line with side notches, two secondary actions | Animates per I-9; citizen variant adds "Keep this code" | The code is selectable text with a spelled-out label |
| **QuestionCard** | Gold-wash card: eyebrow "REVIEWER QUESTION · time", the question, an answer field, a Send button | Sending, sent ("Sent. The reviewer will see it."), failed (retry), queued offline | Labelled `section`; focus goes to the field when opened from a notification link |
| **MessageThread** | Bubbles: the observer on the right (ink outline), the reviewer on the left (raised paper), time under each | New message (slides in), sending, failed | `role="log"` with polite announcements |
| **SegmentedControl** | Track in `--paper-sunk`, a sliding thumb in `--paper-raised` (or `--sun-tint` on public pages), labels with counts | — | Tabs pattern (`role="tablist"`) |
| **Notice / Banner** | Icon + sentence + optional action. Kinds: info (sun-wash), attention, danger, offline (ink), success | Dismissible or persistent | `role="status"`, or `role="alert"` only for danger |
| **Sheet** | Bottom sheet with a grab handle, title, content and actions; full screen at 200 % text or on phones under 640 px high | Enter and exit (C1); swipe down to close | Focus trap, Escape closes, focus returns to the trigger |
| **Toast** | C4 | — | `aria-live` |
| **EmptyState** | Spot illustration, one sentence, at most one action | — | The illustration is decorative |
| **Skeleton** | C4 | — | `aria-busy` on the region |
| **ArtPlate** | `<picture>` with AVIF/WebP and the dark-mode window | Loading (paper-sunk block, no shimmer) | Decorative by default |
| **SunRings** | 2–4 concentric circles in sun tones; used by the splash, receipt and empty states | Static or one-shot ripple | `aria-hidden` |
| **BottomNav** | Home, Reports (with a needs-you count), Profile | Current (filled icon + bold) | `<nav aria-label="Main">`, `aria-current="page"` |
| **StaffShell** | Ink rail (240) with the mark, sections and counts; a top bar with search, the user and a theme switch; the content area | Collapsed rail (64) at 1024–1279 | Skip link to the main content; keyboard shortcuts listed under "?" |
| **DataTable** (staff) | Sticky header, sortable columns, row focus, row selection, density toggle | Loading rows, empty, error, "n new" pill (I-18) | A real `<table>`; sort is announced |
| **SuggestionCard** (staff) | "Suggested, not decided" eyebrow, the suggestion, confidence as a word and a bar, "Why" (the top reasons), Accept / Change | Abstained ("No suggestion: not confident enough") | AI output is always labelled as AI |
| **MetricTile** (staff, public) | Label, big number (Display 700), change, a small bar | Suppressed ("fewer than 5") | The number has its label in the accessible name |

---

## Part E · Words

- **Voice:** a calm, respectful neighbour who knows the rules, not an official and not a salesman. Short sentences. "You" and "we".
- **Titles are the question the screen asks:** "What happened?", "Where did it happen?", "Is anyone in danger now?"
- **Buttons are verbs that say what happens:** "Send report", "Save and send when online", "Send reply", "Withdraw report". Never "Submit", "OK" or "Click here".
- **Errors** say what happened and what to do, and never blame. Example: "That code and PIN don't match. Check the card and try again."
- **Time** is always WAT with a 24-hour clock: "08:14 WAT", "Today, 07:52", "Yesterday, 16:27", "5 Dec, 09:05".
- **Safety lines are fixed wording,** used the same everywhere:
  - "We never use your phone's location."
  - "Faces we can detect are blurred. Check before sending."
  - "ElectraGuard records reports. It does not send help. If someone is in danger, call 112."
  - "Reviewed observations only. Not official results. Independent of INEC."
  - "Consistency check for review. This is not a result."
- **Five languages:** strings are written for each language, not translated word for word. The owner approves each language. A missing key fails the build (`check-message-keys.ts`). No string is concatenated in code, because word order differs between languages.

---

---

## Part F · Every screen, in detail

**How to read a screen entry**
- **Job:** the one thing the screen is for.
- **Layout:** top to bottom, with components from Part D.
- **Data:** the API and the real field names. Nothing is invented. Sample values in mock-ups come from the official synthetic reference data only.
- **Interaction:** what responds, and how. Links refer to the catalogue in C3.
- **States:** every one that must be designed and screenshotted.
- **Copy:** the real message keys. **New** means the key is added in all five languages.
- **Beyond the reference:** where we go further than the owner's reference images, and why.
- **Done when:** the acceptance checks specific to that screen. Part G6 applies to every screen as well.

**Shared rules for every observer and citizen screen (R1–R8 in the screens README, kept):**
- The offline bar shows, then "Back online" for 4 s.
- `401` opens the PIN sheet and keeps the work.
- `403 code_revoked` goes to screen 9.
- `503 intake_paused` shows the paused banner and queues the report.
- `429` says how many minutes to wait, taken from Retry-After.
- A failed write says "Not confirmed yet", never "Received".
- Drafts save within 300 ms of a change.
- Back never loses data.
- Primary button 56 px. Tested at 200 % text and 320 px wide.

**Decisions taken in this spec (they close gaps found in the code and the contracts):**

| # | Gap | Decision |
|---|---|---|
| D1 | First run had 7 screens before the first report | The three welcome slides absorb O-02: slide 2 *is* "What this app keeps". Skip jumps to slide 2, never past it, so the privacy lines are always seen once. |
| D2 | Change PIN shown without a contract | AUTH-08 exists on the backend (C2, `POST /api/v1/auth/observer/pin/change`). Keep the row and wire it. |
| D3 | Home's checklist progress is not in the contract (G3) | Progress is counted from REP-02 items of kind `checklist` plus the outbox. If REP-02 does not return the stage, the backend adds `checklist_stages_sent` to REP-02 `counts` (backend task **B-1**, small). |
| D4 | Offline My reports is empty (G9) | Keep the minimal on-phone index already decided (reference, code, category, ward, status, time), so lists and the receipt work offline. |
| D5 | The citizen flow returns to the observer start page | Citizen steps keep `/o/new/<step>?as=citizen`, but Back from step 1 and "Home" go to the public home `/`. |
| D6 | No QR code for staff two-step enrolment | Render the QR on the staff page from `otpauth_uri` with a small QR library loaded only on that route. The secret stays visible as a fallback. |
| D7 | Missing English keys (`errors.*`, `o15.note`, `o20.keepCopies`) and the stale `o03.signIn.triesLeft` | Add the missing keys in all five languages; delete the stale key (G1). |
| D8 | Checklist stages have no clock times | The sun on the day arc follows the real WAT clock. Stages are shown by completion, never by expected time, so no times are invented. |
| D9 | Abstain text keys differ (`ask.abstain` vs `o19.noAnswer`, `p04.abstain.*`) | One shared key, `ask.abstain`. The screens use it. |

---

### First run

#### 1 · Splash (new `ui/Splash`, shown by the root layout once per install)
- **Job:** a warm, quick first impression while the app shell and fonts load.
- **Layout:**
  - Paper ground.
  - In the centre: SunRings (three rings, outer 232 px) with a 136 px sun disc holding the E+G mark (68 px, ink).
  - Under it, "ElectraGuard AI" in hero type, then "by Cairn" in body-lg `--ink-2`.
  - At the bottom: Plate A crop 390×220, fading into the paper at the top.
- **Interaction:**
  - I-1. It stays up at most 1.2 s, or until the shell is ready, whichever is later but never more than 2 s.
  - A tap skips it.
  - It is not shown again on this install (flag `eg.splashSeen`).
  - It never shows for tests (`navigator.webdriver`) or deep links (`/o/reports/…`, `/status?code=`).
- **States:** first open; reduced motion (static, 400 ms); dark (warm-black ground, Plate A in the paper window, sun unchanged).
- **Copy:** brand only, never translated.
- **Beyond the reference:** never blocks offline start or deep links; skippable.
- **Done when:** LCP of the next screen is not delayed by more than 200 ms compared with no splash (measured).

#### 2 · Choose your language (O-01, `/o/start` step 1)
- **Job:** pick one of five languages in one tap, before reading anything else.
- **Layout:**
  - AppBar `plain`, without Back on first run.
  - Title "Choose your language" with a sub-line in `--ink-2`.
  - Five ChoiceTile `row`s, one per language. Each row shows the language's own name in its own script (large) with its English name small under it, in this order: English, Naijá, Hausa, Yorùbá, Igbo.
  - The bottom ActionBar has "Continue", enabled once a language is chosen. The current phone language is preselected when it matches one of the five.
- **Data:** none. Stored in localStorage `eg.locale`.
- **Interaction:**
  - I-3 sweep on the chosen row.
  - The title and sub-line cross-fade into the chosen language immediately, so the user sees the choice working.
- **States:** first view; opened from Settings (as a Sheet, saving immediately); no stored locale.
- **Copy:** `o01.title`, `o01.sub`, `common.continue`.
- **Beyond the reference:** the screen speaks the language you tapped before you leave it.
- **Done when:** each row has `lang` set; TalkBack reads each language name in that language's voice where the phone has one.

#### 3 · Welcome, slide 1: "See it. Report it." (new)
- **Job:** say what the app is for in one sentence.
- **Layout:**
  - Plate A (390×240).
  - Title (new key `ob1.title`): "Report what you see at the polling unit."
  - One sentence (new `ob1.body`): "A trained reviewer reads every report. You get a receipt code to follow it."
  - Pager dots (3) and buttons "Skip" (quiet) and "Next" (primary).
- **Interaction:**
  - I-2 swipe with parallax.
  - Skip goes to slide 2 (D1).
- **States:** reduced motion (no parallax); 200 % text (art shrinks to 160 px tall, text never cut).
- **Done when:** a swipe and the buttons both work, and the focus order is the title, then the body, then Skip and Next.

#### 4 · Welcome, slide 2: "What this app keeps" (O-02 moved here)
- **Job:** the privacy promise, read once by everyone.
- **Layout:**
  - Plate D (square, 200 px).
  - Title `o02.title` "What this app keeps".
  - Four lines (existing O-02 lines), each with a 40 px icon disc: no name or phone number; we never use your location; faces we can detect are blurred; the 112 line (`o02.line4`) with the danger triangle.
  - Optional "Listen" button, shown only if audio exists.
  - The link "Read the full privacy notice" opens screen 36 in a Sheet.
  - Primary "I understand" (`o02.continue`) on the last slide only; here it is "Next".
- **States:** read-only from Settings (no pager, Back instead).
- **Done when:** these lines are the exact fixed safety wording from Part E.

#### 5 · Welcome, slide 3: "Works without network" (new)
- **Layout:**
  - Plate E.
  - Title (new `ob3.title`): "No network? It still works."
  - Body (new `ob3.body`): "Your report waits safely on this phone and sends itself when the network is back."
  - Primary "I understand" (`o02.continue`), which records the O-02 acknowledgement.
- **Done when:** the acknowledgement is stored as before. Existing logic that checks O-02 still passes.

#### 6 · Who are you? (O-03 choose view)
- **Job:** route to observer sign-in, citizen reporting, or checking a receipt.
- **Layout:**
  - AppBar `home` with a LanguageSwitcher (compact, the globe icon plus the language's short name).
  - Plate A top crop (390×200).
  - Title `o03.choose.title` "Who are you?". The reference says "How will you take part?"; keep the existing key, which tests well.
  - Two ListCards:
    1. Lanyard icon, "I am an accredited observer" with the line "Sign in with the code and PIN on your card."
    2. Person icon, "Report as a citizen" with the line "No account, no name. You get a receipt code."
  - The quiet link "Check a report with a receipt code" goes to screen 31.
  - The footer line "ElectraGuard AI by Cairn · Independent and nonpartisan" in small `--ink-3`.
- **Interaction:** I-3-style press on the cards. Choosing citizen creates the receipt secret on the phone, with no API call (existing logic).
- **States:** default; offline (both cards work, the banner shows).
- **Beyond the reference:** no tagline ("Clean elections, stronger tomorrow" is removed for neutrality), and the real mark instead of a sun icon.

#### 7 · Sign in (O-03 sign-in)
- **Job:** enter the observer code and the PIN from the card.
- **Layout:**
  - AppBar `plain`, Back.
  - Title `o03.signIn.title` "Sign in".
  - CodeInput "Observer code": prefix `OBS-` shown greyed, auto-uppercase, normalises O→0, I and L→1, and checks the check symbol on the phone.
  - PinInput "PIN", which accepts 6 or 8 digits (the setup PIN is 8), with show/hide.
  - Primary "Sign in".
  - Quiet line: "Lost your card? Ask your coordinator."
- **Data:** AUTH-02 then AUTH-03 when it is a setup PIN; AUTH-01 is fetched again after success.
- **Interaction:**
  - The code field moves to the PIN field when it is complete.
  - The button shows the loading state; on success it shows a tick for 400 ms.
  - On failure the fields shake gently (4 px, 2 cycles; reduced motion: none).
- **States:**
  - empty; local errors `codeEmpty`, `codeFormat`, `pinFormat`;
  - `401 invalid_credentials` ("The code or PIN is not right." It never says which);
  - `423 code_locked`: the button is disabled with a countdown taken from Retry-After;
  - `403 code_revoked`: goes to screen 9;
  - `422`, `429`, `5xx`, offline ("Sign-in needs the network. Your saved reports are safe.");
  - setup token expired.
- **Copy:** existing `o03.signIn.*`. The tries-left key is deleted (D7).
- **Done when:** no error message reveals which field was wrong, and `autocomplete="off"` is on both fields.

#### 8 · Choose your own PIN (O-03 set PIN)
- **Layout:**
  - Title `o03.setPin.title` "Choose your own PIN".
  - Rules as three ticked lines that turn green with a tick as each is met: 6 digits; not all the same digit; not a run like 123456; not the start of your card PIN.
  - PinInput "New PIN" and "Type it again".
  - Primary "Save my PIN".
- **Interaction:** the rule lines update as you type (I-3 tick pop).
- **States:** `tooSimple`, `mismatch`, `pin_same_as_setup`, setup token expired (back to screen 7), `5xx`.
- **Done when:** the success state lands on Home with the "Your PIN is saved" toast (not a banner).

#### 9 · This code no longer works (O-03 revoked)
- **Layout:**
  - Danger triangle in a red-tint disc.
  - Title `o03.revoked.title`.
  - Plain sentence; the count of unsent reports on this phone.
  - Primary "Sign in with a new code".
  - Danger outline button "Clear unsent reports", with a confirm Sheet that states the number that will be deleted.
- **Done when:** the unsent reports stay unless explicitly cleared (Q3 rule).

---

### Reporting

#### 10 · Home (O-04, `/o`)
- **Job:** start a report in one tap, and see at a glance what needs you.
- **Layout** (scrolls; BottomNav fixed):
  1. AppBar `home`: the mark and name, the OutboxBadge when something is waiting, and Menu.
  2. Banners, in the existing order, at most two visible, the rest in the Menu: network, revoked items, intake paused, unsent (with "Send now"), question (with "Answer").
  3. Greeting by WAT time (new `o04.greeting.morning` / `.afternoon` / `.evening`) in title type. Under it: "Observer OBS-7K2P9X" (code bold, tabular) and the observer's unit if known from the Arrival stage.
  4. "Continue your report" card when a draft exists: category pictogram, "Started 07:52", Continue / Delete.
  5. HeroCard "Report something" with the sentence "Tell us what you see at your polling unit."
  6. DayArc card "Polling-day checklist · 2 of 6 sent": six stage dots on the arc (sent = ink, next = gold, later = rule), the sun at the WAT clock position (I-11), and one line under it, "Next: Accreditation". Six names do not fit legibly at 360 px, so they are not printed on the arc; a visually hidden ordered list reads every stage and its state to screen readers. Tapping it goes to screen 22.
  7. "My reports" heading with "See all (n)". Up to 3 ListCards, newest first, needs-you first.
  8. A quick row of three equal tiles: Messages (unread count), Ask, Discussions (shown only when DIS-01 has a row).
- **Data:** AUTH-07, REP-02 (`counts.open_questions`, `counts.unread_messages`, first 3 items, D3), DIS-01, the local outbox and draft.
- **Interaction:** I-11 (the sun moves; it updates every minute while visible); hero press; I-10 when the outbox drains; I-12 pull to refresh.
- **States** (each screenshotted):
  - new observer (no reports: the "My reports" section shows the "no reports yet" spot with one line);
  - loading (skeletons, never fake zeros);
  - filled;
  - question waiting;
  - offline;
  - intake paused (the hero turns grey with "New reports are paused. You can still write them; they will wait on this phone.");
  - unsent items;
  - revoked items;
  - session expired (sheet);
  - after closing time (sun set, arc complete or dimmed).
- **Beyond the reference:**
  - six real stages, not five;
  - a live sun;
  - My reports kept;
  - quick row for Messages and Ask;
  - real paused and offline states.
- **Done when:**
  - the whole hero card is one link;
  - the arc is read as a list by TalkBack;
  - three requests at most on load, in parallel.

#### 11 · What happened? (O-05, `/o/new/what`, step 1 of 7)
- **Layout:**
  - AppBar `task`: Back and "Step 1 of 7", with the Stepper bar.
  - Title `o05.title` "What happened?".
  - Sub-line `o05.sub` "Choose the closest one. Not sure is fine."
  - ChoiceTile grid, 2 columns (1 column at 200 % text, 3 on tablets), 10 tiles in the fixed order: late materials, equipment failure, queues or crowding, intimidation or violence, access barrier, people lack information, misinformation, vote buying, good practice, not sure. Good practice uses a thumbs-up; Not sure uses a question mark.
  - Choosing "Access barrier" expands, under the grid, a card of 6 checkboxes (`steps_no_ramp` … `other`). The expansion animates its height 240 ms.
  - ActionBar "Continue".
- **Interaction:** I-3, I-4. The draft is created on the first choice, and the idempotency key is made once (existing).
- **States:**
  - nothing chosen (Continue shows `o05.error` inline under the title and focuses the grid);
  - prefilled from the checklist ("Report this as an incident");
  - citizen mode (identical);
  - 200 % text.
- **Beyond the reference:** the full 10 categories, with good practice reported as a positive, not only problems.
- **Done when:**
  - arrow keys move between tiles;
  - the selection survives a reload (the draft race fix from the plan, 6.2);
  - no tile is hidden behind the ActionBar.

#### 12 · Is anyone in danger now? (O-06, step 2)
- **Layout:**
  - Title `o06.title`.
  - YesNo, two large rows: "Yes, someone is in danger" (red triangle icon) and "No".
  - **No** advances at once (I-4).
  - **Yes** replaces the content with "Get safe first":
    - a danger-tint card with 3 numbered steps;
    - a full-width danger Button "Call 112" (`tel:112`, number from the one config constant);
    - the fixed line "This app does not send help. Your report goes to reviewers, not to the police.";
    - then "Continue the report" (secondary) and "Finish later" (quiet, saves the draft).
- **Interaction:** I-3 on the choice; the danger haptic `[40]` once.
- **States:** offline (calling 112 still works); stored as `danger_now`.
- **Done when:** the Call button is reachable in one tab stop after the title.

#### 13 · Where did it happen? (O-07, step 3)
- **Layout:**
  - Title `o07.title`.
  - Line with the no-location icon: "We never use your phone's location."
  - If the Arrival stage gave a unit, a pinned card "Your polling unit today": the unit name, the code and the ward line, and a radio.
  - A search field: "Search by unit name, code or ward". Code matches work with or without dashes.
  - The result list: each a row with the name, then "PU 009 · Ward 07, Ibadan North, Oyo".
  - A quiet link "Choose by state, LGA and ward" opens a Sheet with four labelled selects.
  - A quiet link "I don't know the unit" switches to ward-only.
  - ActionBar "Continue".
- **Data:** REF-01 index and state documents (ETag cached).
- **Interaction:** I-5. Downloading the state list shows a thin sun progress line under the search field ("Getting the list of polling units, 40 %").
- **States:**
  - no results ("No unit found. Try the ward name.");
  - list not downloaded and offline ("The polling unit list needs the network once. You can choose 'I don't know the unit' for now.");
  - downloading; server error with retry;
  - `unknown_area` returned on send (comes back here with the message).
- **Done when:** every select announces its own label (bug fix); search results are announced as a count.

#### 14 · When did it happen? (O-08, step 4)
- **Layout:**
  - Title `o08.title`.
  - A SegmentedControl with "Just now" (default), "Earlier today" and "Another day".
  - Earlier today shows a time field. Another day shows a date field (min 30 days ago, max today) and a required time.
  - The note "All times are West Africa Time."
- **States:**
  - `future` (more than 5 min ahead): "Choose a time that is not in the future.";
  - `empty`; `too_old`;
  - a date more than 7 days back opens a confirm Sheet;
  - phone clock off by more than 10 min: silently corrected using AUTH-07 `server_time`, and the note says "Using network time."
- **Done when:** native inputs are used, and the step works with TalkBack and a hardware keyboard.

#### 15 · Tell us what you saw (O-09, step 5)
- **Layout:**
  - Title `o09.title`.
  - The hint "Describe roles, not names: 'a party agent', 'the presiding officer'."
  - TextArea (grows from 5 lines) with the DictationButton in its corner and a counter shown from 1,500 of 2,000.
  - A required choice "How do you know?": "I saw it myself" / "Someone told me" (sent as `firsthand`).
  - ActionBar "Continue".
- **Interaction:**
  - I-6. Dictation stops after 60 s or 8 s of silence.
  - A one-time note before the first dictation: "Your phone's speech service may process this audio. You can also use your keyboard's voice typing."
- **States:**
  - dictation unavailable (button hidden); microphone denied (inline);
  - under 20 characters ("A few more words help the reviewer.", and Continue needs a second tap);
  - too long;
  - possible name detected: an attention banner "This may name a person. Please describe roles, not names." blocks Continue once, until "I've checked" is tapped.
- **Done when:** the text survives reload and language change, and the name banner never sends anything to the server.

#### 16 · Add a photo, video or voice note (O-10, step 6)
- **Layout:**
  - Title `o10.title`, with "Optional" as a small chip.
  - A 2×2 grid of source tiles: Photo, Video (up to 60 s), Voice note (up to 2:00), File.
  - The attachments list (UploadItem): thumbnail, size, "Location removed" chip, a "Blur faces" switch (photo and video; on by default), and Retake / Remove.
  - The line "Faces we can detect are blurred. Check before sending."
  - A count line "2 of 6 added".
  - ActionBar "Continue" with the quiet link "Skip".
- **Interaction:**
  - the I-3 press on the source tiles;
  - the thumbnail shows the phone-side blur preview;
  - real progress appears later, on the receipt (uploads start after sending).
- **States:**
  - camera denied; microphone denied;
  - 6 items reached (`media_limit_reached`); too big (photo 2 MiB, video 25 MiB, voice 4 MiB); wrong type; too long (video over 60 s: "Choose a clip of 60 seconds or less.");
  - storage full; processing.
- **Done when:** EXIF is stripped on the phone before the preview (existing), the limits shown match the contract, and the screen works without a camera (File only).

#### 17 · Check and send (O-11, step 7)
- **Layout:**
  - Title `o11.title` "Check and send".
  - A summary card per part, each a row with a label, the value and a "Change" link: What, Danger, Where, When, What you saw (the first 3 lines, with "Show all"), How you know, Evidence (thumbnails).
  - ActionBar primary "Send report". When offline or paused it reads "Save and send when online".
- **Data:** REP-01 (citizen: REP-05) with `Idempotency-Key` and `X-Device-Time`.
- **Interaction:** I-8 (button to ring to tick; offline, the envelope flies to the badge).
- **States** (all from the contract):
  - incomplete (the missing part is highlighted with an attention chip);
  - sending; success;
  - offline ("Saved on this phone. It will send by itself.", then Home after 2 s);
  - not confirmed ("We sent your report but have not heard back. We are checking. It will not be sent twice.");
  - intake paused; queue full (20);
  - session expired (PIN sheet); revoked;
  - validation (needs attention, back to the step);
  - key reused, 413, 429, 5xx.
- **Done when:** "Received" and the code appear only after a server response; a double tap never sends twice.

#### 18 · Report received (O-12, `/o/reports/[ref]?just-sent`)
- **Job:** confirm, give the receipt code, and finish uploads.
- **Layout:**
  1. SunRings with a 80 px green check disc.
  2. Title "Report received".
  3. ReceiptTicket: "Your receipt code", the code in hero type, "Received 08:14 WAT, 15 Feb", the tear line, then "Copy code" and "Save as image".
  4. When attachments exist, an "Attachments" card with UploadItems showing real bytes, each Saved / Uploading 40 % / Failed (Retry), and the note "Keep the app open until all items say Saved".
  5. "What happens next": three numbered lines (`o12.next.line1..3`).
  6. Quiet link "Report something else".
  7. ActionBar primary "Back to home" (when just sent) or "See this report" (when opened later).
- **Interaction:** I-9. Upload rings show real progress, and finishing all attachments shows a toast "All attachments saved".
- **States:**
  - just sent; opened later;
  - offline mid-upload (resumes from `received_bytes`);
  - item failed (413, 415, `media_limit_reached`, `report_closed`, `report_withdrawn`, `hash_mismatch`, `media_unreadable`, each with its own sentence);
  - file missing on the phone; session expired; revoked.
- **Beyond the reference:**
  - a single primary action;
  - nothing hidden under the bar;
  - live upload status on the receipt itself.
- **Done when:**
  - the saved PNG contains only the code and time;
  - the steps are never covered by the ActionBar at 360 × 640.

---

### After reporting

#### 19 · My reports (O-13, `/o/reports`)
- **Layout:**
  - AppBar `plain` "My reports".
  - SegmentedControl: "All (n)", "Needs you (n)", "On this phone (n)". The third filter is the outbox (D4).
  - "Updated 10:02 WAT" in small type.
  - ListCards: category pictogram, title (or "Checklist: Opening" / "Result-sheet check"), place line, time, status chip, unread line "1 new message".
  - Load more at 50.
- **Interaction:** I-12 pull to refresh; I-10 status cross-fade; a needs-you count bump on the BottomNav.
- **States:**
  - loading; filled;
  - empty (spot "No reports yet. When you send a report, it will show here.");
  - empty filter ("Nothing needs you right now.");
  - offline (the phone index plus the outbox, with the note);
  - server error with retry.
- **Done when:** rows from the outbox and from the server never appear twice (merge by idempotency key).

#### 20 · Report detail (O-14, `/o/reports/[ref]`)
- **Layout:**
  1. AppBar `plain`, Back.
  2. Title = the category (e.g. "Late or missing materials").
  3. Meta line: unit name · time · the receipt code (tabular).
  4. StatusJourney: Received · Being reviewed · Question for you · Closed (the Question node appears only if a question was ever asked).
  5. QuestionCard when a formal question is open: eyebrow "REVIEWER QUESTION · 09:41", the question, "Your answer" (1–2,000), "Send answer".
  6. A closed outcome card when closed: "Confirmed by evidence" / "Not enough evidence" / "Outside what we observe", with a plain sentence.
  7. "Your report" card: description, place, when, how you know; attachment thumbnails with "Location removed" and the blur state.
  8. Conversation (MessageThread) with a composer: text plus one photo or voice note. Staff always appear as "Reviewer".
  9. Footer action: "Withdraw this report" (danger outline, only while status is received, with a confirm sheet) or the line "Review has started, so this report can no longer be withdrawn."; for outbox items, "Delete from this phone".
- **Data:** REP-03, MSG-01, MSG-02, REP-04.observer.
- **Interaction:** I-13, I-14; a new message slides in; read on open.
- **States:**
  - loading; on this phone; not confirmed; received; in review; question;
  - question already closed (`o14.question.alreadyAnswered`); writes refused; closed with outcome; withdrawn (a stub card);
  - withdraw too late; withdraw offline (not allowed: "Withdrawing needs the network.");
  - empty conversation; offline; server error; not found; session expired; revoked.
- **Beyond the reference:**
  - the withdraw rule is shown honestly (the reference showed Withdraw during a question, which the system does not allow);
  - the outcome is explained.

#### 21 · Messages (O-17, `/o/messages`)
- **Layout:**
  - Title "Messages".
  - ListCards grouped "Questions for you" first, then "Unread", then "Earlier". Each shows the category, the receipt code and "Reviewer · 09:41". The preview line comes from REP-02 `last_message_preview` (contract amendment G8, already decided); without it, show "New message".
  - Tapping opens screen 20 scrolled to the thread.
- **States:** loading; filled; empty (spot "No messages. Reviewers will write here if they need to ask you something."); offline (from the phone index); server error.

---

### Polling day

#### 22 · Polling-day checklist (O-15 list, `/o/checklist`)
- **Layout:**
  - AppBar `plain`, Back.
  - Title "Polling day".
  - Meta: unit name · "2 of 6 sent".
  - Plate B (390×220), with the sun arc drawn in code over its sky: the real-time sun (I-11), "07:30" and "16:00" as labels only at the two ends. These are the published standard opening and closing times and must be confirmed against the official guide before freeze.
  - A Timeline of the 6 stages:
    - done: green tick, stage name · the time it was sent, "Sent";
    - next: gold disc, name, "Answer 4 questions →" button;
    - later: hollow, name, a one-line description of the stage;
    - in the outbox: hollow with an "On this phone" chip.
  - Stage 1 Arrival is required first; the others show "Fill in Arrival first so we know your polling unit."
- **Interaction:** I-11, I-15.
- **States:** not started; in progress; all done (spot "Thank you. All stages sent." with the sun set); offline; intake paused.
- **Beyond the reference:** six real stages; times shown are when you sent, never invented expected times (D8).
- **Done when:** the timeline is an ordered list and every stage reads its state.

#### 23 · Checklist stage (O-15 form, `/o/checklist/[stage]`)
- **Layout:**
  - AppBar `task`: "Opening · 3 of 4", with a progress bar per question.
  - One question per card, with Yes / No / Not seen chips (YesNo three-way).
  - A "No" on materials shows an inline checklist of the 9 missing materials.
  - Under each problem answer, a quiet link "Report this as an incident" (opens screen 11 prefilled).
  - An optional note (1,000 characters).
  - ActionBar "Send this stage".
- **Stages and questions:** as in the facts (arrival: unit and arrival time; opening: 4 questions; accreditation: 3, queue size as 4 chips; voting: 4; closing and counting: 3; results posted: 1, where Yes offers screen 24).
- **States:**
  - draft; unanswered ("Send anyway?" sheet); needs unit first;
  - sending; offline; paused;
  - 422 shown on the question;
  - already sent (opens its detail).
- **Done when:** answers save per tap; wire values match (`closing_counting`, `results_posted`).

#### 24 · Result-sheet check (O-16)
- **Layout:**
  - Pinned, non-dismissible info banner: "Consistency check for review. This is not a result."
  - Step A, photo: a camera frame with corner guides and "Fit the whole sheet inside the frame"; Take photo / Choose photo.
  - Step B, numbers: a field per item (registered, accredited, rejected, then one per party label A–E), each with a "Suggested" chip when filled from RS-01 and a "Can't read" switch.
  - A required checkbox "I checked every number against the posted sheet".
  - "Send".
- **Interaction:** I-16 scan line while RS-01 reads (real wait only); suggested fields appear in order.
- **States:**
  - reading; suggestions; read failed (type them);
  - photo rejected (413, 415, `hash_mismatch`); 429;
  - offline (typed, `entry_method manual`);
  - validation (not a number, over 99,999);
  - sending; paused.
- **Safety:** never a total, a percentage, a winner or "adds up". A test checks that no sum is rendered.

---

### Community and settings

#### 25 · Discussions (O-18)
- **Layout (list):** "Invitations" cards (title, ward or LGA scope, the rules text, Accept / Decline) and "Your discussions" ListCards with an unread dot.
- **Layout (thread):** posts as MessageThread with "Observer" labels; a composer (1–1,000, counter from 800); a menu with Leave and Report this post. The fixed note: "To use something from here in your own report, write it in your report yourself."
- **States:**
  - loading; empty; join refused;
  - posting queued offline; too long;
  - `contains_polling_unit_code` ("Name the ward, not the polling unit.");
  - closed; removed; leave confirm; rate limited.

#### 26 · Ask ElectraGuard (O-19)
- **Layout:**
  - Title "Ask ElectraGuard".
  - The note "Answers only come from approved guides. They are not legal advice."
  - A question field (3–500, dictation) and "Ask".
  - The answer card: the quoted passage, then a source card (guide title, section, version) with "Open source".
  - Abstain card (`ask.abstain`, D9): "I don't have an approved answer to that. Contact your coordinator."
- **Interaction:** "Thinking" shows three sun dots in sequence (real wait only); the answer fades in.
- **States:** empty submit; asking; answer; English fallback chip; abstain; offline (saved guides list); server error; 429.

#### 27 · Profile and settings (O-20)
- **Rows** (grouped cards):
  - Language (Sheet).
  - Theme: System / Light / Dark (new, stored locally).
  - Text size: Normal / Large (new; scales the root font size by 1.15).
  - Vibration on or off (new).
  - Change PIN (D2, Sheet with current and new PIN).
  - Privacy notice (screen 4, read-only).
  - "Keep copies on this phone" (`o20.keepCopies`, D7, default off).
  - Storage used.
  - Sign out; "Sign out on every phone"; "Sign out and clear this phone" (confirm sheet stating the unsent count).
  - App version.
- **States:** PIN validation; unsent warning; offline sign-out (local clear, with a note that the server session ends on its own).

#### 28 · Menu sheet and Outbox sheet (global)
- **Menu:**
  - the code and unit at the top;
  - Profile and settings, Messages, Ask, Discussions, Guides, Privacy, Language;
  - the 112 line;
  - Sign out.
- **Outbox:**
  - the list of waiting reports with category, time and state (waiting, sending, failed with reason);
  - "Send now", plus "Delete" per item with a confirm;
  - the line "Reports send in the order you made them."

---

### Citizens

#### 29 · Citizen report flow (screens 11–17 with `?as=citizen`)
- **Differences from the observer flow:**
  - the AppBar shows "Citizen report" instead of the code;
  - Where has no "Your polling unit today";
  - Evidence is the same with the same limits;
  - Check and send says "You don't need an account. You'll get a receipt code.";
  - the API is REP-05;
  - Back from step 1 goes to `/` (D5).
- **Done when:** no observer-only control appears; the receipt secret never leaves the phone except to REP-05.

#### 30 · Citizen receipt (C-01, `/r/receipt/[code]`)
- **Layout:**
  - Same as screen 18, plus a "Write it down" line with a pen icon.
  - The switch "Keep this code on this phone" (default on; turning it off removes the code and secret after a confirm).
  - The SMS status line ("You can also check by SMS: STATUS EG-4H7Q-92KD to 20384 (test number)").
  - Primary "Check status"; quiet link "Report something else".
- **Done when:** the saved image has no content and no secret.

#### 31 · Check a report (P-01, `/status`)
- **Layout:**
  - Title "Check a report".
  - CodeInput "Receipt code" with the example "EG-4H7Q-92KD", plus chips for codes saved on this phone.
  - "Check" button.
  - The result card: StatusJourney (dates only), a plain explanation, and when in question the formal question with a reply box (only on the phone holding the secret), and "Withdraw" (only with the secret and while received).
- **States:**
  - prefilled; format error; checking; found;
  - not found (the same text for every unknown code);
  - 429; offline; server error;
  - `401 receipt_secret_invalid` ("You can answer only on the phone that sent the report.");
  - `409 question_closed`; `409 withdraw_unavailable`.
- **Privacy:** no category, times or text revealed.

---

### Public site (responsive: phone first, 1280 desktop)

The public shell is shared by screens 32 to 37:
- **Header:** the mark and name, then the nav (Home, Results, Ask, Guides, Try SMS and USSD, Privacy). Below 900 px the nav collapses into a Menu sheet. A language switcher.
- **Footer:** the mark with "by Cairn", the two fixed lines (nonpartisan; 112), the links, the licence and the version.

#### 32 · Public home (P-02, `/`)
- **Desktop layout:**
  - Hero in two columns. Left: the title "Saw a problem at a polling unit? Report it.", the body, primary "Report what you saw" with the note "No account and no name. You get a receipt code.", and the basic-phone line. Right: a receipt-check card.
  - Plate A runs full-bleed under the hero.
- **Then, in order:**
  - "Reviewed so far": a MetricTile with the total, plus three category bars, the INEC line and "See all results →".
  - "How it works": four steps with icon discs joined by a sun line.
  - "Questions": Ask and the guide links.
  - Footer.
- **Phone layout:** a single column in the same order; the receipt check comes after the hero.
- **States:** results empty ("Nothing has been published yet."); suppressed ("Fewer than 5 reviewed reports so far."); unavailable; receipt check states (found, question, too many, unavailable).

#### 33 · Reviewed reports (P-03, `/results`)
- **Layout:**
  - Title "Reviewed reports".
  - Meta "Updated 10:00 WAT · Counts below 5 are hidden".
  - An organisation picker ("All organisations combined").
  - SegmentedControl "By state / By issue":
    - **phone:** a list of states, each a card with the total and up to 4 category bars; "fewer than 5" in `--ink-3` where suppressed; tapping opens a Sheet with that state's full breakdown;
    - **desktop:** a table with sticky first column and bars in cells.
  - "Outcome of reviewed reports": three bars with percentages.
  - "Reports by hour (WAT)": a bar chart with a table caption.
  - The INEC notice card.
  - The audit fingerprint: "Snapshot 14:00 WAT · 1,240 events · fingerprint 3f9a…" with "How to verify".
- **Interaction:** I-17; the segmented thumb slides; the sheet opens.
- **States:** ok; empty (spot "closed ballot box with a clock" with the line "Totals appear after reviewers finish reports, and at least 60 minutes after the reports were made."); error with retry.
- **Done when:**
  - no count under 5 is ever shown, and secondary suppression is respected (test with fixtures);
  - no area finer than state appears;
  - every chart has a data table.

#### 34 · Ask (P-04, `/ask`)
- Same as screen 26, in a wide centred column (max 720), with "Your questions are not stored." The "unavailable" state reads "Ask ElectraGuard is not switched on yet."

#### 35 · Guides (P-05, `/guide`, `/guide/[slug]`)
- **List:** cards with the title, version, approval date and an "English only" chip.
- **Reader:**
  - a 68-character text column;
  - a contents list (sticky at the side on desktop, a Sheet on phones);
  - the version and approval line;
  - a fallback-language notice;
  - "Ask about this guide".
- **States:** empty; not found; error.

#### 36 · Privacy notice (P-06, `/privacy`)
- The existing sections, set as a readable document: a contents list and section headings with icon discs.
- Adds the data-location line "Reports are stored in Microsoft Azure, South Africa North" (from C14, in five languages).

#### 37 · Try SMS and USSD (P-07, `/phone`)
- **Layout:**
  - On desktop, a drawn basic phone (ink body, paper screen, real keypad buttons) on the left and the instructions on the right. On phones, the phone fills the width.
  - Views: dial, USSD menu (140-character screens), SMS composer (160), inbox.
  - The banner "Simulated phone. Reports made here are marked and never counted in public results."
  - "New simulated number".
- **States:** starting; disabled ("The phone simulator is switched off."); network; server; too many; invalid.
- **Done when:** the keypad works with a physical keyboard (digits, Enter = OK, Escape = End).

---

### Staff desk (desktop 1280 first; usable at 1024; read-only usable on a phone)

**Shared:**
- StaffShell with an ink rail (sections by role, as in `(staff)/s/layout.tsx`, with counts).
- A top bar: page title, global search by reference (`/`), the user menu, the theme switch.
- Staff type is one step smaller. No art except on sign-in.
- Every page has loading, error (`staff.networkError`), forbidden and not-ready states.
- Destructive actions use confirm sheets with a reason field where the API asks for one.
- Shortcuts are listed under "?".

#### 38 · Staff sign-in (S-01)
- **Layout:**
  - A centred card (max 420) on paper, a thin Plate A strip at the top of the card, and the mark.
  - The steps:
    1. Email + password.
    2. Two-step code: 6 boxes, auto-advance, paste works.
    3. Enrol: the QR (D6), the secret with "Copy key", and a confirm code.
    4. Invite: set a password (12–128), with a strength line.
- **States:** `invalid_credentials` ("Email or password is wrong."); `account_locked`; `totp_invalid`; `totp_required`; invite invalid or expired; rate limited.

#### 39 · Review queue (S-02)
- **Layout:**
  - Filter chips (status, urgency, category, channel, has media) with "Reset filters" and saved views.
  - Status counts as segmented tabs.
  - DataTable columns: urgency (chip with shape), reason chips, reference, category, place (LGA), occurred, evidence counts, status.
  - Wide screens add a preview pane on row focus.
- **Interaction:** I-18; J/K/Enter; "Load more".
- **States:** loading rows; empty ("No cases match these filters."); error.

#### 40 · Case review (S-03)
- **Layout (three columns at ≥ 1280, stacked below):**
  - **Left, the report:**
    - reporter label;
    - the original text with a "Machine translation. Check the original." toggle;
    - details;
    - evidence with integrity ticks (SHA-256 verified, EXIF stripped, faces blurred), "View unblurred", which asks for a reason and is recorded in the audit, and transcripts;
    - redaction mode (select spans, preview).
  - **Middle, help:**
    - SuggestionCards for category and urgency ("Suggested, not decided", confidence word and bar, top reasons, Accept / Change);
    - duplicate candidates side by side (Link / Keep separate);
    - the result-sheet flags box with the fixed disclaimer.
  - **Right, decision:**
    - status and actions: Start review, Ask a formal question (1–2,000), Close (outcome radio, internal rationale 1–2,000, an "I considered all evidence" check);
    - the conversation with the observer;
    - the audit trail with "Hash chain intact" or "Hash chain broken!".
- **States:** `stale_version` (reload banner), `invalid_transition`, `closure_evidence_changed`, 422.
- **Done when:** AI output is always labelled, and no decision can be made in one click from a suggestion.

#### 41 · Assign (S-04)
- **Layout:** reviewer workload as horizontal bars ("12 open, 3 urgent"); the unassigned table with a "Suggested: Reviewer 4" chip and its reason; select all; bulk assign (1–100); "Take suggested reviewer".
- **States:** a per-row result (assigned, `already_assigned`, `stale_version`).

#### 42 · Operations room (S-05)
- **Layout:**
  - MetricTiles: total, incidents after links, urgent open, questions open, result-sheet flags (with "This is not a result."), withdrawn.
  - Reports by LGA (a table, and a choropleth map of LGAs only, with no finer markers).
  - Cluster warnings with review notes.
  - Coverage gaps (expected units, reported %, missing).
  - Late-materials risk (high, medium, low).
  - A date filter.
  - The synthetic-data footnote.

#### 43 · Rumour desk (S-06)
- **Layout:**
  - Log a claim: text or image, "Seen on", language.
  - The claims table with harm and check-worthiness chips.
  - The claim detail with matched observations (corroborated only), past verified claims, the image verification guide, and the response draft editor with Save, Approve, Reject (needs a note) and Dismiss.
- **States:** `403 same_person_approval` ("Another coordinator must approve this.").

#### 44 · Publish snapshots (S-07)
- **Layout:**
  - Cutoff time picker (at least 60 min ago).
  - "Generate preview", which renders exactly screen 33's components with the draft data, side by side with the exclusions list.
  - "Approve and publish" (confirm sheet); "Discard draft".
  - The hourly auto-release switch; the snapshot history with fingerprints.

#### 45 · Discussion moderation (S-08)
- **Layout:** the flagged posts inbox ("Flagged 3 times", reasons, "Possible personal name detected"); Hide (reason) / Unhide / Remove member / Close discussion; Create discussion (title, topic, ward or LGA scope, invite codes).

#### 46 · Observer code batches (S-09)
- **Layout:**
  - Create batch (label, count 1–500).
  - The print view: an A4 sheet of cut-out cards, each with the code and setup PIN, the mark and a scissor line, with the notice "Setup PINs are shown only once."
  - The codes table with search and status chips (Unclaimed, Active, Locked, Revoked); row actions Revoke / Reissue / Reset PIN, each with a reason.
- **States:** `409 confirmation_required` (a confirm sheet).

#### 47 · Staff accounts (S-10)
- **Layout:** the staff table (name, email, roles, 2FA, last sign-in); add staff (email, name, roles; admin exclusive); the one-time invite link with Copy; Reset 2FA; Offboard (reason).
- **States:** `last_admin`, `stale_version`, duplicate email, self-offboard forbidden.

#### 48 · Organisation settings (S-11)
- **Layout:**
  - Intake pause, a danger switch with a confirm sheet.
  - Retention days (30–730; shortening shows the number of records that will be deleted).
  - Election day.
  - Public delay (60–1,440).
  - Party labels (locked once a result sheet exists, with the reason).
  - Export audit log (JSONL or CSV, date range).

#### 49 · Security and audit (S-12)
- **Layout:**
  - Alerts as a timeline table: severity chip, rule, detector (rules or model), status filter, update with a note (500).
  - A "Verify audit chain" card: "Run check", the result ("12,402 events verified · chain intact", the head hash, or the first broken event in danger).
  - Export.

### System

#### 50 · System pages
- **Pages:** Not found, Offline shell, Session ended, Access changed (`/access-changed`), Intake paused (full page for citizens), Error boundary ("Something went wrong. Your saved reports are safe." with Reload / Home).
- Each is an EmptyState with a spot illustration, one sentence and one action.
- **Clean-up after a link sweep:**
  - remove the legacy routes `/workspace/*` and `/sign-in`, with permanent redirects to the new ones;
  - exclude `/dev/*` from production builds.

---

## Part G · Production readiness (applies to every screen)

### G1. Performance budgets (checked in CI with Lighthouse CI on the built app)

| Measure | Budget | Measured on |
|---|---|---|
| JavaScript per observer route (gzipped, first load) | ≤ 170 KB; ≤ 60 KB for later routes | `next build` output, checked by `scripts/check-bundle.ts` |
| CSS per route | ≤ 30 KB gzipped | same |
| Fonts preloaded | 2 files, ≤ 110 KB total | network log |
| Art | ≤ 70 KB per plate at 1×; nothing above the fold over 120 KB | build script fails on overrun |
| Largest Contentful Paint | ≤ 2.5 s | Moto G Power profile, "Slow 4G", cold cache |
| Interaction to Next Paint | ≤ 200 ms | same |
| Cumulative Layout Shift | ≤ 0.05 | same |
| Repeat visit, offline | Shell and last data in ≤ 1 s | service worker cache |

**Rules**
- No new runtime dependency without a size note in the pull request.
- Images are lazy-loaded below the fold.
- Lists over 50 rows are windowed. Staff tables page at 50.

### G2. Offline and network matrix (every observer and citizen screen states its behaviour)

| Condition | What the user sees | What the system does |
|---|---|---|
| Offline on open | The app opens from the service-worker shell, with an ink "You're offline. Reports wait on this phone." banner | Reference data and art come from the cache |
| Offline while reporting | Nothing changes until Send, which reads "Save and send when online" | The draft saves on every change, and the report goes to the IndexedDB outbox with its idempotency key |
| Network returns | I-10 | The outbox drains in order with retries (1 s, 4 s, 15 s, then on every reconnect) |
| Lost response (sent, no answer) | "Checking if your report arrived…" for up to 10 s, then the receipt | It retries with the same idempotency key and gets the same receipt |
| Slow upload | Real progress per attachment. The report can be sent before the photos finish; they continue and the receipt says "Photos still sending" | Chunked, resumable upload (MED-01..05) |
| Session expired | A sheet asks for the PIN and keeps the work | Re-auth, then continue the same action |
| Code revoked | "This code was stopped by your coordinator." Reports on this phone are kept | Q3 rule: the next code on this phone may send them |
| Intake paused | Persistent banner; Send turns into "Save on this phone" | Nothing is lost |

### G3. Privacy and safety in the interface

- No personal data in URLs, page titles, toasts or notifications. Report references only.
- The PIN, codes and description fields have `autocomplete="off"` and `autocapitalize` as appropriate. The PIN field never shows its value by default.
- The screenshot-safe receipt image contains only the receipt code and time, never the place or the description.
- The "Remove this phone's data" action in Settings clears IndexedDB, caches and the session after a confirm sheet.
- Location: the app never calls the geolocation API. A test fails the build if `navigator.geolocation` appears in the bundle.
- No analytics or third-party scripts. Fonts and art are self-hosted.

### G4. Accessibility (WCAG 2.2 AA, plus our own rules)

- axe: 0 violations on every screen and state (Playwright + `@axe-core/playwright`).
- Manual TalkBack pass on the Redmi for the observer flow and the citizen flow, before freeze.
- Keyboard-only pass for the staff desk and the public site.
- 200 % text and 320-px width: no horizontal scroll, nothing cut off.
- Focus is visible and in a logical order. Each screen change moves focus to the new title (`h1` with `tabindex="-1"`).
- Every time limit can be extended, except the security ones (setup PIN expiry), which are explained.

### G5. Browsers and devices

| Tier | Devices | Must |
|---|---|---|
| 1 (test on real hardware) | Xiaomi Redmi (owner's), a 1 GB Android Go phone, a laptop with Chrome | Everything works, every frame meets the budgets |
| 2 (emulated in CI) | Chrome Android 360×800, Safari iOS 375×667 (iPhone SE), Firefox desktop, Edge desktop | Everything works |
| 3 (best effort) | Opera Mini extreme mode | The public pages and receipt check render as readable text |

### G6. Quality gates (the "definition of done" for each screen)

A screen is done only when all of these are true:

1. It matches its spec (Part F) and the foundations. The finish-gate reviewer has passed it.
2. Every state listed in its spec renders and has a screenshot: light and dark, at 390 px, plus 360 px and 200 % text for the default state, and 1280 px for public and staff screens.
3. The real-backend end-to-end spec for its flow passes, and so does the full suite.
4. axe reports 0 violations. Lint, type check and build pass. Bundle and contrast checks pass.
5. No missing message key in any of the five languages. The longest language fits.
6. Visual regression baselines are updated in `frontend/e2e/visual/` and reviewed.
7. The owner has approved the before/after/reference triptych.

---

## Part H · How it gets built

### H1. Order and method

- One screen at a time, in the order in Part F. Each screen is a branch `redesign/NN-name`, cut from the trunk `redesign/base`, which is itself cut from `origin/production-readiness`.
- **Phase 0** builds the foundations and every component in Part D before screen 1. After that, a screen may change a shared component only with a note, and every finished screen's screenshots are then re-checked.
- **Who:**
  - The design lead writes each screen's final notes and reviews.
  - One builder at a time implements, from this spec.
  - The UI Finish-Gate Reviewer checks each screen.
  - Kara reviews the final pull request into `production-readiness`. Nobody merges their own work.
- **Owner checkpoints:**
  - approval of Phase 0 (gallery screenshots);
  - each screen's triptych;
  - the Redmi check after screens 9, 18, 24, 31 and 37, and after the staff desk.

### H2. Calendar

| Date | Work |
|---|---|
| Wed 25 Nov | Phase 0 part 1: tokens, type, contrast/key/glyph/bundle checks, motion helper, Button, Field family, ChoiceTile, Stepper, ActionBar, AppBar |
| Thu 26 Nov | Phase 0 part 2: remaining components, gallery, visual baselines. Owner approves the gallery. Art masters requested from the owner. |
| Fri 27 Nov | Screens 1–6 (first run). One-page sprint plan due to the organisers. |
| Sat 28 Nov | Screens 7–10 (privacy, sign-in, PIN, home). Redmi check 1. Art masters in (otherwise the hand-built SVG fallback starts). |
| Sun 29 Nov | Screens 11–15 (category, danger, place, time, describe) |
| Mon 30 Nov | Screens 16–18 (evidence, check, receipt). Redmi check 2. |
| Tue 1 Dec | Screens 19–21 (my reports, report detail, messages) |
| Wed 2 Dec | Screens 22–24 (polling day, stage, result sheet). Redmi check 3. |
| Thu 3 Dec | Screens 25–28 (discussions, ask, settings, menu and outbox) |
| Fri 4 Dec | Screens 29–31 (citizen). Redmi check 4. |
| Sat 5 Dec | Screens 32–37 (public site) |
| Sun 6 Dec – Mon 7 Dec | Screens 38–49 (staff desk) |
| Tue 8 Dec | Screen 50 (system pages), legacy route removal, full visual re-run in five languages |
| Wed 9 Dec | Pull request `redesign/base` → `production-readiness`; Kara reviews; hosted on Azure if the login has arrived |
| Thu 10 Dec | Usability test with consenting users; fixes; demo video recording |
| Fri 11 Dec | **Feature freeze** |
| Sat 12 Dec | Demo video and submission documents updated with the new screens |
| Sun 13 Dec | **Submission** |

**Buffer:** the staff desk (screens 38–49) already works. If any day slips, it is cut to the four screens judges will see (sign-in, queue, case review, operations), and the rest keep today's design with the new tokens only.


---

## Change log

- **v1.1 (24 Nov 2026), after the finish-gate review of the prototype:**
  - One safety line wording ("We never use your phone's location.").
  - DayArc shows dots and the next stage only.
  - The danger, "how do you know" and time questions are required, never defaulted.
  - Staff suggestions need a second step to apply ("Use this", then Confirm, or "Choose another").
  - Public tables apply complementary suppression in both rows and columns, so a hidden count can never be found by subtraction.
- **v1.4 (25 Nov 2026), screen 10:** home reads checklist progress from the per-day checklist record already kept on the phone (`_lib/checklist.ts`), so decision D3 needs no backend change. The hero stays tappable when intake is paused (reports can still be written and wait on the phone); the paused banner explains. The bottom navigation is deferred to a later step so it lands on every observer screen at once; the top-bar menu stays until then.
- **v1.3 (25 Nov 2026), screen 2:** language keeps the existing one-tap advance (fastest for first-time users, and the end-to-end tests depend on it). The tap plays the sunlight sweep and check for 280 ms before moving on (instant under reduced motion); there is no separate Continue button. Rows show a short-code disc and the language's own name; no English sub-label, because the five names are already in their own scripts.
- **v1.2 (24 Nov 2026), Phase 0 review:** token names follow the code (B0); disabled buttons are dashed instead of 40 % opacity; the DayArc sun rides above the arc; looping animations pause while the page is hidden.
