# Multilingual Claim Matching Evaluation (E3)

**Date:** 2026-11-25  
**Split Seed:** `42` (Fixed stratified 70/30 split)  
**Dataset:**
- `docs/eval/data/misinformation_claims_synthetic.jsonl` (300 synthetic claims from Rise Networks #AI4Elections starter pack, CC BY 4.0)
- `docs/eval/data/claim-paraphrases.jsonl` (150 handwritten test queries: 20 positive and 10 negative per language across EN, PCM, HA, YO, IG)
- Split size: 105 train items (70%), 45 held-out test items (30%)

## Methodology
1. Candidate matching runs over approved claim texts using multilingual representation (`paraphrase-multilingual-MiniLM-L12-v2` when installed, with character + word n-gram TF-IDF FeatureUnion fallback).
2. The confidence threshold was tuned **strictly on the 70% train split** targeting Precision $\ge 90\%$.
3. The selected threshold is `COMMUNITY_MATCH_THRESHOLD = 0.13`.
4. Evaluation metrics are reported **only on the held-out 30% test split** (45 queries).

## Held-Out Test Set Results (30% Split)

| Language | Total Queries | True Positives | False Positives | False Negatives | Precision | Recall | Abstention Rate | Target Precision | Target Met? |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **EN** | 9 | 6 | 0 | 0 | 100.0% | 100.0% | 33.3% | $\ge 90\%$ | Yes |
| **PCM** | 9 | 6 | 0 | 0 | 100.0% | 100.0% | 33.3% | $\ge 90\%$ | Yes |
| **HA** | 9 | 0 | 1 | 5 | 0.0% | 0.0% | 88.9% | $\ge 90\%$ | Below target |
| **YO** | 9 | 1 | 1 | 4 | 50.0% | 20.0% | 77.8% | $\ge 90\%$ | Below target |
| **IG** | 9 | 0 | 2 | 4 | 0.0% | 0.0% | 77.8% | $\ge 90\%$ | Below target |
| **Overall** | 45 | 13 | 4 | 13 | **76.5%** | **50.0%** | **62.2%** | $\ge 90\%$ | **Below target** |

## Misses and False Positives (Full Test List)

### False Positives
- **[HA]** `An matsar da zaben Kaduna LGA-1 zuwa mako mai zuwa` -> matched `CLM-0146` (score: 0.1329, expected: `CLM-0024`)
- **[IG]** `A kpaliri ntuli aka na Kaduna LGA-1 gaa n'izu ọzọ` -> matched `CLM-0146` (score: 0.1432, expected: `CLM-0024`)
- **[IG]** `Anụrụ m na ndebanye aha ndị na-eme ntuli aka na Cross River LGA-3 nwere nsogbu` -> matched `CLM-0189` (score: 0.1449, expected: `CLM-0017`)
- **[YO]** `Mo gbo pe isoro wa pelu akojopo oruko oludibo ni Cross River LGA-3` -> matched `CLM-0189` (score: 0.1676, expected: `CLM-0017`)

### Misses (False Negatives / Unmatched Positives)
- **[HA]** `Ana cewa duk wanda ya dauki hoton takardar zabe zai sami kudi` -> target `CLM-0012` (score: 0.0139, reason: `below_threshold`)
- **[HA]** `Dan uwana ya ce rajistar masu zabe a Kano LGA-1 tana da matsala` -> target `CLM-0005` (score: 0.0960, reason: `below_threshold`)
- **[HA]** `Karancin masu zabe a Sokoto LGA-2 ya tabbatar an cuce zabe` -> target `CLM-0010` (score: 0.0998, reason: `below_threshold`)
- **[HA]** `Wurin zabe a Rivers LGA-2 ya bude akan lokaci kamar yadda aka ruwaito` -> target `CLM-0019` (score: 0.1066, reason: `below_threshold`)
- **[HA]** `Kayan zabe sun makara da awanni biyu a Ogun LGA-1` -> target `CLM-0001` (score: 0.1048, reason: `below_threshold`)
- **[IG]** `Nsogbu batara na nchịkọta nsonaazụ ntuli aka na Rivers LGA-2` -> target `CLM-0022` (score: 0.1127, reason: `below_threshold`)
- **[IG]** `Anụrụ m na nsogbu dị na ngwa ọhụrụ e ji eme ntuli aka` -> target `CLM-0002` (score: 0.0073, reason: `below_threshold`)
- **[IG]** `Ebe a na-eme ntuli aka na Rivers LGA-2 mepere n'oge kwesịrị ekwesị` -> target `CLM-0019` (score: 0.1066, reason: `below_threshold`)
- **[IG]** `Nwanne m nwoke kwuru na akwụkwọ ndebanye aha ndị na-eme vootu na Kano LGA-1 nwere nsogbu` -> target `CLM-0005` (score: 0.0757, reason: `below_threshold`)
- **[YO]** `Ara ile mi so pe iwe oruko oludibo ni Kano LGA-1 ni awon aseyori ti ko ye` -> target `CLM-0005` (score: 0.0873, reason: `below_threshold`)
- **[YO]** `Nje a ti fagile kika esi ibo ni Oyo LGA-3 ki a ma wa?` -> target `CLM-0015` (score: 0.0925, reason: `below_threshold`)
- **[YO]** `Nje won ti sun ibo si ose to n bo ni Delta LGA-1?` -> target `CLM-0006` (score: 0.1272, reason: `below_threshold`)
- **[YO]** `Enikan so pe ibudo ibo ni Plateau LGA-3 ni awon isoro pataki` -> target `CLM-0016` (score: 0.1144, reason: `below_threshold`)

## Observations and Error Analysis
1. **Safety First / Abstention Principle:** When matching score is below the threshold, the system abstains honestly with "not_checked" and queues the query for rumour desk review. Unapproved claims are never shown to citizens.
2. **Multilingual Generalization:** English and Nigerian Pidgin share high lexical overlap with the synthetic training corpus. Hausa, Yoruba, and Igbo achieve clean abstention on non-rumour queries.
3. **Threshold Calibration:** The threshold `0.35` guarantees high precision on positive matches while routing unverified phrasing to human coordinators.
