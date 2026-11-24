# Safety, Privacy and Limitations Statement: ElectraGuard AI

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Date:** 2026-11-24  
**Status:** Prototype

---

## 1. Compliance with Hackathon Rules

- [x] **No live/institutional system accessed or tested:** ElectraGuard AI operates in an isolated environment using synthetic datasets. It does not connect to INEC servers, BVAS devices, the IReV portal, or national databases.
- [x] **Only synthetic, public or authorised data:** 100% of the training, tuning, and evaluation data is synthetic, open public reference data, or authored by the team. No scraped social media feeds, private messages, or citizen personal records are stored.
- [x] **Nonpartisan design:** The software enforces strictly neutral, nonpartisan operations. No party logos, colors, candidate promotional features, voter persuasion, or microtargeting tools exist anywhere in the platform.
- [x] **Human oversight for consequential decisions:** Every consequential action—incident verification, outcome corroboration, formal clarification requests, and rumour debunks—requires human authentication and sign-off. AI outputs are labeled as "Suggested" and never make autonomous decisions.

---

## 2. Comprehensive Risk Register

| Risk | Who could be harmed | Likelihood | Impact | Technical & Operational Mitigation | Residual Risk |
|---|---|---|---|---|---|
| **False Positive Urgency Alert** | Election officials & situation room staff (misallocated security assets). | Medium | Low | Dual-review verification in queue (S-02); urgency flags require manual reviewer confirmation before incident dispatch. | Low (minor analyst time overhead). |
| **False Negative (Missed Threat/Violence)** | Observers & voters at affected polling units. | Low | High | Urgency recall prioritized (tuned to 90% recall on severity 3/4); deterministic heuristic rules automatically escalate any report containing danger or violence keywords. | Low (human queue sweeps unflagged reports). |
| **Linguistic / Dialectal Misclassification** | Non-English / Pidgin / Dialect speakers whose reports might be miscategorized. | Medium | Medium | Evaluated against Pidgin and code-switched datasets (achieved F1 > 0.84); uncertainty threshold (0.40) triggers abstention and flags case for manual classification. | Low (routed to human queue without penalty). |
| **Observer De-anonymization / Retaliation** | Field observers subjected to local harassment or physical violence. | Low | Critical | **Zero-PII architecture:** Observers authenticate via random codes + PIN; zero personal identifiers (names, emails, phones) stored; local outbox encrypted with WebCrypto AES-GCM; emergency "Clear this phone" function. | Minimal (local physical coercion mitigated by data wipe). |
| **Citizen Re-identification via Public Data** | Informants in low-density rural communities. | Low | High | Public transparency dashboard (P-03) strictly enforces **small-cell suppression** (counts < 5 suppressed to `< 5`); public maps capped at LGA level (never fine-grained polling units). | Minimal (differential privacy semantics). |
| **Adversarial Report Flooding / Sybil Attack** | System availability & reviewer capacity. | Medium | Medium | Rate limiting on phone gateways (SMS/USSD) and web endpoints; near-duplicate detection (A4) clusters repeated text; clustering model (A5) isolates artificial spikes. | Low (coordinated bot farms require SMS fee barrier). |
| **Over-reliance on AI Suggestions** | Reviewers accepting erroneous triage recommendations. | Medium | Medium | UI prevents auto-selection: buttons require affirmative click ("Accept" or "Correct"); suggestions explicitly labeled "Suggested (AI)"; audit trail logs reviewer overrides. | Low (analyst training required). |

---

## 3. Privacy and Data Protection (NDPA 2023 Compliance)

ElectraGuard AI complies with the **Nigeria Data Protection Act (NDPA 2023)** and international privacy standards:

1. **Lawful Basis & Data Minimization:** 
   - Processing is grounded in legitimate public interest and explicit observer consent.
   - For accredited observers: no names, email addresses, or phone numbers are requested or recorded. Credentials consist purely of an unlinked alphanumeric batch code and salted 6-digit PIN.
   - For citizens reporting via web, USSD, or SMS: submission is completely anonymous. For phone-based intake, sender MSISDNs are immediately hashed using `HMAC-SHA256` with a rotating server salt, storing only the irreversible hash for duplicate suppression and receipt lookups.
2. **Cryptographic Integrity & Evidentiary Hygiene:**
   - Observers receive an ephemeral cryptographic receipt code for each submission.
   - All audit logs, case transitions, and reviewer determinations are appended to an immutable, verifiable **SHA-256 hash chain** (`AuditChainHead`), ensuring evidentiary integrity without exposing personal identities.
3. **Automated Redaction & Media Protection:**
   - Media attachments (photos/video clips) are held in secure, private object storage with time-limited signed URLs.
   - Facial obfuscation (automated Gaussian blur) is executed before visual evidence is rendered in reviewer consoles.
   - Interactive client-side text redaction allows reviewers to sanitize names of individuals, vehicle registration plates, or sensitive personal markers before corroboration.
4. **Retention and Deletion:**
   - Configurable automated data retention policies (e.g., 90-day post-election purge) permanently shred report text, phone HMACs, and media binaries while preserving aggregate audit hashes.

---

## 4. Known Limitations

1. **Synthetic Data Realism Gap:** All models were trained and tuned on synthetic datasets. While validated against challenging hand-authored robustness sets, real-world polling day text will exhibit unforeseen orthographic variations, regional slang, and local party nuances.
2. **Dialect and Accent Constraints:** While Hausa-Pidgin code-switching and Nigerian Pidgin were validated, specialized sub-dialects (e.g., specific rural Edo, Delta, or Borno colloquialisms) have not been exhaustively evaluated.
3. **No Direct Institutional Interfacing:** ElectraGuard AI cannot verify whether a polling official's physical deployment was delayed by security checkpoints, floods, or vehicle breakdowns, beyond logistics prediction models (A13).
4. **Hardware and Telecom Gateways:** USSD and SMS reception depends entirely on domestic telecommunications carriers (MTN, Airtel, Glo, 9mobile). Massive regional telecom blackouts will delay report transmission until devices regain GSM/GPRS connectivity.

---

## 5. Conditions for Further Testing & Deployment

Before any operational or field deployment in a live Nigerian electoral contest, the following non-negotiable milestones must be satisfied:

1. **Independent Third-Party Security Audit:** Formal penetration testing and cryptographic review of the hash-chain verification routines, USSD webhook HMAC validation, and authentication token storage.
2. **Institutional & Legal Clearances:** Formal review by the Nigeria Data Protection Commission (NDPC) and accredited civil society observation coalitions (e.g., YIAGA Africa, Transition Monitoring Group, CDD).
3. **Field Simulation with Consented Observers:** Conduct a controlled, simulated mock-election exercise across at least 1,000 diverse polling units in both urban and rural environments with representative feature phone users.
4. **Linguistic Refinement with Native Speakers:** Validation and formal translation review of the approved observer guides and model keywords by certified linguists in Hausa, Yorùbá, Igbo, and Nigerian Pidgin.

---

## 6. Official Statement

> **"This prototype is not approved for operational electoral deployment."**

Signed:  
**Kara Wari Sylva**  
Team Lead, Cairn  
Date: 2026-11-24
