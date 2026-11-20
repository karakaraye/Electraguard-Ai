# Track 5 reporting and review

This application implements structured incident intake, private receipt checks, assignment, and human review for an election observation organisation. A fresh database contains no reports. See [the page and action plan](WORKFLOWS.md).

## Local setup

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:TRACK5_DEBUG = "1"
$env:TRACK5_INTAKE_TOKEN = [guid]::NewGuid().ToString("N")
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

SQLite is the local default. To use PostgreSQL, set `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`. The host and port default to loopback and 5432 and can be changed with `POSTGRES_HOST` and `POSTGRES_PORT`.

Open `http://127.0.0.1:8000/` once online to load the observer page. Submit a report and supply the configured access code when sending. Optional device storage supports one pending report per browser profile. It keeps the report for up to 24 hours of active availability, subject to browser storage availability. Expired entries are cleared when the page is reopened. Access codes are entered again after reload. Use `/review/` for review, `/review/assignments/` for assignment, and `/review/overview/` for coordinator totals.

The superuser can manage accounts using `/admin/`. Give reviewers the report view and change permissions. Give coordinators report view and assignment permissions, plus change permission if they also review reports. Reviewers see only assigned cases. Coordinators can see the workspace queue.

## API

Get a CSRF token and cookie from `GET /api/csrf/` before sending JSON POSTs. Send the cookie and the token in `X-CSRFToken`. Reviewer endpoints use Django sessions.

| Endpoint | Contract |
| --- | --- |
| `POST /api/reports/` | Send a new UUID in `Idempotency-Key`, the workspace credential in `X-Intake-Token`, and the JSON fields `receipt_secret`, `area`, `occurred_at` (ISO 8601 with an offset), `category` (`access`, `materials`, `procedure`, `conduct`, or `other`), `firsthand` (boolean), and `description`. Generate the receipt secret independently using 32 cryptographically random bytes encoded as lowercase hex. Keep the same key, secret, and report fields for retries. |
| `POST /api/receipt/` | Send only `receipt_secret` in the body. The response contains the report reference, receipt time, and current status. Keep the secret out of URLs and logs. |
| `GET /api/review/` | Returns up to 50 permission-scoped reports. Filter with `q`, `status`, and `unassigned=1`. |
| `GET /api/review/<reference>/` | Returns the authorised report, review history, and scoped comparison candidates. |
| `POST /api/review/<reference>/` | Requires report view and change permissions. Send the current integer `version` plus `action` (`start` or `close`). For closure, send `reason` (`corroborated`, `insufficient_information`, or `out_of_scope`). |
| `GET /api/review/assignees/` | Lists eligible reviewer accounts for an authorised coordinator. |
| `POST /api/review/<reference>/assignment/` | Send the current `version` and numeric `reviewer` ID. Requires the assignment permission. |
| `POST /api/review/<reference>/links/<candidate>/` | Send `decision` (`linked` or `separate`), `note` and `versions` keyed by both report references. Both reports must be in the reviewer's scope. |

Run `python manage.py test` with `TRACK5_DEBUG=1` for local verification. Use authorised materials in isolated tests. Intake uses a shared organisation credential. For comparison, reports are scoped to the reviewer and limited to the same area and a 90-minute incident window. Suggestions are ranked by description overlap, time proximity, and shared category. Reviewed links remain accessible separately from the ranked list. Run `python -m reports.suggestion_benchmark` to reproduce the authored benchmark. The benchmark contains no workspace data and does not establish field accuracy.

### Report retention

`python manage.py purge_reports --days 30` counts reports older than the selected window. The day count is an example. Use the retention window approved for the organisation. Adding `--apply` permanently removes eligible records, associated receipts, audit entries, and links from the active database. Backup retention and restoration procedures are managed separately.

Use the [isolated field trial checklist](OPERATIONS.md) for HTTPS, retention, network rate controls, access configuration and field verification. The public interface does not contain prepopulated reports.

See the [staging profile](staging/README.md) for the HTTPS and PostgreSQL stack, and the [backup and restore runbook](docs/BACKUP-RESTORE.md) for a disposable restore rehearsal.
