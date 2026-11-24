# Submission Documentation Fact-Check Review Log

**Date:** 2026-11-24  
**Worktree:** `C:\Users\Windows\Desktop\CAIRN\.worktrees\EG-docs`  
**Branch:** `docs/c15-submission-docs`  
**Author:** Core Engineering Team

---

## 1. Summary of Fact-Check Audit

An audit was conducted across all submission documents in `docs/submission/` against the verified codebase in `production-readiness`, PR #18 (`backend/v1-media-av`), PR #19 (`docs/c13-submission-tooling`), and `docs/eval/results.md`.

Every claim regarding cryptographic primitives, storage architecture, privacy mechanisms, telephony interfaces, and evaluation metrics was verified and aligned with reality.

---

## 2. Corrections Detailed

### Fact Check 1: Outbox Storage Architecture
- **Files Modified:** `docs/submission/ARCHITECTURE.md`, `docs/submission/METHODOLOGY.md`, `docs/submission/PROBLEM.md`, `docs/submission/SAFETY_AND_LIMITATIONS.md`, `docs/submission/THREAT_MODEL.md`, `docs/submission/VIDEO_SCRIPT.md`
- **Before:** "Encrypted local outbox using WebCrypto AES-GCM" / "WebCrypto AES-GCM local storage queues reports until connectivity resumes".
- **After:** Clarified that in the C15 prototype, field reports are queued locally in browser `IndexedDB` with exponential backoff synchronization and instant emergency wipe ("Clear this phone"); `WebCrypto AES-GCM` client-side at-rest encryption is documented as a roadmap item for future hardening.
- **Evidence Path:** `frontend/lib/api/client.ts`, `docs/design/design-contract.md`.

### Fact Check 2: Citizen Phone Hashing Primitive
- **Files Modified:** `docs/submission/ARCHITECTURE.md`, `docs/submission/METHODOLOGY.md`, `docs/submission/SAFETY_AND_LIMITATIONS.md`, `docs/submission/THREAT_MODEL.md`
- **Before:** "`HMAC-SHA256` with rotating daily server salts".
- **After:** Corrected to Django's `salted_hmac("phone-channel:<purpose>", value, algorithm="sha256")` with purpose-scoped salt strings and the server secret key (`SECRET_KEY`). Raw MSISDNs are never persisted in database records, while stable matching allows receipt tracking (`STATUS <receipt_code>`), language preferences (`LANG <lang>`), and reviewer question replies (`REPLY <receipt_code> <text>`).
- **Evidence Path:** `backend/phone_channels/handlers.py` (lines 31-32: `def digest(purpose, value): return salted_hmac("phone-channel:" + purpose, value, algorithm="sha256").hexdigest()`), `backend/phone_channels/models.py`.

### Fact Check 3: Retention and Purge Automation
- **Files Modified:** `docs/submission/ARCHITECTURE.md`, `docs/submission/SAFETY_AND_LIMITATIONS.md`, `docs/submission/THREAT_MODEL.md`
- **Before:** "Automated background scheduler (`purge_retained_data`) / automated 90-day retention shredding".
- **After:** Corrected to operator management command `python manage.py purge_retention [--dry-run]` (calling `staff.retention.purge()`), which shreds narrative text, media blobs, and phone hashes past the organisation's configured `retention_days` while preserving audit chain heads.
- **Evidence Path:** `backend/staff/management/commands/purge_retention.py`, `backend/staff/retention.py`.

### Fact Check 4: Face Blur Implementation Boundary
- **Files Modified:** `docs/submission/MODEL_CARD.md`, `docs/submission/SAFETY_AND_LIMITATIONS.md`, `docs/submission/VIDEO_SCRIPT.md`
- **Before:** "Client-side face blur across background bystanders".
- **After:** Confirmed and stated that face obfuscation is executed server-side in the media ingestion pipeline using OpenCV's YuNet ONNX face detector (`backend/reports/media_av/faces.py` via `cv2.FaceDetectorYN` on a 640x640 letterboxed canvas, followed by pixelation and Gaussian smoothing) before reviewer access.
- **Evidence Path:** `backend/reports/media_av/faces.py`, PR #18 (`backend/v1-media-av`, commit `401cf1a`).

### Fact Check 5: Synthetic Result-Sheet Dataset Count
- **Files Verified:** `docs/submission/DATASHEET.md`, `docs/submission/EVALUATION.md`, `docs/submission/METHODOLOGY.md`, `docs/submission/MODEL_CARD.md`
- **Verified Fact:** Verified exact row count of `data/synthetic/results_synthetic.csv` is 901 lines (header + 900 records). 900 synthetic EC8A returns used across A6 mathematical anomaly benchmarks.
- **Evidence Path:** `data/synthetic/results_synthetic.csv`.

### Fact Check 6: Feature Phone USSD Integration Status
- **Files Modified:** `docs/submission/ARCHITECTURE.md`, `docs/submission/METHODOLOGY.md`, `docs/submission/SAFETY_AND_LIMITATIONS.md`, `docs/submission/VIDEO_SCRIPT.md`
- **Before:** Described USSD shortcode `*384*24#` as a production telco deployment.
- **After:** Explicitly clarified that `*384*24#` is a prototype service code tested against the Africa's Talking API sandbox simulator and local mock harnesses (`SIM-01`), pending carrier provisioning across domestic networks (MTN, Airtel, Glo, 9mobile) for field rollout.
- **Evidence Path:** `backend/phone_channels/views.py`, `backend/phone_channels/tests.py`.

### Fact Check 7: Evaluation Metrics Decimals
- **Files Verified:** `docs/submission/EVALUATION.md`, `docs/submission/MODEL_CARD.md`
- **Verified Fact:** Verified all figures against `docs/eval/results.md`:
  - Category Triage (A1): Headline macro-F1 `0.824` (95% CI `0.700`–`0.912`), accuracy `0.821`, A3 abstention rate `0.446`, retained accuracy `1.000`.
  - Urgency Recall (A2): Validation split precision `0.947` / recall `0.900` / F1 `0.923`; held-out precision `0.818` / recall `0.871` / F1 `0.844`.
  - Result-Sheet Checks (A6): 84.44 alerts per 1,000 sheets across 900 returns.
  - Claim Ranking (A8): English check-worthiness precision `1.000` / recall `1.000`; Pidgin check-worthiness precision `1.000` / recall `1.000`.
  - Transit Risk (A13): MAE `0.817` hours, top-quintile precision `0.667`.
- **Evidence Path:** `docs/eval/results.md`.

### Fact Check 8: Safety Statement Signature Line
- **File Modified:** `docs/submission/SAFETY_AND_LIMITATIONS.md`
- **Before:** Pre-filled literal signature block.
- **After:** Replaced with formal un-signed submission line:
  `Signed: ____________ (Kara Wari Sylva, team lead), date: ________`
- **Evidence Path:** Instructions in `HANDOFF-PROMPTS.md` section ANTIGRAVITY 7.
