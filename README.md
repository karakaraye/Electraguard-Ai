# ElectraGuard AI

Nonpartisan election observation and citizen accountability system for Nigeria, built by Cairn for the #AI4Elections hackathon (Track 5: Election Observation and Citizen Accountability, integrating Tracks 1–4).

---

## 1. ElectraGuard in Two Minutes

### What It Is
ElectraGuard AI is a software platform for monitoring elections in Nigeria. It connects field observers, citizens, situation-room analysts, and the public during voting and collation. It works when mobile networks fail, protects the identity of people reporting from polling units, and helps teams process thousands of incoming reports without losing urgent safety issues.

### Who It Is For
- **Field Observers:** Accredited civil-society observers stationed at polling units who verify opening times, logistics, voting procedures, and official result sheets.
- **Citizens and Voters:** Everyday voters who want to report an irregularity, check on the status of their report, or verify whether a viral election rumour has been debunked.
- **Situation Room Staff:** Reviewers, operations coordinators, and fact-checkers who triage incoming reports, detect emerging patterns, and respond to incidents.
- **The Public and Media:** Journalists, researchers, and citizens seeking aggregate, verified observations without partisan bias or unverified rumours.

### The Problem in Nigerian Elections
Nigeria has 176,846 polling units across 774 Local Government Areas (LGAs). On election day, four problems consistently undermine observation:
1. **Network Blackouts:** Observers frequently lose connectivity at remote polling units, leaving reports trapped on their devices until voting ends.
2. **Reviewer Overload:** Central command rooms receive thousands of unstructured messages, photos, and duplicate reports, causing real emergencies to get lost in the noise.
3. **Safety Risks:** Observers and citizens reporting ballot box snatching or voter intimidation risk retaliation if their identity or location is exposed.
4. **Viral Misinformation:** False reports about polling unit cancellations, delayed materials, or fake vote counts spread faster than official clarifications.

### What an Observer Does
An observer signs in using an anonymous 8-character code and a 6-digit PIN (no name, email, or phone number required). During voting day, the observer:
1. Completes a timed checklist tracking whether the polling unit opened on time, whether BVAS (Bimodal Voter Accreditation System) functioned, and whether materials arrived complete.
2. Files incident reports in seven standardized categories, attaching photos or audio when safe. If offline, reports are stored on the phone and sync automatically when network returns.
3. Receives an instant cryptographic receipt code (`EG-xxxx-xxxx`) to track the report.
4. Transcribes the official polling unit result sheet (Form EC8A). Built-in checks verify that accredited voters do not exceed registered voters and that candidate vote totals sum correctly.
5. Responds to ward-level check-ins sent by situation-room coordinators.

### What a Citizen Does
A citizen can take part without creating an account:
1. Submits an incident report via the web form, or sends an SMS or USSD code (`*384*24#`) from a basic feature phone.
2. Receives a private receipt code to look up reviewer progress and follow-up questions at `/receipt`.
3. Checks viral claims at `/check` or by texting `CHECK <claim>` via SMS. If the claim matches an approved fact-check, the verified verdict is returned immediately. If not, the claim is queued for situation-room analysts.

### What Is Published vs. What Is Never Published
- **Published on the Public Transparency Dashboard (`/` and `/results`):** Aggregate counts of reviewed incidents by state and category, verified rumour verdicts, and observer status summaries. Any geographic breakdown with fewer than 5 reports (`< 5`) is automatically suppressed to protect informants from being singled out.
- **Never Published:** Names, personal phone numbers, device identifiers, voter card numbers (VIN), observer identities, exact timestamps of sensitive reports, raw unredacted text, or unreviewed claims.
- **Constitutional Boundary:** ElectraGuard AI **never** projects winners or declares election results. Official election declaration is the exclusive constitutional prerogative of the Independent National Electoral Commission (INEC).

---

## 2. For Judges

This section outlines how ElectraGuard AI satisfies each of the six evaluation criteria for the #AI4Elections hackathon, pointing directly to the codebase and verification evidence.

### Criterion 1: Technology and Innovation (25 Points)
- **Calibrated Human-in-the-Loop Triage:** Statistical models suggest incident categories and urgency scores while deferring ambiguous reports to human reviewers. When model confidence falls below 0.40, the system abstains rather than making an unverified guess ([`backend/intelligence/triage.py`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/backend/intelligence/triage.py), [`docs/submission/MODEL_CARD.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/submission/MODEL_CARD.md)).
- **Automatic Privacy Redaction:** Synchronous pattern-matching redacts Nigerian phone numbers, voter card numbers (VIN/PVC), national identity numbers (NIN), bank verification numbers (BVN), and curated Nigerian names across Hausa, Yoruba, Igbo, and Edo, replacing them with HMAC tokens ([`backend/privacy/redactor.py`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/backend/privacy/redactor.py), evaluated in [`docs/eval/redaction.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/eval/redaction.md)).
- **Dual-Window Poisson & CUSUM Surge Detection:** Replaced naive thresholds with dual-window (30m & 60m) Poisson statistical modeling, Benjamini–Hochberg False Discovery Rate control ($q=0.05$), and CUSUM drift detection to spot slow multi-hour build-ups while dropping false alarms by 99.7% ([`backend/ops/emerging.py`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/backend/ops/emerging.py), [`docs/eval/emerging-alerts.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/eval/emerging-alerts.md)).
- **Regulatory Review Clocks:** Enforces time-to-review targets based on case urgency (15m urgent, 60m high, 240m normal), tracking live states (`on_time`, `due_soon`, `overdue`) with single-alert background sweeps ([`backend/clocks/calculator.py`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/backend/clocks/calculator.py), [`backend/clocks/sweep.py`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/backend/clocks/sweep.py)).
- **Multilingual Semantic Claim Matching:** Multilingual embeddings and TF-IDF fallbacks match incoming public queries against approved fact-checks in milliseconds ([`backend/rumours/matching.py`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/backend/rumours/matching.py), evaluated in [`docs/eval/claim-matching.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/eval/claim-matching.md)).

### Criterion 2: Electoral Relevance (20 Points)
- **Targeted to Nigerian Realities:** Built around the administrative structure of 36 States + FCT, 774 LGAs, 8,809 Wards, and 176,846 Polling Units ([`data/reference/official-synthetic-areas.json`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/data/reference/official-synthetic-areas.json)).
- **Observation Workflow (Form EC8A & Checklist):** Real polling-day checklist matching INEC guidelines and ballot sheet validation that checks arithmetic consistency on accreditation and party vote tallies ([`backend/intelligence/result_checks.py`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/backend/intelligence/result_checks.py)).
- **Ward Check-Ins & Safety Notices:** Situation-room coordinators can broadcast check-ins to observers in specific wards. Safety advisories require two independent coordinator approvals before dispatch ([`backend/ops/notices.py`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/backend/ops/notices.py)).
- **Public Rumour Check:** Direct debunking channel for viral claims during collation periods ([`frontend/app/(public)/check/`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/frontend/app/(public)/check/)).

### Criterion 3: Security, Privacy, and Responsible AI (20 Points)
- **Zero-PII Observer Credentialing:** Observers sign in using anonymous random batch codes and 6-digit PINs; no personal credentials are stored in database tables ([`backend/accounts/observer_auth.py`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/backend/accounts/observer_auth.py)).
- **Cryptographic Audit Chain:** Every case action (triage, status change, note, review decision) appends to an immutable SHA-256 hash chain with cryptographic verification ([`backend/reports/workflow.py`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/backend/reports/workflow.py), verified at `/api/v1/security/audit-chain/verify`).
- **Controlled Original Access (CASE-06):** Reviewers view auto-redacted text by default. Opening the unredacted original requires entering a written justification (1–500 characters), is rate-limited to 30 requests/hour, and writes an audit event ([`backend/staff/audit.py`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/backend/staff/audit.py), [`backend/reports/reviewer_views.py`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/backend/reports/reviewer_views.py)).
- **Small-Number Suppression:** Public dashboard aggregates suppress counts lower than 5 (`< 5`) to prevent triangulation of observers in low-turnout units ([`backend/publicdata/views.py`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/backend/publicdata/views.py)).
- **Comprehensive Threat & Privacy Models:** Documented STRIDE/LINDDUN threat assessments ([`docs/submission/THREAT_MODEL.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/submission/THREAT_MODEL.md)) and NDPA compliance register ([`docs/submission/SAFETY_AND_LIMITATIONS.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/submission/SAFETY_AND_LIMITATIONS.md)).

### Criterion 4: Inclusion and Multilingual (15 Points)
- **Five Full Nigerian Languages:** The interface, messages, and guidance are fully localized in **English**, **Nigerian Pidgin (Naijá)**, **Hausa**, **Yorùbá**, and **Igbo** ([`frontend/messages/*.json`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/frontend/messages/)).
- **Telecom Access for Basic Phones:** Built-in interactive USSD (`*384*24#`) session engine and SMS inbound intake for feature-phone users without internet access ([`backend/phone_channels/`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/backend/phone_channels/), test simulator at `/phone`).
- **Accessibility & Contrast:** 0 serious or critical Axe accessibility violations (WCAG 2.2 AA compliant), generous 48px touch targets, warm paper palette, and full functionality under `prefers-reduced-motion` ([`frontend/ui/`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/frontend/ui/)).
- **Low-Bandwidth (2G) Optimized:** First-load bundle under 300 KB; resilient offline ServiceWorker and IndexedDB queue ([`frontend/lib/outbox/`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/frontend/lib/outbox/)).

### Criterion 5: Scalability (15 Points)
- **Locust Load Tested:** Verified at 200 concurrent requests/sec with p95 response time under 180ms ([`docs/submission/LOAD_AND_COST.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/submission/LOAD_AND_COST.md)).
- **Idempotency and Concurrency:** Every unsafe POST request requires a UUIDv4 `Idempotency-Key` and database lock, preventing duplicate submissions during network retries ([`backend/reports/idempotency.py`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/backend/reports/idempotency.py)).
- **Deployment Infrastructure:** Complete Docker Compose production setup with TLS gateway, PostgreSQL 17, and automated Azure App Service / Bicep configurations ([`deploy/compose.yaml`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/deploy/compose.yaml), [`deploy/azure/`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/deploy/azure/), [`docs/azure-deployment.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/azure-deployment.md)).

### Criterion 6: Demo and Documentation (5 Points)
- **Three-Minute Video Script:** Complete shot-by-shot script with visual cues, voiceover, and timings ([`docs/submission/VIDEO_SCRIPT.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/submission/VIDEO_SCRIPT.md)).
- **Role-Based Guides with Real Screenshots:** Step-by-step illustrated documentation for observers, citizens, and staff roles ([`docs/guides/`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/guides/)).
- **Documentation Sitemap:** Full inventory mapping every document to its purpose and target reader ([`docs/README.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/README.md)).

---

## 3. For Engineers

### Project Layout
```text
Electraguard-Ai/
├── backend/                  # Python 3.12 / Django 5 backend
│   ├── accounts/             # Observer codes, PIN auth, staff sessions, organisations
│   ├── clocks/               # Regulatory review clocks and overdue background sweeps
│   ├── discussions/          # Observer community discussions and safety flags
│   ├── intelligence/         # Statistical triage, duplicate detection, result checks
│   ├── ops/                  # Emerging alerts, Poisson/CUSUM clusters, ward check-ins
│   ├── phone_channels/       # SMS and USSD simulation and webhook ingestion
│   ├── privacy/              # HMAC-SHA256 PII redactor and organisation secrets
│   ├── publicdata/           # Public transparency dashboard and <5 suppression
│   ├── reports/              # Core incident reports, evidence storage, audit chain
│   ├── rumours/              # Claim matching, multilingual embeddings, rumour desk
│   ├── security/             # Security dashboard, rate-limiting, audit verification
│   └── staff/                # Review queue, case actions, coordinator assignment
├── frontend/                 # Next.js 16 / React 19 / TypeScript / CSS Modules
│   ├── app/(observer)/       # Observer flow: start, checklist, report, receipt, outbox
│   ├── app/(public)/         # Public home, transparency, rumour check, phone simulator
│   ├── app/(staff)/          # Staff workspace: review queue, ops overview, check-ins
│   ├── lib/                  # Offline outbox (IndexedDB), API client, i18n
│   ├── messages/             # Localization JSONs: en, pcm, ha, yo, ig
│   └── ui/                   # Brand tokens, components, SVG illustrations
├── deploy/                   # Production Dockerfile, Compose, Nginx, Azure Bicep
├── docs/                     # Submission docs, evaluations, role guides, architecture
└── scripts/                  # Evaluation benchmarks and database utilities
```

### Local Development Setup

#### 1. Prerequisites
- Python 3.12+
- Node.js 22+ and npm
- PostgreSQL 17 (or Docker Compose)

#### 2. Database and Backend
From the repository root:
```bash
# Start PostgreSQL (or use an existing PostgreSQL 17 instance on port 5432)
docker compose -f deploy/compose.yaml up -d --wait postgres

# Create and activate Python virtual environment
python -m venv backend/.venv
# Windows:
.\backend\.venv\Scripts\activate
# Linux/macOS:
source backend/.venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Run migrations and seed synthetic reference areas
python backend/manage.py migrate
python backend/manage.py load_reference_areas

# Provision staff administrator and test observer codes
python backend/manage.py provision_account --email admin@cairn.example --role coordinator
python backend/manage.py issue_observer_codes --count 10 --organisation 1

# Start the Django backend (port 8000)
python backend/manage.py runserver 127.0.0.1:8000
```

#### 3. Frontend
In a second terminal:
```bash
cd frontend

# Install npm dependencies
npm ci

# Start Next.js development server (port 3000)
npm run dev -- -p 3000
```
Open `http://localhost:3000` in your browser.

### Test Commands

#### Run Full Backend Test Suite (PostgreSQL 17)
```bash
cd backend
python manage.py test --noinput
```
*Expected: 336 tests, 0 failures, 1 skipped.*

#### Run Frontend Lint, Typecheck, and Production Build
```bash
cd frontend
npm run lint
npm run typecheck
npm run build
```

#### Run End-to-End Real-Server Browser Tests
```bash
cd frontend
npx playwright test --config playwright.real.config.ts
```

#### Run Evaluation Benchmarks
```bash
# Redaction recall and precision evaluation (310 test cases across 5 languages)
python scripts/eval/redaction.py

# Poisson & CUSUM volume alert benchmark
python scripts/eval/emerging_alerts.py

# Multilingual claim matching evaluation
python scripts/eval/claim_matching.py
```

### Key Documentation Links
- **Documentation Sitemap:** [`docs/README.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/README.md)
- **Role Guides:** [`docs/guides/observer-guide.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/guides/observer-guide.md), [`citizen-guide.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/guides/citizen-guide.md), [`staff-guide.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/guides/staff-guide.md), [`glossary.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/guides/glossary.md)
- **Architecture & System Design:** [`docs/submission/ARCHITECTURE.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/submission/ARCHITECTURE.md)
- **API Contracts:** [`docs/submission/API_REFERENCE.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/submission/API_REFERENCE.md)
- **Threat Model & Safety:** [`docs/submission/THREAT_MODEL.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/submission/THREAT_MODEL.md), [`docs/submission/SAFETY_AND_LIMITATIONS.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/submission/SAFETY_AND_LIMITATIONS.md)
- **Model Card & Data Sheet:** [`docs/submission/MODEL_CARD.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/submission/MODEL_CARD.md), [`docs/submission/DATASHEET.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/submission/DATASHEET.md)
- **Video Walkthrough Script:** [`docs/submission/VIDEO_SCRIPT.md`](file:///C:/Users/Windows/Desktop/CAIRN/.worktrees/EG-docs-readable/docs/submission/VIDEO_SCRIPT.md)
