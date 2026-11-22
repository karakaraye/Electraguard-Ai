# PostgreSQL and private media restore acceptance

Before accepting observations, assign the backup and recovery owner and approve storage, encryption, key access, retention, recovery point and recovery time. Record the PostgreSQL version, application revision, migration state, backup time and expected recovery point in restricted operational records.

## Capture a consistent encrypted bundle

1. Quiesce every writer, including Django, workers, maintenance commands and direct database writes. Pausing intake alone still permits mutations to existing reports and photos. Keep PostgreSQL running and keep writers stopped until the backup and its verification baseline finish.
2. Use the approved PostgreSQL credential through libpq. Give the backup operator read-only filesystem access to the `private-media` volume used by the backend and worker at `/var/lib/electraguard/media`. On the Compose host, use an approved read-only mount or the volume mountpoint, and keep it out of any web root. Read back the database and private media against the same quiescent state when producing an aggregate baseline.
3. Verify the full OpenPGP recipient fingerprint out of band. The routine backup host needs only the approved public key. Use an approved encrypted scratch filesystem for the temporary database dump and a backup directory that supports atomic hard links.

```sh
export ELECTRAGUARD_BACKUP_SCRATCH=/approved/encrypted-scratch
bash deploy/backup-encrypted.sh approved_source_database APPROVED_FINGERPRINT \
  /approved/backups/release.tar.gpg /approved/read-only/private-media

python scripts/verify-restored-data.py --database approved_source_database \
  --private-media-root /approved/read-only/private-media > approved_aggregate_baseline.json
```

Pass the media directory explicitly even when it is empty. The encrypted bundle contains `database.pgdump` and the `private-media/` tree, including staged uploads. The three-argument invocation without `PRIVATE_MEDIA_ROOT` is retained for legacy PostgreSQL-only rehearsals. Use the bundle for C4 recovery.

## Restore in isolation

Keep the recovery key off the routine backup host. Use a matching PostgreSQL major version and approved restore credentials. Keep credentials out of arguments and logs. Prepare a new isolated database and an empty recovery directory on encrypted scratch storage, with no application listener, public route or worker attached.

```sh
umask 077
mkdir /approved/encrypted-scratch/recovery
gpg --batch --output /approved/encrypted-scratch/release.tar \
  --decrypt /approved/backups/release.tar.gpg
python scripts/extract-recovery-bundle.py /approved/encrypted-scratch/release.tar \
  /approved/encrypted-scratch/recovery
pg_restore --exit-on-error --no-owner --no-privileges --dbname=approved_restore_database \
  /approved/encrypted-scratch/recovery/database.pgdump

python scripts/verify-restored-data.py --database approved_restore_database \
  --private-media-root /approved/encrypted-scratch/recovery/private-media \
  --compare approved_aggregate_baseline.json
```

Proceed only after successful decryption. The extractor requires an empty directory and rejects links and unexpected paths. The checker compares each restored C4 photo's byte count and SHA-256 against its `MediaItem`, and checks PostgreSQL evidence, relationships, audit versions, and aggregates. It returns zero on success, one for integrity or count mismatches, and two for an unreadable database, schema or baseline. Compare the migration state and approved backup identity separately.

After verification, copy the contents of `recovery/private-media/` into a **new isolated** Compose private media volume with writers stopped. Preserve the organisation directory tree. Set ownership to UID and GID `10001`, with directories mode `0700` and files mode `0600`. Run the checker again against the mounted copy. Keep the original installation's volume separate.

With application traffic stopped and intake paused, revoke all sessions in the isolated restore using `python backend/manage.py revoke_restored_sessions --isolated-restore --confirm-database approved_restore_database`. Verify restored cookies fail and new sign-ins work. Check offboarding, reassignment, private evidence, receipts, dashboard reconciliation and database privileges before switching traffic. Record recovery duration, the restored point, access retention and expected loss. Get operator approval before switching traffic. Dispose of scratch copies under the organisation's retention and access policy.

The earlier hosted recovery check verified two closed legacy reports and their PostgreSQL evidence and audit history. It predates the private media volume. [Hosted recovery check](https://github.com/karakaraye/Electraguard-Ai/actions/runs/44976829468)
