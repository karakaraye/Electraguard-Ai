# Backend intelligence and phone channels · 23 November 2026

- **SMS-01** — Africa’s Talking inbound SMS callback with report, status, reply, language and help commands. Gateway IDs deduplicate delivery. Reports have no account, and the reporter mapping uses a number HMAC.
- **USSD-01** — Africa’s Talking menu for language, category, danger, state, LGA, description and confirmation. Confirmation creates one incident and queues its SMS receipt.
- **SIM-01** — SMS, USSD, inbox and reset. Sends require CSRF and an idempotency key. Simulator reports carry `incident_details.simulated: true`. The publishing slice must exclude that marker from snapshots.
- **OPS-04** — Organisation-scoped late-materials risk with state filtering and ranked polling-unit predictions. The legacy administrator role maps to coordinator on this branch.
- **A1–A6, A8 and A13** — Local category, urgency and abstention suggestions, ward duplicate matching, area cluster detection, five result-sheet checks, calibrated rumour scores and gradient-boosted transit risk. The staff slice can read `Triage.suggestions`, `TriageMatch` and `ClusterSuggestion`. The separate result-sheet API can call `intelligence.result_checks.result_sheet_flags`.

## Verification

All 78 backend tests passed on PostgreSQL, including 17 new tests. They cover the menu, callback replay, browser idempotency and CSRF, rate limits, organisation separation, local scoring, and result-sheet warnings. The full run used a workspace-local temporary-directory harness because this Windows sandbox denied writes in two existing tests' default temporary directories.

PostgreSQL migrations applied and the migration-drift check passed. The risk refresh wrote 300 synthetic polling-unit rows. See [held-out metrics and failure examples](../eval/results.md).

## Migrations

- `reports.0009_triage_suggestions` adds suggestion data to existing jobs.
- `reports.0010_alter_report_observer_alter_reviewevent_actor` lets phone reports and their audit events have no authenticated actor.
- `intelligence.0001_initial` creates cluster suggestions and materials-risk rows.
- `phone_channels.0001_initial` creates callback replay, reporter HMAC, language preferences, outbound SMS and simulator storage.

## Contract and data notes

- The provider uses the same separator between inputs and inside a description. A literal suffix such as `*1` can look like a send command. The USSD handler keeps a five-minute HMAC of each displayed confirmation prompt to resolve that ambiguity, without persisting the clear description before gateway confirmation.
- The incident file has seven product categories and no language field. Per-language incident metrics and the three absent category metrics are unavailable. Duplicate evaluation uses held-out text perturbations and one same-unit distractor because the pack has no labeled paraphrase pairs.
- Rumour harm and check-worthiness use veracity and spread as proxies. No owner translations or labeled retrieval pairs were available. Synthetic logistics uses the starter pack's fictional unit, ward and LGA identifiers, with state names as its filter values.
- This slice leaves the staff suggestion decision, cluster review, rumour and publication endpoints to their owners. The staff and public integrations should keep phone-channel report metadata and the synthetic risk source visible where required.
- The access logging layer in Django omits callback paths. Configure equivalent path redaction at the reverse proxy before enabling gateway callbacks. End-to-end provider delivery requires sandbox credentials and a reachable callback URL.
- Git denied creation of the worktree’s `index.lock`, so this work remains uncommitted.

## Run from the repository root

```powershell
python -m pip install -r backend/requirements.txt
python backend/manage.py migrate
python backend/manage.py test accounts reports config reference intelligence phone_channels --noinput
python backend/manage.py load_reference_areas
python backend/manage.py run_intelligence
python backend/manage.py evaluate_models
python backend/manage.py write_materials_risk <organisation-uuid>
python backend/manage.py send_channel_sms
```

Set `PUBLIC_INTAKE_ORGANISATION_ID` and `SIMULATOR_ENABLED=true` for the local simulator. Configure `CHANNEL_WEBHOOK_SECRET`, `CHANNEL_SMS_SHORT_CODE` and `CHANNEL_SMS_API_KEY` for the sandbox. In production mode, also configure `CHANNEL_GATEWAY_NETWORKS` for trusted callback peers. Schedule the triage and outbound SMS commands as workers.

## Review fixes · 23 November 2026

- **Urgency (A2).** Recall on severity 3 or 4 was 3.2%. Rules now lift urgency (danger +5, violence +3, severity score +3, firsthand, evidence and cluster +1 each; 3 or more is urgent). The severity cut-off is chosen on the validation split for 90% recall. Held-out result: precision 0.818, recall 0.871, F1 0.844, false-urgent rate 0.122.
- **Category leakage (A1).** The pack has 7 distinct descriptions once place names are removed, so the earlier macro-F1 of 1.00 measured template memorisation. The report now audits this, trains on de-duplicated templates plus hand-written paraphrases, tunes abstention on separate hand-written examples, and reports a 56-example synthetic robustness set (typos, paraphrase, Pidgin, code-switched): macro-F1 0.824. The memorisation check is still printed and labelled leaky.
- **Evaluation.** `evaluate_models` is deterministic (seed 42, tested) and lists test-set descriptions, per-slice tables and failure examples.
- **SMS.** Ward and unit codes such as `SYN-KN-01-01-001` never resolved (the pattern allowed three segments, the data has up to five). Keywords now tolerate any whitespace. A hyphenated first word without digits is description text.
- **USSD.** Prompts now end in a colon and the confirmation reads `Send? <category> in <LGA>` as the contract says.
