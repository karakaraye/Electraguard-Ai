# ElectraGuard AI Documentation Index & Reading Guide

Welcome to the documentation suite for **ElectraGuard AI**, developed by Team Cairn for the **#AI4Elections Hackathon (Track 5: Election Observation and Citizen Accountability)**.

This index organizes all documentation by target reader so that voters, election observers, situation room analysts, hackathon judges, and software engineers can quickly navigate to the information they need.

---

## 1. Quick Navigation by Reader

```
+----------------------------------------------------------------------------------------------------+
|                                      WHICH READER ARE YOU?                                         |
+--------------------------+----------------------------+-----------------------+--------------------+
| 🗳️ Citizen or Voter      | 📋 Field Observer          | 🏢 Situation Room     | ⚖️ Hackathon Judge  |
| - citizen-guide.md       | - observer-guide.md        | - staff-guide.md      | - README.md (Judges|
| - glossary.md            | - glossary.md              | - glossary.md         | - submission/*.md  |
| - Problem overview       | - Field checklist          | - api-contracts.md    | - VIDEO_SCRIPT.md  |
+--------------------------+----------------------------+-----------------------+--------------------+
|                                    💻 Software & Ops Engineer                                      |
|                                    - README.md (Local setup)                                       |
|                                    - ARCHITECTURE.md & API_REFERENCE.md                            |
|                                    - LOAD_AND_COST.md & azure-deployment.md                         |
+----------------------------------------------------------------------------------------------------+
```

### For Citizens and Voters
You want to know how to report an incident anonymously, track your report, verify election rumours, or access basic phone channels (USSD and SMS).
* **Start here:** [`docs/guides/citizen-guide.md`](guides/citizen-guide.md)
* **Key terminology:** [`docs/guides/glossary.md`](guides/glossary.md)
* **Why this matters:** [`docs/submission/PROBLEM.md`](submission/PROBLEM.md)

### For Accredited Field Observers
You are stationed at a polling unit and need to understand how to sign in with your batch code, submit 7-step incident reports, work completely offline, verify Form EC8A result sheets, and answer questions from the situation room.
* **Start here:** [`docs/guides/observer-guide.md`](guides/observer-guide.md)
* **Key terminology:** [`docs/guides/glossary.md`](guides/glossary.md)
* **Operational procedures:** [`docs/field-operations.md`](field-operations.md)

### For Situation Room Staff & Election Organizations
You are a reviewer, coordinator, or system administrator triaging incoming incident queues, monitoring Poisson/CUSUM surveillance spikes, coordinating ward check-ins, approving safety notices with dual-coordinator authorization, or auditing cryptographic logs.
* **Start here:** [`docs/guides/staff-guide.md`](guides/staff-guide.md)
* **Safety & privacy rules:** [`docs/submission/SAFETY_AND_LIMITATIONS.md`](submission/SAFETY_AND_LIMITATIONS.md)
* **Full API contracts:** [`docs/design/api-contracts.md`](design/api-contracts.md)

### For Hackathon Judges
You are evaluating ElectraGuard AI against the six #AI4Elections rubric criteria (Technology & Innovation, Electoral Relevance, Security & Privacy, Inclusion & Multilingual, Scalability, Demo & Documentation).
* **Start here:** [`README.md`](../README.md) — specifically Layer 2 ("For Judges"), which links each score criterion directly to code, contracts, and tests.
* **3-Minute Demo Video Script:** [`docs/submission/VIDEO_SCRIPT.md`](submission/VIDEO_SCRIPT.md)
* **Empirical Benchmark Numbers:** [`docs/submission/EVALUATION.md`](submission/EVALUATION.md)
* **Model & Intelligence Suite:** [`docs/submission/MODEL_CARD.md`](submission/MODEL_CARD.md)
* **Threat Model & Privacy Matrices:** [`docs/submission/THREAT_MODEL.md`](submission/THREAT_MODEL.md)

### For Software Engineers and Operations
You want to install, run, test, benchmark, or deploy ElectraGuard AI locally or on cloud infrastructure.
* **Quick local setup:** [`README.md`](../README.md) (Layer 3: "For Engineers")
* **System Architecture:** [`docs/submission/ARCHITECTURE.md`](submission/ARCHITECTURE.md)
* **REST API Reference:** [`docs/submission/API_REFERENCE.md`](submission/API_REFERENCE.md)
* **Load Benchmarks & Azure Costs:** [`docs/submission/LOAD_AND_COST.md`](submission/LOAD_AND_COST.md)
* **Production Deployment Guide:** [`docs/azure-deployment.md`](azure-deployment.md)
* **Engineering Handoff:** [`docs/engineering-handoff.md`](engineering-handoff.md)

---

## 2. Complete Document Catalog

Every document in the repository is cataloged below with its target audience and a brief summary of contents.

### Root Directory

| Document | Target Audience | Summary |
|---|---|---|
| [`README.md`](../README.md) | All Readers | Layered project introduction: "ElectraGuard in Two Minutes", rubric evidence pointers for judges across all 6 criteria, and complete developer setup instructions. |

---

### User & Operational Guides (`docs/guides/`)

| Document | Target Audience | Summary |
|---|---|---|
| [`docs/guides/citizen-guide.md`](guides/citizen-guide.md) | Citizens, Voters, Public | Step-by-step guide to anonymous incident reporting, receipt tracking at `/receipt`, rumour checking at `/check`, and feature phone channels (USSD `*384*24#` and SMS `38424`). |
| [`docs/guides/observer-guide.md`](guides/observer-guide.md) | Field Observers | Guide to anonymous batch code login, guided 7-step incident reporting, offline outbox caching and auto-sync, Form EC8A arithmetic verification, and responding to situation room queries. |
| [`docs/guides/staff-guide.md`](guides/staff-guide.md) | Reviewers, Coordinators, Admins | Operational manual covering RBAC permissions, queue triage with live review clocks, automated PII redaction, CASE-06 unredacted access, 60-LGA surveillance, dual-coordinator safety notices, and SHA-256 audit chaining. |
| [`docs/guides/glossary.md`](guides/glossary.md) | All Readers | Comprehensive glossary defining 17 core Nigerian electoral, technical, and operational terms (INEC, Polling Unit, BVAS, Form EC8A, Observer Code, Receipt Code, Review Clock, Small-Cell Suppression `< 5`, SHA-256 Hash Chain). |

---

### Hackathon Submission & Technical Reports (`docs/submission/`)

| Document | Target Audience | Summary |
|---|---|---|
| [`docs/submission/PROBLEM.md`](submission/PROBLEM.md) | Judges, General Public, Analysts | Explains the structural bottlenecks in Nigerian election observation (fragmented reporting, network outages, informant retaliation, auditability gaps) that ElectraGuard AI solves. |
| [`docs/submission/ARCHITECTURE.md`](submission/ARCHITECTURE.md) | Engineers, Architects, Judges | Architectural breakdown of the Next.js 15 frontend, Django 5.1 REST API, PostgreSQL 17 database, offline ServiceWorker outbox, automated privacy engine, and SHA-256 Merkle-style audit chain. |
| [`docs/submission/SAFETY_AND_LIMITATIONS.md`](submission/SAFETY_AND_LIMITATIONS.md) | Judges, Legal / Privacy Officers | Safety statement detailing NDPA 2023 compliance, zero-PII data minimization, automated regex/NER redaction, small-cell suppression (`< 5`), risk register, and non-operational prototype disclaimer. |
| [`docs/submission/THREAT_MODEL.md`](submission/THREAT_MODEL.md) | Security Analysts, Judges | Exhaustive STRIDE cybersecurity and LINDDUN privacy threat modeling mapping attack vectors to concrete code paths and automated test suites. |
| [`docs/submission/MODEL_CARD.md`](submission/MODEL_CARD.md) | ML Engineers, Judges | Formal model card documenting nine assistive intelligence and surveillance components (A1–A6, A8, A13, C16 redaction, C17 surge detection, C18 review clocks) with inputs, outputs, and ethical limits. |
| [`docs/submission/DATASHEET.md`](submission/DATASHEET.md) | Researchers, Judges | Gebru-style datasheets for all six datasets used across the system (synthetic starter pack, authored robustness set, reference boundaries, EC8A returns, redaction benchmark, and surge simulation). |
| [`docs/submission/EVALUATION.md`](submission/EVALUATION.md) | Judges, ML Engineers | Deterministic evaluation report (Seed 42) reporting exact macro-F1 (0.824), Pidgin robustness (0.848), PII redaction recall (96.3%), volume surge detection (70% recall, 19m TTD, 0.39 false alarms/hr), and result-sheet checks. |
| [`docs/submission/METHODOLOGY.md`](submission/METHODOLOGY.md) | Engineers, Researchers | Comprehensive description of engineering methodology, human-in-the-loop oversight principles, offline-first edge architecture, and leakage-free evaluation partitioning. |
| [`docs/submission/LOAD_AND_COST.md`](submission/LOAD_AND_COST.md) | DevOps, System Administrators | Local Locust load test methodology and an election-day Azure cloud cost estimate ($5.18 for 24 hours of compute and 30 days of data retention). |
| [`docs/submission/API_REFERENCE.md`](submission/API_REFERENCE.md) | Engineers, Integrators | Exhaustive contract-level REST API reference detailing headers, authentication, CSRF handling, error schemas, and endpoint specifications across all system modules. |
| [`docs/submission/VIDEO_SCRIPT.md`](submission/VIDEO_SCRIPT.md) | Judges, Video Producers | Complete 3-minute (180s) shot-by-shot demonstration video script specifying visual actions, on-screen text, voiceover narration, and second-by-second timing. |

---

### Engineering & Infrastructure References (`docs/`)

| Document | Target Audience | Summary |
|---|---|---|
| [`docs/field-operations.md`](field-operations.md) | Observer Coordinators, Field Leads | Operational deployment plan covering observer credential distribution, communications protocols, emergency escalation procedures, and post-election debriefs. |
| [`docs/azure-deployment.md`](azure-deployment.md) | DevOps, Infrastructure Engineers | Step-by-step guide to provisioning Azure App Service Linux, Azure Database for PostgreSQL Flexible Server, Azure Blob Storage, and TLS certificates. |
| [`docs/engineering-handoff.md`](engineering-handoff.md) | Software Engineers | Technical transition guide detailing environment configurations, database migrations, background Celery workers, and test suite commands. |
| [`docs/agent-updates.md`](agent-updates.md) | Developers, Reviewers | Chronological log of engineering development slices, ownership matrices, and verification status across frontend and backend implementations. |
| [`docs/design/api-contracts.md`](design/api-contracts.md) | Full-Stack Engineers | The authoritative specification for all data exchange schemas and API contracts (REP, CASE, OPS, CHK, ADM, SEC). |
| [`docs/design/design-contract.md`](design/design-contract.md) | UI/UX Designers, Frontend Devs | Contract defining the visual identity, warm dawn color tokens, typography scales, accessibility thresholds, and motion guidelines. |

---

*ElectraGuard AI is an open-source prototype developed by Team Cairn for #AI4Elections 2026. This prototype is not approved for live operational electoral deployment.*