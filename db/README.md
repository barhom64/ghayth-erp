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

### `pnpm db:provision-agent` — head-of-main DB for AI agent sandboxes

`scripts/provision-agent-db.sh` is the Docker-free, no-system-Postgres
counterpart to `bootstrap.sh`, built for agent / Replit / CI sandboxes
that have neither a system Postgres nor Docker. Unlike `bootstrap.sh`
(which targets a `sudo`-managed cluster on 5432 and leaves post-cutoff
migrations for the server to apply on boot), this script:

1. spins up a throwaway **native** PG16 cluster (`initdb` + `pg_ctl`) on
   port **54329** — the agreed test marker `assertTestDatabase` and the
   dynamic integration harness gate on (so the same DB doubles as the
   integration-test Postgres);
2. loads `schema_pre.sql` + `schema_post.sql`;
3. **actually applies** every post-cutoff migration (after
   `db/.baseline-cutoff`), mirroring `guard.yml` and `migrate.ts`, so the
   DB sits at **HEAD of main**, not just the dump baseline;
4. seeds the deterministic admin (`owner@local.test` / `Test1234!`),
   Al-Diyaa company defaults (chart of accounts, settings) and an open
   fiscal period — so GL posting / accounting flows work immediately.

```bash
pnpm db:provision-agent
# then, in the SAME shell session (the cluster is a child of this shell):
export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test
```

The monolithic `db/seed.sql` is **not** loaded by this script — it is
stale (references the dropped `role_permissions` table); the per-company
seed pipeline above is the canonical path. Env overrides: `PGPORT`,
`PGDATA_DIR`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `KEEP_DB=1`.

### Drift guard (CI-gated)

Because fresh boots pre-mark every migration as applied, any migration
whose schema change is **not** baked into the dump silently never lands
on a fresh DB. `scripts/src/check-schema-dump-drift.mjs` catches this:
it loads the committed dump into a disposable scratch DB, replays every
migration in a savepoint sandbox, and fails if the result drifts beyond
`scripts/schema-dump-drift-baseline.txt` (the baseline absorbs cosmetic
pg_dump CHECK-constraint reformatting so it never causes a false
failure). It runs inside the `guard` CI gate via `scripts/guard.sh`
(`check:schema-dump-drift`) and self-skips locally when it can't
provision a scratch DB.

When it fires, follow the **dump-refresh + cutoff-advance** workflow:

1. `bash db/dump-schema.sh` — regenerate `schema_pre.sql` +
   `schema_post.sql` + `schema.sql` from the live DB.
2. Advance `db/.baseline-cutoff` to the lex-max **and** numeric-max
   migration filename now baked into the refreshed dump, so a fresh boot
   marks those migrations applied instead of re-running them.
3. `UPDATE_BASELINE=1 node scripts/src/check-schema-dump-drift.mjs` —
   retire any baseline lines whose underlying drift is now gone and
   re-capture the remaining cosmetic reformatting.
4. Commit `db/schema*.sql`, `db/.baseline-cutoff`, and
   `scripts/schema-dump-drift-baseline.txt` together.

### Live-DB drift monitor (NOT a gate)

The drift guard above proves *dump ↔ migrations*. It never looks at the
real live DB, so a live/production database that has silently fallen
**below** the canonical dump (e.g. performance indexes from migrations
016/018/074 dropped, or `hr_leave_requests` regressing to conflicting
CHECK constraints that reject valid statuses) stays invisible until
someone manually re-dumps and notices the diff.

`scripts/src/check-live-db-drift.mjs` (`pnpm check:live-db-drift`) closes
that gap. It loads the committed dump into a disposable scratch DB (the
**canonical** schema), then reads indexes, constraints, and columns from
both the scratch DB and the live `$DATABASE_URL` via `pg_catalog` and
diffs them object-by-object:

- **MISSING in live** — present in the dump, absent in live. The loud
  failure: live lost something it should have. Each is printed with
  idempotent remediation SQL (`CREATE INDEX IF NOT EXISTS …`,
  `ALTER TABLE … ADD CONSTRAINT …`, `ALTER TABLE … ADD COLUMN IF NOT
  EXISTS …`). Apply it against the live DB to restore the object.
- **CHANGED** — same object, different definition (e.g. a CHECK narrowed
  so it rejects valid values). Remediation drops + re-adds the canonical
  definition.
- **EXTRA in live** — present in live, absent in the dump. Usually just
  means the live DB is ahead of the last `bash db/dump-schema.sh` refresh
  — a **warning** by default (pass `--strict` / `STRICT=1` to fail on it).

Because both sides render via the same server's `pg_get_indexdef` /
`pg_get_constraintdef`, there's no cosmetic pg_dump-text noise; the one
known-benign deparse variance (the `ARRAY[(x)::text,…]` vs
`(ARRAY[x::varchar,…])::text[]` rendering of an identical `ANY(ARRAY[…])`
membership test) is normalized away before comparison so genuine changes
still surface.

Exit codes: `0` clean (or only EXTRA without `--strict`, or a benign skip
when `DATABASE_URL` is unset / the role lacks `CREATEDB`); `1` live is
MISSING/CHANGED objects; `2` the check could not run. This is a **monitor,
not a PR gate** — it needs the live DB, so run it on demand
(`pnpm check:live-db-drift`) or register it as a periodic Replit workflow
(`node scripts/src/check-live-db-drift.mjs`).

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
