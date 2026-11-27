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
- **Web Client (PWA):** Features an offline-first local outbox (IndexedDB) with automatic background synchronization. Once signed in, observers can record incidents, checklists and result sheets without network; signing in needs network.
- **Feature Phone Channels:** SMS and USSD handlers (prototype test values: SMS `20384`, USSD `*347*88#`) written for the Africa's Talking callback format. In this prototype they are exercised through the built-in on-screen simulator at `/phone`; no live carrier is connected.
- **Privacy by Design:** Field observers authenticate using anonymous, random observer codes (`OBS-` plus six characters) and a 6-number PIN. No names, phone numbers, or email addresses are ever stored with observer records. Phone numbers for SMS/USSD intake are immediately converted into cryptographic one-way hashes (`salted_hmac` with purpose-scoped salt and server secret key).

### 1.3 Automated PII Redaction & Data Protection (C16)
Narrative descriptions submitted by observers or citizens undergo automated privacy sanitization (`backend/privacy`) prior to display in reviewer consoles. Pattern matchers and a curated name list replace Nigerian phone numbers, VIN, NIN, BVN, emails, account numbers, addresses and names with keyed tokens (such as `[PHONE_a1b2]`). The unredacted original text can be fetched only through contract CASE-06 by the assigned reviewer, with a written reason, and each use is written to the audit record.

### 1.4 Calibrated Multi-Task Intelligence
Rather than deploying an opaque, ungrounded Large Language Model, ElectraGuard decomposes incident understanding into specialized, explainable modules:
1. **Category Triage (A1):** Multi-class classifier across seven core election categories.
2. **Urgency Scoring (A2):** Cost-sensitive model prioritizing recall of severe threats (safety, violence, voter suppression).
3. **Abstention & Out-of-Scope Detection (A3):** Calibrated uncertainty mechanism that abstains and prompts human reviewers when confidence falls below calibrated thresholds (0.40).
4. **Duplicate Detection (A4):** Character 3-gram similarity between reports in the same ward within a 90-minute window; the reviewer decides whether to link them.
5. **Cluster Warnings (A5) and Emerging Alerts (C17):** a count-in-window cluster warning, and Poisson (30 and 60 minute windows, Benjamini-Hochberg control) plus one-sided CUSUM surveillance (`backend/ops`) for abnormal spikes.
6. **Result-Sheet Mathematical Consistency (A6):** Five deterministic checks testing accreditation ceilings, vote sums, digit transpositions, round-number anomalies, and cross-unit duplications on Form EC8A returns.
7. **Rumour & Claim Prioritization (A8):** Cross-lingual rumour matching (`backend/rumours/matching.py`) prioritizing claims based on check-worthiness and potential for public harm.
8. **Review Clocks (C18):** Deterministic per-case target times and an overdue sweep (`backend/clocks`).
9. **Logistics Transit Risk (A13):** Gradient-boosted model forecasting delayed materials delivery based on route characteristics and transit history.
10. **Approved-answer retrieval ("Ask ElectraGuard"):** returns passages quoted word for word from approved guides, with the source shown, and says so when there is no approved answer. It does not generate text.

---

## 2. Datasets Used

In strict accordance with hackathon rules, all data used is synthetic, public, or officially authorized:

| Dataset | Records / Scope | Origin | Purpose |
|---|---|---|---|
| `incident_reports_synthetic.csv` | 400 incidents across 7 categories | Official Hackathon Starter Pack | Baseline training & template evaluation |
| `polling_units_synthetic.csv` | 900 polling units, 20 states, 60 LGAs | Official Hackathon Starter Pack | Geographic & administrative hierarchy |
| `logistics_deliveries_synthetic.csv` | Synthetic delivery runs | Official Hackathon Starter Pack | Materials delay model (A13) |
| `incident_paraphrases_authored.csv` | 140 rows: 56 train, 28 calibration, 56 robustness | Hand-written by the Cairn team | Training extras, abstention threshold (A3), and the independent robustness evaluation |
| `results_synthetic.csv` | 900 synthetic EC8A returns | Official Hackathon Starter Pack | Evaluating consistency checks (A6) |
| Approved guides (`docs/approved-guide/`) | 5 documents in each of 5 languages | Written by the team | Source for "Ask ElectraGuard" |

---

## 3. Evaluation Methodology

### 3.1 Data Leakage Audit & Robustness Benchmarking
During development, our leakage audit revealed that the 400 incidents in the official starter pack comprise only **7 distinct descriptions once place names are removed** (exactly one template per category). Consequently, any row-level train/test split of the starter pack measures template memorization (yielding a misleading 1.000 macro-F1) rather than true linguistic generalization.

To address this honestly:
1. **Memorization Check:** We retain and report the starter pack split explicitly labeled as a memorization sanity check.
2. **Headline Robustness Benchmark:** We evaluate all classification and triage components against the 56 independent, hand-authored synthetic examples (the `robustness` rows of `data/synthetic/incident_paraphrases_authored.csv`), which include real-world spelling errors, syntactic paraphrases, Nigerian Pidgin, and Hausa-Pidgin code-switching.
3. **Deterministic Evaluation Pipeline:** All evaluations run via `python backend/manage.py evaluate_models` using fixed seed 42 and report 95% bootstrap confidence intervals.

### 3.2 Evaluation Metrics
- **Triage (A1):** Category Macro-F1, Precision, and Recall across the 7 categories and across linguistic slices (Pidgin, code-switched, typos, paraphrases).
- **Urgency (A2):** High/Urgent Recall (minimizing false negatives on life safety), Precision, False-Urgent Rate.
- **Abstention (A3):** Abstention rate at calibrated threshold (0.40) and retained accuracy.
- **Clustering (A5):** Injection detection rate (spikes detected vs injected) and false alarm rate per 1,000 background reports.
- **Result-Sheet Consistency (A6):** Flag precision, recall, and alert rate per 1,000 sheets evaluated against known arithmetic and forensic anomalies.
- **Accessibility:** automated axe scans in the real-server browser tests (`frontend/e2e/observer-real/08-accessibility.spec.ts`) and earlier review notes in `docs/reviews/`. These are not proof of full WCAG conformance.
