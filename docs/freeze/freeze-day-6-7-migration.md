# Day 6-7 — `buildScopedWhere` migration scope & policy

> **Decision date**: 2026-05-09
> **Outcome**: Policy documented; one representative migration shipped (`auditLogs.ts`); the bulk of "manual `WHERE companyId = $X`" callsites are NOT migration candidates and are tracked here for visibility.

## Reality check on the original plan

The Day 6-7 entry in `docs/freeze/freeze-14-day.md` budgeted "migrate top-50 hottest routes". A first-pass inventory shows that target was based on a misread:

| File                     | Manual `"companyId" = $X` count | Pattern                         | Migration candidate? |
| ------------------------ | -------------------------------: | ------------------------------- | -------------------- |
| `bi.ts`                  | 76                               | aggregations (COUNT/SUM/AVG)    | No                   |
| `moduleDashboards.ts`    | 50                               | aggregations                    | No                   |
| `admin.ts`               | 33                               | detail joins / user lookups     | No                   |
| `umrah-entities.ts`      | 30                               | mostly already use builder      | No                   |
| `finance-custodies.ts`   | 27                               | detail queries + journal writes | No                   |
| `properties.ts`          | 24                               | detail + JOIN predicates        | No                   |
| `mySpace.ts`             | 24                               | keyed by `activeAssignmentId`   | No                   |
| `finance-algorithms.ts`  | 24                               | scoped algorithms               | No                   |
| `accounting-engine.ts`   | 24                               | detail queries + JOINs          | No                   |
| `rules.ts`               | 10                               | `companyId IS NULL OR = $X`     | No                   |
| `activityLog.ts`         | 12                               | UNION across multiple tables    | No                   |
| `auditLogs.ts`           | 4                                | LIST endpoint                   | **Yes — migrated**   |

The `buildScopedWhere()` helper is purpose-built for ONE shape: a row-listing `WHERE` clause with companyId + optional branchId + optional search + optional soft-delete. Five common patterns in this codebase do not fit:

1. **Detail queries** — `SELECT … WHERE id = $1 AND "companyId" = $2`. Already minimal; the helper would add overhead, not safety.
2. **Aggregations** — `SELECT COUNT(*) FROM x WHERE "companyId" = $1`. The helper builds a `WHERE` not a single-clause filter for an aggregate; manually inline is clearer.
3. **JOIN predicates** — `JOIN ea ON … AND ea."companyId" = $X`. The Day 3-5 defense-in-depth fixes added these to JOIN clauses, which the helper does not generate.
4. **Cross-tenant fallbacks** — `WHERE "companyId" IS NULL OR "companyId" = $1` (system-wide rules / templates that any tenant can read). The helper has no flag for this and adding one would muddy its contract.
5. **UNION queries** — `activityLog.ts` UNIONs audit_logs + journal_entries + several others. Each branch has its own scope; one helper invocation cannot model that.

## Final policy

The ratchet test (`tests/integration/tenantIsolation.test.ts`) accepts ALL valid forms:
- explicit `"companyId" = $N` predicate in SQL
- `${…}` interpolation that may inject `buildScopedWhere(…)`
- args containing `scope.companyId` / `scope.allowedCompanies` / `scope.activeAssignmentId` / etc.

Therefore "migrate to `buildScopedWhere`" is a **maintainability** preference, not a safety requirement. From now on:

- **New code** for LIST endpoints (`router.get("/")` with pagination + filter + scope) MUST use `buildScopedWhere`.
- **Existing code** in patterns 1-5 above is kept as-is. Migration without a clear win is forbidden during the freeze.
- **Existing LIST endpoints that don't use the helper** are tracked in this document and migrated on a per-feature basis when the file is otherwise touched.

## Done in this session

- `auditLogs.ts` GET `/` migrated. Improvement: now respects `scope.allowedCompanies` for users with assignments in multiple companies (the previous code only filtered by `scope.companyId`, hiding rows from sibling companies the user could legitimately see).
- Verified clean typecheck + tenant-isolation static test still green.

## Outstanding LIST endpoints (post-freeze cleanup)

Files with `router.get("/")` LIST endpoints that filter by companyId but don't yet use `buildScopedWhere`. Most are small and low-traffic; migrating them is mechanical but yields nothing during the freeze:

- `documents.ts` — has search + pagination, would benefit if migrated
- `requests.ts` — list of requests, similar
- `workflows.ts` — list of workflow definitions
- `gov-integrations.ts` — list of government integrations
- `search.ts` — global search (special case; arguably not a candidate)

These are tracked for a post-freeze sweep, not for this 14-day window.

## Why this is the right scope

The freeze's purpose is to close tenant-isolation risk before production. Day 1-5 closed the actual leak surface (defense-in-depth predicates added everywhere a static scan flagged a risk). Migrating the rest of the codebase to `buildScopedWhere` is a **cosmetic** change that doesn't move the production-readiness needle. Day 8-14 deliverables (KNOWN_ISSUES register, RBAC v2 migration grid, real-PG dynamic tests, freeze final report) carry far more risk-reduction per hour, and that's where the remaining freeze budget should go.
