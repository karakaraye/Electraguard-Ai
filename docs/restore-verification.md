# PostgreSQL restore acceptance

Before accepting observations, assign the backup and recovery owner and approve storage, encryption, key access, retention, recovery point and recovery time. Record the PostgreSQL version, application revision, migration state, backup time and expected recovery point in restricted operational records.

1. Pause new intake during a planned consistency checkpoint, or establish the exact snapshot boundary using the approved PostgreSQL backup mechanism. Obtain aggregate verification output for that same snapshot.
2. Restore into an isolated database with no application listener, public route or worker attached. Use a matching PostgreSQL major version and the approved restore credential. Keep credentials out of command arguments and logs.
3. Compare the restored database to the approved snapshot expectations. Use a PostgreSQL service or standard libpq environment and a read-only role to run the checker.

```sh
python scripts/verify-restored-data.py --database approved_restore_database --compare approved_aggregate_baseline.json
```

The checker returns zero when structural and evidence integrity checks pass and aggregates agree. It returns one for integrity problems or mismatched counts, and two for an unreadable database, schema or baseline. Compare the database migration state and the approved backup identity separately. Review any legacy closure without an attachment snapshot before accepting the restore.

4. Test permissions and receipt recovery on the isolated restore. Verify offboarded users remain disabled, formerly assigned users cannot download evidence, and the dashboard reconciles. Revoke restored sessions before any traffic switch. Confirm application and migration roles have their expected access.
5. Record recovery duration, the restored point, access retention and any expected loss. Get operator approval before changing traffic. Handle the isolated copy under the organisation's retention and access policies.
