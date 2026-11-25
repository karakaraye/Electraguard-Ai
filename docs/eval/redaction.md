# Redaction Evaluation (C16)

Evaluated on 308 hand-written synthetic items across 5 languages (`en`, `pcm`, `ha`, `yo`, `ig`), including 83+ negative ordinary-election items (with 8 negative PVC/VIN sentences) and all C16 edge cases. Gold spans are scored strictly, with personal names scored on whether the personal name itself is hidden (excluding preceding titles such as Mr, Dr, Alhaji, which the redactor intentionally preserves).

## Overall Results

- **Overall Recall:** 96.3% (414/430)
- **Overall Precision:** 99.8% (414/415)

## Per-Kind Breakdown

| Kind | TP | FP | FN | Recall | Precision | Target Recall |
|---|---|---|---|---|---|---|
| account | 35 | 0 | 5 | 87.5% | 100.0% | ≥ 95% |
| address | 59 | 1 | 1 | 98.3% | 98.3% | — |
| bvn | 20 | 0 | 0 | 100.0% | 100.0% | ≥ 95% |
| email | 40 | 0 | 0 | 100.0% | 100.0% | ≥ 95% |
| name | 121 | 0 | 10 | 92.4% | 100.0% | ≥ 85% |
| nin | 25 | 0 | 0 | 100.0% | 100.0% | ≥ 95% |
| phone | 84 | 0 | 0 | 100.0% | 100.0% | ≥ 95% |
| vin | 30 | 0 | 0 | 100.0% | 100.0% | ≥ 95% |

## Per-Language Breakdown

| Language | TP | FP | FN | Recall | Precision |
|---|---|---|---|---|---|
| en | 83 | 0 | 3 | 96.5% | 100.0% |
| pcm | 82 | 1 | 4 | 95.3% | 98.8% |
| ha | 83 | 0 | 3 | 96.5% | 100.0% |
| yo | 83 | 0 | 3 | 96.5% | 100.0% |
| ig | 83 | 0 | 3 | 96.5% | 100.0% |

## Full Miss List (False Negatives: 16)

- `RED-020` (en, account): `0123456789` in "Voter 0123456789 is my account was overheard near the booth."
- `RED-059` (en, name): `Toluwani Ojo` in "Toluwani Ojo lives at 15 Bode Thomas Street."
- `RED-060` (en, name): `Uchechukwu Okoro` in "Uchechukwu Okoro called 0814 555 6677 after polls closed."
- `RED-080` (pcm, account): `0123456790` in "0123456790 is my account na wetin e shout."
- `RED-083` (pcm, address): `22 Ahmadu Bello Way` in "Alhaji Musa Bello boys block 22 Ahmadu Bello Way."
- `RED-119` (pcm, name): `Toluwani Ojo` in "Toluwani Ojo stay 15 Bode Thomas Street."
- `RED-120` (pcm, name): `Uchechukwu Okoro` in "Uchechukwu Okoro dial 0814 555 6678 after counting."
- `RED-140` (ha, account): `0123456791` in "0123456791 is my account ya fada da karfi."
- `RED-179` (ha, name): `Toluwani Ojo` in "Toluwani Ojo yana 15 Bode Thomas Street."
- `RED-180` (ha, name): `Uchechukwu Okoro` in "Uchechukwu Okoro ya kira 0814 555 6679."
- `RED-200` (yo, account): `0123456792` in "0123456792 is my account ni o wi."
- `RED-239` (yo, name): `Toluwani Ojo` in "Toluwani Ojo wa ni 15 Bode Thomas Street."
- `RED-240` (yo, name): `Uchechukwu Okoro` in "Uchechukwu Okoro pe 0814 555 6680."
- `RED-260` (ig, account): `0123456793` in "0123456793 is my account ka o kwuru."
- `RED-299` (ig, name): `Toluwani Ojo` in "Toluwani Ojo bi na 15 Bode Thomas Street."
- `RED-300` (ig, name): `Uchechukwu Okoro` in "Uchechukwu Okoro kporo 0814 555 6681."

## Full False Positive List (1)

- `RED-083` (pcm, address): `block 22 Ahmadu Bello Way` in "Alhaji Musa Bello boys block 22 Ahmadu Bello Way."
