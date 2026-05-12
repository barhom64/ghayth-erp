# Post-freeze cleanup tracker

> **Started**: 2026-05-09 (after PR #214 merged the dynamic harness into CI)
>
> The 14-day freeze closed with a GO. This file tracks the post-freeze
> cleanup work the freeze report acknowledged but didn't include. Each
> entry says exactly what changed, what's still open, and why.

## Sweep #1 — buildScopedWhere migration (2026-05-09)

**Done in this sweep**:

- `workflows.ts` GET `/` → `buildScopedWhere` with `companyColumn: 'wi."companyId"'`, `disableBranchScope: true`, `softDeleteColumn: 'wi."deletedAt"'`. The `status` and `requestType` query filters now use a paramIdx counter instead of `params.length`, so the unit test in `tests/unit/workflowsSmoke.test.ts:155` was widened to accept either form.
- `gov-integrations.ts` GET `/` → `buildScopedWhere` with `disableBranchScope: true`. Both the cold-path and seeded-fallback queries reuse the same `where`/`params` from one helper call.

**Not migrating** (and why — see `freeze-day-6-7-migration.md` for the policy):

- `documents.ts`, `requests.ts` — both use the cross-tenant fallback shape `("companyId" = $1 OR "companyId" IS NULL)` to expose system-wide rows alongside the tenant's own. Migrating would require a new `includeSystemRows` flag on `buildScopedWhere`; the cost/benefit doesn't justify adding it.
- `search.ts` — global search; not a single-table list endpoint.

**Verification**: `bash scripts/guard.sh` green locally with `DATABASE_URL` + `JWT_SECRET` exported (3208 tests passed, 16 dynamic scenarios green).

## Sweep #2 — dynamic harness expansion (2026-05-09)

`tests/integration/tenantIsolation.dynamic.test.ts` `SCOPED_LIST_ENDPOINTS` extended from 6 to 14 endpoints:

added: `/api/projects`, `/api/tasks`, `/api/documents`, `/api/requests`, `/api/workflows`, `/api/gov-integrations`, `/api/notifications`, `/api/audit-logs`.

The harness now runs 16 scenarios per CI job (2 D-class POST reproductions + 14 list-endpoint no-leak assertions). Each list-endpoint scenario accepts `200`, `401`, `403`, or `422` as a valid no-leak response and only fails if the response body contains a row whose `companyId` matches `companyB`.

Adding more list endpoints is mechanical — append to the array, no other changes needed.

## Still deferred (not started in this sweep)

### 1. RBAC v2 test debt — 27 files

`docs/freeze/freeze-day-10-11-rbac.md` lists 27 test files that still need to be updated to reflect the new `authorize()`/`requirePermission()` role matrix. `employeesSmoke.test.ts` is the worked demo. Each remaining file is a one-off — they don't compose into a generic mass-rename.

**Why deferred**: each file requires reading the route's intent, mapping it onto the new role grid, and updating expectations. Doing 27 of those without per-file context risks introducing false-green tests.

**Recommendation**: tackle these in feature batches as the routes are otherwise touched, not as a stand-alone sweep.

### 2. `db/schema.sql` regeneration

The current dump uses an interleaved per-table grouping (PKs, FKs, and CREATE TABLE blocks intermixed) that PG16 can't load in a single pass — see the 2-pass workaround in `.github/workflows/guard.yml`'s `Load schema into test Postgres` step.

**To fix**: re-run `db/dump-schema.sh` on Replit (where the live DB is). The PG16-compatible pg_dump there will emit a clean post-data section and the 2-pass workaround can be removed. After the dump:

```bash
# On Replit — env already has DATABASE_URL pointed at the live DB
bash db/dump-schema.sh
git add db/schema.sql
git commit -m "db: regenerate schema.sql with PG16-compatible ordering"
git push
```

Then locally / in a follow-up PR:

```yaml
# .github/workflows/guard.yml — replace the 2-pass python heredoc with
# a single line:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f db/schema.sql
```

**Why deferred**: Replit access required.

### 3. Harness expansion beyond list endpoints

The current 14 list endpoints + 2 POST D-class repros covers reads broadly but writes narrowly. Future scenarios worth adding (each one is ~10 lines of test):

- POST `/api/finance/journal/entries` with a foreign-tenant `accountId` → expect rejection
- POST `/api/finance/vendors` with a foreign `companyId` in the body → expect server overrides with scope
- DELETE `/api/clients/:id` where the id belongs to the other tenant → expect 404
- PATCH `/api/employees/:id` where the id belongs to the other tenant → expect 404

**Why deferred**: each needs route-shape research and a fixture extension (more seed rows than the current 2-companies fixture provides).
