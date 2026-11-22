# PostgreSQL restore acceptance

Before accepting observations, assign the backup and recovery owner and approve storage, encryption, key access, retention, recovery point and recovery time. Record the PostgreSQL version, application revision, migration state, backup time and expected recovery point in restricted operational records.

For an operator-managed OpenPGP backup, verify the full recipient fingerprint out of band, configure the authorised PostgreSQL credential through libpq and use the encrypted backup command. The routine backup host needs only the approved public key. Use a backup directory that supports atomic hard links.

```sh
bash deploy/backup-encrypted.sh approved_source_database APPROVED_FINGERPRINT /approved/backups/release.pgdump.gpg
```

On the isolated recovery host, decrypt into approved encrypted scratch storage and verify decryption exits successfully before giving the plaintext archive to PostgreSQL. Keep the recovery key off the routine backup host and dispose of scratch copies under policy.

The PostgreSQL restore and integrity checker passed locally with generated records. Hosted Docker acceptance ran the OpenPGP backup command after the browser test, decrypted its output and restored two closed reports, two 2 MiB photos and their audit history into an isolated database. The comparison checked report and audit digests, attachment hashes, closure snapshots and migration counts. The organisation still needs to approve the recovery key and recovery targets. [Hosted recovery check](https://github.com/karakaraye/Electraguard-Ai/actions/runs/44976829468)

1. Pause new intake during a planned consistency checkpoint, or establish the exact snapshot boundary using the approved PostgreSQL backup mechanism. Obtain aggregate verification output for that same snapshot.
2. Restore into an isolated database with no application listener, public route or worker attached. Use a matching PostgreSQL major version and the approved restore credential. Keep credentials out of command arguments and logs.
3. Compare the restored database to the approved snapshot expectations. Use a PostgreSQL service or standard libpq environment and a read-only role to run the checker.

```sh
python scripts/verify-restored-data.py --database approved_restore_database --compare approved_aggregate_baseline.json
```

The checker returns zero when structural and evidence integrity checks pass and aggregates agree. It returns one for integrity problems or mismatched counts, and two for an unreadable database, schema or baseline. Compare the database migration state and the approved backup identity separately. Review any legacy closure without an attachment snapshot before accepting the restore.

4. Test permissions and receipt recovery on the isolated restore. Verify offboarded users remain disabled, formerly assigned users cannot download evidence, and the dashboard reconciles. Revoke restored sessions before any traffic switch. Confirm application and migration roles have their expected access.
5. Record recovery duration, the restored point, access retention and any expected loss. Get operator approval before changing traffic. Handle the isolated copy under the organisation's retention and access policies.
