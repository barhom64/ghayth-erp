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

## Sweep #2 — write-path harness scenarios (2026-05-09)

Extended `tests/integration/_fixtures/twoCompanies.ts` to seed one row per company in `clients`, `projects`, and `tasks`, then added 5 cross-tenant write scenarios:

- DELETE `/api/clients/:id` (foreign client)
- PATCH `/api/clients/:id` (foreign client)
- DELETE `/api/projects/:id` (foreign project)
- PATCH `/api/projects/:id` (foreign project)
- DELETE `/api/tasks/:id` (foreign task)

Each asserts the response status is one of `[401, 403, 404, 422]` — never `200`/`204` (which would mean the mutation went through). Total dynamic scenarios per CI run is now **21** (2 D-class POST repros + 14 list no-leak + 5 cross-tenant writes).

Adding more write scenarios is mechanical: append to the `CROSS_TENANT_WRITE_CASES` array in the test file and seed any new tables in the fixture's `seedCompany`.

## Sweep #3 — RBAC migration completion + 2 more harness writes (2026-05-11)

**RBAC migration now 100% complete** (modulo `admin.ts` which had 3 holdouts):

- 3 `requirePermission("admin:read")` calls in `admin.ts:1390/1398/1412` (the `/system-registry/*` GET endpoints) → `authorize({ feature: "admin", action: "list" })`. Same authorization semantics, consistent with the 1131 already-migrated endpoints.
- 65 dead `requirePermission` imports removed across the routes directory. These were leftover from the `requirePermission → authorize` mass migration: every endpoint had been moved but the import line wasn't pruned. Now the import only appears where the symbol is actually used (which after this sweep is zero files outside the middleware module itself).

**Corrected migration stats** — `freeze-day-10-11-rbac.md` claimed "9.2% coverage / 103 authorize / 1017 requirePermission". The current numbers are very different and the doc was massively stale by the time today's session began:

| | claimed (2026-05-09) | actual (2026-05-11) |
| --- | --- | --- |
| `authorize()` endpoints | 103 | **1131** |
| `requirePermission()` endpoints | 1017 | **0** |
| Coverage | 9.2% | **100%** |

The wide gap is explained by the steady migration drip in the days between the freeze-day-10-11 doc and now (PR #195 alone moved ~100 endpoints; most subsequent feature PRs followed the same pattern).

**Harness expansion**: 2 additional cross-tenant write scenarios:

- PATCH `/api/employees/:id` (foreign employee) → expect [401, 403, 404, 422]
- DELETE `/api/employees/:id` (foreign employee) → same

Total dynamic scenarios per CI run is now **23** (2 D-class POST repros + 14 list no-leak + 7 cross-tenant writes). The fixture's existing `companyB.employeeId` is the test target — no new seed needed because the fixture already creates one employee per company for the owner assignment.

## Resolved (not still deferred)

### ~1. RBAC v2 test debt — 27 files~

This was already addressed during the freeze recovery (see PR #209 and follow-ups). As of 2026-05-09, `bash scripts/guard.sh` reports **3256 tests passed / 0 failed / 2 skipped** on `main`. The 11 specific files flagged in `freeze-day-10-11-rbac.md` are no longer red.

The remaining work is the **+100 endpoint migration goal** from the original Day 10-11 plan — that's a feature change, not test debt, and is out of scope for the cleanup sweeps.

### ~2. `db/schema.sql` regeneration~

**Done 2026-05-10** — re-ran `bash db/dump-schema.sh` on Replit against the live
DB. New dump is **27,678 lines / 311 tables / 596 indexes / 376 FKs** with a
clean post-data section: 0 constraints before the first `CREATE TABLE`, all 376
FKs grouped after the last `CREATE TABLE`. PG16 can now load it in a single
pass, so the 2-pass workaround in `.github/workflows/guard.yml` (if/when it gets
re-added) is no longer needed — a single `psql -f db/schema.sql` suffices.

### 2. Further harness expansion

Sweep #2 added the first 5 write scenarios (clients/projects/tasks DELETE+PATCH). Future scenarios worth adding when the surrounding feature is touched:

- POST `/api/finance/journal/entries` with a foreign-tenant `accountId` → expect rejection (needs `accounts` seed in fixture)
- POST `/api/finance/vendors` with a foreign `companyId` in the body → server should override with scope
- PATCH `/api/employees/:id` where the id belongs to the other tenant → expect 404
- More tables under DELETE/PATCH: invoices, vendors, employees, requests

**Why deferred**: each needs a route-specific reading + a fixture extension (additional seed rows). The shape is now established by sweep #2; new scenarios are append-only.
