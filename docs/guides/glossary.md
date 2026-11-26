# Election & System Glossary

This glossary explains election terms, Nigerian administrative boundaries, and technical concepts used throughout ElectraGuard AI.

---

## Electoral & Administrative Terms (Nigeria)

### Polling Unit (PU)
The primary voting location where citizens cast their ballots on election day. Nigeria has 176,846 official polling units across the country. Each polling unit has a unique numeric code (for example: `012/04/01`).

### Registration Area / Ward
An administrative grouping of polling units. Nigeria is divided into 8,809 wards. Wards serve as the first level of election collation above individual polling units.

### Local Government Area (LGA)
The second-tier administrative division in Nigeria. There are 774 Local Government Areas across the 36 states and the Federal Capital Territory (FCT).

### INEC (Independent National Electoral Commission)
The official election management body responsible for organizing, conducting, and supervising all federal and state elections in Nigeria.

### BVAS (Bimodal Voter Accreditation System)
The electronic handheld device introduced by INEC that verifies voters before they are given a ballot. It verifies identity using either fingerprint biometrics or facial recognition. It is also used to photograph and upload the official result sheet (Form EC8A).

### Voter Accreditation
The official check conducted at the polling unit to confirm that a voter holds a valid Permanent Voter Card (PVC), matches the biometric record on the BVAS, and appears on the printed register of voters for that polling unit.

### Form EC8A (Polling Unit Result Sheet)
The official paper document completed and signed by the Presiding Officer and party agents at each polling unit at the end of voting. It records the total registered voters, accredited voters, spoiled ballots, and votes scored by each political party.

### Permanent Voter Card (PVC)
The official plastic biometric identification card issued by INEC to registered Nigerian voters, required for presentation at the polling unit on election day.

### Voter Identification Number (VIN)
The unique 19-character identification code printed on every Permanent Voter Card.

---

## ElectraGuard AI Concepts

### Observer Code
An anonymous 8-character identifier (for example: `OB-7K4M2`) paired with a 6-digit PIN, issued by an election observation organisation to accredited field observers. It enables authenticated reporting and checklist submission without storing the observer's name, phone number, or personal credentials.

### Receipt Code
An 8-character cryptographic reference (for example: `EG-92D1-B48C`) generated upon report submission. It allows observers and anonymous citizens to look up review progress, answer follow-up questions from situation-room staff, and verify resolution without an account.

### Review Clock
A regulatory timer enforced on situation-room staff that counts down the maximum allowable time to review and triage an incident based on its urgency level:
- **Urgent:** 15 minutes
- **High:** 60 minutes
- **Normal:** 240 minutes
- **Low:** 480 minutes
- **Question Reply:** 120 minutes

### Review Clock States
- **`on_time`:** More than 25% of the target time window remains.
- **`due_soon`:** 25% or less of the target time window remains.
- **`overdue`:** Deadline has expired ($\text{minutes remaining} \le 0$).

### Small-Number Suppression (`< 5`)
A privacy-protecting statistical rule. When reporting public aggregate numbers on `/results`, any geographic cell or incident category with fewer than 5 incidents is masked as `< 5`. This prevents bad actors from identifying or retaliating against individual informants in low-turnout or isolated communities.

### Automatic PII Redaction
The automated redaction engine that scans descriptions and notes for personal identifying information (PII) — including Nigerian phone numbers, voter card numbers (VIN/PVC), National Identity Numbers (NIN), Bank Verification Numbers (BVN), and curated Nigerian names — replacing them with keyed cryptographic tokens (`[PHONE_xxxx]`, `[NAME_xxxx]`) before text is viewed by staff.

### SHA-256 Audit Chain
An immutable append-only ledger that records every case action, status transition, triage correction, and publication event in cryptographic sequence. Each entry includes the hash of the preceding event, ensuring that the historical observation record cannot be silently modified or deleted.

### Ward Check-In
A short status inquiry broadcast by situation-room coordinators to all accredited observers stationed within a specific ward or LGA to verify critical election milestones (e.g., arrival of materials, commencement of voting, presence of security).

### Safety Advisory
An urgent security notification issued to field observers or the public regarding verified physical violence or disruption. In ElectraGuard AI, safety advisories require two independent coordinator approvals before dispatch to prevent false panic.

### Rumour Desk
The situation-room section dedicated to monitoring viral misinformation, assessing public harm, verifying facts against authoritative sources, and publishing rapid debunks to `/check` and SMS.

### Reviewed Totals vs. Election Results
- **Reviewed Totals:** Aggregated summaries of incidents and observations filed by observers and citizens that have been verified by situation-room analysts.
- **Election Results:** The official vote totals and declarations made exclusively by INEC. ElectraGuard AI strictly **never** declares winners or certifies official outcomes.
