# Statistical Alerts Evaluation (C17)

Replayed through the production `ops.emerging.detect_emerging` function on PostgreSQL across:
- **1 Surge Day** (900 polling units, realistic background + 20 injected surges of 4–15 reports over 15–60 minutes).
- **10 Quiet Days** (120 hours of realistic background reports, 0 injected surges) to measure false alarms per hour per **distinct warning**.

## Headline Results

| Metric | Legacy Fixed Threshold | C17 Statistical Detector | Notes |
|---|---|---|---|
| **Surge Detection Rate** | 90.0% (18/20) | **100.0% (20/20)** | Tested across 20 surges (4–15 reports, 15–60 min) |
| **Median Time to Detect** | 17.5 min | **20.0 min** | Median minutes from surge start to alert |
| **Quiet-Day False Alarms / Hour** | 0.000 (0 warnings / 120h) | **0.000 (0 warnings / 120h)** | Distinct warnings raised across 10 quiet days |

## Surge Detection Detail

| Surge ID | LGA | Category | Reports | Duration | Legacy TTD | C17 TTD |
|---|---|---|---|---|---|---|
| SURGE-01 | Kano LGA-1 | intimidation_violence | 10 | 25 min | 10 min | 10 min |
| SURGE-02 | Lagos LGA-1 | equipment_failure | 12 | 20 min | 10 min | 10 min |
| SURGE-03 | Rivers LGA-1 | intimidation_violence | 9 | 30 min | 10 min | 10 min |
| SURGE-04 | Enugu LGA-1 | vote_buying | 8 | 20 min | 15 min | 15 min |
| SURGE-05 | Borno LGA-1 | late_materials | 7 | 35 min | 30 min | 30 min |
| SURGE-06 | Plateau LGA-2 | equipment_failure | 9 | 25 min | 10 min | 10 min |
| SURGE-07 | Oyo LGA-1 | vote_buying | 11 | 30 min | 20 min | 20 min |
| SURGE-08 | Edo LGA-1 | intimidation_violence | 8 | 25 min | 20 min | 20 min |
| SURGE-09 | Cross River LGA-1 | equipment_failure | 7 | 20 min | 15 min | 15 min |
| SURGE-10 | Delta LGA-1 | intimidation_violence | 10 | 25 min | 15 min | 15 min |
| SURGE-11 | Kaduna LGA-2 | queues_crowding | 14 | 55 min | 25 min | 20 min |
| SURGE-12 | Imo LGA-2 | late_materials | 15 | 60 min | 15 min | 15 min |
| SURGE-13 | Ogun LGA-2 | queues_crowding | 12 | 50 min | 20 min | 20 min |
| SURGE-14 | Kwara LGA-1 | lack_of_information | 13 | 60 min | 15 min | 10 min |
| SURGE-15 | Sokoto LGA-1 | queues_crowding | 15 | 55 min | 20 min | 20 min |
| SURGE-16 | Bauchi LGA-1 | equipment_failure | 5 | 40 min | 35 min | 30 min |
| SURGE-17 | Benue LGA-1 | intimidation_violence | 4 | 30 min | Missed | 30 min |
| SURGE-18 | Ebonyi LGA-1 | vote_buying | 5 | 45 min | 45 min | 40 min |
| SURGE-19 | Ondo LGA-1 | equipment_failure | 4 | 30 min | Missed | 30 min |
| SURGE-20 | Adamawa LGA-1 | late_materials | 6 | 40 min | 40 min | 40 min |

## Findings

- **Detection:** C17 detected 20/20 (100.0%) surges with a median detection time of 20.0 minutes, compared to 18/20 (90.0%) and 17.5 minutes for the legacy threshold.
- **False Alarms:** Across 10 quiet days (120 hours), C17 raised 0 distinct warnings (0.000/hr) versus 0 (0.000/hr) for the legacy threshold.
