# PostgreSQL backup and retention rehearsal

Rehearse with fictional records in disposable databases. Keep the restored service isolated and intake paused until verification and retention are complete.

## Backup

Use the PostgreSQL client tools compatible with the database server. Configure connection credentials with an approved secret mechanism. Verify the source database name before running the dump.

```text
pg_dump --format=custom --file=track5.dump <source_db>
pg_restore --list track5.dump
```

Record the backup date, origin, schema revision and a SHA-256 checksum. Keep backups encrypted under restricted access and set a separate expiry for backup copies. A retention purge on the active database does not erase older backups.

## Restore into a new database

Use a new, empty database on the isolated staging instance. Ensure the restore role can create and own objects in it. Restore does not include the original role ownership or grants in this example. Provision the application role and access separately according to the deployment configuration.

```text
createdb <new_isolated_restore_db>
pg_restore --dbname=<new_isolated_restore_db> --exit-on-error --single-transaction --no-owner --no-privileges track5.dump
```

Verify the dump checksum before restoring. Point the restored app at the **new database only**. Check the expected migrations, report count, assigned reviewers, review history and links. Check that a fresh private receipt still returns status without exposing report details, and an expired receipt returns 404 while its report may still exist. Receipt lifetime and report retention are independent.

## Reapply retention before reopening

Set the approved retention period for the environment. In this rehearsal, report retention was 45 days and receipt lifetime was 30 days.

```text
python manage.py purge_reports --days 45
python manage.py purge_reports --days 45 --apply
python manage.py purge_reports --days 45
```

Replace 45 with the approved number. The first command previews the count. Review the count and verify the database target before running the destructive apply command. Applying the command removes matching reports and their associated audit entries and links. Verify the final preview is zero and that the remaining records, assigned reviewers, links and receipts match expectations. A snapshot made before retention can restore previously purged rows, so repeat the retention check after every restore before enabling access.

The age-based purge only reapplies the current retention rule. If the organisation grants individual deletion requests, agree on a separate mechanism to reapply those requests after restoration. Rehearse using the real staging backup store and recovery credentials before field use, and record restoration timings on representative data volume.
