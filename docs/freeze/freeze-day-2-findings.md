# Day 2-5 Findings — Tenant-isolation static scan

> **Test**: `artifacts/api-server/tests/integration/tenantIsolation.test.ts`
> **Initial run**: 2026-05-09 (commit `16027cb`) — 19 candidates → 18 after auth bootstrap allowlist
> **Resolution run**: 2026-05-09 (Day 3-5 fixes) — 0 unexplained violations remaining
> **Allowlist final size**: 3 entries (auth bootstrap + 2 read-after-INSERT pair)

## Summary of fixes

Of the 19 initial candidates, **16 were resolved with defense-in-depth fixes** (added `AND <table>."companyId" = scope.companyId` to the JOIN/WHERE clause), **2 were verified as legitimate read-after-INSERT** patterns and remain allowlisted with full reasons, and **1 was the auth-bootstrap exemption** documented from Day 2.

### Triage labels (from Day 2)

- **A (BOOTSTRAP)** — runs before request `scope` exists
- **B (READ-AFTER-WRITE)** — reads a row whose primary key was just produced by an INSERT in the same handler that enforced `companyId`
- **C (SURROGATE-FROM-SCOPED-FETCH)** — keyed by an id pulled from a previously-scoped `SELECT … WHERE companyId = scope.companyId`
- **D (USER-SUPPLIED ID, NO TENANT CHECK)** — keyed by request input without a companyId predicate
- **E (NEEDS DEEPER READ)** — caller chain is more than two hops

## Final disposition

| # | File                       | Line | Table                  | Triage | Disposition                                                                |
| -: | -------------------------- | ---- | ---------------------- | ------ | -------------------------------------------------------------------------- |
|  1 | `auth.ts`                  | 296  | employee_assignments   | A      | **Allowlisted** — refresh-token bootstrap                                  |
|  2 | `accounting-engine.ts`     | 307  | chart_of_accounts      | E      | **Fixed** — added `ca."companyId" = scope.companyId` to JOIN              |
|  3 | `accounting-engine.ts`     | 355  | chart_of_accounts      | E      | **Fixed** — same JOIN tightening (post-create read-after-write)            |
|  4 | `accounting-engine.ts`     | 411  | chart_of_accounts      | E      | **Fixed** — same JOIN tightening (post-update read-after-write)            |
|  5 | `crm.ts`                   | 1016 | employee_assignments   | C      | **Fixed** — added `AND "companyId" = scope.companyId` to assignment lookup |
|  6 | `employees.ts`             | 627  | employee_assignments   | B      | **Fixed** — added `ea."companyId" = $2` to JOIN                            |
|  7 | `employees.ts`             | 627  | branches               | B      | **Fixed** — added `b."companyId" = $2` to LEFT JOIN                        |
|  8 | `employees.ts`             | 786  | attendance             | C      | **Fixed** — added `a."companyId" = $2` to WHERE                            |
|  9 | `employees.ts`             | 1084 | employee_assignments   | B/C    | **Fixed** — added `ea."companyId" = $3` to JOIN, params extended           |
| 10 | `finance-custodies.ts`     | 441  | employee_assignments   | **D**  | **Fixed** — added `ea."companyId" = scope.companyId` to WHERE              |
| 11 | `hr.ts`                    | 1702 | hr_leave_requests      | B      | **Allowlisted** — read-after-INSERT of insertId from scoped INSERT @1649   |
| 12 | `hr.ts`                    | 1702 | hr_leave_types         | E      | **Allowlisted** — joined to allowlisted row above                          |
| 13 | `hr.ts`                    | 2154 | employee_assignments   | E      | **Fixed** — added `ea."companyId" = $2` to LEFT JOIN                       |
| 14 | `hr.ts`                    | 2326 | employee_assignments   | E      | **Fixed** — added `ea."companyId" = $2` to LEFT JOIN                       |
| 15 | `hr.ts`                    | 2364 | employee_assignments   | E      | **Fixed** — added `ea."companyId" = $2` to JOIN                            |
| 16 | `hr.ts`                    | 5246 | employee_assignments   | E      | **Fixed** — added `ea."companyId" = $2` to LEFT JOIN                       |
| 17 | `properties.ts`            | 2223 | employee_assignments   | **D**  | **Fixed** — added pre-INSERT validation of `b.assignedTo` against tenant + tightened JOIN |
| 18 | `properties.ts`            | 2265 | employee_assignments   | **D**  | **Fixed** — same validation + tightened JOIN                               |
| 19 | `warehouse.ts`             | 821  | employee_assignments   | E      | **Fixed** — added `AND "companyId" = $2` (companyId arg already passed in) |

## Verification

- `pnpm --filter @workspace/api-server test tests/integration/tenantIsolation.test.ts` — all 3 tests pass.
- `pnpm --filter @workspace/api-server run typecheck` — clean.
- Full suite: 12 pre-existing failures unchanged (RBAC v2 `requirePermission()` → `authorize()` migration debt — out of scope for this freeze item; tracked under Day 10-11).

## Notes for Day 6-7 (migrate hand-written WHERE clauses)

Several of the fixes above are the manual `AND "companyId" = $N` pattern. Day 6-7 will migrate the hottest of these to `buildScopedWhere()`. The newly-tightened JOIN clauses are NOT candidates for `buildScopedWhere()` — they live inside JOIN predicates, which the helper doesn't generate. Those stay as manual `AND ea."companyId" = $X` and are tracked by the static test going forward.

## Notes for Day 12-13 (dynamic supertest harness)

The two D-class fixes (custodies + properties) deserve runtime verification:
- POST `/finance/custodies` with `{assignmentId: <foreign>}` → must 404 / 403, never write
- POST `/properties/maintenance-requests` with `{assignedTo: <foreign>}` → must 400 / 404 with `ValidationError`

Both scenarios are sketched in `tests/integration/tenantIsolation.dynamic.test.ts.skip` and will be wired in Day 12.
