# Isolated field trial checklist

## Set up the environment

Use an isolated HTTPS host and a dedicated PostgreSQL database. Set `TRACK5_DEBUG=0`, `TRACK5_SECRET_KEY` to an independent random secret, `TRACK5_INTAKE_TOKEN` to an independent random organisation credential, `TRACK5_ALLOWED_HOSTS` to the approved host names, and the required `POSTGRES_*` settings. Use a production WSGI server for `config.wsgi`, run migrations, and serve the output of `collectstatic` from the same origin. Keep the intake and deployment credentials out of version control and rotate them after any suspected disclosure. Use individual staff accounts and the minimum report permissions.

If a reverse proxy terminates HTTPS, allow backend access only from that proxy, configure it to overwrite the forwarded protocol header, and only then enable `TRACK5_TRUST_HTTPS_PROXY=1`. The built-in request budgets use the server-observed peer address and deliberately ignore client-provided forwarded addresses. If clients share a gateway or proxy, the app may see them as one client. Check the behaviour with realistic shared networks and configure per-client limits at the trusted edge. Keep request bodies, credentials and URL query strings out of proxy and error logs. Review who can access logs and backups.

The application enables HSTS for the configured host in production. Django's deployment check will still advise on subdomain coverage and preloading. Decide those at the domain level after checking how other subdomains are served.

## Retention and recovery

- The private receipt lifetime defaults to 30 days from server receipt. Set `TRACK5_RECEIPT_LIFETIME_DAYS` to the period agreed with the observation organisation. An expired receipt returns the same response as an unknown receipt. Report retention is separate.
- Schedule `python manage.py prune_request_windows` to remove old throttling counters. The counters use a keyed digest that changes between windows. They store neither the address itself nor report content.
- Agree a report retention window and who can authorise a purge. Check counts with `python manage.py purge_reports --days <approved-days>` before any explicit apply. Agree whether to keep independent audit records before using purge, which removes related audit entries and links from the active database.
- Store encrypted backups with restricted access. Rehearse restoring an authorised disposable backup in an isolated database. After restoring, rerun the approved retention procedure before reopening access. Backup expiration requires separate configuration.
- Field queues are optional on private devices. Use the organisation's shared-device precautions. First access requires connectivity, and browser storage can be cleared or evicted. Confirm receipt after reconnection. Removing device data does not withdraw a report that the server already received.

## Before admitting field users

1. Run the automated suite against the isolated PostgreSQL deployment, the migrations check, and `node tests/worker.mjs`. Verify the expected certificate, headers, reviewer roles, and intake rate limits.
2. Rehearse a lost acknowledgement, credential rotation, device removal, reassignment, and database restore. Do this with authorised test material and record the actual results.
3. Run consented usability sessions on the target phones and networks. Measure time to file, required-field completion, recognition of queued versus received, reviewer time, and observed errors. Include a keyboard or screen-reader path. Record device and browser versions and the number of participants.
4. Agree who handles incident escalation, report withdrawal requests, and an intake pause. To pause intake while preserving review and status access, set `TRACK5_INTAKE_PAUSED=1` and restart the application. Confirm that paused submissions show a retry message and keep the current queued attempt. Use the organisation's established procedure for urgent safety incidents.
5. Review the suggestion error cases with observers before expanding the trial. Keep manual review available and retain a way to correct a link. The benchmark does not establish field accuracy.
