# Backend staff slice — 23 November 2026

## API and data

| Contracts | Implementation |
| --- | --- |
| AUTH-04–06 | Staff password challenge, TOTP enrolment and verification, single-use invite acceptance, and session revocation. |
| Q-01, CASE-01–05 | Assigned review queue, case detail, versioned case actions and evidence checks, suggestion decisions, duplicate decisions, and span redaction. |
| ASG-01–02 | Coordinator summaries, workload-based suggestions, and replayable bulk assignment with per-item transactions. |
| OPS-01–04 | Overview counts with linked incidents grouped, cluster detection and review, checklist coverage, and a reader for organisation-scoped precomputed late-materials risk. |
| RUM-01–03 | Text and image claims, retrieval against safe closed-observation excerpts and past responses, and versioned drafting with second-person approval. |
| PUB-01–02 | Snapshot drafting, approval, discard and scheduling, delayed public counts, primary and complementary suppression, combined cells and conditional cache responses. |
| ADM-01–04 | Observer code batches, card printing, revoke, reissue and reset, staff account administration, and per-organisation settings. |
| SEC-01, AUD-01 | Alert listing and updates, rule-based detectors, and organisation-scoped audit export and chain verification. |

## Run

From the repository root, use the provided Python environment and PostgreSQL database.

```text
python backend/manage.py migrate
python backend/manage.py test accounts reports reference config staff ops publicdata rumours security --noinput
python backend/manage.py makemigrations --check --dry-run
python backend/manage.py purge_retention --dry-run
```

- Run `detect_observation_clusters` periodically to populate cluster warnings. The baseline is the mean count across the seven preceding windows of the same duration. A warning needs the configured minimum and at least twice that baseline.
- Run `publish_hourly_snapshots` periodically to process due schedules, and `prune_staff_requests` at least every ten minutes to clear expired encrypted card replay data. Expired card payloads are unavailable to the API even before pruning.
- Run `purge_retention` on the maintenance schedule. Apps can add their organisation-owned record models to `OBSERVATION_RETENTION_MODELS` as a mapping of Django model label to age field. This branch purges the existing report and evidence rows and retains the audit digests. Backup expiry remains a deployment responsibility.
- The logistics producer can insert one `ops.LateMaterialsRun` and its `ops.LateMaterialsRisk` rows atomically. OPS-04 reads the newest run for the requesting organisation.

## Integration and contract gaps

- The base branch has legacy evidence rows and clarification events. Case detail and closure use those rows. Resumable upload state, conversation messages, and checklist and result-sheet intake need the corresponding backend slices. Coverage reads checklist data when present. The retention registry needs the incoming message and discussion model labels and any external-file cleanup handlers.
- Redaction clears stale translations. Translation regeneration and model-backed category, urgency, rumour ranking, and image forensics need their producers. The slice uses explicit urgency and harm rules and lexical retrieval. Retrieval requires an existing redacted English excerpt or a translation marked as redacted. Image checks are guidance with metadata-presence signals.
- The approved rumour response workflow is available to coordinators. The contract defines no public route or response schema for approved rumour responses. PUB-02 serves the defined public snapshot schema.
- Audit verification identifies historical case events that predate the chain. Retention and audit exports use the chain's digests. The anomaly-model detector and receipt enumeration need their data producers.
- Refused roles get `404 not_found` on object routes and `403 forbidden` elsewhere, as the permissions matrix says. The check lives in `staff.audit.authorize`.
- Complementary suppression hides the smallest visible cell until the hidden cells of a row, column or series add up to five or more. A line whose hidden cells are all zero is left alone.
- Not run against a hosted database: the tests use a local PostgreSQL 18 cluster on port 55450.

## Tests

`staff.test_permissions` checks every staff route against the matrix for each role, unauthenticated and pre-TOTP sessions, CSRF and organisation separation. `staff.test_errors` covers the error codes of ADM-01 to ADM-04, ASG, SEC, OPS, PUB, RUM, AUTH-04 to AUTH-06 and AUD-01, including the 429 limits. `security.test_detectors` and `publicdata.test_suppression` cover the alert rules and the suppression rules.
