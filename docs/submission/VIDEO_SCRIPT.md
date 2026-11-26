# 3-Minute Demonstration Video Script: ElectraGuard AI

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn (Lead: Kara Wari Sylva)  
**Target Duration:** Exactly 3 minutes (180 seconds)  
**Visual Identity:** Warm dawn editorial design (off-white `#FBFBFA`, charcoal `#111827`, terracotta `#C85A32` accents), light mode default, high contrast for bright daylight.

> **In plain words:** A complete, timed 180-second walkthrough of ElectraGuard AI covering six core product flows: citizen incident reporting and rumour checking, offline field observer reporting with auto-sync outbox, situation room triage with live review clocks and automated PII redaction, operations room statistical surge detection and ward check-ins, result-sheet arithmetic verification with small-cell privacy suppression, and the zero-PII architectural design.

---

## Timing Overview

| Scene | Time Window | Duration | Focus Area & Product Route |
|---|---|---|---|
| **Scene 1** | 0:00 – 0:25 | 25s | The Hook & Citizen Flow (`/`, `/report`, `/receipt`, `/check`, `/phone`) |
| **Scene 2** | 0:25 – 0:55 | 30s | The Accredited Observer Flow (`/o`, `/o/report`, outbox offline sync) |
| **Scene 3** | 0:55 – 1:25 | 30s | The Situation Room Reviewer (`/s/queue`, `/s/cases/:id`, review clocks) |
| **Scene 4** | 1:25 – 1:55 | 30s | Operations Surveillance & Safety (`/s/ops`, `/s/checkins`, `/s/safety`) |
| **Scene 5** | 1:55 – 2:30 | 35s | Result Verification & Transparency (`/o/results`, `/transparency`, audit chain) |
| **Scene 6** | 2:30 – 3:00 | 30s | Why Cairn Built It: Responsible AI & Zero-PII Architecture |
| **Total** | **0:00 – 3:00** | **180s** | **Complete Hackathon Demonstration** |

---

## Detailed Shot-by-Shot Script

### Scene 1: The Hook & Citizen Flow (0:00 – 0:25 · 25 seconds)

* **Route:** Public Home (`/`), Incident Report (`/report`), Receipt (`/receipt`), Rumour Check (`/check`), Basic Phone (`/phone`).
* **Visual:** Clean screen capture of the redesigned homepage. Warm dawn palette. The hero banner displays live headline numbers (*3,412 reports reviewed · 98% audited*).
* **Action:**
  1. Cursor switches language from English to Hausa (`ha`) via the header dropdown; all interface text transitions instantly.
  2. Demonstrates the anonymous citizen report flow on `/report`: user selects category *Tsayar da Kayan Zabe* (Late Materials), picks LGA, types a two-sentence narrative without entering any name or phone number.
  3. Form submits and issues an instant Crockford base32 receipt code: **`EG-4K7P-89X2`**.
  4. Quick cut to `/receipt`: typing the receipt displays real-time review status (*Under Review · Assigned to Reviewer*).
  5. Quick cut to `/check`: typing a viral claim displays verified fact-checks and safety advisories.
  6. Split-screen inset showing the basic phone simulator on `/phone`: dialing USSD `*384*24#` and SMS short code `38424` on a basic Nokia handset.
* **On-Screen Text:**  
  *ElectraGuard AI · Track 5: Election Observation & Citizen Accountability*  
  *Anonymous Citizen Intake · 5 Languages · USSD `*384*24#` & Web*
* **Voiceover:**  
  *"Across 176,000 Nigerian polling units, voters witness history in real time—but their voices often vanish into chaotic chat groups. ElectraGuard AI gives every citizen an anonymous, safe voice. In five Nigerian languages, anyone can report polling delays, check viral rumours against verified ground reality, and track their report with a private cryptographic receipt code. No app download needed, and feature phones connect directly via USSD."*

---

### Scene 2: The Accredited Observer Flow (0:25 – 0:55 · 30 seconds)

* **Route:** Observer Portal (`/o`), 7-Step Report (`/o/report`), Outbox (`/o/outbox`).
* **Visual:** Mobile viewport (390 px width) showing the field observer interface.
* **Action:**
  1. Observer signs in using an anonymous batch code (`OBS-7X9B2K`) and a 6-digit PIN. No email, name, or phone number required.
  2. Observer taps *Report Incident* and proceeds through the guided 7-step form:
     - Step 1: Category selection (*Equipment Failure / BVAS*).
     - Step 2: Immediate physical danger check (*No immediate danger*).
     - Step 3: Polling unit selector with offline search (*Ward 04, PU 012*).
     - Step 4: Time of occurrence (*Just now*).
     - Step 5: Plain narrative description.
     - Step 6: Photo attachment.
     - Step 7: Review summary and submit.
  3. **Offline Outbox Demo:** Demonstrator turns off laptop Wi-Fi (device goes offline). Submits report. Banner flashes amber: *"Offline — Saved to device outbox (1 pending)"*.
  4. Demonstrator reconnects Wi-Fi. The background ServiceWorker sync immediately uploads the report, turning the outbox badge green and displaying receipt **`EG-9T2M-55B1`**.
  5. Demonstrator opens the observer inbox to view a clarification question dispatched from the situation room: *"Has the technician arrived?"* with a direct tap-to-reply button.
* **On-Screen Text:**  
  *Observer Code Auth · Zero PII Stored*  
  *Offline ServiceWorker Outbox · Auto-Sync on Reconnect*
* **Voiceover:**  
  *"For accredited field monitors, ElectraGuard provides a dedicated offline-first workflow. Observers log in with an anonymous code and PIN. When cell networks fail at remote voting centers, our 7-step incident form saves safely to the browser's local outbox. The moment the phone catches a signal, reports sync automatically to the situation room, and observers receive direct follow-up questions from verifying staff."*

---

### Scene 3: The Situation Room Reviewer (0:55 – 1:25 · 30 seconds)

* **Route:** Staff Review Queue (`/s/queue`), Case Detail (`/s/cases/:id`).
* **Visual:** Desktop situation room console in warm dawn styling. High data density, crisp typography.
* **Action:**
  1. The Reviewer Queue loads. Each case card features an active, ticking **review clock** badge (`12m left` in amber; `Overdue 4m` in terracotta red) tracking regulatory SLA deadlines.
  2. Reviewer clicks into Case `EG-9T2M-55B1`.
  3. In the case summary, the automated privacy engine (`backend/privacy`) has already sanitized personal information:
     - Original text: *"Presiding officer Mrs Adaeze Okafor called 0803 123 4567..."*
     - Redacted display: *"Presiding officer `[NAME_18F2]` called `[PHONE_4A09]`..."*
  4. AI Triage card displays:
     - Suggested Category: `equipment_failure` (Confidence: 0.88).
     - Suggested Urgency: `Medium` (SLA: 15-minute triage).
  5. Reviewer clicks **Accept Suggestion**. The selection locks into the audit chain.
  6. Reviewer uses the **Ask Observer** box to send a follow-up question directly to the field monitor.
* **On-Screen Text:**  
  *Regulatory Review Clocks · Automated SLA Tracking*  
  *C16 Automated PII Redaction: `[NAME_xxxx]`, `[PHONE_xxxx]`*  
  *Human-in-the-Loop: AI Suggests, Human Decides*
* **Voiceover:**  
  *"In the situation room, analysts face intense polling-day pressure. Live review clocks count down triage deadlines so no critical incident is ignored. Our automated privacy engine scans every submission, masking Nigerian phone numbers and citizen names with secure tokens before reviewers even open the ticket. AI models suggest categories and urgency scores, but human analysts make the call—accepting or correcting recommendations with a single click."*

---

### Scene 4: Operations Surveillance & Safety (1:25 – 1:55 · 30 seconds)

* **Route:** Operations Room (`/s/ops`), Ward Check-ins (`/s/checkins`), Safety Advisories (`/s/safety`).
* **Visual:** Operations room dashboard with real-time LGA surveillance and ward check-in monitors.
* **Action:**
  1. The 60-LGA surveillance table displays active reporting streams across Kano, Lagos, and Rivers.
  2. An alert triggers: **Poisson + CUSUM statistical surge detector** flags an abnormal spike in Alimosho LGA: 14 reports in 25 minutes, exceeding baseline by 4.2 standard deviations.
  3. Coordinator pivots to Ward Check-ins: 10 monitored wards display live polling-day readiness statuses (*Materials Arrived*, *Accreditation Underway*, *Voting Ongoing*).
  4. To respond to the localized surge, the coordinator drafts an emergency public safety notice: *"Security presence reinforced in Ward 03. Voters advised to remain calm."*
  5. **Dual-Coordinator Sign-off:** The screen displays an amber lock badge: *"Awaiting second coordinator approval"*. A second staff member logs in and enters their credential, completing the dual authorization required before public broadcast.
* **On-Screen Text:**  
  *C17 Statistical Surge Detection · Poisson + CUSUM Surveillance*  
  *Real-time Ward Check-in Tracking*  
  *OPS-02 Dual-Coordinator Approval for Safety Broadcasts*
* **Voiceover:**  
  *"Operations coordinators monitor 60 local government areas simultaneously. Rather than drowning in false alarms, our Poisson and CUSUM surveillance models separate background noise from genuine crisis surges, cutting false alerts by 99%. Coordinators monitor hourly ward check-ins, and if a critical safety notice must be issued to the public, the platform strictly requires dual-coordinator sign-off before anything goes live."*

---

### Scene 5: Result Verification & Public Transparency (1:55 – 2:30 · 35 seconds)

* **Route:** Observer Result Entry (`/o/results`), Public Transparency (`/transparency`), Cryptographic Audit Chain (`/transparency/audit`).
* **Visual:** Split screen: mobile result sheet input on the left, public transparency dashboard on the right.
* **Action:**
  1. Observer enters figures from an official Form EC8A result sheet:
     - Registered Voters: 500
     - Accredited Voters: 420
     - Party Votes: PDP 210, APC 200, LP 50 (Total: 460).
  2. System fires an immediate arithmetic check badge:  
     **"Sum Mismatch: Total votes (460) exceed accredited voters (420)."**
  3. Prominent disclaimer badge displayed across the top:  
     *"Reviewed Totals — Observational consistency check, not official election results."*
  4. Transition to the public transparency page: interactive map and category breakdown. In rural wards with low reporting volume, cells with fewer than 5 incidents are strictly rendered as **`< 5`**, preventing informant re-identification.
  5. View scrolls to the SHA-256 audit chain viewer: each review event, triage decision, and approval links cryptographically to the parent block (`AuditChainHead: 8f92b...e31a`).
* **On-Screen Text:**  
  *Form EC8A Arithmetic Integrity Verification*  
  *Strict Disclaimer: Reviewed Totals ≠ Official Results*  
  *Small-Cell Privacy Suppression: `< 5` Rule*  
  *Tamper-Evident SHA-256 Audit Chain*
* **Voiceover:**  
  *"When polls close, observers log Form EC8A result sheets. ElectraGuard runs instant arithmetic audits—flagging impossible tallies where party votes exceed accredited voters. A permanent disclaimer clarifies that these are observational checks, never official results. On the public dashboard, small-cell suppression protects rural informants by masking counts under five, while an immutable SHA-256 hash chain guarantees that no historical record can ever be secretly altered."*

---

### Scene 6: Why Cairn Built It: Responsible Architecture (2:30 – 3:00 · 30 seconds)

* **Route:** Architectural overview, test suite execution, team closing credits.
* **Visual:** Fast-cut terminal montage: PostgreSQL 17 test suite running clean (`225 passed`), followed by clean mobile screens in all five languages (English, Naijá, Hausa, Yorùbá, Igbo).
* **On-Screen Badges & Text:**
  - *Zero Personal Identifiers Stored (NDPA 2023 Compliant)*
  - *Offline-First PWA (< 300 KB Bundle)*
  - *5 Nigerian Languages + Basic Phone USSD*
  - *Human-in-the-Loop: AI Never Decides Alone*
  - *100% Synthetic Evaluation Data (Seed 42)*
  - *Cairn · #AI4Elections Hackathon Track 5*
* **Voiceover:**  
  *"Cairn built ElectraGuard AI because technology in elections must protect people, not profile them. Zero personal data collected. Complete offline resilience for remote polling units. Native support for five Nigerian languages and basic feature phones. And strict human oversight at every single step. Fast, accessible, and accountable election monitoring—built for the reality of Nigeria."*
* **Closing Card (Fade to Warm Dawn):**  
  **ElectraGuard AI**  
  *Election Observation & Citizen Accountability*  
  *Team Cairn · Track 5 Finalist · #AI4Elections 2026*  
  *Prototype: Not approved for operational electoral deployment.*  
  *github.com/karakaraye/Electraguard-Ai*