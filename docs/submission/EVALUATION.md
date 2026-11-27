# Evaluation Report: ElectraGuard AI

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Date:** 2026-11-26  
**Status:** Prototype

> **In plain words:** ElectraGuard AI was tested on hand-written cases that are harder than the repetitive starter-pack templates. The category classifier scored 0.824 macro-F1 on 56 hand-written examples with paraphrases, typos, Pidgin and Hausa-Pidgin mixing (Pidgin slice 0.848 on 14 examples; code-switched slice 1.000 on only 7). The privacy engine found 96.3% of personal details and 99.8% of what it replaced was correct, on 308 hand-written items in five languages. The statistical surge detector cut false alarms from 120.33 to 0.39 per hour, but it also detected fewer planted surges (65%, against 100% for the old fixed threshold). All data is synthetic, so none of these numbers predicts accuracy on real reports.

---

## 1. Objective and Success Criteria

In accordance with the Track 5 technical brief, ElectraGuard AI was evaluated against three core operational benchmarks:
1. **Triage Accuracy & Urgency Prioritization (5B):** High classification accuracy on multi-class incidents and high recall on urgent threats (severity 3/4) to prevent life-safety incidents from lingering in backlogs.
2. **Robustness across Nigerian Multilingual Realities (Track 3):** Performance parity across standard English, Nigerian Pidgin (Naijá), Hausa-Pidgin code-switching, and typographically noisy mobile inputs.
3. **Forensic Integrity & Human Review Efficiency (5C, Track 2, Track 4):** Accurate duplicate clustering, high detection rates on spatial anomalies, and high sensitivity on mathematical result-sheet anomalies without overwhelming review staff.
4. **Data Privacy & Operational Surveillance (C16, C17, C18):** Redaction of personal details, a low false-alarm rate on volume surges, and review clocks (the clocks are covered by unit tests, not by a measured benchmark).

---

## 2. Test Data and Leakage Audit

### 2.1 Held-Out Partitioning
All evaluations use a strictly deterministic evaluation pipeline with **Seed 42** for every split, model, and bootstrap run (`python backend/manage.py evaluate_models`). Splits group by `incident_id`:
- **Training:** the starter-pack incidents outside the validation and held-out splits (240 of 400), de-duplicated to the 7 distinct templates, plus 56 hand-written paraphrases (the `train` rows of `data/synthetic/incident_paraphrases_authored.csv`).
- **Validation split:** 80 incidents, used to choose the urgency threshold (0.439).
- **Held-out test split:** 80 incidents (20%) from the synthetic starter pack.
- **Calibration:** 28 hand-written examples (the `calibration` rows) used to choose the abstention threshold (0.40).
- **Independent robustness benchmark:** 56 hand-written examples (the `robustness` rows) never used for training, tuning or calibration.

### 2.2 Leakage Audit Findings
A thorough lexical audit of the official 400-incident pack demonstrated that once geographic place names are normalized, only **7 unique description sentences exist** across the entire dataset (one template per category). Consequently:
- Evaluating a row-level split of the starter pack measures template memorization rather than natural language understanding (yielding a deceptive **macro-F1 of 1.000**).
- We report the starter-pack score strictly as a **memorization check**.
- The **headline evaluation metric** reported throughout our submission is based on the 56-sample authored robustness dataset.

---

## 3. Baselines

We compare our calibrated multi-task system against standard operational baselines:
- **Urgency before rules were added:** the first text-only urgency model had recall of 3.2% on severity 3 or 4 incidents (recorded in `docs/reviews/2026-11-23-backend-ai-sms-slice.md`). The rules and the validation-chosen threshold below fixed that.
- **Surge detection:** compared with the previous fixed threshold (2x the 7-period average, minimum 3), see section 4.9.
- No majority-class or keyword baseline was measured for category triage, so none is reported.

---

## 4. Empirical Results

### 4.1 Category Triage (A1)
- **Memorization Check (Held-out pack, n=80):** Category Macro-F1: `1.000` (leaky by construction).
- **Robustness Benchmark (Headline, n=56):** Category Macro-F1: `0.824` (95% bootstrap confidence interval: `0.700` – `0.912`); Overall Accuracy: `0.821`.

**Per-Category Performance on Robustness Benchmark:**
| Category | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| `access_barrier` | 0.750 | 0.750 | 0.750 | 8 |
| `equipment_failure` | 0.875 | 0.875 | 0.875 | 8 |
| `good_practice` | 0.857 | 0.750 | 0.800 | 8 |
| `intimidation_violence` | 0.800 | 1.000 | 0.889 | 8 |
| `lack_of_information` | 0.600 | 0.750 | 0.667 | 8 |
| `late_materials` | 1.000 | 0.750 | 0.857 | 8 |
| `queues_crowding` | 1.000 | 0.875 | 0.933 | 8 |

**Confusion Matrix:**
Categories in order: `[access_barrier, equipment_failure, good_practice, intimidation_violence, lack_of_information, late_materials, queues_crowding]`
```
[[6, 0, 0, 1, 1, 0, 0],
 [0, 7, 0, 0, 1, 0, 0],
 [0, 1, 6, 0, 1, 0, 0],
 [0, 0, 0, 8, 0, 0, 0],
 [1, 0, 0, 1, 6, 0, 0],
 [1, 0, 0, 0, 1, 6, 0],
 [0, 0, 1, 0, 0, 0, 7]]
```

### 4.2 Urgency Classification (A2)
Missing an urgent case carries high democratic and human safety costs. The model threshold was calibrated on the validation split at `0.439` to achieve 90% recall. In addition, rules add to the score: danger reported now (+5), category intimidation or violence (+3), a high severity probability from the text model (+3), and firsthand, evidence attached and local spike (+1 each). A score of 3 or more is urgent and 2 is high.

| Split | n | Urgent Cases | Precision | Recall | F1 | False-Urgent Rate |
|---|---|---|---|---|---|---|
| Validation Split | 80 | 40 | 0.947 | 0.900 | 0.923 | 0.050 |
| Held-out Incidents | 80 | 31 | 0.818 | 0.871 | 0.844 | 0.122 |

**Urgency Recall by Incident Category (Held-out Split):**
- `access_barrier` (n=11, 10 urgent): Recall `1.000` (11 flagged)
- `equipment_failure` (n=9, 5 urgent): Recall `1.000` (9 flagged)
- `intimidation_violence` (n=12, 12 urgent): Recall `1.000` (12 flagged)
- `lack_of_information` (n=10, 3 urgent): Recall `0.000` (1 flagged)
- `late_materials` (n=9, 1 urgent): Recall `0.000` (0 flagged)
*Note on Misses:* The missed urgent incidents in `lack_of_information` and `late_materials` shared identical text templates with non-urgent incidents in the starter pack (e.g., identical wording assigned severity 1 vs severity 3). The false-urgent rate of 0.122 is the price of the recall reached (0.871 overall; 1.000 within the access, equipment and intimidation categories on this split).

### 4.3 Uncertainty Abstention (A3)
- Calibrated confidence threshold: `0.40` (tuned on 28 calibration samples).
- On the 56-sample robustness set:
  - Abstention Rate: `0.446` (44.6% of noisy/complex samples referred for manual triage).
  - Retained Accuracy: **`1.000`** (100% of non-abstained predictions were correct).

### 4.4 Spatial Cluster Detection (A5)
- Stream simulation: 1,000 time windows with 100 synthetic injected anomaly spikes.
- Spike Detection Recall: **`98.0%`** (98 of 100 spikes detected).
- False Alarm Rate: `18.54` false alarms per 1,000 background reports.

### 4.5 Result-Sheet Mathematical Anomalies (A6, 900 EC8A Returns)
- `accredited_exceeds_registered`: Precision `1.000`, Recall `1.000` (support 16)
- `sum_mismatch`: Precision `0.190`, Recall `1.000` (support 8)
- `suspicious_round_numbers`: Precision `1.000`, Recall `1.000` (support 12)
- `duplicated_from_previous_unit`: Precision `1.000`, Recall `1.000` (support 5)
- `digit_transposition`: Precision `1.000`, Recall `1.000` (support 1)
- Overall Anomaly Alert Rate: `84.44` alerts per 1,000 sheets.

### 4.6 Rumour Desk Claim Ranking (A8, 60 Claims)
- English Harm: Precision `0.667`, Recall `0.400` (Brier score: `0.120`).
- English Check-Worthiness: Precision `1.000`, Recall `1.000` (Brier score: `0.000`).
- Nigerian Pidgin Harm: Precision `0.571`, Recall `0.667` (Brier score: `0.162`).
- Nigerian Pidgin Check-Worthiness: Precision `1.000`, Recall `1.000` (Brier score: `0.001`).

### 4.7 Logistics Delivery Transit Delay Risk (A13, 60 Deliveries)
- Mean Absolute Error (MAE): **`0.817` hours**.
- Top-Quintile Severe Delay Precision: **`0.667`**.

### 4.8 Automated Privacy Redaction (C16, 308 Benchmark Items)
- **Dataset:** 308 hand-authored items (`docs/eval/data/redaction-set.jsonl`) containing 430 target personal details across English, Pidgin, Hausa, Yoruba and Igbo, including 83 or more ordinary election sentences with nothing to redact.
- **Token Detection Recall:** **`96.3%`** (414 / 430 target PII entities correctly identified and replaced).
- **Token Replacement Precision:** **`99.8%`** (414 / 415 replacements valid; the one false positive wrapped a street address with the word "block").
- **Weakest kinds:** bank account numbers (recall 87.5%, 5 missed) and names (92.4%, 10 missed, all of them the same two names repeated across the five languages). Phone, NIN, BVN, VIN and email were all found (100%). Full miss list: `docs/eval/redaction.md`.
- **Sanitization Coverage:** Automated redaction protects incident narratives, observer review event notes (MESSAGE, RESPOND), and citizen conversation replies. The raw original text can be fetched only through contract CASE-06 by the assigned reviewer, with a written reason, and each use is written to the audit record.

### 4.9 Emerging Volume Anomaly & Surge Detection (C17, 60 LGAs, 900 units)
- **Methodology:** Poisson tests over 30- and 60-minute windows with Benjamini-Hochberg control (q = 0.05) and a one-sided CUSUM (`backend/ops/emerging.py`).
- **Surge Detection Rate:** **`65.0%`** (13 of 20 planted surges detected; the old fixed threshold detected 20 of 20).
- **Median Time to Detect:** **`19 minutes`** (the old threshold: 9 minutes).
- **False Alarm Rate:** **`0.39` false alarms per hour** (31 warnings over 80 quiet evaluation hours: 10 independent quiet days of 8 hours).
- **Comparison to the old threshold:** The old fixed-threshold detector produced 9,626 warnings, **`120.33` false alarms per hour**, on the same quiet days. The statistical detector is a 99.7% reduction in false alarms, but it misses more surges. Source: `docs/eval/emerging-alerts.md`.

### 4.10 Review Clocks (C18)
- **What they do:** the server keeps a clock per active case with a target (urgent 15 minutes, high 60, normal 240, low 480, reply to a reporter 120; configurable per organisation). A clock is on time, due soon (25% or less left) or overdue. A sweep (`sweep_review_clocks` in `backend/clocks/sweep.py`) raises one alert per overdue clock.
- **Evidence:** unit tests in `backend/clocks/tests.py`. There is no benchmark, so no accuracy figure is reported. The staff screens in this build do not show a countdown.

---

## 5. Human-in-the-Loop Impact

1. **Reviewer Workload Reduction:** Automatic near-duplicate clustering (A4) collapses redundant incident filings with 1.000 precision and recall on 80 held-out text perturbations plus one same-unit distractor. These are proxy cases built from the same templates, not independently labelled real duplicates, so the figure says little about real reports.
2. **Alert Frequency:** The result-sheet check raises about 84 alerts per 1,000 sheets on the synthetic set. No staffing estimate was measured.
3. **Second-person approval on rumour replies:** A reply drafted by one coordinator must be approved by another before the public sees it (`backend/rumours/views.py`).

---

## 6. Linguistic & Dialectal Robustness

Evaluation across text genres on the 56-sample authored robustness benchmark demonstrates strong multi-dialectal performance:

| Linguistic Slice | n | Accuracy | Macro-F1 | Notes |
|---|---|---|---|---|
| **Code-switched (Hausa / Pidgin)** | 7 | 1.000 | 1.000 | *"Line don long, mutane suna jira..."* classified accurately |
| **Nigerian Pidgin (Naijá)** | 14 | 0.857 | 0.848 | High fidelity on informal vernacular |
| **Mobile Typographical Errors** | 14 | 0.857 | 0.848 | Resilient to skipped vowels and double keys |
| **Syntactic Paraphrase** | 21 | 0.714 | 0.701 | Lower performance on subtle, indirect phrasing |

---

## 7. Usability & Accessibility

- **Automated accessibility checks:** the real-server browser tests include an axe scan of the observer flow (`frontend/e2e/observer-real/08-accessibility.spec.ts`). Earlier review notes (`docs/reviews/2026-11-23-*.md`) record 0 serious and 0 critical findings on observer, staff and public screens of the previous build. The final design has not been re-scanned for this document, and automated scans do not prove WCAG conformance.
- **Phone width:** earlier review notes record no horizontal overflow at 360 px.
- **First-load size:** under 300 KB is a design target (`docs/design/design-contract.md`). It was reported for earlier builds of the public pages and has not been re-measured on the current design. No 2G test was run.
- **Contrast:** `npm run check:contrast` in `frontend/` checks the colour pairs in the design tokens.

---

## 8. Failure Case Analysis

### Documented Failure Examples
1. **Linguistic Cross-Talk (`access_barrier` misclassified as `intimidation_violence`):**
   - *Input:* *"Old mama no fit climb the staircase to vote, dem send her go house."* (Pidgin)
   - *True Label:* `access_barrier` | *Predicted:* `intimidation_violence` | *Confidence:* `0.22`
   - *Fix:* Calibrated abstention (A3) intercepted this prediction (confidence < 0.40) and referred it to manual human review.
2. **Ambiguous Information Gaps:**
   - *Input:* *"Faulty equipment at this station is holding up the voting process."*
   - *True Label:* `equipment_failure` | *Predicted:* `lack_of_information` | *Confidence:* `0.19`
   - *Fix:* Abstention intercepted the erroneous recommendation.
3. **Urgency Misses on Identical Description Text:**
   - Incidents `INC-0031`, `INC-0115` and `INC-0182` (severity 3, information gap) and `INC-0043` (severity 3, logistics delay) were missed because the starter pack gives the same text different severities (information gaps run from 1 to 3), so no text model can separate them.
   - *Mitigation:* rules raise urgency when the reporter says someone is in danger now or the category is intimidation or violence, whatever the text model predicts.

---

## 9. Reproducibility

To re-run the entire deterministic evaluation suite from the repository root:
```bash
python backend/manage.py evaluate_models
```
- **Configuration:** Random Seed `42`, deterministic split grouping by `incident_id`.
- **Environment:** Python 3.12 and PostgreSQL 17 (the version used in CI). The command writes `docs/eval/results.md`.
