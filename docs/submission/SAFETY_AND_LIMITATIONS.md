# Safety, Privacy and Limitations Statement: ElectraGuard AI

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Date:** 2026-11-26  
**Status:** Prototype

> **In plain words:** ElectraGuard AI is a prototype election-monitoring platform built exclusively with synthetic data and tested in isolation. It never connects to official election servers and does not ask for names, phone numbers or email addresses. An automated privacy engine hides personal details it finds in reports before reviewers see them (it finds about 96% of them in testing), and the original text can be fetched only by the assigned reviewer with a written reason that is audited. A person decides every case, and this prototype is not approved for live election deployment.

---

## 1. Compliance with Hackathon Rules

- [x] **No live/institutional system accessed or tested:** ElectraGuard AI operates in an isolated environment using synthetic datasets. It does not connect to INEC servers, BVAS devices, the IReV portal, or national databases.
- [x] **Only synthetic, public or authorised data:** 100% of the training, tuning, and evaluation data is synthetic, open public reference data, or authored by the team. No scraped social media feeds, private messages, or citizen personal records are stored.
- [x] **Nonpartisan design:** The software enforces strictly neutral, nonpartisan operations. The platform has no party logos or colours, no candidate promotion, and no persuasion or microtargeting features.
- [x] **Human oversight for consequential decisions:** Every consequential action—incident verification, outcome corroboration, formal clarification requests, and rumour debunks—requires human authentication and sign-off. AI outputs are labeled as "Suggested" and never make autonomous decisions.

---

## 2. Comprehensive Risk Register

| Risk | Who could be harmed | Likelihood | Impact | Technical & Operational Mitigation | Residual Risk |
|---|---|---|---|---|---|
| **False Positive Urgency Alert** | Election officials & situation room staff (misallocated security assets). | Medium | Low | Urgency is only a suggestion on the case screen (S-03); a reviewer accepts or corrects it. The app does not dispatch help. | Low (minor analyst time overhead). |
| **False Negative (Missed Threat/Violence)** | Observers & voters at affected polling units. | Low | High | Urgency recall prioritized (tuned to 90% recall on severity 3/4); rules add urgency when the reporter says someone is in danger now or the category is intimidation or violence, whatever the text model predicts. Held-out urgent recall was 0.871, so some urgent cases are still missed. | Low (human queue sweeps unflagged reports). |
| **Linguistic / Dialectal Misclassification** | Non-English / Pidgin / Dialect speakers whose reports might be miscategorized. | Medium | Medium | Evaluated against Pidgin and code-switched datasets (achieved F1 > 0.84); uncertainty threshold (0.40) triggers abstention and flags case for manual classification. | Low (routed to human queue without penalty). |
| **Observer De-anonymization / Retaliation** | Field observers subjected to local harassment or physical violence. | Low | Critical | **No-name design:** Observers authenticate via random codes + PIN; zero personal identifiers (names, emails, phones) stored; unsent reports sit in the phone's browser storage, **not encrypted by the app** (client-side encryption is not built); "Sign out and clear this phone" removes them. | Medium: anyone who can open the phone's browser profile can read unsent reports. |
| **Citizen Re-identification via Public Data** | Informants in low-density rural communities. | Low | High | Public results (P-03) are by state, type and hour only and hide counts below 5 ("fewer than 5"); they are published at least 60 minutes after the reports. | Low to medium: small counts can still be combined with outside knowledge. |
| **PII Leakage in Free-Text Narratives** | Citizens or bystanders named in incident reports or messages. | Medium | High | **Automated redaction (`backend/privacy`):** pattern matching and a curated name list replace phone numbers, VIN, NIN, BVN, emails, account numbers, addresses and names with keyed tokens. Recall was 96.3% on a 308-item test; names not on the list and bank account numbers are the weakest. The original text is available only to the assigned reviewer through CASE-06 with a written reason. Reviewers can also hide names by hand. | Medium: about 4 in 100 personal details were missed in testing. |
| **Adversarial Report Flooding / Sybil Attack** | System availability & reviewer capacity. | Medium | Medium | Rate limits on phone and web endpoints; duplicate candidates shown to reviewers (A4); a Poisson and CUSUM surge detector (C17, `backend/ops`) raises alerts for sudden surges (it found 13 of 20 planted surges, with 0.39 false alarms an hour). | Medium: the rate limits do not stop a large distributed flood. |
| **Over-reliance on AI Suggestions** | Reviewers accepting erroneous triage recommendations. | Medium | Medium | UI prevents auto-selection: buttons require affirmative click ("Accept" or "Correct"); suggestions are labelled "Suggested, not decided" with their reasons and confidence; the audit trail records what the reviewer did. | Medium: reviewers may still defer to the suggestion. |
| **Premature or False Public Broadcasts** | Public alarm caused by unverified critical safety notices. | Low | High | **Second-person approval:** a check-in of type "safety" is not sent to observers until a coordinator other than its author approves it (`backend/notices/views.py`), and a rumour reply drafted by one coordinator must be approved by another. Safety notices go to observers, not to the public. | Low. |

---

## 3. Privacy and Data Protection (NDPA 2023 principles)

ElectraGuard AI is designed around the principles of the **Nigeria Data Protection Act 2023** (data minimisation, purpose limitation, retention limits, access and deletion). **No formal legal review has been done, and this document is not a statement of legal compliance.**

1. **Lawful Basis & Data Minimization:** 
   - The app shows a "What this app keeps" notice before first use and has a public privacy notice. The lawful basis for a real deployment would be set by the observation organisation.
   - For accredited observers: no names, email addresses, or phone numbers are requested or recorded. Credentials are a random observer code and a PIN stored only as a PBKDF2-SHA256 hash.
   - For citizens reporting via web, USSD, or SMS: submission is completely anonymous. For phone-based intake, sender numbers are hashed with `salted_hmac` using a purpose-scoped salt (`electraguard.<purpose>`) and the server secret key, and only the hash is stored, for rate limits, language choice and receipt lookups. The plain number is held in memory only while a reply is sent.
2. **Automated PII Redaction (`backend/privacy`):**
   - Pattern matchers and a curated name list find Nigerian mobile numbers (local and `+234` forms, with or without spaces and hyphens), VIN, NIN, BVN, emails, account numbers, addresses and Nigerian personal names. Titles such as Mr or Alhaji are left in place.
   - Matches are replaced with keyed tokens (`[PHONE_xxxx]`, `[NAME_xxxx]`, and so on).
   - The redacted text is stored beside the original (`auto_redacted_description`). Reviewers are shown the redacted form in the queue, the case view and messages.
   - The original text is reachable only through contract CASE-06: the assigned reviewer, a written reason of 1 to 500 characters, at most 30 times an hour, and each use is written to the audit record. The case screen in this build has no button for it.
3. **Record Integrity & Evidence Handling:**
   - Each submission gets a random receipt code (`EG-xxxx-xxxx`) with a check character.
   - Case actions, reviewer decisions and original-text access are appended to a per-organisation **SHA-256 hash chain** (`AuditEvent`, `backend/staff/audit.py`), checked by `GET /api/v1/audit/verify`. A changed past entry breaks the chain; someone controlling the whole database could rewrite it all, so the published fingerprint should be compared over time.
4. **Media Protection:**
   - Media files are kept in a private media store and served only through authenticated, organisation-scoped endpoints. Uploads are re-encoded, location data is removed, and the SHA-256 checksum is verified.
   - Server-side face blurring (OpenCV with the YuNet detector, pixelation and Gaussian smoothing) runs in the media worker when requested. It blurs faces the detector finds, so it can miss some; the case screen shows whether faces were blurred.
5. **Retention and Deletion:**
   - Each organisation sets a retention period of 30 to 730 days. The operator command `python backend/manage.py purge_retention` deletes older reports, files and messages; the purge itself is recorded in the audit chain. It must be run on a schedule by the operator.

---

## 4. Known Limitations

1. **Synthetic Data Realism Gap:** All models were trained and tuned on synthetic datasets. While checked against hand-written robustness sets and a 308-item redaction benchmark, real-world polling day text will exhibit unforeseen orthographic variations, regional slang, and local party nuances.
2. **Dialect and Accent Constraints:** While Hausa-Pidgin code-switching and Nigerian Pidgin were validated, specialized sub-dialects (e.g., specific rural Edo, Delta, or Borno colloquialisms) have not been exhaustively evaluated.
3. **No Direct Institutional Interfacing:** ElectraGuard AI cannot verify whether a polling official's physical deployment was delayed by security checkpoints, floods, or vehicle breakdowns, beyond logistics prediction models (A13).
4. **Hardware and Telecom Gateways:** The SMS number (`20384`) and USSD code (`*347*88#`) are test values for this prototype. The handlers are written for the Africa's Talking callback format and are exercised only through the built-in on-screen simulator; no carrier or sandbox gateway has been connected, and a commercial short code must be leased. In a live production deployment, carrier provisioning across MTN, Airtel, Glo, and 9mobile would be required. Massive regional telecom blackouts would delay report transmission until devices regain GSM/GPRS connectivity.

---

## 5. Conditions for Further Testing & Deployment

Before any operational or field deployment in a live Nigerian electoral contest, the following non-negotiable milestones must be satisfied:

1. **Independent Third-Party Security Audit:** Formal penetration testing and review of the hash-chain verification routines, the SMS and USSD webhook secret and allow-list, and authentication token storage.
2. **Institutional & Legal Clearances:** Formal review by the Nigeria Data Protection Commission (NDPC) and accredited civil society observation coalitions (e.g., YIAGA Africa, Transition Monitoring Group, CDD).
3. **Field Simulation with Consented Observers:** Conduct a controlled, simulated mock-election exercise across at least 1,000 diverse polling units in both urban and rural environments with representative feature phone users.
4. **Linguistic Refinement with Native Speakers:** Review of the interface strings, approved guides and SMS keywords by native speakers of Hausa, Yoruba, Igbo and Nigerian Pidgin.

---

## 6. Official Statement

> **"This prototype is not approved for operational electoral deployment."**

Signed on behalf of Team Cairn:

| Name | Role | Signature | Date |
|---|---|---|---|
| Karakaraye Wari Sylva | Team lead | | |
| Nonso Charles | Product and design | | |
