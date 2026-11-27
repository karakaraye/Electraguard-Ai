# ElectraGuard AI

Nonpartisan election observation and citizen accountability system for Nigeria, built by Cairn for the #AI4Elections hackathon (Track 5: Election Observation and Citizen Accountability, integrating Tracks 1–4).

---

## 1. ElectraGuard in Two Minutes

### What it is
ElectraGuard AI is a prototype for monitoring elections in Nigeria. It connects field observers, citizens, situation-room staff and the public. Observers can keep working when the network drops, people who report are not asked for a name, and AI only suggests; a person decides every case. It was built with synthetic data only and is **not approved for live election use**.

### Who it is for
- **Accredited observers** at polling units, who report incidents, fill in a polling-day checklist and check result sheets.
- **Citizens and voters**, who can report without an account, check a report with a receipt code, or check a rumour.
- **Situation-room staff** (reviewers, coordinators, moderators, administrators) who review reports, watch for patterns and publish reviewed totals.
- **The public and media**, who see reviewed totals, never raw reports.

### The problem
Nigeria has 774 Local Government Areas and, according to INEC, 176,846 polling units. On election day, observation runs into four problems:
1. **Network drops.** Reports get stuck on phones until the network returns.
2. **Overload.** Command rooms receive many unstructured and duplicate reports, and urgent ones can be missed.
3. **Safety.** People who report intimidation or ballot-box snatching can be put at risk if they are identifiable.
4. **Rumours.** False claims spread faster than official clarifications.

### What an observer does
An observer signs in with a code and PIN from a printed card (for example `OBS-7K2P9X`; first an 8-number setup PIN, then a 6-number PIN the observer chooses). No name, email or phone number is asked for. The observer can:
1. Fill in a six-stage polling-day checklist (arrival, opening, accreditation, voting, closing and counting, results posted).
2. Send an incident report in seven short steps, choosing from ten categories, with up to six photos, videos or voice notes. Without network the report waits on the phone and sends itself later.
3. Receive a receipt code (for example `EG-4H7Q-92KD`).
4. Photograph and transcribe the posted result sheet (Form EC8A). The system flags arithmetic that does not add up. It never adds up votes or names a winner.
5. Answer reviewers' questions and coordinators' ward check-ins.

### What a citizen does
No account is needed.
1. Report from the website (`/o/new/what?as=citizen`), or by SMS or USSD on a basic phone. **The SMS number `20384` and the USSD code `*347*88#` are test values for this prototype and run on an on-screen simulator at `/phone`. A commercial short code must be leased from a telecom operator before real phones can use them.**
2. Use the receipt code to check progress at `/status`, in the app, or by SMS (`STATUS <code>`).
3. Check a rumour at `/check` (or `CHECK <message>` by SMS). If reviewers approved an answer, it is shown. If not, the claim can be passed to the rumour desk.

### What is published and what is not
- **Published** on the public pages (`/` and `/results`): totals of reviewed reports by state, by type and by hour, released at least 60 minutes after the reports. Any number below 5 is shown as "fewer than 5". Approved rumour answers are shown on `/check`.
- **Never published:** names, phone numbers, observer identities, report text, photos, or unreviewed reports.
- **Not election results.** ElectraGuard never projects winners or declares results. That belongs to INEC.

---

## 2. For Judges

Each point below links to the code or a measured result in this repository. Numbers come from `docs/eval/` and `docs/submission/EVALUATION.md`; where something was not measured, it says so.

### Criterion 1: Technology and Innovation (25)
- **Human-in-the-loop triage.** A text model (character n-gram TF-IDF with logistic regression) suggests a category and urgency; rules add weight for danger and violence. Below confidence 0.40 it abstains. On a 56-example hand-written robustness set, category macro-F1 is 0.824 (95% interval 0.700 to 0.912). On the starter pack the score is 1.000, which only measures memorisation because the pack has 7 distinct sentences once place names are removed ([`backend/intelligence/triage.py`](backend/intelligence/triage.py), [`backend/intelligence/learning.py`](backend/intelligence/learning.py), [`docs/eval/results.md`](docs/eval/results.md)).
- **Automatic privacy redaction.** Phone numbers, voter card numbers (VIN), NIN, BVN, emails, account numbers, addresses and a curated name list are replaced with keyed tokens. On 308 hand-written items in 5 languages: recall 96.3% (414 of 430), precision 99.8% (414 of 415) ([`backend/privacy/redactor.py`](backend/privacy/redactor.py), [`docs/eval/redaction.md`](docs/eval/redaction.md)).
- **Surge detection.** Poisson tests over 30- and 60-minute windows with Benjamini-Hochberg control (q = 0.05) and a one-sided CUSUM. Against the old fixed threshold on 20 planted surges: false alarms fall from 120.33 to 0.39 per hour, but detection also falls from 100% (20 of 20) to 65% (13 of 20) ([`backend/ops/emerging.py`](backend/ops/emerging.py), [`docs/eval/emerging-alerts.md`](docs/eval/emerging-alerts.md)).
- **Review clocks.** The server tracks a target time per case (urgent 15 minutes, high 60, normal 240, low 480, reply 120; configurable per organisation) and raises one alert when a case goes overdue ([`backend/clocks/calculator.py`](backend/clocks/calculator.py), [`backend/clocks/sweep.py`](backend/clocks/sweep.py)).
- **Rumour matching.** Matches a message against reviewer-approved answers, using a multilingual sentence model if installed locally and otherwise a word and character TF-IDF. On a small held-out set it works for English and Pidgin and is below target for Hausa, Yoruba and Igbo (overall precision 76.5%, recall 50.0%, 45 queries) ([`backend/rumours/matching.py`](backend/rumours/matching.py), [`docs/eval/claim-matching.md`](docs/eval/claim-matching.md)).

### Criterion 2: Electoral Relevance (20)
- **Nigerian structure.** Reference data covers 20 states, 60 LGAs and 900 synthetic polling units from the hackathon starter pack, loaded by `load_reference_areas` ([`data/reference/official-synthetic-areas.json`](data/reference/official-synthetic-areas.json)). The national figures above are INEC's, not data held in this repository.
- **Polling-day checklist and result sheet.** Six checklist stages and five result-sheet consistency flags: accredited above registered, votes plus rejected differing from accredited, a likely swapped digit, rounded numbers, and numbers identical to another unit ([`backend/reports/result_checks.py`](backend/reports/result_checks.py)).
- **Ward check-ins and safety notices.** Coordinators send check-ins to a ward or LGA. A notice of type "safety" is not sent until a different coordinator approves it ([`backend/notices/views.py`](backend/notices/views.py)).
- **Rumour check.** Public page at [`frontend/app/(public)/check/`](frontend/app/%28public%29/check/). A reply drafted by one coordinator must be approved by another ([`backend/rumours/views.py`](backend/rumours/views.py)).

### Criterion 3: Security, Privacy and Responsible AI (20)
- **No personal credentials for observers.** Observers hold a random code and a PIN (PBKDF2-SHA256, 1,000,000 iterations). Five wrong tries in 15 minutes lock the code for 15 minutes; ten in 24 hours lock it until a coordinator resets it ([`backend/accounts/observer_credentials.py`](backend/accounts/observer_credentials.py), [`backend/accounts/observer_auth.py`](backend/accounts/observer_auth.py)).
- **Tamper-evident audit record.** Each organisation has a chain of events; each stores the SHA-256 hash of the one before. `GET /api/v1/audit/verify` checks it ([`backend/staff/audit.py`](backend/staff/audit.py)).
- **Controlled original access.** Staff see redacted text. The assigned reviewer can fetch the original through an API call that needs a written reason (1 to 500 characters), allows 30 calls an hour, and is written to the audit record (`case.original_viewed`) ([`backend/reports/reviewer_views.py`](backend/reports/reviewer_views.py)). The staff screens do not yet have a button for it.
- **Small-number suppression.** Public totals below 5 are hidden, and a combined total is shown only if every part is shown ([`backend/publicdata/aggregate.py`](backend/publicdata/aggregate.py)).
- **Threat and privacy documents.** [`docs/submission/THREAT_MODEL.md`](docs/submission/THREAT_MODEL.md) and [`docs/submission/SAFETY_AND_LIMITATIONS.md`](docs/submission/SAFETY_AND_LIMITATIONS.md). No formal legal review or external security audit has been done.

### Criterion 4: Inclusion and Multilingual (15)
- **Five languages.** English, Nigerian Pidgin, Hausa, Yoruba and Igbo have a complete set of interface strings ([`frontend/messages/`](frontend/messages/)). No native-speaker review has been done.
- **Basic phones.** SMS and USSD handlers with menus in five languages ([`backend/phone_channels/`](backend/phone_channels/)). In this prototype they are exercised only through the simulator at `/phone`.
- **Accessibility.** Automated axe checks run in the real-server tests ([`frontend/e2e/observer-real/08-accessibility.spec.ts`](frontend/e2e/observer-real/08-accessibility.spec.ts)); earlier review notes in [`docs/reviews/`](docs/reviews/) record 0 serious or critical findings. Automated checks do not prove full WCAG conformance.
- **Low bandwidth.** Offline outbox in IndexedDB and a service worker ([`frontend/lib/outbox/`](frontend/lib/outbox/), [`frontend/public/sw.js`](frontend/public/sw.js)). A first-load size under 300 KB is a design target ([`docs/design/design-contract.md`](docs/design/design-contract.md)); it was measured on earlier builds of the public pages and has not been re-measured on the current design.

### Criterion 5: Scalability (15)
- **Load test.** A small local run (8 users, 55 seconds, Django development server) showed 6 of 66 requests timing out at 15 seconds during PIN setup. It gives no capacity guarantee ([`docs/submission/LOAD_AND_COST.md`](docs/submission/LOAD_AND_COST.md), [`scripts/loadtest/`](scripts/loadtest/)). The cost estimate for 1,000 observers is a planning figure.
- **Retries are safe.** Sends carry a UUID v4 `Idempotency-Key`, so a repeated request returns the first result ([`backend/reports/idempotency.py`](backend/reports/idempotency.py)).
- **Deployment.** Docker Compose with an nginx gateway and PostgreSQL 17, and Azure Bicep templates for Azure Container Apps ([`deploy/compose.yaml`](deploy/compose.yaml), [`deploy/azure/`](deploy/azure/), [`docs/azure-deployment.md`](docs/azure-deployment.md)). **Nothing has been deployed to Azure yet.**

### Criterion 6: Demo and Documentation (5)
- **Video script:** [`docs/submission/VIDEO_SCRIPT.md`](docs/submission/VIDEO_SCRIPT.md).
- **Guides with screenshots of the current interface:** [`docs/guides/`](docs/guides/).
- **Documentation index:** [`docs/README.md`](docs/README.md).

---

## 3. For Engineers

### Project layout
```text
Electraguard-Ai/
├── backend/                  # Python 3.12, Django 5.2, Django REST framework
│   ├── accounts/             # Observer codes and PINs, staff sign-in, organisations
│   ├── approved_answers/     # Approved guides behind "Ask ElectraGuard"
│   ├── clocks/               # Review clocks and the overdue sweep
│   ├── discussions/          # Observer discussions and moderation
│   ├── intelligence/         # Triage, urgency and duplicate models; evaluate_models command
│   ├── notices/              # Ward check-ins and safety notices (two-person approval)
│   ├── ops/                  # Cluster warnings, emerging-alert detector, coverage
│   ├── phone_channels/       # SMS and USSD handlers and simulator
│   ├── privacy/              # Keyed-token PII redaction
│   ├── publicdata/           # Public results snapshots and small-number suppression
│   ├── reference/            # State, LGA, ward and polling-unit reference data
│   ├── reports/              # Reports, media, case review, result-sheet checks
│   ├── rumours/              # Rumour desk and claim matching
│   ├── security/             # Security alerts
│   └── staff/                # Audit record, observer code batches, organisation settings, retention
├── frontend/                 # Next.js 16.4, React 19, TypeScript, CSS Modules
│   ├── app/(observer)/o/     # Observer app
│   ├── app/(citizen)/        # Receipt status page
│   ├── app/(public)/         # Home, results, ask, check, guides, phone simulator, privacy
│   ├── app/(staff)/s/        # Staff console
│   ├── lib/                  # API client, offline outbox, drafts, i18n
│   ├── messages/             # en, pcm, ha, yo, ig
│   └── ui/                   # Components and design tokens
├── deploy/                   # Dockerfiles, Compose, nginx gateway, Azure Bicep
├── docs/                     # Guides, submission documents, evaluations, design
├── data/                     # Synthetic starter data and reference areas
└── scripts/                  # Evaluation scripts, load test
```

### Local setup

**Prerequisites:** Python 3.12, Node.js 24 (the version CI uses) with npm, PostgreSQL 17 (or Docker), and ffmpeg for video and voice-note processing.

```bash
# Database: copy .env.example to .env and set the passwords, then
docker compose up -d --wait db        # postgres:17 on 127.0.0.1:5432

python -m venv backend/.venv
source backend/.venv/bin/activate     # on Windows: backend/.venv/Scripts/activate
pip install -r backend/requirements.txt

# The backend reads POSTGRES_* and the other settings from .env in the repository root
python backend/manage.py migrate
python backend/manage.py load_reference_areas
python backend/manage.py provision_account --email you@example.org --role coordinator
python backend/manage.py issue_observer_codes --count 10 --label "Local test"
python backend/manage.py runserver 127.0.0.1:8000
```

In a second terminal:
```bash
cd frontend
npm ci
npm run dev        # http://localhost:3000
```

### Tests and checks

CI (`.github/workflows/verify.yml`) runs, against PostgreSQL 17:
```bash
python backend/manage.py test accounts approved_answers clocks config discussions intelligence notices ops phone_channels privacy publicdata reference reports rumours security staff
cd frontend && npm run lint && npm run typecheck && npm run build
```
The full backend suite last had a recorded count of 295 tests (1 skipped) on 25 November ([`docs/reviews/2026-11-25-c17-emerging-alerts.md`](docs/reviews/2026-11-25-c17-emerging-alerts.md)); later work added tests, and the total has not been re-counted for this document. Further frontend checks: `npm run check` (contrast, message keys, glyphs, privacy). Real-server browser tests live in `frontend/e2e/observer-real/` and run with `npx playwright test -c e2e/observer-real` (see the header of its `playwright.config.ts`).

### Evaluation
```bash
python backend/manage.py evaluate_models   # triage, urgency, duplicates, clusters, result sheets, claims, transit (docs/eval/results.md)
python scripts/eval/redaction.py           # redaction on 308 items
python scripts/eval/emerging_alerts.py     # surge detector against the old threshold (uses a throwaway test database)
python scripts/eval/claim_matching.py      # rumour matching
```

### Documentation
- [`docs/README.md`](docs/README.md): index by reader
- Guides: [`observer`](docs/guides/observer-guide.md), [`citizen`](docs/guides/citizen-guide.md), [`staff`](docs/guides/staff-guide.md), [`glossary`](docs/guides/glossary.md)
- [`docs/submission/ARCHITECTURE.md`](docs/submission/ARCHITECTURE.md), [`API_REFERENCE.md`](docs/submission/API_REFERENCE.md), [`THREAT_MODEL.md`](docs/submission/THREAT_MODEL.md), [`SAFETY_AND_LIMITATIONS.md`](docs/submission/SAFETY_AND_LIMITATIONS.md), [`MODEL_CARD.md`](docs/submission/MODEL_CARD.md), [`DATASHEET.md`](docs/submission/DATASHEET.md), [`EVALUATION.md`](docs/submission/EVALUATION.md), [`VIDEO_SCRIPT.md`](docs/submission/VIDEO_SCRIPT.md)
