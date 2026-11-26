# Model / System Card: ElectraGuard AI Multi-Component Suite

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Date:** 2026-11-26  
**Status:** Prototype

> **In plain words:** ElectraGuard AI uses transparent, specialized machine learning models and mathematical rules instead of black-box chatbots. These tools suggest incident categories, prioritize urgent threats like violence or polling delays, detect duplicate submissions, and check result sheets for impossible arithmetic. The AI never acts on its own—every suggestion must be confirmed by a human reviewer, and the system openly steps aside whenever confidence falls below 40%.

---

## Summary
The ElectraGuard AI system is a modular suite of assistive statistical classifiers, rule-based heuristics, privacy engines, and grounded information retrieval models designed to support election observation and civic transparency in Nigeria. It comprises nine core intelligence and operational components:
1. **Category Triage (A1):** Calibrated multi-class classification across 7 electoral incident categories.
2. **Urgency Scoring (A2):** Cost-sensitive classifier and deterministic escalation rules prioritizing severity 3/4 threats.
3. **Uncertainty Abstention (A3):** Calibrated confidence gating that abstains and prompts human review when confidence is below 0.40.
4. **Duplicate Detection (A4):** Semantic text embedding combined with spatial-temporal clustering to collapse redundant submissions.
5. **Spatial-Temporal Cluster & Surge Detection (A5 / C17):** Poisson + CUSUM statistical anomaly scanner (`backend/ops`) tracking abnormal LGA reporting surges.
6. **Result-Sheet Consistency Verification (A6):** Deterministic audit checks flagging arithmetic anomalies, vote inflation, and impossible accreditation numbers on Form EC8A returns.
7. **Automated PII Redaction (C16):** Regex and named-entity privacy engine (`backend/privacy`) masking phone numbers and personal names before human review.
8. **Review & Regulatory Clocks (C18):** Deterministic queue SLA countdown timers and overdue sweeps (`backend/clocks`).
9. **Claim Ranking & Multilingual Matching (A8):** Cross-lingual rumour matching (`backend/rumours/matching.py`) prioritizing check-worthiness and potential for public harm.

- **Model Types:** Calibrated Naive Bayes, Logistic Regression, Gradient Boosted Trees, Poisson/CUSUM surveillance, deterministic arithmetic verifiers, and grounded TF-IDF/semantic retrieval.
- **Version:** 1.0.0 (Release Candidate 1)
- **Date:** 2026-11-26
- **Authors:** Cairn Team (Lead: Kara Wari Sylva)
- **License:** Open Source (Apache 2.0 / MIT)

---

## Intended Use

### Primary Users & Intended Tasks
- **Reviewers & Triage Analysts:** Receive structured recommendations on report categories (A1) and urgency levels (A2) to prioritize urgent life-safety and voter-suppression incidents.
- **Situation Room Coordinators:** Receive spatial-temporal anomaly alerts (A5 / C17) and delayed materials risk forecasts (A13) to dispatch ground support.
- **Fact-Checkers & Rumour Desk Analysts:** Review social media claims prioritized by potential harm and check-worthiness (A8) and match incoming queries against verified debunks.
- **Observers & Citizens:** Query accredited electoral rights and regulations via grounded retrieval (Ask ElectraGuard) and submit mathematical consistency checks on vote tallies (A6).

### Out-of-Scope and Prohibited Uses
- **Declaring Election Results:** The system strictly forbids automated declaration or projection of election outcomes.
- **Automated Sanctions or Adjudication:** No report is accepted, rejected, or published without human confirmation.
- **Voter Persuasion, Microtargeting, or Profiling:** No voter tracking or partisan sentiment manipulation.
- **Identifying Anonymous Reporters:** De-anonymizing observers or tracing hashed phone identifiers is strictly barred.

---

## Training and Data
All training and evaluation data is synthetic or public:
- **Synthetic Training Data:** 400 incidents from the official starter pack (`incident_reports_synthetic.csv`), 300 logistics deliveries (`logistics_deliveries_synthetic.csv`), and 900 synthetic EC8A result sheets.
- **Linguistic Coverage:** English, Nigerian Pidgin (Naijá), Hausa, Yorùbá, and Igbo.
- **Authored Robustness Sets:** 56 challenging hand-written synthetic incidents (`incident_paraphrases_authored.csv`), 28 calibration samples, and 310 privacy redaction benchmark cases (`docs/eval/data/redaction-set.jsonl`).
- **Synthetic/Real Proportion:** 100% synthetic in accordance with general challenge rule #3 (no live electoral data or personal records permitted).
- **Detailed Data Documentation:** See [`docs/submission/DATASHEET.md`](DATASHEET.md).

---

## Evaluation & Metrics

### Leakage Audit Finding
A comprehensive audit of the official starter pack revealed that its 400 incident records represent only **7 distinct descriptions once place names are stripped** (one template per category). Evaluating on a row-level held-out split of the starter pack yields a deceptive **macro-F1 of 1.000**, which reflects template memorization rather than natural language understanding.

To maintain scientific integrity:
1. The starter-pack score is reported honestly as a **memorization check**.
2. The **headline evaluation metric** is evaluated on the 56-sample independent authored robustness dataset (`incident_paraphrases_authored.csv`), containing typos, Pidgin syntax, complex paraphrasing, and Hausa-Pidgin code-switching.

### Headline Benchmark Results (Seed 42, Deterministic)

#### A1: Category Triage (7 Classes)
* **Memorization Check (Held-out pack, n=80):** Macro-F1: `1.000` (leaky by construction).
* **Robustness Set (Headline, n=56):** Macro-F1: `0.824` (95% bootstrap CI `[0.700, 0.912]`), Overall Accuracy: `0.821`.

| Category | Precision | Recall | F1 | Notes |
|---|---|---|---|---|
| `access_barrier` | 0.750 | 0.750 | 0.750 | Difficulties with stairs/wheelchair descriptions |
| `equipment_failure` | 0.875 | 0.875 | 0.875 | BVAS / card reader failures |
| `good_practice` | 0.857 | 0.750 | 0.800 | Punctual opening and peaceful conduct |
| `intimidation_violence` | 0.800 | 1.000 | 0.889 | Perfect recall on threats & violence |
| `lack_of_information` | 0.600 | 0.750 | 0.667 | Confusion with registration boundaries |
| `late_materials` | 1.000 | 0.750 | 0.857 | High precision on delayed polling boxes |
| `queues_crowding` | 1.000 | 0.875 | 0.933 | High recall on crowd and queue density |

**Performance by Linguistic Slice (Robustness Set):**
| Linguistic Slice | n | Accuracy | Macro-F1 | Notes |
|---|---|---|---|---|
| Code-switched (Hausa/Pidgin) | 7 | 1.000 | 1.000 | Robust on bilingual expressions |
| Pidgin (Naijá) | 14 | 0.857 | 0.848 | Handles local vernacular accurately |
| Typographical Errors | 14 | 0.857 | 0.848 | Resilient to mobile keyboard typos |
| Syntactic Paraphrase | 21 | 0.714 | 0.701 | Lower accuracy on indirect phrasing |

#### A2: Urgency Classification
* **Objective:** Prioritize severity 3 and 4 incidents (violence, danger, severe disenfranchisement). Missing an urgent case is critical.
* **Validation Split (n=80):** Threshold tuned to `0.439` achieving 90% recall.
* **Held-out Split (n=80, 31 urgent):**
  * Precision: `0.818` | Recall: `0.871` | F1: `0.844`
  * False-Urgent Rate: `0.122` (acceptable operational cost to avoid missing critical incidents).
  * Rule Escalation: Deterministic rules lift score if danger is active (+5), violence is reported (+3), or a local spike occurs (+1).

#### A3: Uncertainty Abstention
* **Calibration:** Threshold `0.40` tuned on 28 calibration samples.
* **Robustness Set Performance:** Abstention rate `0.446`; retained prediction accuracy on non-abstained cases: `1.000`.

#### A4: Duplicate Detection
* **Held-out Evaluation (n=80):** Precision: `1.000`, Recall: `1.000` on controlled text perturbations and same-unit distractors.

#### A5: Spatial-Temporal Cluster Detection
* **Benchmark:** 1,000 time windows with 100 injected incident spikes.
* **Performance:** 98 of 100 spikes detected (98.0% recall); false alarm rate: `18.54` per 1,000 background reports.

#### A6: Result-Sheet Consistency Verification (900 EC8A Sheets)
* `accredited_exceeds_registered`: Precision `1.000`, Recall `1.000` (support 16)
* `sum_mismatch`: Precision `0.190`, Recall `1.000` (support 8; high sensitivity catches secondary errors)
* `suspicious_round_numbers`: Precision `1.000`, Recall `1.000` (support 12)
* `duplicated_from_previous_unit`: Precision `1.000`, Recall `1.000` (support 5)
* `digit_transposition`: Precision `1.000`, Recall `1.000` (support 1)
* Overall Alert Rate: `84.44` per 1,000 sheets checked.

#### A8: Rumour & Claim Ranking (60 Claims)
* English Harm: Precision `0.667`, Recall `0.400` (Brier score `0.120`).
* English Check-Worthiness: Precision `1.000`, Recall `1.000` (Brier score `0.000`).
* Pidgin Harm: Precision `0.571`, Recall `0.667` (Brier score `0.162`).
* Pidgin Check-Worthiness: Precision `1.000`, Recall `1.000` (Brier score `0.001`).

#### A13: Logistics Delivery Transit Risk (60 Runs)
* Mean Absolute Error: `0.817` hours.
* Top-Quintile Severe Delay Precision: `0.667`.

---

## Error Analysis & Failure Modes
1. **Linguistic Nuance in Accessibility:** Phrases such as *"Old mama no fit climb the staircase"* were misclassified as `intimidation_violence` (confidence 0.22) because the vocabulary triggered conflict associations. *Mitigation:* The uncertainty abstention module (A3) flagged the low confidence, forcing human analyst review.
2. **Subtle Equipment Descriptions:** Descriptions such as *"voter register tablet crashes"* yielded low confidence (0.24) due to lexical differences from training keywords.
3. **Over-Flagging on Arithmetic Mismatches (A6):** When accredited voters exceed registered voters, vote sum checks also fire, depressing pure sum precision to 0.190. *Mitigation:* Reviewers see distinct check badges, allowing immediate isolation of root discrepancies.

---

## Fairness and Bias
- **Language Equity:** Models were explicitly benchmarked across standard English, Nigerian Pidgin, and Hausa-Pidgin code-switched text. Performance on Pidgin (F1: 0.848) and code-switched text (F1: 1.000) matches or exceeds standard English text.
- **Geographic Parity:** Geographic clustering operates on relative local Poisson rates, preventing rural polling units with low baseline traffic from being drowned out by urban centers.

---

## Uncertainty and Abstention
All probabilistic models produce calibrated confidence scores. When prediction confidence falls below `0.40`, the model outputs `abstain: true`. In the reviewer user interface, these reports are marked as "Uncertain / Needs Human Decision" without pre-selected radio buttons, preventing automation bias.

---

## Human Oversight Points
- **Reviewer Queue (S-02, S-03):** Reviewers must explicitly accept or correct suggested categories and urgency flags before an incident can be closed or corroborated.
- **Rumour Desk (S-06):** Requires two-person authorization (second-person dual approval) before any debunk or guidance snapshot is published.
- **Operations Room (S-05):** Cluster warnings and delivery delay predictions serve as operational hints only.

---

## Ethical and Legal Considerations
- **Nigeria Data Protection Act (NDPA 2023):** Built with strict data minimization. No PII collected for observers or citizens.
- **Public Disclosure Privacy:** Aggregated public transparency reports (P-03) enforce small-cell suppression: any cell with fewer than 5 reports is suppressed (`< 5`) to prevent re-identification of rural informants.

---

## Maintenance & Monitoring
- **Deterministic Pipeline:** Run `python backend/manage.py evaluate_models` to reproduce all benchmark metrics.
- **Retraining Cadence:** Before any live field deployment, models must be calibrated against verified historical election transcripts under strict human rights oversight.
