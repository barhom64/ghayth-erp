# `db/` — Schema source of truth

This directory is the **canonical source of truth** for the Ghayth ERP
database schema. It exists because of Phase 2 of the unification plan
(see `docs/UNIFICATION_PLAN.md`): before this directory, the schema
lived only on Replit's managed Postgres and there was no way for a
developer to spin up a working local instance from a fresh clone.

## Files

| File | What it is | Updated by |
|---|---|---|
| `schema.sql` | `pg_dump --schema-only` of the live Replit DB. The complete DDL: `CREATE TABLE` / `CREATE INDEX` / `CREATE SEQUENCE` / constraints / triggers. **No row data.** | `db/dump-schema.sh` (run on Replit) |
| `seed.sql` | Reference rows that every fresh instance needs: companies, branches, job_titles, permissions, roles, chart_of_accounts, currencies, system_settings, module_dashboards. **No PII, no transactional data, no real users.** | `db/dump-seed.sh` (run on Replit) |
| `seed-admin-user.sql` | Hand-written. Creates `owner@local.test` / password `Test1234!` with role=owner so verification packs can log in. Idempotent. | hand-edited |
| `bootstrap.sh` | One-command local DB setup. Drops + recreates the local DB, loads `schema.sql`, loads `seed.sql`, runs `seed-admin-user.sql`, marks every existing migration as applied. | hand-edited |
| `dump-schema.sh` | Run on Replit to regenerate `schema.sql`. | hand-edited |
| `dump-seed.sh` | Run on Replit to regenerate `seed.sql`. | hand-edited |

## How a new developer gets a working local instance

```bash
# Prerequisites: postgresql-16 installed locally, pnpm, node 22+
cd ghayth-erp
pnpm install
pnpm db:bootstrap          # runs db/bootstrap.sh
cd artifacts/api-server
pnpm dev                   # API at http://localhost:5000
```

That's it. The bootstrap script:

1. Ensures the `ghayth_erp` Postgres role + database exist
2. Loads `db/schema.sql` (full DDL)
3. Loads `db/seed.sql` (reference rows)
4. Loads `db/seed-admin-user.sql` (test admin user)
5. Pre-marks every file in `artifacts/api-server/src/migrations/` as
   applied in `schema_migrations`, so the runtime migration runner
   doesn't try to re-apply them on top of the baseline

After bootstrap finishes, login with:
- email: `owner@local.test`
- password: `Test1234!`

## How `schema.sql` gets regenerated

The dump must come from a real Postgres because the canonical schema
lives there — there's no Drizzle/Prisma source we can render from. The
process is:

1. **On Replit**, source the `.env` so `$DATABASE_URL` points at the live DB.
2. Run `pnpm db:dump-schema` (or `bash db/dump-schema.sh` directly).
3. Review the diff in `db/schema.sql`. Any new tables, columns, or
   indexes added by recent migrations should appear.
4. Commit + push.
5. Pull the change locally and re-run `pnpm db:bootstrap` to verify
   it loads cleanly on a fresh DB.

The dump uses `--no-owner --no-acl --no-comments --clean --if-exists`
so the resulting file is portable across users/clusters and idempotent
(re-running drops + recreates everything).

## How `seed.sql` gets regenerated

Same flow as `schema.sql`, but with `db/dump-seed.sh`. The seed only
includes the **reference table allowlist** defined inside
`dump-seed.sh` — adding a new reference table requires editing that
list.

**Critical:** never add `users`, `employees`, `customers`, or any
table that holds PII to the seed. The bootstrap creates exactly one
test admin via `seed-admin-user.sql` with a known password — that's
the only login the local instance has.

## Relationship to `artifacts/api-server/src/migrations/`

The `src/migrations/` directory continues to hold incremental
`ALTER TABLE` migrations. After Phase 2, the runtime workflow is:

- **Fresh local instance:** `db/bootstrap.sh` loads `schema.sql` (which
  already has every migration baked in), then pre-marks every
  migration filename as applied. The runtime `runMigrations()` call
  in `src/index.ts` is therefore a no-op on first boot.
- **Existing instance (Replit, staging, production):** the runtime
  `runMigrations()` runs as before. Any new migration committed
  after `schema.sql` was generated will apply on top normally. The
  baseline detector in `src/lib/migrate.ts` recognizes that
  `schema_migrations` already has rows and **does not** try to re-apply
  the dump.

This means a brand-new migration always lands the same way regardless
of environment: drop a new file in `src/migrations/`, ship. On fresh
DBs the dump + the migration both apply; on existing DBs only the
migration applies. Eventually `db/dump-schema.sh` is re-run and the
new column lands inside `schema.sql` for the next generation of fresh
clones.

## Why we don't use Drizzle migrate / Prisma migrate

The codebase has 263+ tables that accumulated over years via
hand-written SQL migrations. Reconstructing them as Drizzle schema
definitions would be a multi-week project AND would still need a
fallback for things Drizzle's introspection doesn't capture
(triggers, custom types, partial indexes with WHERE clauses,
materialized views). The pg_dump approach gives us 100% fidelity
in one command and is the standard pattern for "the DB is the
schema source of truth."

## What `db/` does NOT contain

- ❌ Any production data
- ❌ Any user passwords from the live system
- ❌ Drizzle/Prisma schema definitions
- ❌ Migration runner code (lives in `src/lib/migrate.ts`)
- ❌ ORM models (the codebase uses raw SQL via `pg` client)
