# C17 Emerging Alerts Evaluation

Independent evaluation run against a throwaway PostgreSQL test database using
`data/synthetic/polling_units_synthetic.csv` (60 LGAs across 20 states, 900 polling units).

## Setup

- **Database:** Throwaway Django test database (`test_*`), destroyed on exit.
- **Background volume:** 900-unit polling-day stream from 07:00 to 17:00 WAT across 3 incident categories (`intimidation_violence`, `ballot_issues`, `logistics_delay`).
- **Share of surge-day alerts at the 0.5 expected floor:** 11.1% (2/18).
- **Surges:** 20 planted surges (4–15 reports over 15–60 minutes) across varied LGAs (each with peers) and times (09:30–15:30 WAT).
- **Quiet baseline:** 10 independent quiet days (distinct random seeds, dates, and background rates; 80 evaluation hours total, 09:00–17:00 WAT). False alarms counted per distinct `ClusterWarning` created.

## Results

| Detector | Detection rate | Median time to detect | Quiet-day warnings (80h) | False alarms / hour |
|---|---:|---:|---:|---:|
| Old threshold (`2x` 7-period average, min 3) | 100.0% (20/20) | 9.0 min | 1790 | 22.38 |
| New statistical (Poisson + BH FDR q=0.05 + CUSUM) | 70.0% (14/20) | 19.0 min | 27 | 0.34 |

## Honest takeaway

- The new statistical detector produced **fewer** false alarms per hour (0.34/hr vs 22.38/hr).
- **Detection:** New detector caught 14/20 surges (median 19.0 min) vs 20/20 (median 9.0 min) for the old threshold.
