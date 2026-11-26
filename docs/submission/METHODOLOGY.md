# Methodology: ElectraGuard AI

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Date:** 2026-11-26  
**Status:** Prototype

> **In plain words:** ElectraGuard AI was engineered for the ground reality of Nigerian elections: spotty mobile connectivity, rich multilingual reporting, and serious privacy risks for observers. Instead of relying on an opaque, hallucination-prone chatbot, the system decomposes election observation into specialized statistical tools and deterministic arithmetic verifiers that operate reliably on modest hardware. Observers can work completely offline, and all AI recommendations require human confirmation before action is taken.

---

## 1. Technical Approach & Design Philosophy

ElectraGuard AI is built upon six foundational engineering principles:

### 1.1 Strict Human-in-the-Loop Oversight
AI models inside ElectraGuard serve solely as assistive, ranking, and consistency-checking tools. **The AI never makes autonomous decisions.** All triage labels, urgency flags, cluster warnings, and claim assessments are marked visually and semantically as "Suggested" and require explicit human review, acceptance, correction, or rejection by situation room analysts.

### 1.2 Offline-First Edge & Resilient Telecom Ingestion
Recognizing severe connectivity constraints across Nigerian polling units:
- **Web Client (PWA):** Features an offline-first local outbox (IndexedDB) with automatic background synchronization. The web app operates completely offline, allowing observers to record incidents, checklists, and result sheets without network connectivity.
- **Feature Phone Channels:** Integrated SMS and USSD (`*384*24#`) ingestion via gateway callbacks (tested against Africa's Talking sandbox and simulator), normalizing structured inputs over 2G GSM networks.
- **Privacy by Design:** Field observers authenticate using anonymous, random observer codes and 6-digit PINs. No names, phone numbers, or email addresses are ever stored with observer records. Phone numbers for SMS/USSD intake are immediately converted into cryptographic one-way hashes (`salted_hmac` with purpose-scoped salt and server secret key).

### 1.3 Automated PII Redaction & Data Protection (C16)
Narrative descriptions submitted by observers or citizens undergo automated privacy sanitization (`backend/privacy`) prior to display in reviewer consoles. Regex and named-entity matchers replace Nigerian phone numbers and personal names with deterministic tokens (`[PHONE_xxxx]`, `[NAME_xxxx]`). Unredacted original text is quarantined behind contract CASE-06, requiring senior role elevation, auditable justification, and SHA-256 hash chaining.

### 1.4 Calibrated Multi-Task Intelligence
Rather than deploying an opaque, ungrounded Large Language Model, ElectraGuard decomposes incident understanding into specialized, explainable modules:
1. **Category Triage (A1):** Multi-class classifier across seven core election categories.
2. **Urgency Scoring (A2):** Cost-sensitive model prioritizing recall of severe threats (safety, violence, voter suppression).
3. **Abstention & Out-of-Scope Detection (A3):** Calibrated uncertainty mechanism that abstains and prompts human reviewers when confidence falls below calibrated thresholds (0.40).
4. **Duplicate & Near-Duplicate Detection (A4):** Semantic text embedding combined with temporal and geographic proximity matching to collapse concurrent reports of the same event.
5. **Spatial Cluster & Surge Detection (A5 / C17):** Spatio-temporal anomaly scanner and Poisson + CUSUM statistical surveillance (`backend/ops`) tracking abnormal incident spikes across wards and LGAs.
6. **Result-Sheet Mathematical Consistency (A6):** Five deterministic checks testing accreditation ceilings, vote sums, digit transpositions, round-number anomalies, and cross-unit duplications on Form EC8A returns.
7. **Rumour & Claim Prioritization (A8):** Cross-lingual rumour matching (`backend/rumours/matching.py`) prioritizing claims based on check-worthiness and potential for public harm.
8. **Review & Regulatory Clocks (C18):** Deterministic live SLA countdown timers and overdue sweeps (`backend/clocks`) preventing critical case starvation.
9. **Logistics Transit Risk (A13):** Gradient-boosted model forecasting delayed materials delivery based on route characteristics and transit history.
10. **Grounded Retrieval ("Ask ElectraGuard"):** Retrieval-Augmented Generation (RAG) strictly restricted to approved, pre-vetted electoral guide documents with mandatory source passage attribution and honest refusal to answer out-of-scope inquiries.

---

## 2. Datasets Used

In strict accordance with hackathon rules, all data used is synthetic, public, or officially authorized:

| Dataset | Records / Scope | Origin | Purpose |
|---|---|---|---|
| `incident_reports_synthetic.csv` | 400 incidents across 7 categories | Official Hackathon Starter Pack | Baseline training & template evaluation |
| `polling_units_synthetic.csv` | 900 polling units across 3 states | Official Hackathon Starter Pack / Cairn Reference | Geographic & administrative hierarchy |
| `logistics_deliveries_synthetic.csv` | Synthetic delivery runs | Official Hackathon Starter Pack | Materials delay model (A13) |
| `incident_paraphrases_authored.csv` | 56 hand-authored challenging cases | Authored by Cairn Team | Independent robustness evaluation (typos, Nigerian Pidgin, code-switching) |
| `calibration_heldout.csv` | 28 authored calibration samples | Authored by Cairn Team | Tuning abstention thresholds (A3) |
| Synthetic Result Sheets | 900 synthetic EC8A returns | Synthetically generated | Evaluating mathematical consistency checks (A6) |
| Approved Observer Field Guide | 5 documents in 5 languages | Authored & public guidelines | Grounded knowledge base for Ask retrieval |

---

## 3. Evaluation Methodology

### 3.1 Data Leakage Audit & Robustness Benchmarking
During development, our leakage audit revealed that the 400 incidents in the official starter pack comprise only **7 distinct descriptions once place names are removed** (exactly one template per category). Consequently, any row-level train/test split of the starter pack measures template memorization (yielding a misleading 1.000 macro-F1) rather than true linguistic generalization.

To address this honestly:
1. **Memorization Check:** We retain and report the starter pack split explicitly labeled as a memorization sanity check.
2. **Headline Robustness Benchmark:** We evaluate all classification and triage components against the 56 independent, hand-authored synthetic examples (`incident_paraphrases_authored.csv`), which include real-world spelling errors, syntactic paraphrases, Nigerian Pidgin, and Hausa-Pidgin code-switching.
3. **Deterministic Evaluation Pipeline:** All evaluations run via `python backend/manage.py evaluate_models` using fixed seed 42 and report 95% bootstrap confidence intervals.

### 3.2 Evaluation Metrics
- **Triage (A1):** Category Macro-F1, Precision, and Recall across the 7 categories and across linguistic slices (Pidgin, code-switched, typos, paraphrases).
- **Urgency (A2):** High/Urgent Recall (minimizing false negatives on life safety), Precision, False-Urgent Rate.
- **Abstention (A3):** Abstention rate at calibrated threshold (0.40) and retained accuracy.
- **Clustering (A5):** Injection detection rate (spikes detected vs injected) and false alarm rate per 1,000 background reports.
- **Result-Sheet Consistency (A6):** Flag precision, recall, and alert rate per 1,000 sheets evaluated against known arithmetic and forensic anomalies.
- **Accessibility & Usability:** Automated WCAG 2.2 AA audits (AxeBuilder) across all observer, staff, and public interfaces, plus horizontal viewport audits at 360 px width.
