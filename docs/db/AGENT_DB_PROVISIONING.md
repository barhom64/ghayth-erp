# Agent DB provisioning — official live-Postgres + journey-verification path

> **One-command Postgres for agents (CI sandboxes, local Claude sessions, contractor laptops) — zero Docker, zero system Postgres customisation.** Produces a HEAD-of-main DB the API server boots against; every `verify-*-journey.sh` runs end-to-end without manual repair.

## When to use this

- A PR touches **payroll, discipline, GL posting, journal entries, period close, ZATCA, dunning, finance accruals, umrah commissions** — anything that needs a balanced ledger to prove the change works.
- A reviewer asks «هل الترحيل المالي يتوازن فعلاً؟» — answer with a journey run, not a smoke test.
- A bug report blames «لم يُحدَّث الحساب» — reproduce against this DB before chasing logic.

For pure UI / FE-only refactors that don't write to the DB, the smoke tests in `tests/unit/` are enough. This page covers the cases where they aren't.

## Prerequisites

- `postgresql-16` package installed (`apt list --installed | grep postgres`). The image already has it.
- Node 22+ + pnpm 10 (already set up).
- **No Docker. No `pnpm run dev`. No system Postgres on :5432.** This provisioner stands up its own native cluster on **:54329** (the test marker the dynamic-tenant harness asserts on).

## The one-liner

```bash
runuser -u postgres -- bash -c 'export PATH=/usr/lib/postgresql/16/bin:$PATH; bash scripts/provision-agent-db.sh'
```

(or `pnpm db:provision-agent` if your user can run `initdb` directly — the `runuser -u postgres` wrapper is needed because root can't `initdb`.)

End state — printed at the end of a successful run:
```
schema_migrations: 332 baseline-marked (33 seeds replayed), 0 post-cutoff applied
post-company seed replay: 33 seeds — numbering_schemes=84, accounting_mappings=45
invariants OK: admin=1, open periods=2, migrations=332/332
✓ Head-of-main DB ready at HEAD
```

Then:
```bash
export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test
```

Login: `owner@local.test` / `Test1234!` (admin) or `door@door.sa` / `Door@2026Diaa` (Al-Diyaa company-2 owner).

## What the provisioner actually does

1. **`initdb`** a fresh native PG-16 cluster at `/tmp/pg-agent-54329` (re-uses the data dir if already initialised; trust-auths the `postgres` OS user).
2. **`pg_ctl start`** on **127.0.0.1:54329**.
3. **Ensures** the `ghayth_erp` role + `ghayth_erp` DB exist.
4. **Loads `db/schema_pre.sql` + `db/schema_post.sql`** — the canonical schema dump (regenerated from this branch; includes every migration ≤ cutoff in its post-applied state, no gaps).
5. **`schema_migrations`** pre-marked: every file ≤ `db/.baseline-cutoff` (`297_rename_collided_migration_filenames.sql` today) recorded as already applied; every post-cutoff migration **actually executed**.
6. **Per-company seed replay** (NEW in this PR): the `SEED_REPLAY_ALLOWLIST` (33 files: numbering schemes 213-232, GL operation mappings 035/036/254/256/257, approval chains 133/250, RBAC templates 110/258, etc.) re-runs **after** company seeds — many of these contain `FROM companies c CROSS JOIN ...` so an empty companies table at step 4 produced 0 rows; this step makes them land. All are idempotent (ON CONFLICT DO NOTHING / IF NOT EXISTS).
7. **Hand-curated seeds**: `seed-admin-user.sql` → `seed-aldiyaa-albayan.sql` → `seed-aldiyaa-company-defaults.sql` → `seed-financial-periods.sql`.
8. **Invariants check**: admin row exists, ≥1 open period (GL posting unblocked), every migration filename in `schema_migrations`.

If any step fails, the script exits non-zero — the contract is «ready or loud», never a silent partial.

## Running a `verify-*-journey.sh`

The journey scripts assume an API server running against the provisioned DB:

```bash
# 1. Build + start the API server (once)
pnpm --filter @workspace/api-server run build
cd /home/user/ghayth-erp/artifacts/api-server
DATABASE_URL="postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp" \
JWT_SECRET="local-dev-secret-must-be-at-least-32-characters-long-test" \
NODE_ENV=development PORT=5000 \
nohup node --enable-source-maps ./dist/index.mjs > /tmp/api-server.log 2>&1 & disown

# 2. Wait for health (or `sleep 8`)
curl -fsS http://localhost:5000/api/health

# 3. Run any journey
cd /home/user/ghayth-erp
DATABASE_URL="postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp" \
  bash scripts/verify-hr-payroll-journey.sh
```

Currently green journeys against a fresh provision:
- `verify-hr-payroll-journey.sh` (13/13 — accrual GL, maker-checker, payment GL)
- `verify-hr-discipline-journey.sh` (10/10 — غياب→محضر→قرار→جزاء→أثر بالراتب)
- `verify-umrah-commission-payroll-journey.sh` (16/16 — راتب+عمولة exactly-once with balanced GL) *(merged via PR #2038)*

## Running the live-DB guard checks

Three guards in `guard.sh` are SKIPPED in CI by default (they require a live DB). Run them locally against the provisioned DB after any schema-touching change:

```bash
DATABASE_URL="postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp" \
  node scripts/src/check-schema-drift.mjs
DATABASE_URL="postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp" \
  node scripts/src/check-ghost-rows.mjs
DATABASE_URL="postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp" \
  node scripts/src/check-sql-ambiguity.mjs
```

What each catches:
- **schema-drift**: every column referenced in `routes/*.ts` raw SQL (and every Drizzle `.values()`/`.set()` key) exists in the live schema. Catches typos and post-rename rot. *On this branch: 2238 cols / 440 tables / 115 routes — 0 drift.*
- **ghost-rows**: every SELECT against a soft-delete table filters by `"deletedAt" IS NULL`. Catches cross-tenant leak via deleted rows. *On this branch: 287 statements inspected, 0 ghosts.*
- **sql-ambiguity**: every column reference in a JOIN is qualified (no naked `name` when two joined tables both have one). Catches «ambiguous column» runtime errors. *On this branch: 435 tables — 0 ambiguities.*

## Healing a broken DB

If the cluster gets wedged:
```bash
runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pg-agent-54329 stop -m fast
rm -rf /tmp/pg-agent-54329
# then run the provisioner again — it re-initdb's
```

## Generalising to finance / umrah journeys

The provisioner is **domain-agnostic** — it produces a HEAD-of-main DB, not an HR-only DB. The same `pnpm db:provision-agent` + `bash scripts/verify-<domain>-journey.sh` pattern works for:

| Domain | Existing journey scripts |
|---|---|
| Finance | `verify-finance-posting-journey.sh`, `verify-purchase-journey.sh`, `verify-custody-journey.sh` |
| Umrah | `verify-umrah-journey.sh`, `verify-umrah-commission-payroll-journey.sh` |
| Fleet/transport | `verify-fleet-trip-journey.sh` |
| Property | `verify-property-rent-journey.sh` |
| Legal | `verify-legal-journey.sh` |
| Correspondence | `verify-correspondence-journey.sh` |
| Import | `verify-import-journey.sh` |
| SoD | `verify-sod-enforcement.sh` |

When the finance + umrah server-side reviews kick off, run them against this DB rather than reasoning about the schema in the abstract.

## When the dump goes stale

Symptoms: provisioner ends green but the API server 500s with `column X does not exist` / `relation Y does not exist`, OR seed counts (`numbering_schemes`, `accounting_mappings`) drop.

Cause: a new migration landed that the dump hasn't been regenerated to include. Fix:

```bash
# 1. Provision a clean DB at the new HEAD
runuser -u postgres -- bash -c 'export PATH=/usr/lib/postgresql/16/bin:$PATH; bash scripts/provision-agent-db.sh'

# 2. Apply EVERY migration on a separate test cluster (the provisioner only
#    runs post-cutoff; we want EVERYTHING to land in the dump):
runuser -u postgres -- /usr/lib/postgresql/16/bin/initdb -D /tmp/pg-fresh-dump -U postgres --auth=trust
runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pg-fresh-dump \
  -o "-p 54330 -F -h 127.0.0.1" -l /tmp/pg-fresh-dump.log start
psql "postgres://postgres@127.0.0.1:54330/postgres" -c \
  "CREATE ROLE ghayth_erp WITH LOGIN PASSWORD 'ghayth_erp' SUPERUSER;"
psql "postgres://postgres@127.0.0.1:54330/postgres" -c \
  "CREATE DATABASE ghayth_erp OWNER ghayth_erp;"
# Reload existing dump as baseline, then apply EVERY migration on top
# (most are IF NOT EXISTS-safe so the overlap is a no-op).
psql "postgres://ghayth_erp:ghayth_erp@127.0.0.1:54330/ghayth_erp" -f db/schema_pre.sql
psql "postgres://ghayth_erp:ghayth_erp@127.0.0.1:54330/ghayth_erp" -f db/schema_post.sql 2>/dev/null
bash /tmp/apply-all-migrations.sh \
  "postgres://ghayth_erp:ghayth_erp@127.0.0.1:54330/ghayth_erp" \
  artifacts/api-server/src/migrations

# 3. Regenerate the dump
DATABASE_URL="postgres://ghayth_erp:ghayth_erp@127.0.0.1:54330/ghayth_erp" \
  bash db/dump-schema.sh

# 4. Bump db/.baseline-cutoff to the latest migration filename + commit
```

## Anti-patterns to refuse

- **Editing `db/schema_pre.sql` / `db/schema_post.sql` by hand.** Always regenerate.
- **Adding a new migration without running it locally against this DB first** (the schema-drift check will catch it on push, but only if you actually pushed; a 5-min local run is faster).
- **Skipping `db:provision-agent` for "small" finance changes.** Every finance change touches the ledger; the ledger needs a real DB.
- **`pnpm db:bootstrap`** for agent work. That script targets a different layout (system Postgres on :5432); not the agent flow.

---
*Generated as part of the dump-regeneration + migration-renumber PR. See the PR description for the gap analysis (13 missing-column migrations + 33 missing-seed migrations) that drove this work.*
