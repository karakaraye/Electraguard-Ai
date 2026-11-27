# ElectraGuard AI Documentation Index

ElectraGuard AI is a prototype election-observation and citizen-accountability system built by Team Cairn for the #AI4Elections hackathon (Track 5). This index points each kind of reader to the right documents. All data in the project is synthetic, and the prototype is not approved for live election use.

---

## 1. Start here, by reader

### Citizens and voters
How to report a problem without an account, check your report, check a rumour, and use SMS or USSD (simulated in this prototype).
* [`guides/citizen-guide.md`](guides/citizen-guide.md)
* [`guides/glossary.md`](guides/glossary.md)
* [`submission/PROBLEM.md`](submission/PROBLEM.md): why this exists

### Field observers
Signing in with a code and PIN, the seven-step report, working offline, the checklist, the result-sheet check, and answering questions.
* [`guides/observer-guide.md`](guides/observer-guide.md)
* [`guides/glossary.md`](guides/glossary.md)
* [`field-operations.md`](field-operations.md): the operations runbook for a restricted deployment

### Situation-room staff and organisations
Reviewing cases, assigning, operations, check-ins, the rumour desk, publishing results, observer codes, settings and security.
* [`guides/staff-guide.md`](guides/staff-guide.md)
* [`submission/SAFETY_AND_LIMITATIONS.md`](submission/SAFETY_AND_LIMITATIONS.md)
* [`design/api-contracts.md`](design/api-contracts.md): the API contracts

### Hackathon judges
* [`../README.md`](../README.md), section "For Judges", links each criterion to code and measured results.
* [`submission/EVALUATION.md`](submission/EVALUATION.md): measured results and their limits
* [`submission/MODEL_CARD.md`](submission/MODEL_CARD.md), [`submission/DATASHEET.md`](submission/DATASHEET.md)
* [`submission/THREAT_MODEL.md`](submission/THREAT_MODEL.md), [`submission/SAFETY_AND_LIMITATIONS.md`](submission/SAFETY_AND_LIMITATIONS.md)
* [`submission/VIDEO_SCRIPT.md`](submission/VIDEO_SCRIPT.md)

### Engineers and operators
* [`../README.md`](../README.md), section "For Engineers": setup, tests and evaluation commands
* [`submission/ARCHITECTURE.md`](submission/ARCHITECTURE.md), [`submission/API_REFERENCE.md`](submission/API_REFERENCE.md)
* [`submission/LOAD_AND_COST.md`](submission/LOAD_AND_COST.md), [`azure-deployment.md`](azure-deployment.md)
* [`engineering-handoff.md`](engineering-handoff.md)

---

## 2. Catalogue

### Guides (`docs/guides/`)

| Document | Audience | Summary |
|---|---|---|
| [`citizen-guide.md`](guides/citizen-guide.md) | Citizens | Reporting without an account, receipt codes and the status page (`/status`), rumour check (`/check`), SMS and USSD on the simulator, public results. |
| [`observer-guide.md`](guides/observer-guide.md) | Observers | Code and PIN sign-in, the seven-step report, outbox, messages, six-stage checklist, result-sheet check, check-ins. |
| [`staff-guide.md`](guides/staff-guide.md) | Staff | Roles, queue and case review, assignment, operations, rumour desk, publishing, observer codes, settings, security, review clocks. |
| [`glossary.md`](guides/glossary.md) | Everyone | 20 terms: Nigerian electoral terms and ElectraGuard concepts. |

Screenshots in the guides are from the current "Ink and Paper" interface, captured from the development build with sample data.

### Submission documents (`docs/submission/`)

| Document | Audience | Summary |
|---|---|---|
| [`PROBLEM.md`](submission/PROBLEM.md) | Judges, public | The problems in election observation that the project addresses. |
| [`ARCHITECTURE.md`](submission/ARCHITECTURE.md) | Engineers | Components, data flow, models, human-oversight points, deployment (Next.js 16, Django 5.2, PostgreSQL 17). |
| [`SAFETY_AND_LIMITATIONS.md`](submission/SAFETY_AND_LIMITATIONS.md) | Judges, privacy reviewers | Risk register, privacy design, known limits, conditions before any field use. |
| [`THREAT_MODEL.md`](submission/THREAT_MODEL.md) | Security reviewers | STRIDE and LINDDUN tables with code paths, tests and residual risk. |
| [`MODEL_CARD.md`](submission/MODEL_CARD.md) | ML reviewers | The assistive models and rules, their measured results and limits. |
| [`DATASHEET.md`](submission/DATASHEET.md) | Researchers | The six synthetic or hand-written datasets. |
| [`EVALUATION.md`](submission/EVALUATION.md) | Judges | Seed-42 results: category macro-F1 0.824 on the robustness set, redaction recall 96.3%, surge detector 13 of 20 planted surges with 0.39 false alarms an hour. |
| [`METHODOLOGY.md`](submission/METHODOLOGY.md) | Engineers | Design principles, datasets and evaluation method. |
| [`LOAD_AND_COST.md`](submission/LOAD_AND_COST.md) | Operators | A small local load test and an Azure cost estimate (planning figure, nothing deployed). |
| [`API_REFERENCE.md`](submission/API_REFERENCE.md) | Integrators | Contract-level REST reference. |
| [`VIDEO_SCRIPT.md`](submission/VIDEO_SCRIPT.md) | Video producers | A 180-second scene-by-scene script. |

### Engineering and infrastructure (`docs/`)

| Document | Summary |
|---|---|
| [`field-operations.md`](field-operations.md) | Runbook for a restricted deployment: sign-off, accounts and devices, intake and support, evidence and retention, field acceptance. |
| [`azure-deployment.md`](azure-deployment.md) | Azure Container Apps deployment scripts and templates (not yet deployed). |
| [`engineering-handoff.md`](engineering-handoff.md) | State of the work, verification steps and decisions for the next engineer. |
| [`agent-updates.md`](agent-updates.md) | Change log and ownership table. |
| [`design/api-contracts.md`](design/api-contracts.md) | The API contracts (REP, CASE, OPS, CHK, ADM, SEC and others). |
| [`design/design-contract.md`](design/design-contract.md) | Design contract for the earlier design; the current "Ink and Paper" specification is in [`design/redesign/DESIGN-SPEC.md`](design/redesign/DESIGN-SPEC.md). |
| [`eval/`](eval/results.md) | Evaluation outputs and data. |
| [`reviews/`](reviews/) | Review notes. |

---

*ElectraGuard AI is a prototype and is not approved for live operational electoral deployment.*
