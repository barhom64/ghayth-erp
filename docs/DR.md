# Disaster Recovery — backup, restore, verification

> What to back up, how often, how to restore, and how to drill the restore.
>
> The repo ships two scripts that do the heavy lifting:
> - `scripts/backup.sh` — point-in-time logical backup (`pg_dump` + gzip)
> - `scripts/restore.sh` — restore from a backup file into a fresh DB
>
> Both read `DATABASE_URL` (preferred) or `DB_*` env vars.

## What to back up

| Asset | Where | How |
| --- | --- | --- |
| Application database | Postgres | `scripts/backup.sh` (daily + hourly during business hours) |
| Encryption keys | `.env` on each host + secret manager | Vault / AWS Secrets Manager — **separate from the DB backup** |
| ZATCA private keys (CSR + clearance) | `secrets_vault` table in DB | Covered by the DB backup, but the `SECRETS_ENCRYPTION_KEY` must survive separately |
| Object storage (uploaded documents) | Replit Object Storage or S3 | Provider's snapshot tooling |
| `.env` contents | Each host | Vault, not git |

**The two-key rule**: a DB backup alone is useless without the encryption keys, and the keys alone are useless without the backup. Storing them in the same place (e.g. one S3 bucket with one access policy) defeats the protection. Keep them in distinct stores with distinct access policies.

## Backup cadence

| Profile | Cadence | Retention |
| --- | --- | --- |
| Single-tenant, low traffic | Daily full at 02:00 | 30 days |
| Multi-tenant production | Hourly logical during 08:00–20:00 + daily full at 02:00 | 7 days hourly, 30 days daily, 12 months monthly archive |
| PII-heavy / regulated | Add continuous WAL archiving via `pg_basebackup` + WAL streaming to a second host | RPO ≤ 5 min, 90 days retention |

Cron the daily backup; `scripts/backup.sh` exits non-zero on failure so any standard cron-monitor alerts on it.

## Running a backup

```bash
# Default — writes ./backups/ghayth-erp-<UTC-timestamp>.sql.gz
bash scripts/backup.sh

# Ship to a different destination
bash scripts/backup.sh --out /mnt/backups

# Different DB
DATABASE_URL=postgres://user:pass@host:5432/ghayth_erp bash scripts/backup.sh
```

The script's output is the path to the new backup file (parseable for piping into rsync / aws s3 cp).

## Restoring

```bash
# Restore into a fresh DB (the script refuses to overwrite an existing
# one — drop it manually if you intend to replace).
bash scripts/restore.sh ghayth-erp-2026-05-11T00-00-00Z.sql.gz

# Custom target
DATABASE_URL=postgres://...@host:5432/ghayth_erp_restored \
  bash scripts/restore.sh ghayth-erp-...sql.gz
```

After the restore completes, the new DB contains everything the backup did: schema + data + sequence values. To bring an app instance up against it: point `DATABASE_URL` at the restored DB, supply the matching `FIELD_ENCRYPTION_KEY` + `SECRETS_ENCRYPTION_KEY` from your secret manager, restart.

## Quarterly restore drill (mandatory)

Backups you've never restored aren't backups. Once a quarter:

```bash
# 1. Pull yesterday's backup to a sandbox host.
aws s3 cp s3://backups/ghayth-erp-yesterday.sql.gz .

# 2. Restore into a throwaway DB.
createdb ghayth_erp_dr_drill
DATABASE_URL=postgres://localhost/ghayth_erp_dr_drill \
  bash scripts/restore.sh ghayth-erp-yesterday.sql.gz

# 3. Smoke checks against the restored DB.
psql ghayth_erp_dr_drill <<'SQL'
SELECT count(*) AS companies FROM companies;
SELECT count(*) AS users FROM users WHERE "deletedAt" IS NULL;
SELECT count(*) AS journal_entries FROM journal_entries;
SELECT MAX("createdAt") AS latest_audit FROM audit_logs;
SQL

# 4. (For PII-encryption verification) boot the API against the
# restored DB with the production FIELD_ENCRYPTION_KEY, hit one or
# two GET /employees/:id endpoints, confirm decrypted fields look right.

# 5. Drop the sandbox DB.
dropdb ghayth_erp_dr_drill
```

Record the drill date + time-to-restore in the runbook. If the time-to-restore is creeping up, the database is growing and you may need to switch from logical backups to `pg_basebackup` + WAL streaming.

## RTO / RPO targets

| Scenario | Target RTO | Target RPO |
| --- | --- | --- |
| App-only failure (DB intact) | 5 min — restart the app | 0 |
| Postgres corruption / disk loss | 30 min — restore from the most recent hourly | ≤ 60 min |
| Full datacenter loss | 4 hours — bring up on the standby region + restore from daily | ≤ 24 hours |
| Encryption keys lost (DB intact) | Unrecoverable — every PII row is gone | n/a |

Tune the cadence in §"Backup cadence" until your worst-case RPO meets the contractual requirement.

## Common failure modes

| Symptom | Likely cause | Resolution |
| --- | --- | --- |
| `restore.sh` reports `database already exists` | Target DB wasn't dropped before restore | `dropdb <target>` then re-run |
| Restored DB boots but `audit_logs` is empty for the last few hours | The backup is older than the last app activity | Restore from a more recent backup, or accept the gap |
| Application can't decrypt PII after restore | `FIELD_ENCRYPTION_KEY` mismatch between backup and the env you booted with | Set the key that was active when the backup was taken; if lost, see [`SECRETS_ROTATION.md`](SECRETS_ROTATION.md) |
| Restore takes hours on a large DB | Single-threaded `pg_restore` on a multi-GB dump | Use `pg_restore --jobs=N` (already in `restore.sh`); for very large DBs, consider physical replication instead |
| Backup file growing > expected | `audit_logs` / `event_logs` accumulating without rotation | Set `PERSIST_ALL_EVENTS=false`; rotate `audit_logs` older than 7 years (PDPL retention) |

## Disaster scenario: full DB loss + encryption keys intact

```bash
# 1. Provision a new Postgres instance.
# 2. Pull the most recent backup that exists.
# 3. Restore:
bash scripts/restore.sh ghayth-erp-<latest>.sql.gz

# 4. Confirm record counts match the application's view of "how
# much data should be here":
psql "$DATABASE_URL" -c \
  "SELECT 'companies' AS t, count(*) FROM companies
   UNION ALL SELECT 'employees', count(*) FROM employees
   UNION ALL SELECT 'journal_entries', count(*) FROM journal_entries
   UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs;"

# 5. Point DATABASE_URL at the new DB. Restart the app. Verify with
# the post-deploy curls in docs/DEPLOYMENT.md §5.
```

## Disaster scenario: encryption keys lost, DB intact

The DB has data but every encrypted PII column reads back as ciphertext. Options:

1. **Restore from a backup taken before the key was rotated** if you still have the old key on file.
2. **Re-collect the PII** from source documents (passports, national IDs). For most fields this is feasible; for historical audit-log entries that referenced encrypted fields, the references stay opaque.
3. **Accept the loss** for non-essential fields (e.g. legacy employee bank details that the user will refresh on next payroll cycle).

Whichever path, this is a reportable data incident under PDPL — start the 72-hour notification clock.
