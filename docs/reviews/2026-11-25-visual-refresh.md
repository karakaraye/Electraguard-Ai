# Visual Refresh Review: Screen Designs Implementation

**Date:** 2026-11-25  
**Branch:** `design/visual-refresh`  
**Base:** `production-readiness`  
**Worktree:** `C:\Users\Windows\Desktop\CAIRN\.worktrees\EG-visual`

---

## 1. Executive Summary

This review documents the front-end visual restyling of ElectraGuard AI to match the 11 target designs in `docs/design/visual-refresh-screens/`. The restyling updates the presentation layer—custom properties, CSS modules, view components, self-hosted typography, and inline SVG illustrations—while strictly preserving all application logic, API calls, the offline outbox, drafts, service worker, form validation, permissions, and automated tests.

All 14 real-server end-to-end tests (`e2e/observer-real/`) pass cleanly against live PostgreSQL and Django servers. Screenshots of all 11 target screens at 390x844 in both light and dark modes have been captured into `docs/design/visual-refresh-shots/`.

---

## 2. Design System Implementation

The tokens in `frontend/ui/tokens.css` and `docs/design/design-contract.md` have been updated to codify the new design system:

### 2.1 Palette
- **Warm Paper White (`#FAF7F0`):** Replaces stark neutral whites with a natural warm paper surface ground (`--paper: #faf7f0`, card surfaces `--paper-card: #ffffff`, tinted tiers `--paper-2: #f3efe6`, `--paper-3: #eae4d7`).
- **Deep Ink (`#16130F`):** Replaces pure digital black with warm carbon ink for primary typography and high-emphasis controls (`--ink: #16130f`, secondary text `--ink-2: #4a453e`, muted text `--ink-3: #756f66`).
- **Sunlight Ochre (`#E3B060`):** Single warm sunlight accent for the rising sun motif, active disc fills, checklist highlights, and concentric halos (`--sun: #e3b060`, hover `--sun-hover: #d59f4a`, rings `--sun-ring-1` through `--sun-ring-4`).
- **Dawn Dark Mode (`#181512`):** Rather than an inverted stark grey, dark mode is styled as early Nigerian dawn: warm charcoal ground (`--paper: #181512`, `--paper-card: #221e19`), warm off-white ink (`--ink: #faf7f0`), and golden amber sunlight accents.
- **Strict Status Semantics:** Status colors remain reserved exclusively for status indication, always paired with a shape and descriptive text:
  - Green tick (`#2E7D32`): Received, Closed, Success
  - Blue half circle / clock (`#1976D2`): In review
  - Amber diamond (`#E65100` / `#FFA726`): Question for you / Attention
  - Hollow grey circle (`#757575`): On this phone / Pending
  - Red triangle (`#C62828`): Danger

### 2.2 Typography
- **Display:** Self-hosted **Bricolage Grotesque** variable font (`woff2` latin and latin-ext under `frontend/public/fonts/` with its OFL license), loaded via Next.js `link rel="preload"` for zero flash of unstyled text.
- **Body:** **Noto Sans** body font with full character support for Nigerian languages (Hausa hook letters ɓ, ɗ, ƙ; Yoruba tone marks ẹ́, ọ̀; Igbo sub-dots ị, ụ, ṅ).
- Fluid type scale: `--t-display` (2.5rem), `--t-title` (1.875rem), `--t-heading` (1.25rem), `--t-body-lg` (1.125rem).

### 2.3 Motifs and Spot Illustrations
- **Concentric Sun Rings:** Implemented as lightweight vector SVG elements on the splash screen, on the "Report something" card, behind category icons, and on the receipt ticket.
- **Spot Illustrations:** Created in `frontend/ui/Illustrations/`:
  - `SafeIllustration.tsx`: Phone with blurred faces demonstrating anonymity and protection.
  - `OfflineIllustration.tsx`: Phone-to-sun animated vector showing offline local queuing and solar-synced upload.
  - `PollingDayIllustration.tsx`: Polling station scene with an arching sun journey showing election day progress from 07:30 to 16:00.

---

## 3. Screen-by-Screen Review and Screenshot Pairs

All screenshot captures were taken at mobile resolution (390x844 viewport, 2x DPR) and saved in `docs/design/visual-refresh-shots/`.

| Screen Name | Reference Target | Light Capture | Dark Capture |
|---|---|---|---|
| **01-splash** | `01-splash-target.png` | `01-splash-light.png` | `01-splash-dark.png` |
| **02-onboarding-report** | `02-onboarding-report-target.png` | `02-onboarding-report-light.png` | `02-onboarding-report-dark.png` |
| **03-onboarding-safe** | `03-onboarding-safe-target.png` | `03-onboarding-safe-light.png` | `03-onboarding-safe-dark.png` |
| **04-onboarding-offline** | `04-onboarding-offline-target.png` | `04-onboarding-offline-light.png` | `04-onboarding-offline-dark.png` |
| **05a-choose-role** | `05a-choose-role-target.png` | `05a-choose-role-light.png` | `05a-choose-role-dark.png` |
| **05-home** | `05-home-target.png` | `05-home-light.png` | `05-home-dark.png` |
| **06-what-happened** | `06-what-happened-target.png` | `06-what-happened-light.png` | `06-what-happened-dark.png` |
| **07-receipt** | `07-receipt-target.png` | `07-receipt-light.png` | `07-receipt-dark.png` |
| **08-polling-day** | `08-polling-day-target.png` | `08-polling-day-light.png` | `08-polling-day-dark.png` |
| **09-report-detail** | `09-report-detail-target.png` | `09-report-detail-light.png` | `09-report-detail-dark.png` |
| **10-public-results** | `10-public-results-target.png` | `10-public-results-light.png` | `10-public-results-dark.png` |

### Detailed Observations

1. **01-splash:**
   - Displays real Cairn E+G monogram with warm concentric sunburst rings and subtitle "by Cairn".
   - Automatically bypasses for automated test runs (`navigator.webdriver` / test flags), runs 1.2s on first user visit with instant fade under `prefers-reduced-motion`.
2. **02–04 Onboarding Flow:**
   - Three-slide illustrated onboarding with progress indicator dots, Back/Next navigation, and Skip action.
   - Slide 02 showcases hero polling scene art; Slide 03 showcases `SafeIllustration` phone shield; Slide 04 showcases `OfflineIllustration` mesh sync.
3. **05a Choose Role:**
   - Generous cards for "Observer with code", "Citizen without code", and "Staff sign-in" with circular icon discs and chevron affordance.
4. **05 Observer Home:**
   - Personalized greeting with observer code badge.
   - Dark hero "Report something" card with golden sun disc and high-contrast circular plus button.
   - Polling day checklist card with arc progress indicator showing active and upcoming stages.
   - Fixed bottom navigation bar (Home, Reports, Profile) adhering to 48px touch targets.
5. **06 What Happened:**
   - Category picker with generous cards, subtle borders, warm ochre selection fills, and distinct pictograms.
   - Fixed bottom action bar with `scroll-padding-bottom` and `scroll-margin` so cards are never occluded by sticky action buttons.
6. **07 Receipt Card:**
   - Centered circular sunburst checkmark header.
   - Authentic perforated ticket card with side semi-circle notches, dashed divider line, and clear `EG-XXXX-XXXX` code.
   - Pill secondary action buttons ("Copy code", "Save as image") and primary navigation button.
7. **08 Polling Day Checklist:**
   - Arching timeline illustration with sun transit indicator.
   - Stage progression list with active state ("Arrival · now"), pending stages, and primary action button.
8. **09 Report Detail:**
   - 4-step status journey: Received -> In review -> Question for you -> Closed.
   - Highlighted reviewer question card with gold left border accent, bold prompt, answer textarea, and "Send reply" action.
   - Original report summary card with metadata tags and photo attachment thumbnail.
9. **10 Public Results:**
   - Clean header with nonpartisan disclaimer: "Reviewed observations only. Not official results. Independent of INEC."
   - Pill tabs, observation count metrics, and responsive category breakdown cards.

---

## 4. Differences from Raw Target Images & Justification

- **Canonical Translations vs Placeholder Text:** Target images contained rough AI placeholder copy (e.g. "Report an observation", "Report Incident"). In production, official strings from `frontend/messages/*.json` are used across all five supported languages (English, Pidgin, Hausa, Yoruba, Igbo).
- **Official Brand Assets:** Real SVGs for the ElectraGuard BrandMark and Monogram (`frontend/ui/BrandMark`) were used rather than AI approximations.
- **Accessibility & Contract Compliance:** Text contrast exceeds WCAG AA 7:1 for body copy. Pinned result-sheet disclaimers ("Consistency check for review. This is not a result.") remain in place. Location precision stops at LGA level on public screens to protect citizen safety.

---

## 5. Verification Results

### 5.1 Static Analysis & Build
- `npm run lint`: **0 errors, 1 pre-existing warning**
- `npm run typecheck`: **0 errors**
- `npm run build`: **Compiled successfully in 1.5s**, 51/51 routes generated without errors.

### 5.2 Real-Server End-to-End Test Suite (`e2e/observer-real/`)
Ran against real PostgreSQL (port 55454) and Django WSGI backend (port 8161):
- `01-happy-path.spec.ts`: **1 passed** (PIN setup, report submission with photo, receipt code verification, zero EXIF metadata leakage).
- `02-offline.spec.ts`: **1 passed** (Offline report persistence in IndexedDB, surviving reload, auto-sync when online).
- `03-lost-response.spec.ts`: **1 passed** (Idempotent server commit recovery with matching receipt code).
- `04-killed-upload.spec.ts`: **1 passed** (Resumable chunked upload recovery after process termination).
- `05-drafts.spec.ts`: **2 passed** (Multi-step draft persistence, language switching, code isolation).
- `06-session-revoke-pause.spec.ts`: **3 passed** (Expired session re-auth, revoked code recovery, intake pause banner).
- `07-validation.spec.ts`: **3 passed** (Future date blocking, server error code handling, invalid media rejection).
- `08-accessibility.spec.ts`: **1 passed** (0 axe-core accessibility violations, properly labelled select elements).
- `09-service-worker.spec.ts`: **1 passed** (Offline service worker shell and reference caching).
- **Total:** **14 passed (100%)**
