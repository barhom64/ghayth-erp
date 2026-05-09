# Day 2 Findings — Tenant-isolation static scan

> **Test**: `artifacts/api-server/tests/integration/tenantIsolation.test.ts`
> **Run**: 2026-05-09 (commit pending)
> **Total candidates**: 19 raw SQL calls across 8 route files
> **After heuristic refinement**: was 37 → 19 (the 18 dropped were `scope.activeAssignmentId`/`scope.userId`-keyed lookups, which `authMiddleware` already binds to the caller's company and so cannot reach another tenant)

## Triage labels

- **A (BOOTSTRAP)** — runs before request `scope` exists (login / refresh). Tenant boundary is the verified token, not `scope.companyId`. Allowlisted.
- **B (READ-AFTER-WRITE)** — reads a row whose primary key was just produced by an INSERT in the same handler that enforced `companyId`. Structurally cannot leak.
- **C (SURROGATE-FROM-SCOPED-FETCH)** — keyed by an id pulled from a previously-scoped `SELECT … WHERE companyId = scope.companyId`. Same as B but two queries upstream.
- **D (USER-SUPPLIED ID, NO TENANT CHECK)** — keyed by a value that originates from `req.params` / `req.body` / `req.query` without a companyId predicate. Real leak vector: confirms cross-tenant existence and may return foreign rows.
- **E (NEEDS DEEPER READ)** — caller chain is more than two hops; cannot triage from the snippet alone.

## The 19 candidates

| # | File                       | Line | Table                  | Triage | Action                                    |
| -: | -------------------------- | ---- | ---------------------- | ------ | ----------------------------------------- |
|  1 | `auth.ts`                  | 296  | employee_assignments   | A      | Allowlist — refresh-token bootstrap        |
|  2 | `accounting-engine.ts`     | 307  | chart_of_accounts      | E      | Day 3 — confirm parent template scope      |
|  3 | `accounting-engine.ts`     | 355  | chart_of_accounts      | E      | Day 3 — same template, different handler   |
|  4 | `accounting-engine.ts`     | 411  | chart_of_accounts      | E      | Day 3 — same template, different handler   |
|  5 | `crm.ts`                   | 1016 | employee_assignments   | C      | Day 3 — verify `$1` ANY array source       |
|  6 | `employees.ts`             | 627  | employee_assignments   | B      | Day 3 — read-after-INSERT, add allowlist   |
|  7 | `employees.ts`             | 627  | branches               | B      | Day 3 — same row, branches join            |
|  8 | `employees.ts`             | 786  | attendance             | C      | Day 3 — `employee.assignmentId` from scoped fetch |
|  9 | `employees.ts`             | 1084 | employee_assignments   | B/C    | Day 3 — read-after-UPDATE, key was scoped  |
| 10 | `finance-custodies.ts`     | 441  | employee_assignments   | **D**  | Day 3 — `resolvedAssignmentId` from request body, NO companyId check before journal write |
| 11 | `hr.ts`                    | 1702 | hr_leave_requests      | B      | Day 3 — read-after-INSERT of `insertId`    |
| 12 | `hr.ts`                    | 1702 | hr_leave_types         | E      | Day 3 — joined leave-type ID — confirm tenant scope |
| 13 | `hr.ts`                    | 2154 | employee_assignments   | E      | Day 3 — `leave_approval_stages` LEFT JOIN  |
| 14 | `hr.ts`                    | 2326 | employee_assignments   | E      | Day 3 — `payroll_lines` LEFT JOIN          |
| 15 | `hr.ts`                    | 2364 | employee_assignments   | E      | Day 3 — same payroll join, different shape |
| 16 | `hr.ts`                    | 5246 | employee_assignments   | E      | Day 3 — `peer_evaluations` JOIN            |
| 17 | `properties.ts`            | 2223 | employee_assignments   | **D**  | Day 3 — `assignedTechnicianId` from `req.body`, returns `employeeId` cross-tenant |
| 18 | `properties.ts`            | 2265 | employee_assignments   | **D**  | Day 3 — same pattern, different handler    |
| 19 | `warehouse.ts`             | 821  | employee_assignments   | E      | Day 3 — `userId` is a helper-function arg; trace caller |

## Hard P0 candidates (Triage D)

These have user-supplied ids that flow into a tenant-scoped table without a `companyId` predicate. Confirmed cross-tenant oracle at minimum; the custodies one is worse because it feeds the stolen `employeeId` into a journal write.

- `finance-custodies.ts:441` — leaks `employees.id` for foreign-tenant assignmentId, then writes a journal line tagged with that foreign employee under the caller's company. Severity: **HIGH** (privilege boundary breach via cross-tenant key reuse).
- `properties.ts:2223` & `2265` — confirms whether a technician ID exists in another tenant and returns its `employeeId`. Severity: **MEDIUM** (info disclosure; no destructive write because the createNotification at L2229 still tags the caller's company).

## What I changed today

1. New file: `artifacts/api-server/tests/integration/tenantIsolation.test.ts` — static scanner.
2. New file: `.local/tasks/freeze-14-day.md` — overall plan.
3. Test allowlist seeded with **auth.ts:296** only. The other 18 candidates are surfaced as failures so Day 3-5 cannot be skipped.
4. Vitest config already includes `tests/**/*.test.ts`, so the new test runs in the existing `pnpm --filter @workspace/api-server test` command — no CI wiring change needed today.

## What I did NOT do today

- Wire the test into `scripts/guard.sh` as a separate step. Today the test is auto-discovered by vitest, so guard runs it via `pnpm --filter @workspace/api-server test` if guard runs the test suite. (Will verify in Day 3 morning.)
- Build the dynamic supertest harness. The existing tests in `tests/unit/` are all static-analysis and there is no DB-spin-up infrastructure. Day 12-13 introduces docker-compose Postgres for that.
- Triage every E case. Eight of the 19 need callers traced more than one hop, which is the Day 3-5 slot.

## Day 3 plan (kickoff)

1. Confirm CI picks up the failing test (push branch, watch guard run).
2. Triage the three D-class findings first (custodies + 2× properties); fix or allowlist with reason.
3. Walk the eight E-class findings in `hr.ts` — likely all share the `payroll_lines`/`leave_approval_stages` JOIN pattern; one helper fix may resolve several.
4. Update this document at end-of-day-3 with verdicts.
