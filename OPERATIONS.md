# Isolated field trial checklist

## Set up the environment

Use an isolated HTTPS host and a dedicated PostgreSQL database. The [staging profile](staging/README.md) provides a loopback-only starting configuration, TLS verification, and the shared-network rehearsal procedure. Set `TRACK5_DEBUG=0`, `TRACK5_SECRET_KEY` to an independent random secret, `TRACK5_INTAKE_TOKEN` to an independent random organisation credential, `TRACK5_ALLOWED_HOSTS` to the approved host names, and the required `POSTGRES_*` settings. Keep the intake and deployment credentials out of version control and rotate them after any suspected disclosure. Use individual staff accounts and the minimum report permissions.

If a reverse proxy terminates HTTPS, allow backend access only from that proxy, configure it to overwrite the forwarded protocol header, and only then enable `TRACK5_TRUST_HTTPS_PROXY=1`. By default, the application uses its immediate network peer for request budgets. To use addresses observed by a dedicated ingress proxy, set `TRACK5_TRUSTED_PROXY_IPS` to the exact backend-facing IP addresses of that proxy. The proxy must replace `X-Real-IP` with the address of its actual connection peer and discard client-supplied values. The application accepts a single valid address only from those configured proxy peers. It disregards `X-Forwarded-For`. Devices sharing a network address translator can still share one budget.

For the target network rehearsal, use at least two separate phones on the intended Wi-Fi or hotspot. Open the approved staging hostname on both, confirm the browser trusts its certificate for that hostname, and file and check a report independently from each device. Use the agreed busiest reporting pattern to check whether users behind the same gateway encounter `429` responses. Confirm that a throttled client retains the queued submission and can retry without creating a duplicate. Keep request bodies, credentials, and URL query strings out of proxy and error logs. Review who can access logs and backups.

The application enables HSTS for the configured host in production. Django's deployment check will still advise on subdomain coverage and preloading. Decide those at the domain level after checking how other subdomains are served.

## Retention and recovery

- The private receipt lifetime defaults to 30 days from server receipt. Set `TRACK5_RECEIPT_LIFETIME_DAYS` to the period agreed with the observation organisation. An expired receipt returns the same response as an unknown receipt. Report retention is separate.
- Schedule `python manage.py prune_request_windows` to remove old throttling counters. The counters use a keyed digest that changes between windows. They store neither the address itself nor report content.
- Agree a report retention window and who can authorise a purge. Check counts with `python manage.py purge_reports --days <approved-days>` before any explicit apply. Agree whether to keep independent audit records before using purge, which removes related audit entries and links from the active database.
- Store encrypted backups with restricted access. Follow the [backup and restore runbook](docs/BACKUP-RESTORE.md) to rehearse restoration into an isolated database. After restoring, rerun the approved retention procedure before reopening access. Backup expiration requires separate configuration.
- Field queues are optional on private devices. Use the organisation's shared-device precautions. First access requires connectivity, and browser storage can be cleared or evicted. Confirm receipt after reconnection. Removing device data does not withdraw a report that the server already received.

## Before admitting field users

1. Run the automated suite against the isolated PostgreSQL deployment, the migrations check, and `node tests/worker.mjs`. Verify the expected certificate, headers, reviewer roles, and intake rate limits.
2. Rehearse a lost acknowledgement, credential rotation, device removal, reassignment, and database restore. Do this with authorised test material and record the actual results.
3. Run consented usability sessions on the target phones and networks. Measure time to file, required-field completion, recognition of queued versus received, reviewer time, and observed errors. Include a keyboard or screen-reader path. Record device and browser versions and the number of participants.
4. Agree who handles incident escalation, report withdrawal requests, and an intake pause. To pause intake while preserving review and status access, set `TRACK5_INTAKE_PAUSED=1` and restart the application. Confirm that paused submissions show a retry message and keep the current queued attempt. Use the organisation's established procedure for urgent safety incidents.
5. Review the suggestion error cases with observers before expanding the trial. Keep manual review available and retain a way to correct a link. The benchmark does not establish field accuracy.
