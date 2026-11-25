# Private ElectraGuard deployment

For Azure Container Apps, see [docs/azure-deployment.md](../docs/azure-deployment.md) and `deploy/azure/`.

This Compose topology assumes a dedicated Linux container host and a trusted ingress boundary. The gateway binds to host loopback by default. Restrict listeners to the authorised private network. Django, Next.js, the worker and PostgreSQL have no published ports.

## Release configuration

- Use the reviewed commit identifier for `ELECTRAGUARD_RELEASE`. Preserve the corresponding application images and record their digests after the build.
- Set `ELECTRAGUARD_HOST` to the hostname covered by the TLS certificate. Point `ELECTRAGUARD_TLS_DIR` to a private directory with `fullchain.pem` and `privkey.pem`. Point `ELECTRAGUARD_SECRET_DIR` to the protected runtime directory with the `django`, `postgres-bootstrap`, `postgres-migrator`, and `postgres-runtime` files. Use unique generated values and grant the container identities only the required file access.
- Keep `OBSERVATION_INTAKE_ENABLED=false` for initial startup, migration, rollback and operator acceptance. The ingress accepts TLS 1.2 or 1.3 and permits a 2 MiB photo with multipart overhead.
- Keep browser API traffic on the HTTPS gateway. Next.js server-side reads use a private, read-only gateway listener. Both paths set a canonical Host and verified forwarded protocol. Direct Django access from clients must be impossible.
- The gateway limits sign-in requests per connecting peer. Test the intended client network and shared-network capacity before rollout. A separate upstream proxy changes which peer the gateway sees and requires a reviewed trust and rate-limit configuration.

Run from the repository root with approved configuration:

```sh
docker compose -f deploy/compose.yaml config --quiet
docker compose -f deploy/compose.yaml --profile maintenance build backend frontend
docker compose -f deploy/compose.yaml up -d --wait postgres
docker compose -f deploy/compose.yaml --profile maintenance run --rm migrate
docker compose -f deploy/compose.yaml --profile maintenance run --rm backend python manage.py backfill_review_clocks
docker compose -f deploy/compose.yaml up -d --wait backend frontend gateway
```

Note: when existing open reports created prior to C18 are past due, the backfill creates review clocks that will raise one overdue alert (`case.overdue`) per untouched old case on the first sweep.

After migration, verify the sign-in page and authenticated HTTPS workflow from the intended private network. Check production cookie flags, unauthorised access, a maximum-size accepted photo, and report confirmation replay. Confirm no database or origin ports are reachable from client networks. Verify the worker starts separately with the `triage` profile and that manual review works while it is stopped.

## Video and voice-note worker

The `media-worker` service runs `python manage.py run_media`. It re-encodes uploaded video and voice notes, removes their metadata, applies automatic face blur, and writes local Whisper transcripts. It shares the `private-media` volume with the backend. Until it processes an item, the observer sees the item as saved and processing, and only the assigned reviewer can open the verified original, with a recorded reason. Media the observer asked to blur is never shown unblurred.

The image bundles the YuNet face detector and, by default, the `Systran/faster-whisper-small` model in `/opt/electraguard/whisper`. Build with `--build-arg WHISPER_MODEL=` to leave the model out. Voice notes then still work and their transcripts are reported as unavailable. The worker processes one item at a time. A 60-second 1280 x 720 video took 68 seconds with blur requested and 88 seconds with the separate reviewer copy, on four CPU cores. The image sets `ORT_DISABLE_TELEMETRY=1`, because the onnxruntime library used for speech detection otherwise starts Microsoft usage telemetry. An item that fails three attempts is marked failed and its original is deleted.

## Readiness and triage alerts

Use the backend readiness check for PostgreSQL connectivity and run the operations command from the restricted operator environment. Its JSON contains the intake setting, aggregate triage counts, and the age in seconds of the oldest report with pending triage. Run it at the interval approved by the deployment owner.

```sh
python manage.py check_observation_operations
```

For a deployment that operates the advisory worker, pass approved thresholds with `--alert-pending-age-seconds` and `--alert-failed-count`. A threshold triggers when the value reaches the supplied limit, emits an alert code, and exits with status 1. Keep queue alerts off during a planned worker outage. Test delivery to the approved response channel before launch.

For an update, capture a verified backup, keep intake paused, and migrate using the candidate image before switching application images. Reopen only after the acceptance checks and operator approval. For rollback, use the preceding application images with a compatible database schema. When a migration requires database recovery, use the approved isolated restore procedure and account for writes after the backup before switching traffic.
