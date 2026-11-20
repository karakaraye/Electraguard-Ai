# Track 5 reporting and review

This first increment implements structured incident intake, private receipt checks, and human review for an election observation organisation. A fresh database contains no reports.

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

## API

Get a CSRF token and cookie from `GET /api/csrf/` before sending JSON POSTs. Send the cookie and the token in `X-CSRFToken`. Reviewer endpoints use Django sessions. Sign in through `/admin/` locally and grant the intended reviewer the report view and change permissions.

| Endpoint | Contract |
| --- | --- |
| `POST /api/reports/` | Send a new UUID in `Idempotency-Key`, the workspace credential in `X-Intake-Token`, and the JSON fields `receipt_secret`, `area`, `occurred_at` (ISO 8601 with an offset), `category` (`access`, `materials`, `procedure`, `conduct`, or `other`), `firsthand` (boolean), and `description`. Generate the receipt secret independently using 32 cryptographically random bytes encoded as lowercase hex. Keep the same key, secret, and report fields for retries. |
| `POST /api/receipt/` | Send only `receipt_secret` in the body. The response contains the report reference, receipt time, and current status. Keep the secret out of URLs and logs. |
| `GET /api/review/` | Requires the report view permission and returns the 50 latest reports in this workspace. |
| `POST /api/review/<reference>/` | Requires report view and change permissions. Send the current integer `version` plus `action` (`start` or `close`). For closure, send `reason` (`corroborated`, `insufficient_information`, or `out_of_scope`). |

Run `python manage.py test` with `TRACK5_DEBUG=1` for local API verification. Use only authorised test data. The current intake token and reviewer permissions are workspace-wide. The offline browser, individual reviewer assignment, retention controls, and triage are pending. This increment is intended for local development and testing.
