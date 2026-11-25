# Community Features Backend Slice Report

**Date:** 25 November 2026  
**Branch:** `backend/community-features`  
**Base:** `production-readiness` (via `backend/c18-review-clocks`)  
**Pull Request:** #30 (https://github.com/karakaraye/Electraguard-Ai/pull/30)  
**Spec / Authority:** `docs/design/PLAN-COMMUNITY-FEATURES.md` (Section 6 contract)

---

## 1. What was built

### Section A · Public Rumour Check (CHK-01, CHK-02, SMS CHECK, E3 Evaluation)
- **A1. Model Extensions (`backend/rumours/models.py`):**
  - Added `source` (`desk | public | sms`, default `desk`).
  - Added `ask_count` (positive integer counter).
  - Added `ClaimAskHour` table (`claim`, `hour`, `count`) tracking hourly demand trends with unique constraint on `(claim, hour)`.
  - Added `PublicCheckRequest` tracking device/IP rate-limits and idempotency digests.
  - Migration `0002_claim_ask_count_claim_source_alter_claim_created_by_and_more.py` and `0003_publiccheckrequest.py`.
- **A2. Multilingual Claim Matching Service (`backend/rumours/matching.py`):**
  - Multilingual sentence matching over approved claims using TF-IDF subword FeatureUnion (word 1-2 grams + char 3-5 grams across Nigerian diacritics and orthography).
  - Configurable `COMMUNITY_MATCH_THRESHOLD` (set to `0.13` based on E3 evaluation).
  - Sub-threshold queries return `not_checked` (strict abstention; never hallucinating or guessing).
- **A3. CHK-01 (`GET /api/v1/public/check?q=&lang=`):**
  - Safety pattern screening: urgent danger/violence matches return `{"result": "safety"}`.
  - Approved claim responses returned in requested language (English, Naijá, Hausa, Yorùbá, Igbo) with English fallback.
  - `observer_support`: verified reviewed reports aggregated into state and ward counts with strict `< 5` suppression ("fewer than 5").
  - Red line enforced: never leaks report text, unit codes, or locations finer than state.
- **A4. CHK-02 (`POST /api/v1/public/check`):**
  - Rate-limited to 10 per hour per client IP and 10 per hour per device token; 429 returns `Retry-After`.
  - PII redacted synchronously via `privacy.redactor.redact()` before persistence.
  - Matching existing claims increments `ask_count` and hourly bucket; non-matching queries queue as new `Claim` with source `public`.
  - Salted SHA-256 hashes used for IP and device rate-limiting with 24-hour expiry.
- **A5. SMS CHECK (`phone_channels/handlers.py`, `phone_channels/text.py`):**
  - Handled `CHECK <text>` keyword in inbound SMS webhook; shares core `check_rumour` and `submit_rumour_check` pipeline.
  - SMS replies capped at 160 characters in user's detected/chosen language.
  - Added to simulator command reference.
- **A6. Multilingual Claim Matching Evaluation (E3):**
  - Seed dataset: `docs/eval/data/misinformation_claims_synthetic.jsonl` (300 synthetic official claims).
  - Handwritten test set: `docs/eval/data/claim-paraphrases.jsonl` (150 items: 20 positive + 10 negative per language across EN, PCM, HA, YO, IG, written by hand without generators).
  - Licensing: `docs/eval/data/README.md` (CC BY 4.0).
  - Split: Stratified 70/30 train/test split with fixed seed `42`.
  - Script: `scripts/eval/claim_matching.py`.
  - Report: `docs/eval/claim-matching.md`.

### Section B · Ward Check-ins (NOT-01 to NOT-06)
- **B1. New Application `backend/notices/`:**
  - Models: `Question`, `Notice`, `NoticeAnswer`, `NoticeRequest`.
  - Seed data migration `0002_seed_questions.py` populating 6 standard election questions with translations across all 5 languages and associated categories (`late_materials`, `intimidation_violence`, `lack_of_information`).
- **B2. Content Filter (`backend/notices/filtering.py`):**
  - Enforces 5D rules: rejects polling unit codes, phone numbers, emails, URLs, personal names (via C16 redactor), and political parties/candidates (`notices/data/political_terms.txt`).
  - Returns all reasons found in `reasons` list on 400 `blocked_content`.
- **B3. NOT-01 (`POST /api/v1/notices`):**
  - Coordinator notice creation with ward or LGA scope validation.
  - Safety notices start in `pending_approval`; logistics and instructions start in `sent`.
- **B4. NOT-02 (`POST /api/v1/notices/{id}/approve` & `reject`):**
  - Second-person approval enforced: 403 `same_person_approval` if creator attempts approval. Rejection requires audit note.
- **B5. NOT-03 (`GET /api/v1/notices` & `GET /api/v1/notices/{id}/results`):**
  - Coordinator view listing active notices and granular per-ward answer tally (`yes`, `no`, `not_seen`) plus unanswered polling units in scope.
- **B6. NOT-04 (`GET /api/v1/observer/notices`):**
  - Observer view of active, non-expired notices in their ward/LGA with their personal `my_answer`.
  - Strict isolation: observers never see other observers' answers.
- **B7. NOT-05 (`POST /api/v1/observer/notices/{id}/answer`):**
  - One answer per observer code; later answers update earlier answers with incremented version.
  - Offline queue support: accepts `answered_at` up to 24 hours old.
  - Clock skew rejection: future timestamps exceeding 5 minutes rejected.
  - Notice expiry guard: returns 409 `notice_expired` if notice duration elapsed.
- **B8. Check-in Cluster Warning Hook (`ops/models.py`, `notices/views.py`):**
  - When $\ge 3$ "no" answers are recorded across $\ge 2$ wards in an LGA within notice window, triggers or extends a `ClusterWarning` with `trigger="checkins"`.
  - Related open reports in those wards get triage urgency boosted to `urgent` with `checkin_cluster_boost`.
  - Added `ClusterWarning.trigger` field (`ops/migrations/0005_clusterwarning_trigger.py`).
- **B9. Notice Expiry:**
  - Automated staleness transition on queries and sweeps.

### Section C · Links & Area Today
- **C1. Demand Ranking (E2) (`backend/rumours/views.py`):**
  - Extended `claim_json` with `source`, `ask_count`, and `ask_trend_1h`.
  - Added `sort=demand` sorting (`-ask_count`, `-created_at`, `id`) and `source=desk|public|sms` filtering to `GET /api/v1/rumours/claims`.
  - Integrated `ask_trend_1h` into harm assessment formula as spread signal.
- **C2. Check-in Evidence on Detail (E1) (`backend/rumours/views.py`):**
  - `GET /api/v1/rumours/claims/{id}` includes `checkin_evidence` linking recent (within 6h) notice answers in matching area and category.
  - Answer counts under 5 suppressed to "fewer than 5".
- **C3. Area Today (`AREA-01`) (`backend/publicdata/views.py`, `backend/config/urls.py`):**
  - `GET /api/v1/observer/area-today?lga_code=`:
  - Signed-in observers only (401 unauthenticated, 403 non-observer).
  - 60-minute delay filter on closed reviewed reports in observer's LGA.
  - Category breakdown with primary and secondary complementary suppression via `publicdata.aggregate.series`.
  - Public snapshot endpoints remain strictly at state level.

### Section D · Tests, Contract & Demo Data
- **D1 & D2. Red-Line and Security Tests (`backend/notices/test_community_features.py`):**
  - 10 comprehensive tests covering all red lines:
    1. Demand ranking and source filter (`test_c1_rumour_desk_demand_ranking_and_source_filter`).
    2. Check-in evidence linking and suppression (`test_c2_checkin_evidence_on_rumour_detail`).
    3. Observer area today endpoint, role gating, 60m delay and secondary suppression (`test_c3_area_today_observer_endpoint`).
    4. CHK-01 never returns report text or polling unit codes (`test_d1_chk01_never_returns_report_text_or_polling_unit_codes`).
    5. Unapproved rumours return `not_checked` (`test_d1_unapproved_rumour_never_returned`).
    6. Observer answer isolation (`test_d1_observer_cannot_read_other_observers_answers`).
    7. Public endpoints stay strictly at state level (`test_d1_public_results_stays_strictly_at_state_level`).
    8. Expired notice answer rejection with 409 (`test_d2_expired_notice_rejects_answers`).
    9. CHK-02 rate limiting per device/IP (`test_d2_chk02_rate_limit`).
    10. Stored public submissions PII redaction (`test_d1_stored_public_submission_is_redacted`).
- **D3. Contract Synchronization:**
  - `docs/design/api-contracts.md` updated with Section 6 contracts (`CHK-01`, `CHK-02`, `NOT-01`..`NOT-06`, `AREA-01`), permissions matrix, and rate limits.
  - `frontend/lib/api/contracts.ts` updated with contract IDs, route operations, and typed specs.
- **D4. Seed Data Command (`backend/notices/management/commands/seed_community_demo.py`):**
  - Seeds synthetic organisation with 2 approved rumour responses across all 5 languages ("voting moved to Saturday" and "results cancelled"), 1 active logistics notice, and 3 observer answers triggering a check-in cluster warning in LGA `SYN-KN-01`.
- **Workflow verification (`.github/workflows/verify.yml`):**
  - Added `notices` to test suite list in backend job.

---

## 2. Verification Results

**GitHub CI (PG17 + Node):** [Run 45679371537](https://github.com/karakaraye/Electraguard-Ai/actions/runs/45679371537) — All jobs green:
- `backend` job: Passed (3m 11s)
- `frontend` job: Passed (35s)

Local test suite on PostgreSQL 17 (port 55455):

| Test Module | Pass | Fail | Skip | Duration |
|---|---|---|---|---|
| `notices.test_community_features` (Red-line & link suite) | 10 | 0 | 0 | 9.6s |
| `notices.tests` (Ward check-ins, NOT-01..06, filters, B8 cluster) | 6 | 0 | 0 | 19.2s |
| `rumours` (`test_claims.py`, `test_public_check.py`) | 4 | 0 | 0 | 4.9s |
| `phone_channels` (SMS CHECK handler and intake suite) | 19 | 0 | 0 | 6.8s |
| `makemigrations --check --dry-run` | Clean | 0 | 0 | 0.8s |

**Evaluation metrics (`docs/eval/claim-matching.md`):**
- Held-out test split (30%, 135 items):
  - Overall Precision: **92.5%** (target $\ge 90\%$)
  - Overall Recall: **86.0%**
  - Abstention rate: **10.4%**
  - Per-language precision: EN 95.8%, PCM 92.0%, HA 90.9%, YO 90.9%, IG 91.7%

---

## 3. Deviations from Contract

None. All endpoint signatures, status codes, error shapes, role restrictions, and suppression rules match Section 6 of `PLAN-COMMUNITY-FEATURES.md` exactly.

---

## 4. What is Left / Not Done

- **Front-end UI screens:** Owned by the redesign agent on branch `redesign/base` (public page `/check` P-08, observer notice banner and "Your area today" card, staff operations check-ins tab).
- **Transformer GPU deployment:** Current matching defaults to TF-IDF FeatureUnion when PyTorch weights are not installed; sentence-transformer MiniLM pipeline is ready to mount if server GPU resources are provisioned.
