# Datasheet: Datasets Used in ElectraGuard AI

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Date:** 2026-11-26  
**Status:** Prototype

> **In plain words:** Every piece of data used to train and test ElectraGuard AI is synthetic. Most of it is the hackathon's own starter pack. The team added small hand-written sets to test Nigerian Pidgin, Hausa-Pidgin mixing, typing mistakes and automatic privacy redaction. No real voter names, phone numbers or ballots were collected or stored.

---

The datasets used for development, training and evaluation:
1. The hackathon synthetic starter pack
2. The hand-written paraphrase set (training, calibration and robustness rows)
3. The 900-unit reference areas
4. The synthetic result sheets (Form EC8A)
5. The redaction benchmark
6. The surge-detection simulation

---

# Dataset 1: Hackathon Synthetic Starter Pack

Files are in `data/synthetic/` and are unmodified (see `data/synthetic/README.md` and `DATA_DICTIONARY.md`).

## Motivation
Provided by the #AI4Elections organisers (Rise Networks) as realistic but fictional data for building election-observation tools without real personal records.

## Composition
- `incident_reports_synthetic.csv`: 400 incidents. Fields: `incident_id`, `timestamp` (fictional dates in 2030), `state`, `lga`, `pu_id`, `category`, `description`, `severity_0_4` (0 to 4), `reporter_type`, `verified`, `has_photo_evidence`.
- `polling_units_synthetic.csv`: 900 synthetic polling units (`SIM-00001` to `SIM-00900`) across 20 states and 60 invented LGAs (45 units per state). Fields: `pu_id`, `zone`, `state`, `lga`, `ward`, `settlement`, `registered_voters`, `accessible_venue`, `has_grid_power`, `network_coverage`, `distance_to_lga_hq_km`.
- `logistics_deliveries_synthetic.csv`: 300 delivery records (`pu_id`, `lga`, `distance_km`, `settlement`, `vehicle`, `dispatch_hour`, `transit_hours`, `materials_complete`).
- `misinformation_claims_synthetic.jsonl`: 300 claims (also copied to `docs/eval/data/`).
- Also in the pack: `results_synthetic.csv` and `anomaly_labels_HELD_OUT.csv` (Dataset 4).
- **Incident categories in the pack** (the models use renamed labels): logistics_delay 69, positive_practice 60, intimidation 56, accessibility_barrier 56, information_gap 56, equipment_failure 54, queue_management 49.
- **Personal data:** none. All records are fictional.

## Uses and limits
Used for training and for the held-out split. Not suitable for judging accuracy on real text, because the 400 incidents share only **7 distinct sentences** once place names are removed.

## Licence and source
Creative Commons Attribution 4.0 (CC BY 4.0), from the official #AI4Elections starter pack (Rise Networks).

---

# Dataset 2: Hand-written Paraphrase Set

## Motivation
Written by the Cairn team to test what the starter pack cannot: paraphrases, spelling mistakes, Nigerian Pidgin, and Hausa-Pidgin mixing.

## Composition
`data/synthetic/incident_paraphrases_authored.csv`, 140 rows with columns `split`, `kind`, `category`, `description`:
- `train` (56 rows, kind paraphrase): used in training.
- `calibration` (28 rows): used only to choose the abstention threshold (0.40).
- `robustness` (56 rows): never used for training, tuning or calibration. It is the headline benchmark: paraphrase 21, pidgin 14, typo 14, code_switched 7.
- **Personal data:** none. All text is synthetic.

## Limits
56 benchmark rows are enough for a bootstrap interval but are small. The authors of the training and benchmark rows share vocabulary with the pack, so real text will likely score lower. The code-switched slice has only 7 rows. The rows were written by the team; no independent annotation was done.

## Licence
Released with the repository under its MIT licence (`LICENSE`).

---

# Dataset 3: Reference Areas (900 units)

## Composition
`data/reference/official-synthetic-areas.json` holds the same 900 synthetic polling units grouped as 20 states, 3 LGAs per state, wards and units. It is loaded into the reference tables by `python backend/manage.py load_reference_areas` and used for place search, validation, check-ins and coverage. `data/reference/synthetic-areas.json` is a smaller fixture for tests. The bundled data has no coordinates.

State names are real; LGA and ward names are invented labels (`data/synthetic/DATA_DICTIONARY.md`). The national totals quoted elsewhere (774 LGAs, 176,846 polling units) are INEC's and are not part of this data.

## Personal data
None.

---

# Dataset 4: Synthetic Result Sheets (Form EC8A)

## Composition
- `data/synthetic/results_synthetic.csv`: 900 rows with `pu_id`, `registered_voters`, `accredited_voters`, `votes_A` to `votes_E` (party labels A to E, not real parties) and `rejected_votes`.
- `data/synthetic/anomaly_labels_HELD_OUT.csv`: the answer key, used only for evaluation. Injected anomalies: `accredited_exceeds_registered` 16, `suspicious_round_numbers` 12, `sum_mismatch` 8, `duplicated_from_previous_unit` 5, `digit_transposition` 1 (42 of 900 sheets).

## Use
Evaluating the result-sheet consistency checks (`backend/reports/result_checks.py`). Outputs carry the label "Consistency check for review. This is not a result."

---

# Dataset 5: Redaction Benchmark

## Composition
`docs/eval/data/redaction-set.jsonl`: 308 hand-written items in English, Nigerian Pidgin, Hausa, Yoruba and Igbo, with 430 labelled personal details (phone numbers, names, VIN, NIN, BVN, emails, account numbers, addresses) and more than 83 ordinary election sentences with nothing to redact. All numbers and names are fictitious.

## Use
Scoring the redactor (`scripts/eval/redaction.py`; results in `docs/eval/redaction.md`). Tokens look like `[PHONE_a1b2]`.

---

# Dataset 6: Surge-Detection Simulation

## Composition
Generated by `scripts/eval/emerging_alerts.py` in a throwaway test database from the 900 synthetic polling units (60 LGAs, 20 states): one 900-unit polling-day stream (07:00 to 17:00) with **20 planted surges** (4 to 15 reports over 15 to 60 minutes), and **10 independent quiet days** (80 evaluation hours in total) for counting false alarms. Aggregate counts only; no personal data.

## Use
Comparing the statistical detector with the previous fixed threshold (`docs/eval/emerging-alerts.md`).
