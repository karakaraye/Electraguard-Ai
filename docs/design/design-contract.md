# ElectraGuard AI: design contract

**Status:** READY · 22 Nov 2026 · Owner of this document: product/design (Claude)
Every screen, component and API in the new front end follows this contract. If something here is wrong, change this document first, then the code.

Read with: [hackathon-plan.md](../hackathon-plan.md) (sections 2–8 define behaviour) and [api-contracts.md](api-contracts.md) (written alongside the screens).

---

## 1. What the interface must feel like

**A calm, official field instrument.** Like a well-made public-service form crossed with a reliable mobile banking app: quiet, certain, fast, readable in sunlight, impossible to misread. It must never look like a startup landing page or a generic dashboard template.

Three tests for every screen:
1. **Sunlight test:** readable at arm's length on a cheap phone in bright sun (contrast ≥ 7:1 for body text).
2. **Thumb test:** the next action is reachable with one thumb and is the most obvious thing on the screen.
3. **Honesty test:** the screen never claims something that has not happened (no "Sent" before the server confirms; no AI output shown as fact).

## 2. Non-negotiable rules

1. **Black and white. Colour only for status** (section 4.2). No brand colour washes, no gradients, no decorative colour.
2. **One task per screen** for observers and citizens. One primary button, pinned to the bottom and above the keyboard.
3. **Every step has a visible, labelled Back** that keeps all entered values.
4. **Front end and back end match.** Every screen state maps to an API response or a local queue state in `api-contracts.md`. No screen shows data the API does not provide; no API field is unused without a reason.
5. **Every visible string comes from the message files** (`frontend/messages/{en,pcm,ha,yo,ig}.json`). No hard-coded copy in components.
6. **No fake data in the app.** Empty states are designed and honest ("No reports yet").
7. **AI output is always marked** ("Suggested", with Accept / Correct), never presented as a decision.
8. **No location precision below ward on any shared or public surface. No GPS anywhere.**
9. **Accessible by construction:** WCAG 2.2 AA minimum, AAA contrast for body text, 48 px targets, visible focus, TalkBack-tested labels, works at 200% text, respects reduced motion.
10. **Light for 2G:** observer first load ≤ 300 KB compressed (JS + CSS + fonts), no runtime UI library, no icon font, no web-font flash (system fallback until Noto Sans loads, subset per script).
11. **No AI-tool attribution** in code, comments, commit messages or file names.

## 3. Information architecture and routes

The existing `/workspace/*` screens keep working until each new screen replaces them and passes the tests. New routes use Next.js route groups so each audience has its own shell.

| Audience | Route group | Paths |
|---|---|---|
| Public | `app/(public)` | `/` (home: what this is, report, check status, results) · `/status` · `/results` · `/ask` · `/guide/[slug]` · `/privacy` |
| Citizen | `app/(public)/r` | `/r/new/...` (report steps) · `/r/receipt/[code]` |
| Observer | `app/(observer)/o` | `/o/start` (language, notice, sign-in) · `/o` (home) · `/o/new/[step]` · `/o/checklist/[stage]` · `/o/reports` · `/o/reports/[ref]` · `/o/messages` · `/o/discussions` · `/o/discussions/[id]` · `/o/ask` · `/o/settings` |
| Staff | `app/(staff)/s` | `/s/sign-in` · `/s/queue` · `/s/cases/[ref]` · `/s/assign` · `/s/ops` (operations room) · `/s/rumours` · `/s/publish` · `/s/discussions` (moderator) · `/s/admin/codes` · `/s/admin/staff` · `/s/admin/settings` · `/s/security` |
| SMS/USSD simulator | `app/(public)/phone` | `/phone` (an on-screen basic phone used for USSD/SMS) |

Shared code: `frontend/ui/` (design system), `frontend/lib/` (API client, offline queue, i18n), `frontend/messages/` (strings).

## 4. Visual system

### 4.1 Type

- **Family:** Noto Sans (variable, weights 400/600/700), self-hosted, subset Latin + Latin Extended (covers ẹ ọ ṣ ị ụ ṅ ɓ ɗ ƙ and tone marks). Fallback: `system-ui, "Segoe UI", Roboto, sans-serif`. Tabular figures for references, codes, times and counts (`font-variant-numeric: tabular-nums`).
- **Scale (rem, root 16 px; observer base is larger):**

| Token | Size / line height | Use |
|---|---|---|
| `--t-display` | 2.25 / 1.1, 700 | Receipt code, big numbers |
| `--t-title` | 1.625 / 1.2, 700 | Screen question ("What happened?") |
| `--t-heading` | 1.25 / 1.3, 600 | Section headings |
| `--t-body-lg` | 1.125 / 1.5, 400 | Observer and citizen body (default there) |
| `--t-body` | 1 / 1.5, 400 | Staff body |
| `--t-small` | 0.875 / 1.4, 400 | Meta, timestamps (never below 14 px) |
| `--t-label` | 0.875 / 1.2, 600, letter-spacing .02em | Field labels, badges |

- Screen questions are phrased as questions in plain words. Reading age 9–11.

### 4.2 Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ink` | #0B0B0C | #F4F4F2 | Text, primary button fill, icons |
| `--ink-2` | #3A3A3D | #C9C9C6 | Secondary text (≥ 7:1 on paper) |
| `--ink-3` | #5F5F63 | #9D9D99 | Meta only (≥ 4.5:1) |
| `--paper` | #FFFFFF | #111112 | Surfaces |
| `--paper-2` | #F4F4F2 | #1B1B1D | Page background, input fill |
| `--rule` | #D8D8D4 | #34343A | Hairlines, borders |
| `--focus` | #0B0B0C 3 px outline + 2 px #FFFFFF offset | inverted | Focus ring |
| `--rule-control` | #707075 | #8C8C92 | Input and control borders (≥ 3:1, WCAG 1.4.11); `--rule` stays for hairlines |

Status colours have a background and a dark value each; the values in `frontend/ui/tokens.css` are the reference. Staff buttons are 44 px visible with a 48 px tap area. Pictograms use a 2 px stroke on their 40 px grid. Font subsets must include U+1EA0–1EF9 (ẹ ọ ị ụ) and the combining tone marks U+0300–0303, U+0323. The root layout must not add its own header or `<main>` for the new route groups: the shells provide the landmarks.

Status colours (the only colours) always come with a text label and an icon shape, never colour alone:

| Status | Token | Light | Shape |
|---|---|---|---|
| Received / Confirmed / Saved | `--ok` | #0F6B3A | filled circle with tick |
| Question for you / Needs attention | `--attn` | #8A5A00 (text) on #FFF4D6 | diamond |
| On this phone / Waiting / Pending | `--wait` | #4A4A4F on #EDEDEA | hollow circle |
| Danger / Urgent / Failed | `--danger` | #A3141C | triangle |
| In review / Info | `--info` | #1F4E8C | half-filled circle |

Dark mode: supported for staff surfaces (long sessions), automatic by `prefers-color-scheme`, with a manual toggle. Observer screens default to light (sunlight) with dark available.

### 4.3 Space, shape, elevation

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 64. Side gutter 16 px on phones, 24 px tablet.
- Radius: 10 px for controls and cards, 999 px only for status badges. No mixed radii.
- Borders over shadows. One shadow token for sheets/dialogs only.
- Max text measure 34 rem for reading screens.

### 4.4 Icons

- One custom line set, 24 px grid, 1.75 px stroke, square caps, drawn as inline SVG React components in `frontend/ui/icons/`. No icon fonts, no emoji in UI.
- Category pictograms (incident tiles) are larger (40 px), same stroke family, and must be recognisable without the label for low-literacy users: materials box, broken device, queue of people, raised fist/threat, wheelchair/steps, speech bubble with question mark, phone with warning, hand passing money (inducement), thumbs up (good practice), question mark (not sure).

### 4.5 Motion

- Purposeful only: sheet rise (200 ms, ease-out), step slide (180 ms), receipt confirmation (tick draws in 320 ms once, triggered only by the server response), progress bars tied to real upload bytes.
- No looping animation, no skeleton shimmer on 2G (use static placeholders), no parallax.
- `prefers-reduced-motion: reduce` makes all transitions instant.
- CSS transitions and the Web Animations API only; no animation library on observer routes.

## 5. Components (frontend/ui)

Each component has: props table, all states (default, hover, focus, active, disabled, loading, error), RTL-safe layout, test id, and an accessibility note.

| Component | Notes |
|---|---|
| `AppShell` (observer/citizen) | Top bar: Back (labelled) · screen title · menu. Network bar under it when offline. Bottom action area pinned above keyboard (`env(safe-area-inset-bottom)`, `visualViewport` aware). |
| `StaffShell` | Left navigation on ≥ 1024 px, bottom tabs on phone; queue + detail split on ≥ 900 px. |
| `Button` | primary (ink fill), secondary (ink outline), quiet (text), danger. Min height 52 px observer / 44 px staff. Loading state keeps width. |
| `ChoiceTile` | Pictogram + label, single-select grid (2 columns on phone), selected state = ink border 2 px + tick, not colour. |
| `YesNo` | Two large buttons, keyboard and screen-reader as a radio group. |
| `Field`, `TextArea`, `Select`, `SearchSelect` | Label above, hint below label, error below field with icon, character count for text. |
| `PollingUnitPicker` | Search by code or drill State → LGA → Ward → Unit from the cached list; "I don't know the unit" → ward only. |
| `WhenPicker` | Segmented: Just now / Earlier today / Another day → native time/date inputs; WAT label; future times blocked. |
| `DictationButton` | Uses the Web Speech API where available; otherwise explains keyboard voice typing. Shows Listening + large Stop. |
| `MediaCapture` | Take photo / Record video (60 s) / Record voice (2 min) / Choose file. Preview, retake, remove, blur toggle, size + estimated upload time. |
| `UploadItem` | Per-attachment status: Waiting for network · Uploading n% · Saved · Try again; resumable. |
| `StatusBadge` | Status token + shape + label (section 4.2). |
| `ReceiptCard` | Receipt code in display size with copy and save-as-image; received time; what happens next. |
| `ReportRow` | For lists: category pictogram, place, time, status badge. |
| `Sheet` | Bottom sheet on phone, dialog on desktop; Close button always visible; focus trapped and returned. |
| `Banner` | Offline, intake paused, question waiting. Never auto-dismissed for critical states. |
| `EmptyState` | Plain sentence + one action. No illustrations of people inside the component (the screen's `BackgroundArt` is the only figurative art). |
| `BackgroundArt` | The polling-day illustration: morning at a polling unit outside a school, a queue under the canopy (an elderly man with cap and stick, a woman in gele and wrapper, a mother with a baby on her back and her son, a wheelchair user, a woman in hijab, young people), an observer with lanyard and phone, people walking in from the road, neem and palm trees, a low sun. Original hand-built SVG (source `docs/design/art/v2/polling-day.mjs`), filled tonal greys with one muted warm sand tone for the sunlight (the only non-status colour in the product, and it never appears in UI). No party colours, flag, logos, symbols or text; faces are plain shapes. The public hero and scenes (Blender renders, `docs/design/art/blender/`) may show the transparent ballot box, card reader and ink pot, because they are what every Nigerian polling unit looks like and carry no party or INEC mark (owner-approved, 26 Nov 2026); the background art behind observer screens stays without them. Separate light and dark files (`/art/polling-day-{light,dark}.svg`, about 12 KB gzip each; dark is drawn as first light, not inverted); only the current theme's file loads. Props: `variant` `"hero" \| "soft"` (default soft), `clear` `"actions" \| "none"` (soft only). **hero** (O-01, O-02, O-03 choose): a full-width band under the top bar, 184–248 px on phones (scene drawn 25% larger than cover so the people read clearly), up to 340 px on desktop; the screen content sits below it on plain paper, so text never overlaps the art and keeps its normal ink-on-paper contrast. **soft** (O-04 empty, O-12 receipt): the same scene fixed to the bottom of the viewport at 17% strength, faded toward the top. **Contrast rule:** measured on the rendered page, over the darkest (light) or lightest (dark) pixel of the soft art, `--ink-2` keeps at least 7:1 and `--ink-3` at least 4.5:1; any change to the art or its strength must be re-measured. Never on form steps with inputs (O-05 to O-11, sign-in fields, set PIN). Hidden from assistive technology; removed under `prefers-reduced-data`, print, forced colours and screens under 520 px tall; one 700 ms fade-in, none under reduced motion. Dev preview: `/dev/art`. |
| `Stepper` | "Step 3 of 7" text + thin progress rule (not dots). |
| `SuggestionCard` (staff) | "Suggested" label, value, reasons, confidence word (High/Medium/Low), Accept / Correct. |
| `Timeline` (staff) | Audit events with actor, time, change, hash-chain status. |
| `DataTable` (staff) | Sortable, keyboard navigable, sticky header, tabular numbers. |
| `MetricTile` (staff/public) | Big number + label + period; "fewer than 5" state. |
| `MapLGA` (staff) | Simple choropleth by LGA from aggregated counts; no unit pins; table alternative. |
| `LanguageSwitcher` | Each language shown in its own name. |

## 6. Screen inventory (build order)

Each screen spec in `docs/design/screens/<id>.md` lists: purpose, entry points, layout (phone and tablet), every state (empty, loading, offline, error, success), strings (message keys), API calls (contract ids), and analytics-free acceptance checks.

**Phase D1, observer and citizen (gate: the owner approves on the Redmi):**
O-01 Language · O-02 What this app keeps · O-03 Sign in (code + PIN, first-time PIN set) / Report as citizen · O-04 Home · O-05..O-12 Incident steps (category, danger, where, when, describe, evidence, check, receipt) · O-13 My reports · O-14 Report detail (status, conversation, formal question reply, withdraw, attachments) · O-15 Checklist stage · O-16 Result-sheet entry (photo + confirm numbers) · O-17 Messages · O-18 Discussions list / thread · O-19 Ask · O-20 Settings (language, clear phone, sign out) · C-01 Citizen receipt · P-01 Status lookup.

**Phase D2, staff:** S-01 Sign in + 2FA · S-02 Queue · S-03 Case · S-04 Assign · S-05 Operations room · S-06 Rumour desk · S-07 Publish · S-08 Moderator · S-09 Admin codes (batch create + print cards) · S-10 Admin staff · S-11 Admin settings · S-12 Security monitor.

**Phase D3, public:** P-02 Home · P-03 Results (transparency) · P-04 Ask · P-05 Guide pages · P-06 Privacy · P-07 Phone simulator (USSD/SMS).

## 7. Front-end architecture (so logic can follow cleanly)

- **Next.js App Router, React Server Components for staff and public reads; client components for observer flows** (they must work offline).
- **API client** `frontend/lib/api/`: typed functions per contract id; one error type `{code, message, fieldErrors?}`; CSRF handled centrally; no fetch calls inside components.
- **Offline:** a service worker (`frontend/public/sw.js`, hand-written, no framework) caches the app shell, message files, the polling-unit list and guide documents. An **outbox** in IndexedDB (`frontend/lib/outbox/`) holds queued reports, messages and media chunks with their idempotency keys. One sync loop sends in order: report → its media → messages. Screens read the outbox state and server state through one hook (`useReportState(ref)`), so "On this phone / Received / ..." always comes from one source.
- **i18n:** a small in-house `t(key, vars)` with ICU-style plurals for the five locales; the locale is stored on the device; `<html lang>` set per locale; a missing key shows English and logs in development only.
- **Forms:** step state lives in a draft object in IndexedDB keyed by draft id, so Back, reloads and app kills never lose input.
- **Testing hooks:** every interactive element has a stable `data-testid`; Playwright suites per screen at 320, 360, 768 and 1280 px, 200% text, and the offline profile.

## 8. Anti-patterns (reject in review)

Generic hero sections; stock illustrations of people; gradient buttons; glassmorphism; neon; more than one primary button; colour-only status; placeholder text as labels; toasts for important outcomes; spinners without text; "Sent!" before confirmation; dark patterns around withdraw or consent; icons without labels for observers; truncated user content without a way to see it all; English-only error messages.

## 9. Quality gate before any screen is shown to the owner

1. Built from these tokens and components only.
2. All states designed and reachable.
3. All five languages present (drafts marked for owner review).
4. axe: zero serious/critical issues. Keyboard and screen reader pass.
5. 320 px, 360 px, 768 px, 1280 px screenshots, light and dark, 200% text.
6. API contract ids referenced and matching `api-contracts.md`.
7. Finish-gate review passed (UI Finish-Gate Reviewer).
