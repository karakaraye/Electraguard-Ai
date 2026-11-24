# Evaluation Report: ElectraGuard AI

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Date:** 2026-11-24  
**Status:** Prototype

---

## 1. Objective and Success Criteria

In accordance with the Track 5 technical brief, ElectraGuard AI was evaluated against three core operational benchmarks:
1. **Triage Accuracy & Urgency Prioritization (5B):** High classification accuracy on multi-class incidents and high recall on urgent threats (severity 3/4) to prevent life-safety incidents from lingering in backlogs.
2. **Robustness across Nigerian Multilingual Realities (Track 3):** Performance parity across standard English, Nigerian Pidgin (Naijá), Hausa-Pidgin code-switching, and typographically noisy mobile inputs.
3. **Forensic Integrity & Human Review Efficiency (5C, Track 2, Track 4):** Accurate duplicate clustering, high detection rates on spatial anomalies, and high sensitivity on mathematical result-sheet anomalies without overwhelming review staff.

---

## 2. Test Data and Leakage Audit

### 2.1 Held-Out Partitioning
All evaluations use a strictly deterministic evaluation pipeline with **Seed 42** for every split, model, and bootstrap run (`python backend/manage.py evaluate_models`). Splits group by `incident_id`:
- **Training Set (55%):** 240 pack incidents + 7 de-duplicated core templates + 56 training augmentations.
- **Validation Set (25%):** 80 incidents used exclusively for tuning thresholds (e.g., urgency threshold 0.439, abstention cutoff 0.40).
- **Held-out Test Split (20%):** 80 incidents from the synthetic starter pack.
- **Independent Robustness Benchmark:** 56 hand-written, synthetic examples (`incident_paraphrases_authored.csv`) that were **never** used during training, tuning, or threshold calibration.

### 2.2 Leakage Audit Findings
A thorough lexical audit of the official 400-incident pack demonstrated that once geographic place names are normalized, only **7 unique description sentences exist** across the entire dataset (one template per category). Consequently:
- Evaluating a row-level split of the starter pack measures template memorization rather than natural language understanding (yielding a deceptive **macro-F1 of 1.000**).
- We report the starter-pack score strictly as a **memorization check**.
- The **headline evaluation metric** reported throughout our submission is based on the 56-sample authored robustness dataset.

---

## 3. Baselines

We compare our calibrated multi-task system against standard operational baselines:
- **Baseline 1 (Majority Class / Heuristic Rule):** Predicts the most frequent class (`late_materials`) or flags urgency only on explicit keyword matches (`"gun"`, `"fight"`). Yields an incident macro-F1 of `0.245` and urgent recall of `0.420`.
- **Baseline 2 (Uncalibrated Standard Classifier):** Prior models achieved high precision but an unacceptable urgency recall of only **3.2%** on severity 3/4 cases, missing almost all urgent incidents.

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
Missing an urgent case carries high democratic and human safety costs. The model threshold was calibrated on the validation split at `0.439` to achieve 90% recall. In addition, deterministic heuristics elevate the score if active danger (+5), violence (+3), or a local spike (+1) is detected (score >= 3 is urgent).

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
*Note on Misses:* The missed urgent incidents in `lack_of_information` and `late_materials` shared identical text templates with non-urgent incidents in the starter pack (e.g., identical wording assigned severity 1 vs severity 3). The false-urgent rate of 0.122 is the necessary trade-off to guarantee 100% recall on physical violence, access barriers, and equipment breakdowns.

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

---

## 5. Human-in-the-Loop Impact

1. **Reviewer Workload Reduction:** Automatic near-duplicate clustering (A4) collapses redundant incident filings with **1.000 precision and recall** on synthetic distractor sets, eliminating up to 40% of duplicate review overhead.
2. **Alert Frequency:** The result-sheet anomaly detector flags approximately 84 sheets per 1,000, allowing a review team of 5 auditors to monitor 50,000 polling unit returns effectively.
3. **Dual-Authorization on Rumours:** The Rumour Desk (S-06) enforces second-person dual sign-off, ensuring no individual reviewer can unilaterally publish or dismiss public misinformation warnings.

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

## 7. Usability & Accessibility Testing

- **Automated Axe Audits:** 0 serious and 0 critical accessibility violations across all Observer, Staff, and Public screens.
- **Viewport Resilience:** 0 horizontal scrolling overflow detected on 360 px mobile viewports.
- **Payload & Network Efficiency:** First load server-rendered bundle under 300 KB, functioning smoothly on simulated 2G cellular connections.
- **High Contrast Assurance:** Text contrast strictly complies with WCAG 2.2 AA standards (body text over soft background art exceeds 7:1; secondary text exceeds 4.5:1).

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
   - Incident `INC-0031` (severity 3, `information_gap`) and `INC-0043` (severity 3, `logistics_delay`) were missed because their textual content was identical to severity 1 incidents in the starter pack.
   - *Mitigation:* Explicit escalation rules trigger urgency whenever danger, weapons, or physical violence keywords appear, regardless of statistical prediction.

---

## 9. Reproducibility

To re-run the entire deterministic evaluation suite from the repository root:
```bash
python backend/manage.py evaluate_models
```
- **Configuration:** Random Seed `42`, deterministic split grouping by `incident_id`.
- **Runtime:** Approximately 12 seconds on standard CPU.
- **Environment:** Python 3.12+, PostgreSQL / SQLite test harness.
