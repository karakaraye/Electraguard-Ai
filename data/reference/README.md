# Polling-unit reference releases

The bundled fixture is synthetic. Its place names and identifiers are for training and testing.

From the repository root, run the migrations, then load the fixture:

```text
python backend/manage.py migrate
python backend/manage.py load_reference_areas
```

For a replacement release, use `python backend/manage.py load_reference_areas --file path/to/areas.json`. Use the same envelope and hierarchy as `synthetic-areas.json`. Set `source` to `official` only for the official starter dataset. Use a new `YYYY-MM-DD.N` version each time the content changes.

The API serves the latest version by date and numeric revision. An identical import is safe to repeat. Historical releases stay in PostgreSQL, and unit identifiers from those releases remain available for validation.
