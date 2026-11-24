# Evaluation Report: C16 Automatic Redaction of Personal Details

## Summary

This evaluation benchmarks the deterministic redaction system on a labeled synthetic evaluation dataset
comprising **310 items** across all five supported languages:
English (`en`), Naijá / Nigerian Pidgin (`pcm`), Hausa (`ha`), Yorùbá (`yo`), and Igbo (`ig`).

### Target Benchmarks vs Measured Results
- **Phone & ID numbers recall target:** ≥ 95.0 %
- **Personal name recall target:** ≥ 85.0 %
- **Overall precision target:** ≥ 90.0 %

| Entity Kind | Ground Truth | Detected | True Positives (TP) | False Positives (FP) | False Negatives (FN) | Recall | Precision |
|---|---|---|---|---|---|---|---|
| `phone` | 115 | 115 | 115 | 0 | 0 | **100.0 %** | **100.0 %** |
| `email` | 11 | 11 | 11 | 0 | 0 | **100.0 %** | **100.0 %** |
| `nin` | 50 | 50 | 50 | 0 | 0 | **100.0 %** | **100.0 %** |
| `bvn` | 50 | 50 | 50 | 0 | 0 | **100.0 %** | **100.0 %** |
| `vin` | 55 | 55 | 55 | 0 | 0 | **100.0 %** | **100.0 %** |
| `account` | 50 | 50 | 50 | 0 | 0 | **100.0 %** | **100.0 %** |
| `name` | 156 | 158 | 156 | 2 | 0 | **100.0 %** | **98.7 %** |
| `address` | 105 | 105 | 105 | 0 | 0 | **100.0 %** | **100.0 %** |
| **Overall** | **592** | **594** | **592** | **2** | **0** | **100.0 %** | **99.7 %** |

## Per-Language Breakdown

| Language | Total Samples | TP | FP | FN | Recall | Precision |
|---|---|---|---|---|---|---|
| English (`en`) | 62 | 136 | 0 | 0 | **100.0 %** | **100.0 %** |
| Naijá / Pidgin (`pcm`) | 62 | 114 | 0 | 0 | **100.0 %** | **100.0 %** |
| Hausa (`ha`) | 62 | 114 | 0 | 0 | **100.0 %** | **100.0 %** |
| Yorùbá (`yo`) | 62 | 114 | 0 | 0 | **100.0 %** | **100.0 %** |
| Igbo (`ig`) | 62 | 114 | 2 | 0 | **100.0 %** | **98.3 %** |

## Key Findings & Verification

1. **ID Numbers and Phones:** Phone numbers, emails, NIN, BVN, VIN, and account numbers achieved **100.0 % recall**, well exceeding the ≥ 95.0 % target.
2. **Personal Names:** Names across all language naming conventions (Hausa/Fulani, Yoruba, Igbo, Edo, Niger Delta) achieved **≥ 96.0 % recall**, exceeding the ≥ 85.0 % target.
3. **Precision & Negative Controls:** Non-personal geographic identifiers (states, LGAs such as Dala, Ikeja, Kano, Lagos, Enugu, Oyo) and institutional acronyms (INEC, BVAS, APC, PDP, LP) were correctly excluded from name matching, resulting in **zero false positive leaks** on negative control items.
4. **Stability & Tenant Isolation:** Token suffixes verified to be HMAC-derived with per-organisation secret keys. The same value generates identical tokens within an organisation and distinct tokens across organisations.
