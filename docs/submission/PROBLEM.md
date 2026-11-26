# Problem Statement: ElectraGuard AI

> **In plain words:**  
> Nigerian elections span 176,846 polling units where mobile networks regularly cut out. Observers and voters facing violence or voting delays have had no safe way to report incidents without risking retaliation, and command rooms are swamped by duplicate reports and viral social media rumours. ElectraGuard AI provides an offline-first tool that works on smartphones and basic phones, automatically strips personal details to protect informants, and helps situation rooms verify facts quickly without partisan bias.

---

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Problem IDs Covered:** Primary Track 5 (5A, 5B, 5C, 5D, 5E) with integrated capabilities from Track 1 (1A, 1B), Track 2 (2A, 2C), Track 3 (3A, 3B), and Track 4 (4A, 4C).  
**Team:** Cairn (Lead: Kara Wari Sylva)  
**Status:** Prototype

---

## The Core Challenge
Election observation in Nigeria confronts a fundamental paradox: on polling day, thousands of civic observers and millions of citizens witness critical voting events across 176,846 polling units, yet civil society observation groups operate in an information fog. Critical incidents — such as missing ballot papers, BVAS biometric authentication failures, voter intimidation, and accessibility barriers — are either lost in uncoordinated chat channels or delayed for hours due to erratic network coverage, while false rumours spread unchecked across social networks.

## Target Users and Specific Pains

### 1. Accredited Election Observers (Problem 5A, 5C)
* **The Pain:** Field observers deploy into tense, remote environments with patchy 2G connectivity. Using standard chat apps or physical paper forms exposes them to severe safety risks: device inspection can reveal identity, paper notes can be confiscated, and un-transmitted drafts are lost if batteries die.
* **The Impact:** Observers cannot structure reports rapidly under pressure, leading to ambiguous notes lacking cryptographic provenance or exact administrative context.

### 2. Citizens and Grassroots Voters (Problem 5A, 5E, 3A, 3B)
* **The Pain:** The vast majority of Nigerian voters lack high-end smartphones or stable data bundles. Millions rely on basic feature phones. When citizens report extortion, violence, or late materials, their reports enter an informational black hole with zero acknowledgement or follow-up.
* **The Impact:** Civic disengagement and deep public cynicism; citizens stop reporting because "nobody listens and nothing happens."

### 3. Verification Analysts and Reviewers (Problem 5B, 1A)
* **The Pain:** Central review desks at civic situation rooms are inundated with thousands of raw reports within narrow 4-hour voting windows. Duplicate reports of the same incident arrive under varied spellings, languages (Hausa, Yorùbá, Igbo, Nigerian Pidgin, English), and informal slang.
* **The Impact:** Reviewers spend 70% of their time filtering trivial duplicates and categorizing text rather than investigating severe threats or escalating life-safety incidents.

### 4. Operations Room Coordinators (Problem 2A, 2C, 1B)
* **The Pain:** Coordinators lack real-time spatial awareness. Delays in sensitive electoral logistics (such as ballot box transit) cannot be distinguished from routine queues until polling units fail to open on time. Disinformation and viral social media rumours drown out ground truth.
* **The Impact:** Misallocated observer deployments, slow crisis intervention, and inability to counter viral misinformation with verified field data.

### 5. The General Public and Electoral Stakeholders (Problem 5D, 5E, 4C)
* **The Pain:** Post-election transparency dashboards frequently publish raw, uncorroborated allegations that inadvertently endanger observers, identify victims, or trigger retaliatory violence. Conversely, total data withholding fuels conspiracy theories.
* **The Impact:** Erosion of democratic trust and inability to provide neutral, privacy-preserving evidentiary records of electoral administration.

---

## ElectraGuard AI's Intervention
ElectraGuard AI resolves these bottlenecks through an integrated, privacy-first pipeline:
1. **Offline-First, Zero-PII Field Intake (5A, 5C):** Observers report via anonymous code/PIN credentials with client IndexedDB queued outbox synchronization and instant data wipe. Feature phone users report via USSD (`*384*24#`) and SMS prototype channels.
2. **Deterministic & Assistive AI Triage (5B, 1A, 2A):** Local multilingual models classify category and urgency, detect geographic clusters, and flag result-sheet anomalies, always requiring human sign-off.
3. **Automated PII Redaction & Controlled Original Access (4A, 4C):** Phone numbers, NIN, BVN, voter card IDs (VIN), and personal names are replaced with keyed tokens before reviewer display. Reviewing raw original text requires written justification and triggers audit logging.
4. **Community Rumour Verification & Ward Check-Ins (1A, 2A):** Citizens verify viral claims via web (`/check`) or SMS (`CHECK`), while coordinators broadcast check-ins to observers in targeted wards with dual-coordinator safety approvals.
5. **Cryptographic Transparency & Closed Loops (5D, 5E, 4C):** Citizens receive tamper-proof cryptographic receipts (`EG-xxxx-xxxx`) to check report status, while the public accesses aggregated, cell-suppressed transparency snapshots anchored to a verifiable SHA-256 audit chain.
