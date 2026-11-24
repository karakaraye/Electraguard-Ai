# Observer hardening · 23 November 2026

The browser suite uses Django and PostgreSQL through the production frontend. It interrupts network traffic for the offline, lost-response and interrupted-upload cases, while the Django test helper checks the stored reports and attachments.

| Scenario | What the suite checks |
| --- | --- |
| First report | Setup PIN, personal PIN, photo upload and receipt. The stored report and photo are unique, and the photo has no EXIF or GPS metadata. |
| Offline send | The phone confirms local storage, the report survives reload, and reconnection sends it once. |
| Lost response | The server receives the first attempt. Retrying with the same key returns the original receipt and leaves one report. |
| Interrupted upload | Closing the page after a committed chunk leaves one upload. On reopen, the first chunk starts at the server-confirmed offset and yields one attachment. |
| Drafts | Reload, Back and a language change preserve the draft. Another observer code sees its own draft. |
| Session and intake | Expiry asks for the PIN again, revocation waits for a replacement code, and paused intake queues the report until it reopens. |
| Validation | Checks cover future time, required fields, and oversized, overlong or unsupported media. |
| Accessibility | State, LGA, Ward and Polling-unit selects have accessible names. The location step runs an axe scan. |
| Offline shell | Observer pages, the polling-unit list and search, and all five interface languages are usable offline. |

## Changes

- The upload queue reads saved progress before sending more chunks after a restart or retry.
- The service worker follows references to nested JavaScript and CSS chunks during shell installation. This makes the on-demand language files available without opening every language online first.
- Removed a duplicate accessible-name attribute in the location picker that broke lint and compilation.
- The 900-unit training fixture uses the synthetic API source label. It has a new release revision so earlier imports keep their original contents.

## Run locally

Use the isolated `electraguard_logic` database on PostgreSQL port 55450. From `backend/`, run the following with the shared virtual environment's Python.

```text
python manage.py migrate
python manage.py load_reference_areas --file ../data/reference/official-synthetic-areas.json
python manage.py test
python manage.py runserver 127.0.0.1:8111 --noreload
```

Set `FRONTEND_ORIGIN=http://localhost:3281` for Django and `DJANGO_API_ORIGIN=http://127.0.0.1:8111` before both building and starting Next. From `frontend/`, run:

```text
npm run lint
npm run typecheck
npm run build
npm run start -- --hostname 127.0.0.1 --port 3281
```

In another shell in `frontend/`, set `EG_PYTHON` to the shared Python executable and run `npx playwright test -c e2e/observer-real` twice, sequentially.
