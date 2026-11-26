# Comprehensive Threat Model: ElectraGuard AI (STRIDE & LINDDUN)

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Date:** 2026-11-26  
**Status:** Prototype

> **In plain words:** ElectraGuard AI is built to protect both computer systems and human beings. Field observers and citizens can file reports without fear of retaliation because the platform never asks for names, emails, or phone numbers, and automatically masks private details in text. Cryptographic tamper checks stop rogue administrators or attackers from altering historical records, while statistical monitoring alerts staff to coordinated report flooding or localized violence.

---

## 1. Threat Modeling Methodology

ElectraGuard AI protects both **system cybersecurity integrity** and **civic informant privacy**. We evaluate system security and privacy risks using two industry-standard frameworks:
1. **STRIDE:** Evaluates security threats (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege).
2. **LINDDUN:** Evaluates privacy threats (Linkability, Identifiability, Non-repudiation, Detectability, Disclosure of Information, Unawareness, Non-compliance).

Every identified threat is mapped directly to the technical mitigation and its concrete code path or test suite in the repository.

---

## 2. STRIDE Cybersecurity Threat Matrix

| STRIDE Category | Threat Description | Attack Vector | Technical Mitigation | Code Path & Automated Test |
|---|---|---|---|---|
| **Spoofing** | Adversary impersonates an accredited field observer to inject disinformation. | Brute-forcing observer authentication tokens or stealing credentials. | Batch-generated unguessable alphanumeric codes + 6-digit bcrypt PINs; rate limiting; PIN lockout after 5 consecutive failures. | `backend/accounts/observer_auth.py`<br>`backend/accounts/test_observer_auth.py` |
| **Spoofing** | Forged SMS or USSD gateway callbacks injected from untrusted IP ranges. | Attacker posts HTTP requests directly to telecom callback endpoints. | Gateway secret token validation, IP subnet filtering (`CHANNEL_GATEWAY_NETWORKS`), and payload signature checks. | `backend/phone_channels/views.py`<br>`backend/phone_channels/tests.py` |
| **Tampering** | Rogue actor or compromised administrator alters historical incident details or vote records. | Direct database modification of reported incidents or case review logs. | Immutable **SHA-256 Merkle-style hash chaining** (`AuditChainHead`); any retroactive change breaks hash verification. | `backend/reports/models.py`<br>`backend/reports/test_audit_chain.py` |
| **Tampering** | Man-in-the-middle tampering of reports in transit from remote 2G mobile devices. | Eavesdropping or modifying cleartext HTTP traffic on insecure cell towers. | Enforced TLS 1.3 encryption in transit; HSTS headers; client-side IndexedDB with emergency local wipe; WebCrypto AES-GCM encryption planned for future release. | `frontend/lib/outbox/`<br>`deploy/azure/nginx.conf` |
| **Repudiation** | Staff analyst denies having approved, closed, or redacted a sensitive incident. | Action performed without accountability logging. | Mandatory authenticated audit event creation for every status change, question prompt, or redaction with actor UUID. | `backend/reports/models.py` (`ReviewEvent`)<br>`backend/reports/test_review_actions.py` |
| **Information Disclosure** | Physical seizure of an observer's mobile phone by hostile local actors at a polling unit. | Adversary inspects device browser storage or open applications. | Zero persistent plaintext PII on device; PIN required to view submitted list; "Clear this phone" emergency wipe button. | `frontend/app/(observer)/o/_views/StartViews.tsx`<br>`frontend/lib/drafts/` |
| **Information Disclosure** | Leakage of citizen phone numbers submitted via SMS or USSD reporting. | Database breach or unauthorized access to citizen intake tables. | Raw phone numbers are immediately hashed with `salted_hmac("phone-channel:<purpose>", number)` and the server secret key; plain numbers are never persisted. | `backend/phone_channels/models.py`<br>`backend/phone_channels/tests.py` |
| **Information Disclosure** | Free-text incident reports or messages contain phone numbers, voter VINs, or citizen names. | Narrative descriptions leaked or exposed to standard reviewers and moderators. | **Automated Privacy Engine (`backend/privacy`):** High-precision regex and name recognition automatically replace phone numbers (`[PHONE_xxxx]`) and names (`[NAME_xxxx]`) with opaque tokens. Raw text access requires elevated CASE-06 justification logged to the audit chain. | `backend/privacy/redactor.py`<br>`backend/privacy/tests.py` |
| **Denial of Service** | Botnet or coordinated actor floods API with thousands of spurious reports during voting hours. | HTTP POST flooding or telecom gateway SMS spamming. | Strict per-IP and per-HMAC rate limiting; near-duplicate grouping (A4) collapses identical spam; Poisson + CUSUM volume surveillance (C17 / `backend/ops`) separates coordinated spikes from organic reporting. | `backend/intelligence/duplicates.py`<br>`backend/ops/surges.py`<br>`backend/ops/tests.py` |
| **Denial of Service** | High-urgency safety cases languish unaddressed due to reviewer backlog or queue starvation. | Critical incidents buried under low-priority noise. | **Regulatory & Review Clocks (C18 / `backend/clocks`):** Deterministic live countdown timers with automated overdue sweeps escalate lagging cases across SLA tiers (15m triage deadline, 30m escalation deadline). | `backend/clocks/models.py`<br>`backend/clocks/sweeps.py`<br>`backend/clocks/tests.py` |
| **Elevation of Privilege** | Observer attempts to access staff queue (S-02) or administrative settings (S-11). | Manipulating JWT claims or URL parameters in the frontend client. | Role-Based Access Control (RBAC) enforced strictly at Django middleware and view layers (`IsStaffRole`, `IsOrgAdmin`). | `backend/accounts/permissions.py`<br>`backend/accounts/test_permissions.py` |

---

## 3. LINDDUN Privacy Threat Matrix

| LINDDUN Category | Threat Description | Attack Vector | Technical Mitigation | Code Path & Automated Test |
|---|---|---|---|---|
| **Linkability** | An adversary links multiple anonymous reports filed across hours to the same physical person. | Correlating browser fingerprint, IP address, or observer session keys. | Ephemeral session tokens; no long-lived browser cookies; independent submission nonces; purpose-scoped salts on phone HMACs. | `frontend/lib/api/client.ts`<br>`backend/accounts/tokens.py` |
| **Identifiability** | Informant in a rural polling unit is identified because only 1 or 2 reports were filed from that LGA. | Analyzing public transparency reports on sparse geographical areas. | **Small-Cell Suppression:** Counts fewer than 5 are suppressed and displayed strictly as `< 5`; public maps aggregate to LGA only (never individual polling units). | `backend/publicdata/snapshots.py`<br>`backend/publicdata/test_suppression.py` |
| **Non-repudiation** | An observer is legally or physically compelled to prove they filed an incriminating video/report. | Subpoena or physical extortion demanding cryptographic signature. | Submissions use symmetric ephemeral batch nonces without individual public-key digital signatures, providing plausible deniability. | `backend/reports/receipts.py`<br>`docs/design/design-contract.md` |
| **Detectability** | Hostile actors detect that an individual is carrying and running an election monitoring app. | Visual shoulder-surfing of colorful political or tally graphics on screen. | Warm dawn editorial visual design (warm off-white `#FBFBFA`, charcoal `#111827`, terracotta `#C85A32` accents); high-contrast readability under bright sun; zero partisan emblems; background art automatically hidden during active input. | `frontend/ui/tokens.css`<br>`frontend/ui/BackgroundArt/` |
| **Disclosure of Information** | Citizen reports contain unredacted names, voter card numbers, or vehicle plates in the text. | Public disclosure or situation room data spill. | Automated server-side privacy redaction (`backend/privacy`) plus interactive client-side redaction tool allowing analysts to sanitize residual details before corroboration or export. | `backend/privacy/redactor.py`<br>`frontend/app/(staff)/s/_views/CaseView.tsx` |
| **Unawareness** | Citizens submitting reports via SMS/USSD unaware of how their data is processed. | Unclear telecom consent flows. | USSD confirmation prompt explicitly states: *"Send? <category> in <LGA>. No personal data kept."* Public privacy policy in plain language. | `backend/phone_channels/ussd.py`<br>`frontend/app/(public)/privacy/` |
| **Non-compliance** | Violation of the Nigeria Data Protection Act (NDPA 2023) retention limits. | Indefinite archival of historical incident text and media binaries. | Operator data retention management command (`python manage.py purge_retention`) permanently shreds narrative text and binaries according to organisation retention policy. | `backend/staff/retention.py`<br>`backend/staff/test_retention.py` |

---

## 4. Verification & Testing

Every mitigation listed above is covered by automated unit and integration tests in the test suite:
- Backend security, permission & privacy suite:
  ```bash
  python backend/manage.py test accounts reports phone_channels publicdata privacy clocks ops rumours
  ```
- Automated accessibility & security linting: `npm run lint` and `npm run typecheck` across `frontend/`.
