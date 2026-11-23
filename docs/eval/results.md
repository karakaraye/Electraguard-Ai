# Local model evaluation

Seed 42. Grouped splits reserve 20% for testing and use a separate calibration split.

## A1–A3 · Incident triage

Held-out incident IDs: 80. No language field is supplied.

Category macro-F1: 1.000 (95% bootstrap interval 1.000–1.000).

- access_barrier: F1 1.000

- equipment_failure: F1 1.000

- good_practice: F1 1.000

- intimidation_violence: F1 1.000

- lack_of_information: F1 1.000

- late_materials: F1 1.000

- queues_crowding: F1 1.000

Confusion matrix in the category order above: [[11, 0, 0, 0, 0, 0, 0], [0, 9, 0, 0, 0, 0, 0], [0, 0, 14, 0, 0, 0, 0], [0, 0, 0, 12, 0, 0, 0], [0, 0, 0, 0, 10, 0, 0], [0, 0, 0, 0, 0, 9, 0], [0, 0, 0, 0, 0, 0, 15]]

Urgency: precision 1.000, recall 0.032, support 31; false-urgent rate 0.000.

High or urgent: precision 0.950, recall 0.613, support 31.

Danger, firsthand and cluster labels are unavailable in this dataset.

Abstention: threshold 0.40, rate 0.000, retained accuracy 1.000.

Incorrect or abstained example IDs: none

Missed high-severity example IDs: INC-0016, INC-0031, INC-0034, INC-0043, INC-0056

## A4 · Duplicate similarity

Held-out text perturbations and 1 same-unit distractors: precision 1.000, recall 1.000, support 80. These are proxy cases, without independently labeled paraphrases.

## A5 · Cluster detector

Seeded stream of 1,000 windows with 100 injected spikes: 99/100 detected, 19.19 false alarms per 1,000 background reports.

## A6 · Result-sheet anomalies

Evaluation-only label set: 900 sheets.

- accredited_exceeds_registered: precision 1.000, recall 1.000, support 16

- sum_mismatch: precision 0.190, recall 1.000, support 8

- suspicious_round_numbers: precision 1.000, recall 1.000, support 12

- duplicated_from_previous_unit: precision 1.000, recall 1.000, support 5

- digit_transposition: precision 1.000, recall 1.000, support 1

Alerts per 1,000 sheets: 84.44.

Disagreements: SIM-00004 (label accredited_exceeds_registered, flags accredited_exceeds_registered, sum_mismatch), SIM-00068 (label accredited_exceeds_registered, flags accredited_exceeds_registered, sum_mismatch), SIM-00078 (label duplicated_from_previous_unit, flags sum_mismatch, duplicated_from_previous_unit), SIM-00087 (label digit_transposition, flags sum_mismatch, digit_transposition), SIM-00103 (label accredited_exceeds_registered, flags accredited_exceeds_registered, sum_mismatch)

## A8 · Claim ranking

Held-out claim IDs: 60. Targets proxy harm and check-worthiness from veracity and reach.

- en harm: precision 0.667, recall 0.400, support 10; Brier score 0.120.

- en check_worthiness: precision 1.000, recall 1.000, support 29; Brier score 0.000.

- pcm harm: precision 0.571, recall 0.667, support 6; Brier score 0.162.

- pcm check_worthiness: precision 1.000, recall 1.000, support 11; Brier score 0.001.

Missed harm example IDs: CLM-0006, CLM-0047, CLM-0064, CLM-0093, CLM-0098

## A13 · Transit risk

Held-out deliveries grouped by unit: 60. MAE 0.817 hours. Top-quintile precision 0.667.

Largest transit errors: SIM-00248 (6.61h actual, 2.34h predicted), SIM-00448 (3.31h actual, 6.09h predicted), SIM-00854 (5.61h actual, 3.04h predicted)
