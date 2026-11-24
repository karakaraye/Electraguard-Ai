# Redaction Evaluation (C16)

Evaluated on 310 unique synthetic items across 5 languages (`en`, `pcm`, `ha`, `yo`, `ig`), including 50 negative (clean election text) items and edge-case formats, using **strict exact span matching**.

## Overall Results

- **Overall Recall:** 99.1% (649/655)
- **Overall Precision:** 100.0% (649/649)

## Per-Kind Breakdown

| Kind | TP | FP | FN | Recall | Precision | Target Recall |
|---|---|---|---|---|---|---|
| account | 50 | 0 | 0 | 100.0% | 100.0% | ≥ 95% |
| address | 110 | 0 | 0 | 100.0% | 100.0% | — |
| bvn | 50 | 0 | 0 | 100.0% | 100.0% | ≥ 95% |
| email | 70 | 0 | 0 | 100.0% | 100.0% | ≥ 95% |
| name | 144 | 0 | 6 | 96.0% | 100.0% | ≥ 85% |
| nin | 55 | 0 | 0 | 100.0% | 100.0% | ≥ 95% |
| phone | 115 | 0 | 0 | 100.0% | 100.0% | ≥ 95% |
| vin | 55 | 0 | 0 | 100.0% | 100.0% | ≥ 95% |

## Per-Language Breakdown

| Language | TP | FP | FN | Recall | Precision |
|---|---|---|---|---|---|
| en | 139 | 0 | 1 | 99.3% | 100.0% |
| pcm | 124 | 0 | 1 | 99.2% | 100.0% |
| ha | 128 | 0 | 2 | 98.5% | 100.0% |
| yo | 130 | 0 | 0 | 100.0% | 100.0% |
| ig | 128 | 0 | 2 | 98.5% | 100.0% |

## Misses (False Negatives: 6)

- `RED-045` (en, name): `Samuel Ogunleye` in "Witness Samuel Ogunleye stayed at 88 Aba Road; reached on 0818.222.1100."
- `RED-121` (pcm, name): `Samuel Ogunleye` in "My guy Samuel Ogunleye phone na +234 803 987 6543, e dey 88 Aba Road."
- `RED-143` (ha, name): `Samuel Ogunleye` in "Shaida Samuel Ogunleye ya ba da BVN 33445566778 da waya 0818.222.1100."
- `RED-170` (ha, name): `Samuel Ogunleye` in "Mai jefa kuri'a Samuel Ogunleye ya nuna VIN XY98765432109876543 a rumfar zabe."
- `RED-277` (ig, name): `Samuel Ogunleye` in "Onye aka ebe Samuel Ogunleye nwere BVN 22334455667 na ekwenti 0818.222.1100."
- `RED-304` (ig, name): `Samuel Ogunleye` in "Onye ntuli aka Samuel Ogunleye gosiri VIN XY98765432109876543 n'ebe a."

## False Positives (0)

- None.
