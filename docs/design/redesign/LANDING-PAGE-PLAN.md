# ElectraGuard landing page: redesign and motion plan

Status: BUILT (steps 0–8 done; hero approved 25 November 2026)
Page: the public home at `/` (`frontend/app/(public)/page.tsx`, view `_views/HomeView.tsx`, screen 32)
Date: 25 November 2026

---

## 1. What is wrong with the page today

Measured from screenshots at 1440 px and 412 px wide, light and dark.

1. **The people are faint.** The polling-day scene is the best thing we own, but it sits at about 30 % strength under the hero text. On a phone it shrinks to a grey strip 120 px tall, and you cannot see a single face.
2. **Nothing moves.** The page is a document. Nothing shows that ElectraGuard is a live service on election day.
3. **The hero is split in two.** "Check a report" sits beside the headline on desktop and leaves a large empty area under it. On a phone it pushes the scene below the fold.
4. **"How it works" is four small icons.** It is the most important idea on the page (you report, a person checks it, totals are published), and it reads like a footnote.
5. **The lower half is a plain list of links.** Results, Questions and the footer have no shape and no image.
6. **The new rumour check (`/check`) is only a text link** among four others.
7. **Phone users come second.** Most of our visitors will be on low-cost Android phones on 3G or 4G, yet the phone layout is a squeezed desktop layout.

What works and stays: the headline, the black "Report what you saw" button, the plain black-and-white style with the sun colour used sparingly, the Noto Sans fonts (chosen because they cover every Hausa, Yoruba and Igbo character), the five languages, and the honest copy.

## 2. Who it is for, the one job, the tone

Decided from the brief and the product (no need to ask):

- **Who:** Nigerian voters on election day, mostly on phones, many on weak networks; also observers, journalists and the hackathon judges.
- **The one job:** get someone who saw a problem to press "Report what you saw". The second job is to make them trust it: a person checks every report, and nothing identifying is published.
- **Tone:** warm and civic, like a well-made public notice: plain words, a confident illustration, calm movement. No hype, no tech look, no gradients, no badges.

## 3. The big idea: one polling day, told as you scroll

The page tells the story of one polling day, from morning to the posting of results.

- **At the top it is morning.** The scene is alive: people walk in from the road, the queue moves forward, voters are accredited, ink their thumb, cast a ballot and walk home. An accredited observer stands at the edge with a phone.
- **As you scroll, the day moves on.** The sun travels across a thin sky band that follows the page, from morning (top) through midday (the story section) to evening (the footer).
- **The footer is evening.** The result sheet is pinned on the wall of the polling unit, a small crowd reads it, and lamps come on. The day closes, and the page ends on "Reviewed totals are published here".

The story runs on its own without any clicks (the hero loops calmly), and scrolling moves it forward. Every movement explains something real about the service.

Dark mode is not an inverted copy: it is the same day at night-time colours, with warm lamp light instead of sun.

## 4. The page, section by section

Final order, top to bottom. Every section works without JavaScript and without motion; motion is added on top.

### 4.1 Header (unchanged structure)
Wordmark, Home · Results · Ask · Guides · Check a rumour · Try SMS and USSD, and the language menu. "Check a rumour" joins the menu. On phone: the existing Menu sheet.

### 4.2 Hero: "The polling unit" (full-bleed, living scene)
- **Layout:** the headline, the one line under it, the "Report what you saw" button and the no-account hint sit in the sky area at the top left. The scene fills the full width below at **full strength** (no fade except at the very top edge). Desktop height is about 88 % of the screen; on phones the scene is cropped to the queue and the table, so people are large enough to read (at least 70 px tall on a 360 px screen).
- **"Check a report" moves out of the hero** into its own section (4.4). This removes the empty area and gives the scene the room it needs.
- **The "No smartphone?" line** stays under the button, as now.

**What moves in the hero (the "living scene"):**

| Who or what | Movement | Why it is there |
|---|---|---|
| 3 walkers on the road | Walk in from the left with a real stride (legs and arms swing in opposite phase), slight up-down bounce, join the back of the queue | People are coming to vote |
| The queue (8 people) | Every 6 s the whole queue shuffles one step forward, one after another (a ripple, 80 ms apart). Idle people shift their weight and breathe | It is a real, orderly queue |
| Voter at the table | Steps up, holds out a hand to the card reader (a small light blinks green), dips a thumb in ink, takes the ballot, walks to the box, drops it in (the paper slides and disappears), walks off to the right | Shows the day itself, without words |
| Mother with a baby | The baby's head turns and looks around; her son holds her hand and swings it | Warmth, families vote |
| Child | Waves at the viewer once every loop | A human, slightly playful moment |
| Man in a wheelchair | Rolls up the ramp: wheel spokes turn, his hand pushes the rim; the queue makes room | Access for everyone |
| Elder with a walking stick | Slow walk; the stick taps the ground in time with his steps | Older voters, a different pace |
| The observer | Looks up, types on the phone; a small paper card floats up from the phone along a dotted line and turns into a check mark in the sky | This is ElectraGuard: an observer sends a report |
| Palm and neem trees | Leaves sway gently, each tree out of step with the others | The scene breathes |
| Birds | Two birds cross the sky every 20 s or so | Life, depth |
| Sun | A slow glow, and its position follows the time of day (see §3) | Time passing |
| Canopy cloth | A light flutter along its edge | Wind, texture |

Timing: a 36-second hero loop, staggered so no two things start together and it never looks mechanical. Each walker has a slightly different speed (±8 %) so the crowd never marches in step.

### 4.3 "How a report travels" (scroll story: replaces "How it works")
The heart of the page. On desktop the section is **pinned** for about 2.5 screens of scrolling; a single drawn line (the "report path") runs across it, and four scenes play in turn as the line reaches them. On phones nothing is pinned: the four scenes stack, and each plays once when it comes into view.

1. **You report, in your language, even with weak signal.** A phone shows the report form in Hausa, then Yoruba, then Pidgin (the words change). The signal bars drop to zero, the report waits in "Outbox" with a small clock, the bars come back, and it sends.
2. **You get a receipt code.** A paper receipt prints out of the phone like a ticket, with the code shape `EG-····-····` (no real code).
3. **A trained person checks it.** A reviewer at a desk. The computer sorts reports into piles (urgent first), labelled "Suggested by AI"; the person reads, then stamps "Reviewed". The words under it: "AI helps sort reports. A person decides."
4. **Reviewed totals are published, never names.** The reviewed reports turn into bars by state; a face, a name and a photo appear for a moment and are wiped out by a privacy band before anything is published.

Each step keeps its plain-text sentence from today (`p02.how.1` to `p02.how.4`, lightly rewritten), so the section reads in full with motion off.

### 4.4 "Already reported? Check your report"
The receipt check, as its own section, shaped like a paper receipt with a torn top edge. Behaviour is unchanged (same `ReceiptCheck` component and states). When a code is checked, the result appears with a short slide-up (200 ms) instead of a jump.

### 4.5 Reviewed results
- **When results exist:** the total counts up from zero once when it scrolls into view (800 ms), and the category bars grow from left to right one after another (60 ms apart). The numbers are the real published numbers only; we never animate made-up figures.
- **When nothing is published yet:** an illustrated empty state (the ballot box on its table with a closed padlock and a small clock), with today's text: "Nothing has been published yet. Totals appear here after reviewers finish reports, at least 60 minutes later."

### 4.6 "Three ways to report"
Three columns (one column on phones), each with a small live drawing:
- **The app:** the phone with the "Report something" card.
- **SMS to 20384:** a basic phone; a short message is typed letter by letter, then a "sent" tick.
- **USSD \*347\*88#:** the same basic phone; the code is dialled key by key, and a menu appears ("1 Report a problem, 2 Check a report").
Each links to the real place: the citizen report, `/phone` (the on-screen phone) and `/phone` with USSD selected. The short code and USSD code come from the single config values already in `lib/config.ts` and `_lib/public.ts`.

### 4.7 "Heard a rumour? Check it" (new feature card)
A wide card for the public rumour check (`/check`): a speech bubble with a forwarded-message look; on hover or in view, a stamp lands on it: "Checked by reviewers" (on hover only for mouse users; on phones it plays once in view). Fixed line under it: "Checked by ElectraGuard reviewers. Not an INEC statement."

### 4.8 Questions and guides
Ask ElectraGuard, the guides (up to five, from the real guide list) and the privacy notice, as today, in a two-column list on desktop with a small arrow that slides 4 px on hover (mouse only).

### 4.9 Footer: "Evening at the polling unit"
A short evening scene (about 220 px tall on desktop, 140 px on phones): the result sheet on the wall, four people reading it, lamps that fade on one by one, a bat or two crossing the dusk sky (in dark mode, stars). Under it, today's footer text and links (nonpartisan line, 112 safety line, Privacy, Guides, Try SMS and USSD, Observer app, Staff sign in).

## 5. How the moving people are built

- **The drawings already exist.** The scene is generated by `docs/design/art/v2/polling-day.mjs`; each of its 18 people is already a separate group made from simple parts (head, torso, arms, legs).
- **Change to the generator:** it will output each person with named, separately movable parts (`head`, `torso`, `arm-near`, `arm-far`, `leg-near`, `leg-far`, plus props such as the ballot, the stick and the wheel), each with its pivot point set at the shoulder, hip or wheel hub. It will also draw the new pieces: the card reader and ink pot, the ballot box slot, the result sheet on the wall, lamps, the basic phone and the receipt.
- **One SVG for both themes.** Colours become CSS variables, so light and dark use the same file (half the download of today's two files).
- **The hero scene is inlined in the page** (so it shows on the first paint with no extra request), about 55 KB before compression and 14 KB compressed, under budget.
- **No Lottie, no video, no images of people.** Everything is drawn vector art in our own style.

## 6. Motion technology and rules

- **Ambient movement (walking, breathing, swaying, birds): CSS keyframes** on `transform` and `opacity` only. These run off the main thread and stay smooth even on a busy phone.
- **Choreography and scroll (the queue moving, the voter's journey, the pinned story, the day passing): GSAP 3 with ScrollTrigger**, which is now free for all uses. It is loaded only on the home page, only after the page has finished loading and the browser is idle (about 45 KB compressed). If it fails to load, the page is complete without it.
- **Easing:** our three named curves (`--ease-out: cubic-bezier(0.23,1,0.32,1)`, `--ease-in-out: cubic-bezier(0.77,0,0.175,1)`, linear for constant walking). No bounce on interface elements; a small natural bounce only on the people's steps.
- **Interface motion stays fast:** buttons press to 97 % in 120 ms; results and cards appear within 200–300 ms. Only the illustrations are slow.

### Respecting people and phones
There is **no pause button or any other control on the scene**. The animation is part of the picture, not a widget. Instead the page follows the settings people already have on their phone or computer:

1. **Calm by design.** Movement is slow and small, nothing flashes, and nothing moves near the text or the buttons. The text and the "Report what you saw" button sit on still sky.
2. **Reduced motion.** When the phone asks for reduced motion, every scene shows a still, well-composed frame (the voter at the ballot box), with no movement and no pinning; text appears with a plain fade only.
3. **Save Data or reduced data.** No GSAP download, still scenes only.
4. **Low-power phones** (2 GB of memory or less, or four processor cores or fewer): only the ambient movement runs (breathing, trees, birds); the walkers and the queue stay still.
5. **Off-screen and hidden tabs:** every animation pauses when it is off-screen or the tab is hidden, so it never drains a battery.
6. **Nothing important lives only in motion.** Every step of the story is also written in plain text, in order, for screen readers and for anyone with motion off. The drawings are hidden from screen readers.

## 7. Performance budget (tested before it ships)

| Measure | Target |
|---|---|
| Largest paint on a mid-range Android, 4G | under 2.5 s |
| Extra JavaScript on the home page | 50 KB compressed or less, loaded after the page |
| Inline hero SVG | 16 KB compressed or less |
| Frame rate | 60 fps on a laptop; at least 30 fps on a phone with the CPU slowed 4× |
| Layout shift | 0.05 or less |
| Work blocking the page | no task longer than 50 ms caused by the animation |

## 8. Words and languages

- Every new line of copy goes into all five message files (English, Nigerian Pidgin, Hausa, Yoruba, Igbo), written plainly. The drawings contain no words, so they need no translation.
- No made-up numbers, codes or quotes anywhere. Receipt codes in drawings are shown as a shape (`EG-····-····`), never as a fake code.
- New and changed lines (English first draft):
  - Hero (unchanged): "Saw a problem at a polling unit? Report it."
  - Story heading: "How a report travels"
  - Story steps: "You report what you saw, in your language. It still sends when the network comes back." · "You get a receipt code. Keep it to check your report." · "A trained person checks every report. AI helps sort them; a person decides." · "Reviewed totals by state are published here. Never names, words or photos."
  - Check section heading: "Already reported? Check your report"
  - Ways heading: "Three ways to report" with "On this website", "By SMS to 20384", "By USSD on any phone: \*347\*88#"
  - Rumour card: "Heard a rumour? Check it against answers our reviewers approved."

## 9. Who builds what, and in what order

Following the standing rule: show the most important part first, then build the rest around it.

| Step | Work | Who (model) | Ready when |
|---|---|---|---|
| 0 | **Design in Figma first.** One Figma file, "ElectraGuard landing page": the whole page at desktop (1440 px) and phone (390 px), light and dark; a storyboard of the hero animation (key moments of the 36-second loop, frame by frame); the four scenes of "How a report travels"; the evening footer; the character sheet showing each person's movable parts and pivots; the colours and type used. No code is written until you approve the Figma design | Opus | You approve the Figma file |
| 1 | Character rig: update the art generator to output movable parts and pivots; draw the new props | Opus (art direction) | All 18 people and new props render; a still frame matches today's art |
| 2 | **Hero prototype**: the living scene with walkers, queue, voter journey, observer report, trees, birds, sun; reduced motion | Opus builds, Sonnet helps with CSS | **Shown to you as a short screen recording and a live link before anything else is built** |
| 3 | Layout of the new page (all sections, no motion yet), five languages | Sonnet | Page complete and correct with motion off, at 320 to 1440 px |
| 4 | "How a report travels" scroll story | Sonnet, reviewed by Opus | Pinned on desktop, stacked on phone, smooth |
| 5 | Results count-up, three ways to report, rumour card, evening footer, day-passing sky | Sonnet | All play once and respect the motion settings |
| 6 | Finish the public rumour check page `/check` (a helper built most of it before the last session ended; the work is uncommitted in the folder) and link it from the new card | Sonnet | `tsc`, `eslint` and the message-key check pass |
| 7 | Checks: screenshots at 320, 375, 414, 768, 1280 and 1440 px in light and dark; axe accessibility; reduced motion; Save Data; slowed-CPU frame rate; Lighthouse; the contrast, glyph, key and privacy scripts | Haiku runs, I review | Every target in §7 is met |
| 8 | Finish-gate review (UI Finish-Gate Reviewer) and fixes | Opus | No blocking findings |
| 9 | Commit on `redesign/base`, update the screenshots in `docs/design/redesign/screens/32-*` | Me | Ready to push with the rest of the redesign |

Rough time: step 1 half a day, step 2 one day, steps 3–6 one and a half days, steps 7–9 half a day. About three and a half working days, well before the 13 December deadline.

## 10. What we will not do

- No moving gradients, glows, glass, particles or "AI" visuals.
- No cursor-following tricks, parallax on every element, or hover effects that hide information.
- No scroll-jacking on phones, and no pinning longer than 2.5 screens on desktop.
- No sound.
- No animation on things people use many times (menus, language switch, form fields): those stay instant.
- No change to what the page promises: no account, no names published, a person checks every report.

## 11. Still open from earlier work (not part of this page)

- The redesign branch still has to be pushed and its pull request opened.
- The screenshot recapture for screens 46, 47 and the observer and public screens stopped when the last session ended and needs to run again.
- These will be finished alongside this work; neither blocks the landing page.

## 12. Figma design (step 0)

File: https://www.figma.com/design/75B6ZMLsf8D6ssMCgLsc7w (ElectraGuard landing page)

- **01 Landing page:** desktop 1440 px and phone 390 px, light and dark (colours are Figma variables with Light and Dark modes taken from `frontend/ui/tokens.css`), plus the header that appears after the hero scrolls away and the shared components.
- **02 Hero animation storyboard:** the 36-second loop as a timeline and six posed key moments; 18 s is the still frame for reduced motion.
- **03 How a report travels:** what each scene plays at each point of the scroll.
- **04 Characters and movement:** all 18 people with their pivots and movement notes.
- **05 Colours, type and motion rules:** both themes.

Changes made after the finish-gate review:
- On phones, the hero crop runs from the back of the queue to the observer.
- "Report what you saw" now appears in the hero, after "How a report travels", in the footer, and as a compact header button once the hero has scrolled away. It is the only solid black button on the page.
- The rumour card is an outlined block with an outlined button.
- The sun moved to the sky above the school, keeping its single ring; the birds were moved away from the text.
- The 112 line sits under the hero action.
- The step 1 chips show all five languages, the barcode is gone from the receipt, and the totals drawing uses state stubs and a privacy band.
- The ballot box is drawn clear, and the observer's report leaves the phone.
- On phones, "Three ways to report" became compact rows, and the footer links are stacked with 44 px tap targets.
