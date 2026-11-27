# Election & System Glossary

This glossary explains election terms, Nigerian administrative boundaries, and technical concepts used throughout ElectraGuard AI.

---

## Electoral & Administrative Terms (Nigeria)

### Polling Unit (PU)
The primary voting location where citizens cast their ballots on election day. INEC reports 176,846 polling units across the country. In ElectraGuard each polling unit has a code from the reference data loaded into the system.

### Registration Area / Ward
An administrative grouping of polling units. INEC reports 8,809 registration areas (wards). Wards serve as the first level of election collation above individual polling units.

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
An anonymous identifier of the form `OBS-` plus six characters (for example: `OBS-7K2P9X`), paired with a PIN, issued by an election observation organisation to accredited field observers. The card carries an 8-number setup PIN; the observer then chooses a 6-number PIN. The code enables authenticated reporting and checklist submission without storing the observer's name, phone number, or personal credentials.

### Receipt Code
A random reference of the form `EG-` plus two groups of four characters (for example: `EG-4H7Q-92KD`), with a built-in check character, generated when a report is received. It allows observers and anonymous citizens to look up review progress, answer follow-up questions from situation-room staff, and verify resolution without an account.

### Review Clock
An internal target time, tracked by the server, for how long a case may wait for review based on its urgency level. The defaults below can be changed per organisation:
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
A privacy-protecting statistical rule. When reporting public aggregate numbers on `/results`, any state, category or outcome with fewer than 5 reviewed reports is shown as "fewer than 5". This prevents bad actors from identifying or retaliating against individual informants in low-turnout or isolated communities.

### Automatic PII Redaction
The automated redaction engine that scans descriptions and notes for personal identifying information (PII) — including Nigerian phone numbers, voter card numbers (VIN), National Identity Numbers (NIN), Bank Verification Numbers (BVN), email addresses, bank account numbers, street addresses and a curated list of Nigerian names — replacing them with keyed tokens (such as `[PHONE_a1b2]` or `[NAME_a1b2]`) before text is viewed by staff.

### SHA-256 Audit Chain
An append-only record, kept per organisation, of case actions, status changes, triage corrections and publication events. Each entry includes the hash of the preceding event, so a changed or deleted past entry is detected when the record is verified.

### Ward Check-In
A short question sent by a coordinator to the accredited observers in a specific ward or LGA to check a milestone (for example, arrival of materials). Observers answer Yes, No or Not seen.

### Safety Advisory
A check-in of type "safety" sent to observers. A different coordinator than the one who wrote it must approve it before observers see it.

### Rumour Desk
The situation-room section dedicated to monitoring viral misinformation, assessing public harm, and drafting short replies. A second coordinator must approve a reply before it appears on `/check` and by SMS.

### Reviewed Totals vs. Election Results
- **Reviewed Totals:** Aggregated summaries of incidents and observations filed by observers and citizens that have been verified by situation-room analysts.
- **Election Results:** The official vote totals and declarations made exclusively by INEC. ElectraGuard AI strictly **never** declares winners or certifies official outcomes.
