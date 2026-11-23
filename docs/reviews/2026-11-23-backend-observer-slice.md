# Backend observer and citizen slice

- REP-01 accepts checklist stages and result sheets, including G6 unreadable fields. Checklist supersession uses the observation day in West Africa Time. Staff case detail exposes per-sheet consistency flags with benign explanations. Observer detail keeps flags private.
- REP-02 uses real conversation events for attention counts, preview and filtering. REP-03 returns checklist or result-sheet content and the assigned-reviewer indicator.
- REP-04 adds citizen withdrawal. REP-05 through REP-07 cover anonymous creation, public status, and secret-gated conversation and formal replies. The receipt secret is decoded and hashed with SHA-256 before persistence.
- MSG-01 and MSG-02 cover conversation pagination, read markers, ordinary messages and formal replies. The assigned reviewer can see earlier messages on assignment. Staff message posts use the current report version, following §1.6.
- DIS-01 through DIS-05 cover opt-in membership, text posts, read markers, flags, moderation and expiry. Invitees receive thread metadata before accepting. Moderator actions have a separate audit record.
- ASK-01 ranks approved passages by TF-IDF and returns exact quotes with source metadata. It abstains when scores fall below the threshold and ships with an empty corpus.
- REF-02 and AUTH-03 `pin_same_as_setup` were present in the starting worktree.

## Run and configure

From `backend/`, use the supplied virtual environment:

```powershell
python manage.py migrate
python manage.py test --noinput
python manage.py makemigrations --check --dry-run
```

Set `PUBLIC_INTAKE_ORGANISATION_ID` to the public intake organisation's UUID and enable observation intake. Assign the `moderator` role to the discussion moderators. Set the organisation's election date or send an explicit discussion closing time. Schedule `python manage.py close_expired_discussions` to record automatic closure events.

Load product-approved Markdown with `python manage.py load_approved_documents <folder>`. Each file starts with a JSON object between two `---` delimiter lines, followed by the Markdown body. The metadata keys are `document_id`, `title`, `section`, `version`, `language`, and `url`. Set `observer_only` to `true` for restricted guides. A load updates the document with the same ID, section and language.

## Migrations and coverage

New migrations are accounts 0006, approved_answers 0001, discussions 0001, and reports 0009–0012. Tests exercise structured input, result flag privacy, assignment delivery, read markers, citizen proof and replay, OCR fallback, approved retrieval, discussion membership and moderation.

## Contract gaps

- RS-01 validates the upload and returns `503 ocr_unavailable` for a valid image. Tesseract was absent from PATH and the usual Windows install locations. OCR success, staging and photo attachment by OCR ID remain open.
- Message attachment validation supports scoped evidence marked for messages. The v1 media upload and sanitisation pipeline is a separate slice. The current attachment summary has no audio duration.
- The report checks run within the create transaction. The cross-unit check compares exact fields in the same organisation. It does not aggregate votes across units.
- Public throttles use the existing keyed database throttle store. Burst and enumeration signals are structured application logs. Security-monitor ingestion and deployed timing parity were not verified.
- Automatic discussion closure is implemented as an operator command. Scheduling and retention purge integration remain open. The post name check is a heuristic.
- Git staging failed because the linked worktree index is outside the writable workspace. The changes remain local and uncommitted.
