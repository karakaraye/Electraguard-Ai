# Architecture and Technical Design: ElectraGuard AI

> **In plain words:**  
> ElectraGuard AI is built like a secure emergency-response system. Observers and voters send reports from phones even when there is no mobile data. The backend server automatically cleans names and phone numbers, groups similar reports, and measures review response times against strict deadlines. Human reviewers make every decision, and every change is locked into an unchangeable digital chain so no report can be quietly altered or deleted.

---

**Hackathon Challenge:** #AI4Elections Track 5 — Election Observation and Citizen Accountability  
**Team:** Cairn  
**Date:** 2026-11-26  
**Status:** Prototype

---

## 1. System Overview

ElectraGuard AI is a nonpartisan, offline-first election observation, incident verification, and civic accountability platform built specifically for low-connectivity environments in Nigeria.

### System Context Diagram
```mermaid
flowchart TD
  subgraph Ingestion["Ingestion Channels"]
    Obs[Accredited Observer PWA] -->|Offline-First Queue| Outbox[Local Outbox (IndexedDB)]
    Cit[Citizen Web Portal] -->|Anonymous Form| WebAPI[REST API Gateway]
    Phone[Feature Phone User] -->|SMS / USSD *384*24# (Prototype)| Telecom[Telecom Webhook / Simulator]
  end

  Outbox -->|Background Sync (TLS 1.3)| WebAPI
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
    AI --> Clocks[Regulatory Review Clocks]
    AI --> RSCheck[Result Sheet Consistency EC8A]
    AI --> Rumour[Multilingual Rumour Matching]
  end

  subgraph Review["Human Oversight & Operations"]
    Triage & Cluster & RSCheck & Clocks --> Queue[Staff Reviewer & Operations Room]
    Queue -->|Accept / Correct / Dispatch| AuditChain[SHA-256 Merkle Audit Chain]
  end

  subgraph Output["Transparency & Feedback"]
    AuditChain --> PubAPI[Cell-Suppressed Snapshot Publisher]
    PubAPI --> PublicDash[Public Transparency Dashboard]
    PubAPI --> CitizenReceipt[Citizen Status Lookup]
    AuditChain --> Export[Exportable Audit Chain Head]
  end
```

---

## 2. Core Components

| Component | Responsibility | Tech Stack | Location |
|---|---|---|---|
| **Observer PWA (`app/(observer)`)** | Offline checklist, incident reporting, PIN management, client-side IndexedDB outbox with auto-flush on reconnection. | Next.js 16 App Router, React 19, CSS Modules, IndexedDB | `frontend/app/(observer)` |
| **Staff Console (`app/(staff)`)** | Queue triage, case review, redaction, operations room, review clock monitoring, ward check-ins, rumour approval, audit export. | Next.js 16 App Router, React 19, CSS Modules | `frontend/app/(staff)` |
| **Public Portal (`app/(public)`)** | Citizen reporting, receipt lookup, rumour checking, public transparency dashboard with `< 5` cell suppression. | Next.js 16, React 19, Server Components | `frontend/app/(public)` |
| **API Gateway & Core (`backend/`)** | REST API endpoints, organisation scoping, observer code authentication, case transitions, and idempotency control. | Django 5, Django REST Framework, PostgreSQL 17 | `backend/` |
| **Privacy Redactor (`backend/privacy`)** | Synchronous PII redaction (phones, VIN, NIN, BVN, Nigerian names) replacing sensitive text with scoped HMAC tokens. | Python 3.12, regex, HMAC-SHA256 | `backend/privacy` |
| **Intelligence Engine (`backend/intelligence`)** | Triage classification, urgency scoring, uncertainty abstention, duplicate detection, result sheet EC8A arithmetic verification. | Python 3.12, scikit-learn, NumPy, SciPy | `backend/intelligence` |
| **Emerging Alerts (`backend/ops`)** | Dual-window Poisson anomaly detection, Benjamini–Hochberg FDR control ($q=0.05$), and CUSUM drift scanning. | Python 3.12, SciPy, PostgreSQL | `backend/ops` |
| **Review Clocks (`backend/clocks`)** | Regulatory time-to-review timers (urgent: 15m, high: 60m, normal: 240m), background sweep, and single overdue breach auditing. | Python 3.12, Django ORM | `backend/clocks` |
| **Rumour Matching (`backend/rumours`)** | Semantic claim similarity matching against approved debunks with TF-IDF fallback and public check ranking. | Python 3.12, sentence-transformers, scikit-learn | `backend/rumours` |
| **Telecom Channels (`backend/phone_channels`)** | SMS and USSD (`*384*24#`) callback webhooks, phone hashing, outbound receipt dispatch, interactive simulator. | Python 3.12, Django Channels | `backend/phone_channels` |
| **Cryptographic Audit (`backend/reports`, `security`)** | Immutable SHA-256 tamper-evident hash chaining for all state transitions with on-demand verification. | Python `hashlib`, PostgreSQL | `backend/reports`, `backend/security` |

---

## 3. Data Flow and Privacy Boundaries

```
[Observer/Citizen Input]
       │
       ▼ (Client: zero personal data collected; phone numbers hashed to HMAC-SHA256)
[WebAPI / Django Gateway]
       │
       ▼ (Encrypted in transit via TLS 1.3; Idempotency-Key validated)
[Synchronous Redaction Engine]
       │
       ▼ (PII replaced with [PHONE_xxxx], [NAME_xxxx], [ID_xxxx] tokens)
[Database Storage (PostgreSQL 17)]
  ├── Redacted report narrative (raw original accessible only via audited CASE-06)
  ├── Anonymous Reporter Hash (HMAC-SHA256)
  └── Location: LGA / Ward / Polling Unit Code
       │
       ▼ (AI Inference: read-only feature extraction; generates suggestions only)
[Reviewer Interface]
  ├── Auto-redacted view by default
  └── Human decision: Accept, Correct, or Reject
       │
       ▼ (Appended to SHA-256 Audit Chain Head)
[Public Transparency Engine]
  └── Aggregation to LGA level; small-cell suppression (< 5 reports -> "< 5")
```

---

## 4. Models and Algorithmic Logic

1. **Category Triage:** Calibrated multi-class model predicting 7 product categories (`access_barrier`, `equipment_failure`, `good_practice`, `intimidation_violence`, `lack_of_information`, `late_materials`, `queues_crowding`).
2. **Urgency Classification:** Cost-sensitive probability scoring tuned on validation split combined with deterministic escalation rules for immediate danger, violence, and local clusters.
3. **Uncertainty Abstention:** When model confidence falls below `0.40`, the model explicitly abstains (`abstain = true`), routing the item to human reviewers without automated pre-selection.
4. **Duplicate Detection:** TF-IDF n-gram and character similarity constrained within matching polling unit / ward boundaries and 2-hour temporal windows.
5. **Spatial Cluster Detection:** Dual-window (30m & 60m) Poisson scan statistic evaluated against earlier local baselines and peer LGAs, with Benjamini–Hochberg False Discovery Rate control ($q=0.05$) and one-sided CUSUM drift detection.
6. **Result-Sheet Consistency (EC8A):** Five mathematical assertions:
   - $V_{accredited} \le V_{registered}$
   - $\sum V_{party} + V_{rejected} = V_{ballots\_cast}$
   - Flagging identical vote totals repeated across consecutive polling units.
   - Identifying Benford's law / round number anomalies ($V \pmod{50} = 0$).
   - Digit transposition checks ($\text{diff} \pmod 9 = 0$).
7. **Semantic Claim Matching:** Dense multilingual sentence embeddings comparing incoming citizen queries to approved debunks, with TF-IDF fallback when neural models are offline.

---

## 5. Human Oversight Points

| Touchpoint | System Proposal | Human Action Required | Fallback if Human Unavailable |
|---|---|---|---|
| **Incident Review** | Suggested category & urgency level | Reviewer clicks "Accept" or selects "Correct" | Report remains marked "Received / In Review"; never auto-promoted. |
| **Rumour Desk** | Suggested veracity score & harm score | Fact-checker verifies sources and drafts debunk | Debunk is held in draft; never published to public channels. |
| **Safety Advisory** | Security alert for field observers | **Dual authorization:** requires two independent coordinators to sign off | Notice held in draft; never broadcast to observers or public. |
| **Result-Sheet Flags** | Arithmetic inconsistency warning | Auditor examines physical/scanned Form EC8A photo | Warning displayed in dashboard; vote totals are never altered. |
| **Public Transparency** | Draft aggregated snapshot | Coordinator approves cutoff date and release | No new snapshot published; previous snapshot remains active. |

---

## 6. Security & Privacy Architecture (STRIDE Threat Model)

| Threat Category | Target Component | Technical Mitigation | Residual Risk |
|---|---|---|---|
| **Spoofing** | Observer Reporting | Random alphanumeric batch codes + 6-digit PINs; observer personal identity is never recorded. | Credential theft mitigated by PIN lockout after 5 failed attempts. |
| **Tampering** | Audit & Case Records | Merkle-style SHA-256 hash chaining (`AuditChainHead`); every transition is tamper-evident. | Database compromise cannot forge historical chain hashes. |
| **Repudiation** | Staff Review Actions | Cryptographic signing of review actions with actor UUID and timestamp in immutable audit log. | None. |
| **Information Disclosure** | Informant / Reporter Identity | Zero PII stored; phone numbers converted to HMAC-SHA256; public dashboard suppresses cells < 5. | Re-identification via side-channels prevented by LGA aggregation. |
| **Denial of Service** | Web & Telecom API | Gateway rate limiting (10 req/hour per IP/device on public check; 30 req/hour on CASE-06); UUIDv4 idempotency keys. | Distributed volumetric attacks mitigated by reverse proxy. |
| **Elevation of Privilege** | Staff Workspace | Strict role-based access control (RBAC): Observer, Reviewer, Coordinator, Moderator, Org Admin. | Role boundary violations caught by unit tests and middleware. |

---

## 7. Deployment and Operations

- **Containerized Architecture:** Fully dockerized via `deploy/compose.yaml` (Django REST API, PostgreSQL 17, Next.js Node runtime, Redis cache, Nginx reverse proxy).
- **Target Cloud Environment:** Microsoft Azure (Azure App Service / Container Apps, Azure Database for PostgreSQL 17, Azure Blob Storage with customer-managed keys). Detailed deployment scripts provided in `deploy/azure/`.
