# Model / System Card: ElectraGuard AI Multi-Component Suite

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Date:** 2026-11-26  
**Status:** Prototype

> **In plain words:** ElectraGuard AI uses transparent, specialized machine learning models and mathematical rules instead of black-box chatbots. These tools suggest incident categories, prioritize urgent threats like violence or polling delays, detect duplicate submissions, and check result sheets for arithmetic that does not add up. The AI never acts on its own: a person decides every case, and the system says it is not confident when its confidence is below 0.40. All figures come from synthetic data and do not predict accuracy on real reports.

---

## Summary
The ElectraGuard AI system is a modular suite of assistive statistical classifiers, rule-based heuristics, privacy engines, and grounded information retrieval models designed to support election observation and civic transparency in Nigeria. It comprises ten intelligence and operational components:
1. **Category Triage (A1):** Calibrated multi-class classification across 7 electoral incident categories.
2. **Urgency Scoring (A2):** Cost-sensitive classifier and deterministic escalation rules prioritizing severity 3/4 threats.
3. **Uncertainty Abstention (A3):** Calibrated confidence gating that abstains and prompts human review when confidence is below 0.40.
4. **Duplicate Detection (A4):** Character 3-gram cosine similarity between reports in the same ward within a 90-minute window (threshold 0.65), shown to the reviewer as candidates.
5. **Cluster Warnings (A5) and Emerging Alerts (C17):** a configurable count-in-window cluster warning, and a Poisson (30 and 60 minute windows, Benjamini-Hochberg q = 0.05) plus one-sided CUSUM detector (`backend/ops`) for abnormal reporting surges.
6. **Result-Sheet Consistency Verification (A6):** Five deterministic checks on Form EC8A transcriptions: accredited above registered, votes plus rejected not equal to accredited, a likely swapped digit, rounded numbers, and numbers identical to another unit.
7. **Automated PII Redaction (C16):** Pattern matching and a curated name list (`backend/privacy`) replacing phone numbers, VIN, NIN, BVN, emails, account numbers, addresses and names with keyed tokens before human review.
8. **Review Clocks (C18):** Deterministic per-case target times and an overdue sweep (`backend/clocks`).
9. **Claim Ranking (A8) and Claim Matching:** a model suggesting check-worthiness and potential harm for logged claims, and matching of public queries against approved answers (`backend/rumours/matching.py`; a multilingual sentence model if installed locally, otherwise word and character TF-IDF).
10. **Late-materials risk (A13):** a gradient-boosted regression of delivery transit time.

- **Model types:** character n-gram TF-IDF with logistic regression (category, urgency, claim ranking), a logistic calibrator, gradient-boosted regression (transit time), Poisson and CUSUM statistics, and deterministic rules.
- **Version:** 1.0.0
- **Date:** 2026-11-26
- **Authors:** Cairn Team (Lead: Kara Wari Sylva)
- **License:** MIT (see `LICENSE`)

---

## Intended Use

### Primary Users & Intended Tasks
- **Reviewers & Triage Analysts:** Receive structured recommendations on report categories (A1) and urgency levels (A2) to prioritize urgent life-safety and voter-suppression incidents.
- **Situation Room Coordinators:** Receive spatial-temporal anomaly alerts (A5 / C17) and delayed materials risk forecasts (A13) to dispatch ground support.
- **Fact-Checkers & Rumour Desk Analysts:** Review social media claims prioritized by potential harm and check-worthiness (A8) and match incoming queries against verified debunks.
- **Observers & Citizens:** Ask questions that are answered only from approved guides ("Ask ElectraGuard", with the source shown), and transcribe result sheets, which are checked for consistency (A6).

### Out-of-Scope and Prohibited Uses
- **Declaring Election Results:** The system strictly forbids automated declaration or projection of election outcomes.
- **Automated Sanctions or Adjudication:** No report is accepted, rejected, or published without human confirmation.
- **Voter Persuasion, Microtargeting, or Profiling:** No voter tracking or partisan sentiment manipulation.
- **Identifying Anonymous Reporters:** Not a supported use. The system stores phone numbers only as keyed hashes and has no feature to reverse them.

---

## Training and Data
All training and evaluation data is synthetic or public:
- **Synthetic training data:** 400 incidents (`data/synthetic/incident_reports_synthetic.csv`), 300 logistics deliveries (`logistics_deliveries_synthetic.csv`) and 300 claims; 900 synthetic result sheets are used to evaluate the result-sheet checks.
- **Linguistic Coverage:** English, Nigerian Pidgin (Naijá), Hausa, Yorùbá, and Igbo.
- **Hand-written sets:** `data/synthetic/incident_paraphrases_authored.csv` (56 training, 28 calibration and 56 robustness rows) and 308 redaction benchmark items (`docs/eval/data/redaction-set.jsonl`).
- **Synthetic/Real Proportion:** 100% synthetic in accordance with general challenge rule #3 (no live electoral data or personal records permitted).
- **Detailed Data Documentation:** See [`docs/submission/DATASHEET.md`](DATASHEET.md).

---

## Evaluation & Metrics

### Leakage Audit Finding
A comprehensive audit of the official starter pack revealed that its 400 incident records represent only **7 distinct descriptions once place names are stripped** (one template per category). Evaluating on a row-level held-out split of the starter pack yields a deceptive **macro-F1 of 1.000**, which reflects template memorization rather than natural language understanding.

To maintain scientific integrity:
1. The starter-pack score is reported honestly as a **memorization check**.
2. The **headline evaluation metric** is evaluated on the 56-sample independent authored robustness dataset (the `robustness` rows of `data/synthetic/incident_paraphrases_authored.csv`), containing typos, Pidgin syntax, paraphrasing, and Hausa-Pidgin code-switching.

### Headline Benchmark Results (Seed 42, Deterministic)

#### A1: Category Triage (7 Classes)
* **Memorization check (held-out pack, n=80):** macro-F1 `1.000` (leaky by construction; not a measure of accuracy).
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
  * Rule escalation: rules lift the score for danger reported now (+5), category intimidation or violence (+3), a high text-model severity (+3), and firsthand, evidence and local spike (+1 each).

#### A3: Uncertainty Abstention
* **Calibration:** Threshold `0.40` tuned on 28 calibration samples.
* **Robustness Set Performance:** Abstention rate `0.446`; retained prediction accuracy on non-abstained cases: `1.000`.

#### A4: Duplicate Detection
* **Held-out evaluation (n=80):** precision `1.000`, recall `1.000` on controlled text perturbations and one same-unit distractor. These are proxy cases built from the same templates, so the figure says little about real reports.

#### A5: Cluster Detector
* **Benchmark:** a seeded stream of 1,000 windows with 100 injected spikes.
* **Performance:** 98 of 100 spikes detected; false alarms: `18.54` per 1,000 background reports.

#### C17: Emerging Alerts (Poisson + CUSUM)
* 13 of 20 planted surges detected (65%; the old fixed threshold: 20 of 20), median time to detect 19 minutes, 0.39 false alarms per hour (the old threshold: 120.33). Source: `docs/eval/emerging-alerts.md`.

#### C16: Redaction
* Recall 96.3% (414 of 430), precision 99.8% (414 of 415) on 308 items in five languages. Weakest: bank account numbers (87.5%) and names (92.4%). Source: `docs/eval/redaction.md`.

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

#### A13: Late-Materials Transit Risk (60 held-out deliveries, grouped by unit)
* Mean Absolute Error: `0.817` hours.
* Top-Quintile Severe Delay Precision: `0.667`.

---

## Error Analysis & Failure Modes
1. **Linguistic Nuance in Accessibility:** Phrases such as *"Old mama no fit climb the staircase"* were misclassified as `intimidation_violence` (confidence 0.22) because the vocabulary triggered conflict associations. *Mitigation:* The uncertainty abstention module (A3) flagged the low confidence, forcing human analyst review.
2. **Subtle Equipment Descriptions:** Descriptions such as *"voter register tablet crashes"* yielded low confidence (0.24) due to lexical differences from training keywords.
3. **Over-Flagging on Arithmetic Mismatches (A6):** When accredited voters exceed registered voters, vote sum checks also fire, depressing pure sum precision to 0.190. *Mitigation:* Reviewers see distinct check badges, allowing immediate isolation of root discrepancies.

---

## Fairness and Bias
- **Language equity:** the robustness set was scored by kind of text: paraphrase 0.701, Pidgin 0.848, typo 0.848, code-switched 1.000 (only 7 examples). There is no English-only slice, so no claim is made about parity with English. Hausa, Yoruba and Igbo were not scored for triage; rumour matching is below target for them (`docs/eval/claim-matching.md`).
- **Geography:** the emerging-alert detector compares each LGA with its own earlier baseline and with peer LGAs instead of one national threshold. Fairness between urban and rural areas has not been evaluated.

---

## Uncertainty and Abstention
The category model produces a confidence score. When it falls below `0.40`, the model abstains. In the reviewer screen the suggestion card then says "No suggestion: not confident enough." and the reviewer decides from the report.

---

## Human Oversight Points
- **Case review (S-03):** suggestions are shown as "Suggested, not decided" and the reviewer chooses Accept or Correct. Closing a case needs an outcome and a written rationale from the reviewer.
- **Rumour Desk (S-06):** a reply drafted by one coordinator must be approved by a different coordinator before the public can see it.
- **Operations Room (S-05):** Cluster warnings and delivery delay predictions serve as operational hints only.

---

## Ethical and Legal Considerations
- **Nigeria Data Protection Act (NDPA 2023):** designed around data minimisation. Names, emails and phone numbers are not requested from observers or citizens, and phone numbers sent by SMS or USSD are stored only as keyed hashes. No formal legal review has been done.
- **Public Disclosure Privacy:** Aggregated public transparency reports (P-03) enforce small-cell suppression: any cell with fewer than 5 reports is suppressed (`< 5`) to prevent re-identification of rural informants.

---

## Maintenance & Monitoring
- **Deterministic Pipeline:** Run `python backend/manage.py evaluate_models` to reproduce all benchmark metrics.
- **Retraining Cadence:** Before any live field deployment, models must be calibrated against verified historical election transcripts under strict human rights oversight.
