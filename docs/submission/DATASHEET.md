# Datasheet: Datasets Used in ElectraGuard AI

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Date:** 2026-11-26  
**Status:** Prototype

> **In plain words:** Every piece of data used to train and test ElectraGuard AI is completely synthetic or drawn from public administrative boundaries. No real voter names, phone numbers, or actual ballots were ever collected or stored. To ensure the platform genuinely understands Nigerian election reporting rather than just memorizing repetitive templates, the team authored independent benchmark sets covering Nigerian Pidgin, Hausa code-switching, mobile keyboard typos, and automated privacy redaction.

---

This document provides datasheets for the core dataset suites utilized during the development, training, and evaluation of ElectraGuard AI:
1. **The Official Hackathon Synthetic Starter Pack**
2. **The Authored Paraphrase and Robustness Dataset**
3. **The 900-Unit Administrative Reference Release**
4. **The Synthetic Result-Sheet (EC8A) Dataset**
5. **The Privacy Redaction Benchmark Suite**
6. **The Volume Surge Surveillance Simulation Dataset**

---

# Dataset 1: Official Hackathon Synthetic Starter Pack

## 1. Motivation
- **Purpose:** Created by the #AI4Elections Hackathon organizers (Rise Networks) to provide realistic, standardized baseline data for training election observation models without exposing real personal or sensitive electoral records.
- **Funding & Creation:** Rise Networks AI Labs / Hackathon Technical Committee.

## 2. Composition
- **Record Types & Counts:**
  - `incident_reports_synthetic.csv`: 400 incident records.
  - `polling_units_synthetic.csv`: 900 synthetic polling units mapped to 3 fictionalized states (Kano, Lagos, Rivers).
  - `logistics_deliveries_synthetic.csv`: 300 logistics dispatch and delivery transit records.
- **Fields in Incidents:** `incident_id`, `description`, `category`, `severity` (1–4), `state`, `lga`, `ward`, `polling_unit_id`, `timestamp`.
- **Class Balance:** Approximately balanced across 7 incident categories: `late_materials` (69), `good_practice` (60), `intimidation_violence` (56), `access_barrier` (56), `lack_of_information` (56), `equipment_failure` (54), and `queues_crowding` (49).
- **Personal / Sensitive Data:** **Zero.** All names, phone numbers, and polling units are synthetic and fictionalized.

## 3. Collection Process
- **Method:** Algorithmic synthetic generation using parameterized sentence templates combined with synthetic location placeholders.
- **Timeframe:** November 2026.
- **Licence:** Provided under Creative Commons Attribution 4.0 International (CC BY 4.0) for hackathon participants.

## 4. Preprocessing
- Cleaned whitespace, standardized category naming conventions, and verified schema alignment with backend data contracts (`docs/design/api-contracts.md`).

## 5. Uses
- **Intended Tasks:** Baseline model training, initial schema definition, and pipeline integration testing.
- **Prohibited Uses:** Evaluating real-world natural language generalization (due to template repetition).

## 6. Distribution & Maintenance
- **Hosting:** Track template repository (`Rise-Networks-AI-Labs/-AI4Elections-Hackathon`).
- **Owner:** Hackathon Organizing Committee.

## 7. Known Limitations & Biases
- **Template Repetition:** The 400 incidents share only **7 distinct syntactic templates** once place names are removed. Models trained solely on these records memorise templates rather than understanding natural variations.

---

# Dataset 2: Authored Paraphrase and Robustness Dataset

## 1. Motivation
- **Purpose:** Authored by Team Cairn to serve as a rigorous, independent held-out evaluation benchmark that evaluates real-world linguistic diversity, spelling errors, colloquial phrasing, and Nigerian multilingual communication.
- **Creators:** Team Cairn engineers and language contributors.

## 2. Composition
- **Records:** 56 hand-crafted synthetic incident descriptions (`incident_paraphrases_authored.csv`) and 28 calibration samples (`calibration_heldout.csv`).
- **Slices Represented:**
  - `paraphrase` (21 samples): Semantic reformulations with complex sentence structures.
  - `pidgin` (14 samples): Authentic Nigerian Pidgin (Naijá) vocabulary, idioms, and syntax.
  - `typo` (14 samples): Common mobile keyboard typographical errors and phonetic misspellings.
  - `code_switched` (7 samples): Interleaved Hausa and Nigerian Pidgin phrases commonly used in northern multilingual areas.
- **Personal / Sensitive Data:** Zero. Strictly synthetic narrative descriptions.

## 3. Collection Process
- **Method:** Authored manually by native and fluent speakers reflecting lived polling-unit communication realities.
- **Timeframe:** 22–23 November 2026.
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0).

## 4. Preprocessing
- Label verification by secondary reviewer; standardized lowercase normalization and UTF-8 encoding.

## 5. Uses
- **Intended Tasks:** Held-out testing of model accuracy, macro-F1, error analysis, and uncertainty abstention calibration.
- **Prohibited Uses:** **Never used for training or tuning.** Strictly held out to ensure benchmark integrity.

## 6. Distribution & Maintenance
- **Repository Location:** `backend/intelligence/data/synthetic/incident_paraphrases_authored.csv`.
- **Owner:** Team Cairn.

## 7. Known Limitations
- The dataset comprises 56 records; while sufficient for statistical bootstrap intervals, future work should scale this benchmark to 1,000+ samples covering all 36 Nigerian states.

---

# Dataset 3: 900-Unit Administrative Reference Release

## 1. Motivation
- **Purpose:** To provide a complete administrative spatial hierarchy (State -> LGA -> Ward -> Polling Unit) for validating location validation, spatial cluster detection (A5), and public aggregation maps.
- **Creators:** Compiled from open Nigerian electoral boundary conventions and synthetic starter structures.

## 2. Composition
- **Records:** 900 polling units across Kano, Lagos, and Rivers states.
- **Fields:** `state_code`, `state_name`, `lga_code`, `lga_name`, `ward_code`, `ward_name`, `polling_unit_code`, `polling_unit_name`, `registered_voters`, `latitude`, `longitude`.
- **Class Balance:** Proportional distribution across urban, peri-urban, and rural wards.
- **Personal Data:** None.

## 3. Collection & Licensing
- Open public geographic references; released under CC BY 4.0.

## 4. Uses & Preprocessing
- Ingestion into PostgreSQL spatial reference tables (`backend/reference/models.py`). Used for bounding coordinates and preventing LGA-level geographic leaks in public dashboards.

---

# Dataset 4: Synthetic Result-Sheet (EC8A) Dataset

## 1. Motivation
- **Purpose:** To evaluate the mathematical consistency checker (A6) and OCR field extraction without using physical election return sheets from past elections.
- **Creators:** Generated by Team Cairn's synthetic return generator.

## 2. Composition
- **Records:** 900 synthetic EC8A polling unit return records.
- **Fields:** `polling_unit_code`, `registered_voters`, `accredited_voters`, `ballots_issued`, `ballots_unused`, `ballots_spoiled`, `ballots_rejected`, `party_votes` (Record of party shares), `mathematical_flags`.
- **Injected Anomaly Classes:**
  - `accredited_exceeds_registered` (16 cases)
  - `sum_mismatch` (8 cases)
  - `suspicious_round_numbers` (12 cases)
  - `duplicated_from_previous_unit` (5 cases)
  - `digit_transposition` (1 case)
- **Personal Data:** None.

## 3. Uses & Constraints
- **Intended Use:** Validating automated arithmetic audits and alerting algorithms.
- **Critical Disclaimer:** Labeled strictly: *"Consistency check for review. This is not a result."*

---

# Dataset 5: Privacy Redaction Benchmark Suite

## 1. Motivation
- **Purpose:** To evaluate the automated PII redaction engine (`backend/privacy`) across diverse synthetic Nigerian reporting contexts containing personal phone numbers, names, voter identification numbers (VINs), and national identity numbers (NINs).
- **Creators:** Authored by Team Cairn.

## 2. Composition
- **Records:** 310 hand-authored incident narratives (`docs/eval/data/redaction-set.jsonl`).
- **Entity Count:** 430 target PII tokens across standard Nigerian mobile formats (`080...`, `070...`, `090...`, international `+234...`), personal names (with and without titles/honorifics), and civic identification numbers.
- **Linguistic Distribution:** English, Nigerian Pidgin, and code-switched narratives.
- **Personal Data:** **Zero.** All phone numbers, names, and identification codes are entirely synthetic and fictitious.

## 3. Uses & Licensing
- Strictly held-out evaluation of redaction precision, recall, and token replacement integrity (`[PHONE_xxxx]`, `[NAME_xxxx]`).
- Creative Commons Attribution 4.0 International (CC BY 4.0).

---

# Dataset 6: Volume Surge Surveillance Simulation Dataset

## 1. Motivation
- **Purpose:** To evaluate the Poisson and Cumulative Sum (CUSUM) statistical anomaly detector (`backend/ops`) in distinguishing organic incident volume from abnormal localized surges (e.g., ballot snatching outbreaks, equipment delivery crises).
- **Creators:** Generated by Team Cairn's operational surge simulator.

## 2. Composition
- **Scope:** 60 synthetic Local Government Areas (LGAs) simulated across 10 consecutive operational election days (hourly resolution).
- **Injected Spikes:** 20 localized crisis surges with varying magnitude, onset rate, and duration.
- **Personal Data:** None (aggregate event counts).

## 3. Uses & Licensing
- Validating time-to-detect (TTD) and false-alarm rate trade-offs against baseline fixed thresholds.
- Creative Commons Attribution 4.0 International (CC BY 4.0).
