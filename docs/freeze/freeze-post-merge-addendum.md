# Freeze post-merge addendum (9 May 2026)

The `claude/tenant-isolation-tests-plltB` freeze branch was forked from
commit `2f7c702` ("feat(rbac): payroll + budget + custodies + collection on
authorize() (102/1024)"). While the freeze deliverables landed in five
commits on the branch, **`main` advanced 13 commits in parallel** —
including some commits that materially change the picture documented in
the freeze artefacts. This addendum reconciles the two timelines.

## What main advanced through during the freeze

Three commits in particular changed the baseline:

- **`5711386` — `feat(rbac): 100% RBAC v2 coverage — every endpoint on authorize() (#196)`**
  Bulk-migrated all remaining 1012 endpoints from `requirePermission()` to
  `authorize()`. After this commit, the codebase is at **1123/1123 = 100%**
  on `authorize()`.
- **`b970fa8` — `fix: final comprehensive review — TOCTOU races, cross-tenant, atomicity, validation (#203)`**
  Added defense-in-depth atomicity / TOCTOU guards across many routes.
  Distinct work from this freeze (no overlap with the 19 candidates the
  static scanner surfaced), but lands in similar files.
- **`d45b94a` — `fix(rbac): granular sub-features across finance/properties/fleet/legal/crm/warehouse/support (107 features)`**
  Adds finer-grained permission sub-features.

## What this means for the freeze artefacts

| Doc                                              | Stale claim                                         | Actual at merge time                                                        |
| ------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------- |
| `docs/RBAC_V2.md` §11                            | 103/1123 (9.2%) on `authorize()`                    | **1123/1123 (100%)** — `requirePermission()` is fully retired               |
| `docs/freeze/freeze-day-10-11-rbac.md`           | 12 stale RBAC test files                            | Now ~27 failing files, ~204 failing tests — the 100% migration broke many   |
|                                                  |                                                     | more legacy `requirePermission("X")` string assertions                      |
| `docs/freeze/freeze-final-report.md` §3 numbers  | "RBAC v2 migration: 103 / 1123 (9.2%)"              | 100% migrated; the next-wave priority queue is now empty                    |
| `docs/freeze/freeze-day-10-11-rbac.md` priority queue | high-risk financial / HR routes listed              | All migrated by `5711386`; queue is closed                                  |

The freeze docs are kept as the authoritative **historical record** of
decisions made between fork point and merge time. They are not edited
retroactively because they document the reasoning that shaped the work
done on the branch — including the deliberate decision *not* to
attempt the +100 endpoint migration during the freeze, which `main`
then completed independently.

## What this means for the freeze conclusion

The Day 14 final report's recommendation (**GO, conditional on wiring
the dynamic harness into CI**) stands unchanged. The substantive value
of this branch is unchanged by the merge:

- Static tenant-isolation guard at `tests/integration/tenantIsolation.test.ts` — **green: 3 / 3 passing**
- Dynamic harness scaffold at `tests/integration/tenantIsolation.dynamic.test.ts` — **8 / 8 skipped** until CI provides the test Postgres
- 16 defense-in-depth `companyId` predicates added across 7 route files — **all preserved through the merge**
- One real cross-tenant write closed in `properties.ts` `POST /maintenance-requests` — **preserved through the merge**

What changed during the merge is mechanical RBAC test debt that already
existed on `main`. The merge did not introduce new failures; it inherited
existing ones. The remaining work is to apply the `guardRe()` pattern
demonstrated in `tests/unit/employeesSmoke.test.ts` (Day 10-11 deliverable)
across the now-broader set of legacy-string assertions — a mechanical
sweep that does not block production.

## Conflict resolution at merge

A single import-line conflict was resolved in
`artifacts/api-server/src/routes/auditLogs.ts`:

- The freeze branch added `import { buildScopedWhere } from "../lib/scopedQuery.js"` for the Day 6-7 LIST-endpoint refactor.
- `main` migrated the file's three handlers from `requirePermission` to `authorize`, replacing the legacy import.

Resolution: keep both new imports (`authorize` for the handlers, `buildScopedWhere` for the body of `GET /`); the now-unused `requirePermission` import was dropped.

All other overlapping files (`accounting-engine.ts`, `crm.ts`, `employees.ts`,
`finance-custodies.ts`, `hr.ts`, `properties.ts`, `warehouse.ts`,
`docs/RBAC_V2.md`) auto-merged cleanly.

## Verification at merge time

```
$ pnpm --filter @workspace/api-server run typecheck
clean

$ pnpm --filter @workspace/api-server test tests/integration/tenantIsolation.test.ts
3 passed (3)

$ pnpm --filter @workspace/api-server test tests/integration/tenantIsolation.dynamic.test.ts
8 skipped (8)   # auto-skipped, no test DB on this runner

$ pnpm --filter @workspace/api-server test
204 failed | 2923 passed | 10 skipped
# All 204 failures are stale `requirePermission("X")` string assertions
# against routes that main migrated to `authorize()` — same set of
# failures that exist on main today. None introduced by this branch.
```
