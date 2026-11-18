# ElectraGuard AI

ElectraGuard AI is a supplementary, nonpartisan #AI4Elections Track 5 prototype for Election Observation and Citizen Accountability.

ElectraGuard AI supports election observation and incident documentation alongside Nigeria’s existing electoral processes. Official electoral decisions remain with the appropriate authorities.

INEC and other authorized bodies retain their official responsibilities. ElectraGuard AI has no role in voter registration, voting, counting, collation, declaring results, or resolving electoral disputes. The prototype uses its own database and operates independently of live electoral systems. Stage 1 covers sign-in and role workspaces for Observer, Reviewer, and Administrator. The Administrator manages this prototype’s workspace and has no electoral authority. Stage 2 adds observer reporting and private evidence. Stage 3 adds reviewer assignment, clarification, and internal observation assessments. Stage 4 adds advisory triage suggestions for assigned Reviewers. Stage 5 adds an internal observation dashboard and a fictional demo.

## Windows PowerShell setup

Install Python 3.12, Node.js 24 with npm, and either Docker Desktop with Compose v2 or a local PostgreSQL server. Run these commands from the repository root in PowerShell.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

Replace the secret key and database password placeholders with your own local values. For the optional demo accounts, also replace all three demo password placeholders with distinct local passwords. A password manager can generate the values. Keep `.env` local.

### Option A — PostgreSQL with Docker Compose

```powershell
docker compose up -d --wait db
```

The database listens on loopback and keeps its data in a Docker volume. The PostgreSQL image uses the database name, username, and password when it first initializes the volume. If you change the password later, also update the database role password in PostgreSQL.

### Option B — Existing PostgreSQL

Skip Docker Compose. Using `psql -U postgres -d postgres` or pgAdmin as a local database administrator, create a dedicated role and database. In interactive `psql` using the example names:

```sql
CREATE ROLE electraguard LOGIN CREATEDB;
\password electraguard
CREATE DATABASE electraguard OWNER electraguard;
```

Set the prompted password in `.env` and match the host, port, database name, and username to your server. `CREATEDB` lets Django create and drop a separate test database. Run the tests against a development PostgreSQL instance.

### Install and migrate

```powershell
py -3.12 -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\backend\.venv\Scripts\python.exe backend/manage.py migrate
npm.cmd --prefix frontend ci
```

### Seed fictional demo accounts

Run this explicitly after migrations. It requires `DJANGO_DEBUG=true` and the three configured demo passwords. It creates missing accounts and refreshes their passwords from local configuration. Existing users with a conflicting role or privilege cause the seed to abort.

```powershell
.\backend\.venv\Scripts\python.exe backend/manage.py seed_demo
```

| Workspace | Email | Local password variable |
| --- | --- | --- |
| Observer | `observer@demo.example` | `DEMO_OBSERVER_PASSWORD` |
| Reviewer | `reviewer@demo.example` | `DEMO_REVIEWER_PASSWORD` |
| Administrator | `administrator@demo.example` | `DEMO_ADMINISTRATOR_PASSWORD` |

### Run the application

Use two PowerShell terminals from the repository root.

```powershell
.\backend\.venv\Scripts\python.exe backend/manage.py runserver 127.0.0.1:8000
```

```powershell
npm.cmd --prefix frontend run dev -- --hostname localhost
```

Open `http://localhost:3000`. Use the hostname in `FRONTEND_ORIGIN` consistently when signing in.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | Required local Django secret key |
| `DJANGO_DEBUG` | Set to `true` for local HTTP development and demo seeding |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated backend hostnames |
| `FRONTEND_ORIGIN` | Trusted frontend origin for CSRF checks |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Required PostgreSQL connection settings |
| `POSTGRES_HOST`, `POSTGRES_PORT` | Database host and port. Defaults are `127.0.0.1` and `5432`. |
| `DEMO_OBSERVER_PASSWORD`, `DEMO_REVIEWER_PASSWORD`, `DEMO_ADMINISTRATOR_PASSWORD` | Required only for explicit demo seeding |
| `DJANGO_API_ORIGIN` | Optional Next.js environment override for the backend URL. Defaults to `http://127.0.0.1:8000`. Set it in the frontend terminal before running Next.js, including at build time. |

Django loads the root `.env` and gives existing process variables precedence. Next.js reads its own process environment for the optional API override.

### Authentication and permissions

Next.js proxies browser API requests to Django on the same browser origin. Django uses server-side, database-backed sessions with an HttpOnly session cookie. A CSRF token is fetched from `GET /api/auth/csrf` and sent in `X-CSRFToken` for both `POST /api/auth/sign-in` (form-encoded email and password) and `POST /api/auth/sign-out`. `GET /api/auth/me` returns the current user's email and role. Next.js checks the protected workspace endpoint before rendering each role page. Django independently checks the stored role at `GET /api/workspaces/<role>` and returns HTTP 403 for anonymous or mismatched users. The application Administrator role does not confer Django staff or superuser privileges.

### Observer reporting

Sign in as an Observer and enter an incident date and time, approximate location, and short description. The form interprets times in the device’s time zone. Report detail displays West Africa Time. Use synthetic information for demos. A saved report shows its reference and appears as **Submitted** under **My Reports**.

If a save cannot be confirmed, use **Retry report** on the same form to send the original submission key. If you already left the form, check **My Reports** for the saved report before entering it again. Use localhost or HTTPS so the browser can generate secure submission keys.

Evidence is optional. The server accepts JPEG and PNG still images up to 2 MiB and 16 megapixels. PostgreSQL holds the original files, and the API checks Observer ownership or current Reviewer assignment on every download. If the report saves but the upload fails, use **Retry attachment** with the same file or select a replacement. You can also add evidence from report detail while the case is open. After closure, existing evidence remains downloadable and new uploads are rejected.

The observer API accepts JSON at `POST /api/reports` with `occurred_at` (ISO 8601), `location`, and `description`, plus a UUID in the `Idempotency-Key` header. Replaying the same submission returns HTTP 200 with the original reference. Reusing a key for changed report fields returns HTTP 409. The key is scoped to the signed-in Observer. `GET /api/reports` and `GET /api/reports/<reference>` serve the owner’s list and detail. Uploads use the multipart `file` field at `POST /api/reports/<reference>/attachments`. Uploading identical bytes to the same report returns the existing attachment. Downloads use `GET /api/reports/<reference>/attachments/<attachment-id>`. Writes use the same CSRF flow as sign-in and sign-out.

### Reviewer workflow

1. In the Administrator Workspace, open **Reviewer assignments**. Assign a submitted report to an active Reviewer. An open case can be reassigned during review or while clarification is pending. The assignment page shows only the report reference, status, and assignee. Closed cases leave the assignment list, and their review decisions are final.
2. In the Reviewer Workspace, open **Review queue** and select an assigned case. The case includes the Observer’s report, private evidence downloads, and audit history. New requests from the previous Reviewer lose access immediately after a reassignment.
3. Select **Start review** to change **Submitted** to **In review**. Request clarification to move the case to **Needs clarification**, or close it with a rationale and one of three outcomes. The available outcomes are **Corroborated by available evidence**, **Insufficient evidence**, and **Out of scope**.
4. A clarification request appears on the Observer’s report detail page. The Observer’s response returns the case to **In review**. **My Reports** shows the current status throughout. Review decisions are internal observation assessments. Official electoral decisions remain with the appropriate authorities.

Every assignment and review action records an actor, timestamp, and change in the same PostgreSQL transaction as the update. Administrator assignment writes go to `POST /api/assignments/<reference>`, Reviewer actions to `POST /api/review/<reference>/actions`, and Observer replies to `POST /api/reports/<reference>/clarification`. New closing audit entries record the attachment IDs present at closure, including an empty list for cases without evidence. Earlier closing entries retain their original data. Each write requires a CSRF token and the version returned by the current assignment summary or report detail. If another action committed first, refresh the case before retrying.

### Advisory triage worker

Apply migrations, then run the worker in a separate PowerShell terminal from the repository root. The worker processes existing and new reports independently of the web servers.

```powershell
.\backend\.venv\Scripts\python.exe backend/manage.py run_triage
```

For a one-time run, add `--once`. Add `--retry-failed` on startup to requeue failed jobs for the current method version. A report has one job, and each possible report pair has one shared suggestion. Use only synthetic reports for demos.

The local `local-lexical-v1` method suggests categories by comparing report descriptions with labeled synthetic examples. It identifies possible duplicates using a 90-minute window, approximate-location word overlap, and description similarity. It uses incident times, location text, and descriptions. Evidence attachments and account identities are outside the model input. Processing runs locally without an external AI service.

Open an assigned case to see the processing status, suggested category, and up to five possible matches among cases currently assigned to you. Refresh the page after the worker runs. Use **Correct category** to record a human correction and **Possible match decision** to confirm or dismiss a pair. Both actions create audit entries. Both reports retain their own case records, assignments, and assessment status. Manual review is available even if triage is pending or unavailable. Only the assigned human Reviewer can assess or close a case.

The Reviewer API reads suggestions at `GET /api/review/<reference>/triage`. Category corrections and match decisions are versioned, CSRF-protected writes at `POST /api/review/<reference>/triage/category` and `POST /api/review/<reference>/triage/matches/<candidate>`. Django checks both assignments for match actions and filters previous match audit entries when a candidate is no longer assigned to the Reviewer.

### Internal observation dashboard

Sign in as an Administrator and open **Observation dashboard**. Django restricts `GET /api/dashboard` to the application Administrator role. The optional `start` and `end` dates are inclusive incident dates in West Africa Time. The dashboard returns aggregate counts only.

**Submitted reports** counts every report in the date range, including reports now in review or closed. **Distinct incidents** counts connected groups formed by Reviewer-confirmed links. A group is counted when at least one member is in the date range, including when a report outside the range connects two in-range reports. Pending and dismissed suggestions leave totals unchanged. Status and category breakdowns count reports. The category uses the Reviewer correction when available, then the suggested category, then Uncategorized.

### Stage 5 fictional demo

Use a fresh local demo database to replay the full workflow. Set a dedicated database name in `.env`. With Docker Compose, use a new project name such as `docker compose -p electraguard-stage5 up -d --wait db` and choose a free `POSTGRES_PORT`. With an existing PostgreSQL server, create the dedicated database using the instructions above. From the repository root:

```powershell
.\backend\.venv\Scripts\python.exe backend/manage.py migrate
.\backend\.venv\Scripts\python.exe backend/manage.py seed_dashboard_demo
```

The seed creates the fictional role accounts and one counterpart report at **Fictional Cedar Training Hall** on **12 March 2026 at 09:00 WAT**. The command is safe to rerun and retains existing review progress. Use a fresh database for a clean replay.

1. Sign in as the Observer. Submit a second report at the same location for **12 March 2026 at 09:05 WAT**. The incident form uses the device time zone, so enter the corresponding local time if needed. Use the synthetic description “A crate blocked the ramp and wheelchair users could not enter.” Attach [synthetic-evidence.png](demo/synthetic-evidence.png).
2. Sign in as the Administrator and assign both reports to the same demo Reviewer. Start the worker, or drain the queue after both submissions:

   ```powershell
   .\backend\.venv\Scripts\python.exe backend/manage.py run_triage --once
   ```

3. As the Reviewer, open the new report, download its evidence, and confirm the suggested match. Start review and close the new report with **Corroborated by available evidence** and a fictional rationale. Verify the rationale is in the audit history.
4. As the Administrator, apply a date filter of **12 March 2026** for both bounds. Expect **2 submitted reports**, **1 distinct incident**, **1 Submitted**, **1 Closed**, and **2 Access or accessibility** reports. Before confirming the link, the same two reports count as two incidents.

### Synthetic triage evaluation

Run `backend/manage.py evaluate_triage` with the backend virtual environment. See [the evaluation report](evaluation/README.md) for reproducible commands, split sizes, per-category metrics, and held-out errors. The unchanged Stage 4 method achieved **66.7% duplicate precision and recall** on this synthetic dataset.

### Tests and checks

With PostgreSQL running, execute these commands from the repository root.

```powershell
.\backend\.venv\Scripts\python.exe backend/manage.py test accounts reports
.\backend\.venv\Scripts\python.exe backend/manage.py makemigrations --check --dry-run
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
```

To check the browser workflow, sign in with each demo account and confirm the matching workspace and email. Try opening a different role's workspace URL while signed in and confirm you return to your own workspace. Sign out and revisit the protected URL. The sign-in page should appear.

To check reporting manually, submit a synthetic report as an Observer with an invalid file renamed to end in `.png`. Verify that the report still shows a reference, then select a valid synthetic PNG and retry the attachment. Open the report from **My Reports** and confirm the status and download. In a separate session as another Observer, the report should be absent from **My Reports**, and the copied report and attachment URLs should return HTTP 404. The backend tests also cover same-key submission replay and access by other roles.

To check the reviewer workflow manually, submit a synthetic report with evidence, assign it as an Administrator, and open the case as the assigned Reviewer. Start review, request clarification, respond as the Observer, and close with a rationale and outcome. Verify the audit history and the Closed status in My Reports. With a second active Reviewer, reassign an open case and check that the previous Reviewer loses access to both the case and its evidence. The backend suite also tests stale requests, simultaneous decisions, and audit rollback.

The triage tests cover a genuine duplicate, similar reports at different times or locations, unrelated wording, a matched report assigned to someone else, failure and retry, and audited human feedback.
