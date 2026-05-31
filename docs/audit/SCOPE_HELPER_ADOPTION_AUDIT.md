# Scope helper adoption audit (GAP_MATRIX item #13)

> **Re-audit finding (2026-05-30):** the original sweep flagged this as
> P0, but a deeper read of the 64 "manual scope" files shows that the
> vast majority of usage is **correct-by-design**, not a leak risk:
>
>   - Single-company queries that legitimately filter by the
>     authenticated user's current company (e.g. execDashboard,
>     mySpace, workspace) — `scope.companyId` IS the right answer.
>   - Public endpoints (publicData, careersPortal) where `companyId`
>     comes from a query param by design.
>   - Webhooks (fleet-telematics-webhook) where the company context
>     comes from the integration record validated upstream.
>   - INSERT/event-emission usage that doesn't filter at all.
>
> The real leak surface is much smaller than the headline 64 files
> suggest. The ratchet (`scopeHelperAdoptionSmoke.test.ts`) is still
> worth keeping because it catches NEW manual usage in code review,
> but the urgency on migrating existing routes is much lower than the
> original P0 classification.
>
> The original Top-15 list below stays for reference, but each file
> needs a per-route re-review before migration (most rows will
> resolve to "keep manual, document why"; a few will be real
> migrations).

## Methodology

- Helper users counted via
  `grep -c 'buildScopedWhere\|scopedQuery\|scopedCount'`
- Manual scope counted via
  `grep -c '"companyId" = $\|scope\.companyId\b'`
- Anything that uses the helper is presumed safe (the helper enforces
  `allowedCompanies` from `req.scope`).
- Anything that doesn't use the helper but matches manual scope is a
  hardening candidate: a single missed `WHERE "companyId" = $1` is a
  cross-tenant data leak.

## Numbers

- **36** route files use the helper at least once
- **87** route files have manual scope clauses
- **~30%** adoption rate
- The 15 worst files account for the bulk of manual handling.

## Top 15 files by manual-scope count

| Rank | File | Manual hits | Notes |
|---:|---|---:|---|
| 1 | `routes/properties.ts` | 290 | Largest router. Owner of property+tenant+lease tables. High blast radius. |
| 2 | `routes/umrah.ts` | 208 | Pilgrim PII + finance integration. High blast radius. |
| 3 | `routes/umrah-entities.ts` | 189 | Agents + sub-agents + commissions. PII + commercial confidential. |
| 4 | `routes/finance-algorithms.ts` | 160 | Allocations + aging. Financial impact if cross-tenant. |
| 5 | `routes/admin.ts` | 159 | Admin tools. Often intentionally cross-tenant (owner role). Audit individually. |
| 6 | `routes/bi.ts` | 122 | BI rollups. Read-only but cross-tenant leak surfaces metrics. |
| 7 | `routes/rbacV2.ts` | 107 | Permission management. Wrong scope = privilege escalation. |
| 8 | `routes/governance.ts` | 104 | Policy/risk records. |
| 9 | `routes/hr-discipline.ts` | 91 | Discipline memos. PII + HR-confidential. |
| 10 | `routes/finance-hardening.ts` | 85 | Fiscal periods, journal lock. Critical finance. |
| 11 | `routes/documents.ts` | 72 | Document storage. Likely highest PII surface. |
| 12 | `routes/requests.ts` | 70 | Generic requests. |
| 13 | `routes/finance-custodies.ts` | 67 | Custodies tracking. |
| 14 | `routes/notification-engine.ts` | 66 | Notification fan-out. Wrong scope = misdelivered messages. |
| 15 | `routes/accounting-engine.ts` | 63 | Accounting calculations. |

## Recommended migration order (P0 → P3)

| Priority | File | Reason |
|---|---|---|
| P0 | `routes/rbacV2.ts` | Privilege escalation surface — any scope leak grants permissions |
| P0 | `routes/documents.ts` | Largest PII surface |
| P0 | `routes/finance-hardening.ts` | Fiscal close paths — already gated by min-level, but scope leak = wrong tenant's books |
| P1 | `routes/properties.ts` | Biggest file, biggest blast radius |
| P1 | `routes/umrah.ts` + `routes/umrah-entities.ts` | Pilgrim PII |
| P1 | `routes/hr-discipline.ts` | Personnel-confidential |
| P2 | `routes/notification-engine.ts` | Misdelivery risk |
| P2 | `routes/finance-algorithms.ts`, `routes/finance-custodies.ts`, `routes/accounting-engine.ts` | Financial calculation surfaces |
| P2 | `routes/governance.ts`, `routes/requests.ts` | Workflow records |
| P3 | `routes/bi.ts` | Read-only metrics |
| P3 | `routes/admin.ts` | Often intentionally cross-tenant — audit case by case |

## Helper API reference

```ts
// lib/scopedQuery.ts

// Build a parameterized WHERE clause that enforces the request's
// allowedCompanies + allowedBranches. Honors optional filters and
// per-table column overrides (companyColumn, branchColumn).
buildScopedWhere(scope, filters?, options?, startParamIndex?): {
  where: string;
  params: unknown[];
  nextParamIndex: number;
}

// One-shot scoped SELECT (combines buildScopedWhere + rawQuery).
scopedQuery<T>(req, table, baseSelect, options?): Promise<T[]>

// One-shot scoped COUNT.
scopedCount(req, table, options?): Promise<number>

// Parse ?companyIds=...&branchIds=... query into ScopeFilters
// (filters caller's request to allowedCompanies/Branches).
parseScopeFilters(req): ScopeFilters
```

## Useful options

- `disableBranchScope: true` — for tables without `branchId`
  (e.g. `clients`, `projects`, `crm_opportunities`,
  `support_tickets`, `hr_leave_requests`, `recurring_invoices`).
- `enforceBranchScope: true` — restrict to user's
  `scope.allowedBranches` unless owner/general_manager.
- `softDeleteColumn: '"deletedAt"'` — auto-append soft-delete filter.

## How to migrate one route safely

1. Identify the SELECT/UPDATE/DELETE statement.
2. Replace the literal `WHERE "companyId" = $1` (and any `branchId`
   filter) with the helper's generated WHERE.
3. Re-thread the helper's `nextParamIndex` into any subsequent
   `$2`, `$3`, ... placeholders.
4. For pure list endpoints, prefer `scopedQuery()` over building
   the SQL yourself.

## Guard test

A guard test (`tests/unit/scopeHelperAdoptionSmoke.test.ts`) pins the
list of files that currently bypass the helper. When a developer adds
a new manual `"companyId" = $1` WHERE in a file that's NOT on the
list, the test fails — forcing the diff reviewer to either:

  (a) migrate the new code to use the helper, or
  (b) explicitly add the file to the allowlist with a justification.

This is a one-way ratchet: the count only drops over time. New code
can't quietly add to the manual-scope backlog.

Refs:
- `artifacts/api-server/src/lib/scopedQuery.ts` (helper)
- `artifacts/api-server/src/middlewares/authMiddleware.ts` (req.scope)
- `docs/audit/GHAITH_SYSTEM_GAP_MATRIX.md` item #13
- `docs/audit/EXECUTIVE_INVENTORY_REPORT.md` FND-013
