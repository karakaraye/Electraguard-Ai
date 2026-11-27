# Architecture and Technical Design: ElectraGuard AI

> **In plain words:**  
> ElectraGuard AI is built like a secure emergency-response system. Observers and voters send reports from phones even when there is no mobile data. The backend server automatically hides names and phone numbers, suggests similar reports, and tracks review times against targets. Human reviewers make every decision, and every staff action is added to a hash chain so a quietly changed or deleted record can be detected.

---

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Date:** 2026-11-26  
**Status:** Prototype

---

## 1. System Overview

ElectraGuard AI is a nonpartisan election observation and incident verification prototype for low-connectivity settings in Nigeria. It is a prototype and has not been deployed.

### System Context Diagram
```mermaid
flowchart TD
  subgraph Ingestion["Ingestion Channels"]
    Obs[Accredited Observer PWA] -->|Offline-First Queue| Outbox[Local Outbox (IndexedDB)]
    Cit[Citizen Web Pages] -->|Anonymous Form| WebAPI[REST API Gateway]
    Phone[Feature Phone User] -->|SMS 20384 / USSD *347*88# (test values, simulator)| Telecom[Telecom Webhook / Simulator]
  end

  Outbox -->|Background Sync (HTTPS)| WebAPI
  Telecom -->|Webhook Callback| WebAPI

  subgraph Processing["Backend Application & AI Services"]
    WebAPI --> Auth[Anonymous Code / PIN & Staff Auth]
    WebAPI --> Privacy[HMAC PII Redactor & Org Secrets]
    Privacy --> DB[(PostgreSQL 17 Primary Store)]
    Privacy --> AI[Calibrated Intelligence Suite]

    AI --> Triage[Category & Urgency Classifier]
    AI --> Abstain[Uncertainty Abstention]
    AI --> Dup[Near-Duplicate Matcher]
    AI --> Cluster[Poisson & CUSUM Surge Detector]
    AI --> Clocks[Review Clocks]
    AI --> RSCheck[Result Sheet Consistency EC8A]
    AI --> Rumour[Multilingual Rumour Matching]
  end

  subgraph Review["Human Oversight & Operations"]
    Triage & Cluster & RSCheck & Clocks --> Queue[Staff Reviewer & Operations Room]
    Queue -->|Accept / Correct / Dispatch| AuditChain[SHA-256 Audit Chain]
  end

  subgraph Output["Transparency & Feedback"]
    AuditChain --> PubAPI[Cell-Suppressed Snapshot Publisher]
    PubAPI --> PublicDash[Public Transparency Dashboard]
    PubAPI --> CitizenReceipt[Citizen Status Lookup]
    AuditChain --> Verify[Audit verification]
  end
```

---

## 2. Core Components

| Component | Responsibility | Tech stack | Location |
|---|---|---|---|
| **Observer app** | Checklist, incident reports, PIN management, offline outbox that sends on reconnection, messages, discussions, "Ask". | Next.js 16 App Router, React 19, CSS Modules, IndexedDB, service worker | `frontend/app/(observer)/o`, `frontend/lib/outbox`, `frontend/public/sw.js` |
| **Staff console** | Queue, case review, assignment, operations, check-ins, rumour desk, publishing, discussions moderation, observer codes, staff accounts, settings, security. | Next.js 16, React 19 | `frontend/app/(staff)/s` |
| **Public pages** | Home, reviewed results, rumour check, guides, "Ask", privacy notice, SMS and USSD simulator, receipt status page. | Next.js 16, React 19 | `frontend/app/(public)`, `frontend/app/(citizen)` |
| **API and core** | REST endpoints, organisation scoping, observer and staff authentication, case transitions, idempotency. | Django 5.2, Django REST framework, PostgreSQL 17 | `backend/` (`accounts`, `reports`, `staff`, `reference`) |
| **Privacy redactor** | Synchronous redaction of phone numbers, VIN, NIN, BVN, emails, account numbers, addresses and listed names into keyed tokens. | Python 3.12, regular expressions, HMAC-SHA256 | `backend/privacy` |
| **Intelligence** | Category and urgency suggestions, abstention, duplicate candidates, claim ranking, transit-risk model; evaluation command. | scikit-learn, NumPy | `backend/intelligence` |
| **Result-sheet checks** | Five arithmetic and pattern flags on Form EC8A transcriptions. | Python | `backend/reports/result_checks.py` |
| **Cluster and emerging alerts** | Count-in-window cluster warnings; Poisson (30 and 60 minute windows), Benjamini-Hochberg (q = 0.05) and one-sided CUSUM detector; coverage. | Python (statistics written in plain Python), PostgreSQL | `backend/ops` |
| **Review clocks** | Per-case target times (urgent 15, high 60, normal 240, low 480, reply 120 minutes), overdue sweep, one alert per overdue case. | Django ORM | `backend/clocks` |
| **Rumours** | Rumour desk, two-person approval of replies, matching of public queries to approved answers (TF-IDF; a multilingual sentence model is used only if installed locally). | scikit-learn, optional sentence-transformers | `backend/rumours` |
| **Notices** | Ward and LGA check-ins; safety notices need a second coordinator. | Django | `backend/notices` |
| **Phone channels** | SMS and USSD handlers, phone hashing, simulator. | Django views | `backend/phone_channels` |
| **Audit record** | Per-organisation SHA-256 hash chain and verification. | Python `hashlib`, PostgreSQL | `backend/staff/audit.py` |
| **Public results** | Snapshots of reviewed totals with small-number suppression and a publication delay of at least 60 minutes. | Django | `backend/publicdata` |


---

## 3. Data Flow and Privacy Boundaries

```
[Observer/Citizen Input]
       │
       ▼ (Client: no name is asked for; SMS and USSD phone numbers are stored only as keyed hashes)
[WebAPI / Django Gateway]
       │
       ▼ (HTTPS in transit; Idempotency-Key validated)
[Synchronous Redaction Engine]
       │
       ▼ (personal details replaced with tokens such as [PHONE_xxxx], [NAME_xxxx], [VIN_xxxx])
[Database Storage (PostgreSQL 17)]
  ├── Report text (reviewers are shown the redacted form; the original is reachable only through audited CASE-06)
  ├── Anonymous Reporter Hash (HMAC-SHA256)
  └── Location: state, LGA, ward and polling unit, as far as the reporter gave it
       │
       ▼ (AI Inference: read-only feature extraction; generates suggestions only)
[Reviewer Interface]
  ├── Auto-redacted view by default
  └── Human decision: Accept, Correct, or Reject
       │
       ▼ (Appended to SHA-256 Audit Chain Head)
[Public Transparency Engine]
  └── Totals by state, type and hour; counts below 5 shown as "fewer than 5"
```

---

## 4. Models and Algorithmic Logic

1. **Category Triage:** A character n-gram TF-IDF and logistic regression model predicting 7 model categories (the observer app offers 10 tiles, including "Not sure", "Misinformation seen here" and "Vote buying or inducement"; the model is scored on these 7) (`access_barrier`, `equipment_failure`, `good_practice`, `intimidation_violence`, `lack_of_information`, `late_materials`, `queues_crowding`).
2. **Urgency:** A severity probability from the text model, with a threshold chosen on the validation split, combined with rules: danger reported now (+5), intimidation or violence (+3), a high severity probability (+3), firsthand, evidence and local cluster (+1 each). A score of 3 or more is urgent.
3. **Uncertainty Abstention:** When model confidence falls below `0.40`, the model explicitly abstains (`abstain = true`), routing the item to human reviewers without automated pre-selection.
4. **Duplicate Detection:** Cosine similarity of character 3-grams (threshold 0.65) between reports in the same ward within a 90-minute window.
5. **Emerging Alerts:** Poisson tests over 30- and 60-minute windows against earlier local baselines and peer LGAs, with Benjamini-Hochberg false-discovery control (q = 0.05) and a one-sided CUSUM.
6. **Result-Sheet Consistency (EC8A):** Five flags: accredited voters above registered voters; votes plus rejected ballots not equal to accredited voters; a swap of two adjacent digits that would reconcile the count; three or more vote entries that are multiples of ten; and numbers identical to another unit's sheet.
7. **Claim Matching:** Compares a public query with reviewer-approved answers. It uses a multilingual sentence model only if one is installed locally (it is not in `requirements.txt`), otherwise word and character TF-IDF. The default match threshold is 0.35.

---

## 5. Human Oversight Points

| Touchpoint | System Proposal | Human Action Required | Fallback if Human Unavailable |
|---|---|---|---|
| **Incident Review** | Suggested category & urgency level | Reviewer clicks "Accept" or selects "Correct" | Report remains marked "Received / In Review"; never auto-promoted. |
| **Rumour Desk** | Suggested harm and check priority | A coordinator drafts a reply; a different coordinator approves it | The reply stays in draft and is not shown to the public. |
| **Safety notice** | A coordinator writes a check-in of type "safety" | A different coordinator must approve it | It stays pending and observers do not see it. |
| **Result-Sheet Flags** | Arithmetic inconsistency flags | The reviewer compares with the photo of the sheet | Flags are shown with possible harmless causes; numbers are never altered. |
| **Public Transparency** | Draft aggregated snapshot | Coordinator approves cutoff date and release | No new snapshot published; previous snapshot remains active. |

---

## 6. Security & Privacy Architecture (STRIDE Threat Model)

| Threat Category | Target Component | Technical Mitigation | Residual Risk |
|---|---|---|---|
| **Spoofing** | Observer sign-in | Random codes with a check character; PINs hashed with PBKDF2-SHA256; 5 wrong tries in 15 minutes lock the code for 15 minutes, 10 in 24 hours lock it until reset. | A stolen card and PIN work until revoked. |
| **Tampering** | Audit and case records | Per-organisation SHA-256 hash chain (`AuditEvent`, `backend/staff/audit.py`); verification at `GET /api/v1/audit/verify`. | Someone controlling the database could rewrite the whole chain; the published fingerprint is the check. |
| **Repudiation** | Staff actions | Review and audit events name the acting account. | Depends on accounts not being shared. |
| **Information Disclosure** | Reporter identity | No name asked; phone numbers stored only as keyed hashes; small numbers hidden in public results. | Redaction recall is 96.3%; some details can slip through. |
| **Denial of Service** | Web and phone APIs | Per-user and per-IP rate limits (for example 10 rumour checks an hour per IP and device; 30 original-text requests an hour per reviewer); UUID v4 idempotency keys. | Large distributed floods are not addressed in the code. |
| **Elevation of Privilege** | Staff console | Server-side role checks: observer, reviewer, moderator, coordinator, organisation admin; records scoped to the organisation. | Only as complete as the tests (`backend/staff/test_boundaries.py`). |


---

## 7. Deployment and Operations

- **Containers:** `deploy/compose.yaml` runs PostgreSQL 17, a migration job, the Django backend (gunicorn), a worker, a media worker, the Next.js frontend and an nginx gateway. There is no Redis.
- **Azure (planned, not deployed):** `deploy/azure/` has Bicep templates for Azure Container Apps, Azure Database for PostgreSQL Flexible Server 17 (private subnet), an Azure Files share for private media, Key Vault and Container Registry, in South Africa North. The team was still waiting for Azure access; see `docs/azure-deployment.md`.
