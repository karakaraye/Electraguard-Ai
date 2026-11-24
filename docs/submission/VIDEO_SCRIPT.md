# 3-Minute Video Demo Script: ElectraGuard AI

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn (Lead: Kara Wari Sylva)  
**Target Duration:** Exactly 3 minutes (180 seconds)  
**Format:** Multi-camera screen recording, live mobile device capture, split-screen UI demonstrations, and clean voiceover.

---

## Video Outline & Timing Overview

| Scene | Time Window | Title & Theme | Core Track Coverage |
|---|---|---|---|
| **Scene 1** | 0:00 – 0:15 (15s) | The Problem: The Fog of Polling Day | Track 5 Overview |
| **Scene 2** | 0:15 – 0:50 (35s) | The Observer: Offline-First Hausa Intake | 5A, 5C, Track 3, Track 4 |
| **Scene 3** | 0:50 – 1:05 (15s) | The Citizen: USSD & SMS on a Feature Phone | 3B, 5E |
| **Scene 4** | 1:05 – 1:25 (20s) | The Polling Unit: Result-Sheet Consistency | 2A, 2B, 2D |
| **Scene 5** | 1:25 – 1:55 (30s) | The Situation Room: AI Triage with Human Review | 5B, 1A, Human Oversight |
| **Scene 6** | 1:55 – 2:20 (25s) | Operations & Rumour Desk: Clusters & Dual Approval | 1A, 1B, 2A, 2C |
| **Scene 7** | 2:20 – 2:40 (20s) | The Public: Transparency & Grounded Guidance | 5D, 5E, 3A, 4B |
| **Scene 8** | 2:40 – 3:00 (20s) | Responsible AI Commitments & Summary | Ethics, NDPA 2023, Closing |

---

## Detailed Scene-by-Scene Script

### Scene 1: The Problem: The Fog of Polling Day (0:00 – 0:15)
* **Visual:** Montage of a crowded Nigerian polling unit in morning sunlight, contrasting with a fast-moving, chaotic WhatsApp chat group overflowing with unverified messages, broken photos, and panicked audio notes.
* **On-Screen Text:**  
  *ElectraGuard AI*  
  *#AI4Elections Track 5 — Election Observation & Citizen Accountability*  
  *Team Cairn*
* **Voiceover:**  
  *"On election day across Nigeria's 176,000 polling units, observers and citizens witness crucial events. But in areas with weak or zero network, urgent incidents are never reported safely, chaotic chat groups create bottlenecks, and citizens who speak up never hear back."*

---

### Scene 2: The Observer: Offline-First Hausa Reporting (0:15 – 0:50)
* **Visual:** Over-the-shoulder close-up of a budget smartphone (Redmi 9A) running ElectraGuard in Hausa (`ha`). The device status bar clearly displays **Airplane Mode (No Network)**.
* **Action:**
  1. Observer taps *"Aika Rahoto"* (Report).
  2. Selects category: *Tsoratarwa da Tashin Hankali* (Intimidation & Violence).
  3. Taps *"Ba a cikin gaggawa ba"* (Not in immediate physical danger).
  4. Selects polling unit from offline database and taps *"Yanzu nan"* (Just now).
  5. Speaks an audio observation in Hausa; records a 5-second video clip. The interface automatically demonstrates **client-side face blur** across background bystanders.
  6. Submits. An immediate alert confirms: *"An ajiye a wannan wayar"* (Saved securely in encrypted on-device outbox).
  7. Observer toggles Airplane Mode OFF. The background outbox reconnects via TLS 1.3: a green checkmark confirms upload, generating a cryptographic submission receipt code (`REC-KN-7492`).
* **Voiceover:**  
  *"ElectraGuard changes that. Here, an observer in Kano works completely offline in Hausa. She records an incident, attaches audio, and captures video with bystanders' faces automatically blurred. The report is encrypted in her local device outbox. The moment network returns, it syncs seamlessly, providing a tamper-proof cryptographic receipt."*

---

### Scene 3: The Citizen: USSD & SMS on a Basic Feature Phone (0:50 – 1:05)
* **Visual:** Split screen. On the left, an actor dials `*384*24#` on an inexpensive Nokia feature phone. On the right, the ElectraGuard phone simulator terminal reflects incoming gateway webhook callbacks.
* **Action:**
  1. The user navigates the quick USSD menu: selects language (Pidgin), selects category (Late Materials), selects LGA.
  2. Types short text: *"officials never show since 8am"*.
  3. Within 3 seconds, a confirmation SMS arrives on the Nokia phone: *"ElectraGuard: Report REC-LG-1024 received. Check status at electraguard.ng/p or reply STATUS REC-LG-1024. No personal data kept."*
* **Voiceover:**  
  *"No smartphone? No problem. Any citizen can report via USSD on a basic phone. Phone numbers are converted to one-way cryptographic hashes immediately, and the citizen receives an instant SMS tracking receipt."*

---

### Scene 4: The Polling Unit: Result-Sheet Consistency Check (1:05 – 1:25)
* **Visual:** Smartphone camera snaps an EC8A polling unit result sheet.
* **Action:**
  1. The observer inputs accredited voters (450) and entered party votes (totaling 485).
  2. The screen instantly displays an amber warning badge:  
     **"Sum mismatch: total party votes exceed accredited voters."**
  3. An unequivocal, mandatory banner states across the top and bottom:  
     *"Consistency check for review. This is not an official result."*
* **Voiceover:**  
  *"When polling closes, observers record result-sheet entries. The system runs five instant arithmetic sanity checks—flagging sum discrepancies and impossible accreditation numbers. It clearly disclaims: this is an observational consistency check, never an official result declaration."*

---

### Scene 5: The Situation Room: AI Triage with Human Review (1:25 – 1:55)
* **Visual:** Screen capture of the Staff Reviewer Console (`/s/queue` and `/s/cases/REC-KN-7492`).
* **Action:**
  1. The Reviewer Queue displays incoming reports sorted strictly by urgency.
  2. Reviewer opens our Hausa report. The UI displays the original Hausa narrative side-by-side with an English machine translation clearly badged: *"Machine translation. Check the original."*
  3. AI components present suggestions:
     - Suggested Category: `intimidation_violence` (Confidence: 0.89).
     - Suggested Urgency: `High` (Elevated by rule: threats reported).
  4. Reviewer clicks **Accept**.
  5. Reviewer uses the interactive redaction tool to highlight an individual's private vehicle plate, clicking **Redact**.
  6. Reviewer dispatches a formal clarification question to the observer's phone; the observer replies instantly from the field.
* **Voiceover:**  
  *"In the situation room, analysts see reports ranked by calibrated urgency. AI models suggest categories and detect duplicates, but human analysts remain in absolute control. Analysts verify original audio, read translations, redact personal details, and message field observers directly."*

---

### Scene 6: Operations & Rumour Desk: Clusters & Dual Approval (1:55 – 2:20)
* **Visual:** Switching to the Operations Room (`/s/ops`) and the Rumour Desk (`/s/rumours`).
* **Action:**
  1. Operations map displays an automated cluster warning: a Poisson anomaly alert shows 8 independent late-materials reports across Dala LGA.
  2. Rumour Desk interface displays a viral Twitter claim claiming ballot-snatching in Kano.
  3. The system matches the claim against corroborated field reports from that exact ward, showing normal, peaceful voting.
  4. Analyst drafts a public factual notice.
  5. A second coordinator authenticates and approves the publication (*Second-Person Approval requirement*).
* **Voiceover:**  
  *"The operations room spots geographic clusters in real time—warning coordinators of localized logistics delays. When viral rumours spread on social media, the Rumour Desk cross-references ground reports, requiring dual two-person sign-off before publishing public debunks."*

---

### Scene 7: The Public: Transparency & Grounded Guidance (2:20 – 2:40)
* **Visual:** Mobile browser visiting the Public Transparency Portal (`/results` and `/ask`).
* **Action:**
  1. Demonstrating the transparency results table: rows showing verified incident counts by state. A cell with 3 reports clearly displays **`< 5`** under small-cell suppression rules.
  2. Opening "Ask ElectraGuard": user types in Yorùbá: *"Kini ẹtọ mi ti wọn ba sọ pe orukọ mi ko si ninu iwe?"* (What are my rights if my name is not found on the register?).
  3. The grounded engine returns the exact approved passage from Section 3.1 of the Field Guide with a clickable source citation link.
* **Voiceover:**  
  *"The public portal delivers aggregated transparency while fiercely protecting informants: any geographic cell with fewer than 5 reports is suppressed. Citizens can check their receipt status or query approved election guidance in five Nigerian languages—always backed by verified source citations."*

---

### Scene 8: Responsible AI Commitments & Summary (2:40 – 3:00)
* **Visual:** Split screen showing the Merkle audit chain hash (`AuditChainHead`), code repository structure, and closing credits.
* **On-Screen Text:**
  - *Zero Personal Identifiers Stored*
  - *Offline-First Architecture (< 300 KB)*
  - *Deterministic Reproducibility (Seed 42)*
  - *NDPA 2023 Compliant*
  - *Prototype: Not Approved for Operational Deployment*
* **Voiceover:**  
  *"No names. No voter profiling. No autonomous decisions. AI assists, but humans decide. ElectraGuard AI brings accountability, safety, and inclusion to election observation. Developed by Team Cairn for #AI4Elections."*
* **Closing Card:**  
  *ElectraGuard AI, by Cairn*  
  *Code & Documentation: github.com/karakaraye/Electraguard-Ai*
