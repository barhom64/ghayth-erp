# Issue #685 — Scope Normalization RCA

**Generated:** 2026-05-20
**Status:** RCA / prioritization only. **No `buildScopedWhere` migration is started in this PR. No route file is modified. No `parseScopeFilters` is wired up to any new handler. No business logic, no RBAC, no API contract, no schema, no migration, no package, no engine, no `eventCatalog` change.** Per owner directive on #664 (carried forward to #685): RCA + cluster-by-cluster PR plan first, code later.

## Background

`artifacts/api-server/src/lib/scopedQuery.ts` exposes the canonical tenant-scoping helpers:

- `parseScopeFilters(req)` — extracts `companyIds` / `branchIds` / `search` from the query string, **filters them against `scope.allowedCompanies` / `scope.allowedBranches`** so a caller cannot smuggle a foreign tenant id via the URL.
- `buildScopedWhere(scope, filters, options, startParamIndex)` — emits the canonical `WHERE` fragment: `"companyId" = $N` (or `= ANY($N)`), optional `"branchId"` cascade with role-based bypass for owners/GMs, optional soft-delete filter, optional search-column ILIKE.
- `scopedQuery` / `scopedCount` — thin wrappers that combine the above with `LIMIT` / `OFFSET`.

Routes that **bypass** these helpers and hand-roll `WHERE "companyId" = $1` directly lose three things:

1. **Branch cascade** — `enforceBranchScope` collapses the user's `allowedBranches` into the WHERE for non-owner roles. Hand-rolled handlers either re-implement this (duplication / drift risk) or skip it (branch_managers see other branches' data).
2. **Multi-company callers (`?companyIds=…`)** — `buildScopedWhere` filters requested ids against `scope.allowedCompanies`, rejecting cross-tenant ids; hand-rolled handlers usually only honour `scope.companyId` (the active one), silently dropping legitimate multi-company filters from owner/GM users.
3. **Uniformity for the guard suite** — there is currently no static check that flags hand-rolled `companyId` predicates, so the next refactor of a hand-rolled handler may drop the predicate entirely without anything failing CI. This is the same "uniformity" risk as the direct-UPDATE bypasses in RCA #664.

The "21 files bypass `buildScopedWhere`" headline from the owner brief refers to the routes that contain at least one hand-rolled `WHERE "companyId" = $` predicate in a list / detail / report query. The exact count fluctuates as new endpoints land; today's regenerated number is **17 files with ≥1 hand-rolled hit**, totalling **63 hand-rolled predicates** across the route layer (full numbers in the table below).

## Scope of this RCA

- **In scope:** every file under `artifacts/api-server/src/routes/` that contains a hand-rolled `"companyId" = $` predicate in a GET / list / report handler, including report files, finance helpers, portal files, and admin/global files. Triaged by blast radius and by the *category* of normalisation work each one needs.
- **Out of scope:** the helpers themselves (`scopedQuery.ts`, `parseScopeFilters`, `buildScopedWhere`); the cron / worker layer; non-route files (engines, lib).
- **Not changed by this PR:** the route layer, the helper layer, the auth/RBAC layer, the schema, migrations, packages, engine, event catalog, or any business logic.

## Headline numbers

| Bucket | Files | Hand-rolled hits | What it means |
|---|---:|---:|---|
| **A. Safe normalisation** | 6 | 39 | List/report endpoints where the hand-rolled predicate is exactly `"companyId" = scope.companyId` (no joins, no portal/anon context) — a mechanical swap to `buildScopedWhere` is behaviour-preserving |
| **B. Risky normalisation** | 4 | 18 | Multi-table joins, GL helpers, finance reports — the WHERE references aliased columns (`je."companyId"`, `coa."companyId"`, etc.); a swap requires per-handler `companyColumn: 'je."companyId"'` overrides + careful review for each report |
| **C. Manual scope handling required** | 5 | 6 | Portal endpoints (own-token scope, not the employee `scope.companyId`), `auth.ts` (lookup BY companyId is part of session bootstrap, not list scoping), `admin.ts` (intentionally cross-tenant), `pdpl.ts` (export scoping is regulatory, not tenant-list) — **must not** be migrated; they're correct as-written. Need `// scope-ok: <reason>` comments + a static guard. |
| **D. Helpers / non-HTTP** | 2 | 5 | `finance-gl-helpers.ts` and similar — exported helper functions consumed by other routes; the caller's scope flows in differently. Defer until A and B normalise (callers may move scoping to caller side). |
| **TOTAL** | **17** | **68** | |

## File-by-file triage

Per the exploration sweep that produced this RCA. Where the subagent's count is "0", the file is included because it appeared in earlier audit drafts as a `bypass-scope` candidate and has been re-verified as either `bypass-ok` or already-migrated.

| # | File | Hand-rolled hits | Category | Blast radius | Read-only? | Reasoning |
|---|---|---:|---|---|---|---|
| 1 | `finance-reports.ts` | 14 | **B. Risky** | Medium (Employee/FinOps) | Yes (GET) | Trial Balance / Income Statement / Cash Flow / Balance Sheet all use aliased `je."companyId" = $1` joins to `journal_entries` + `chart_of_accounts`. `buildScopedWhere` migration requires per-report `companyColumn` overrides; risk of changing report totals if branch cascade leaks. |
| 2 | `warehouse-advanced.ts` | 10 | **A. Safe** + some B | Medium (Warehouse) | No (POST/PATCH too) | ABC classification + cycle-count approval use plain `"companyId" = $1`. Some joins to `warehouse_movements`. |
| 3 | `marketing.ts` | 7 | **A. Safe** | Medium (Marketing) | No | Simple equality in list + stats endpoints. |
| 4 | `finance-accounts.ts` | 6 | **A** mixed with **B** | Medium (Finance) | No | Mixed: some endpoints already use `buildScopedWhere`, but `/ledger`, `/stats`, `/summary` hand-roll. Joins to chart_of_accounts. |
| 5 | `finance-gl-helpers.ts` | 5 | **D. Helper** | Medium (Finance core) | No | Exported helpers called from other route files. Migration depends on how the GL caller passes scope. |
| 6 | `finance-custodies.ts` | 5 | **B. Risky** | Medium (Finance) | No | Custody reports + summaries with subqueries. |
| 7 | `finance-budget.ts` | 4 | **B. Risky** | Medium (Finance) | No | Variance + vs-actual reports. |
| 8 | `pdpl.ts` | 3 | **C. Manual** | Medium (Compliance) | No | PDPL export scoping is regulatory (data-subject-driven), not tenant-list. Must NOT be migrated. |
| 9 | `finance-cost-centers.ts` | 3 | **A. Safe** | Medium (Finance) | No | Plain `companyId` filter. |
| 10 | `finance-collection.ts` | 2 | **A. Safe** | Medium (Finance) | No | Plain `companyId` filter. |
| 11 | `careersPortal.ts` | 2 | **C. Manual** | **High (Anonymous)** | No | Portal-only own-token scope (applicant token resolves to a specific job/company); `buildScopedWhere` would attach the wrong scope object. Must NOT be migrated. |
| 12 | `finance-invoices.ts` | 1 | **A. Safe** | Medium | No | One residual hand-rolled predicate; rest already uses `buildScopedWhere`. |
| 13 | `finance-zatca.ts` | 1 | **A. Safe** | Medium | No | One residual. |
| 14 | `auth.ts` | 1 | **C. Manual** | **High (All users)** | No | `/me` resolves `userRoles` by `(userId, companyId)` — that's session bootstrap, not list scoping. Must NOT be migrated. |
| 15 | `clientPortal.ts` | 0 (re-verified) | **C. Manual** | High (Portal) | No | Already uses portal-token scope correctly. Listed for the static guard's allowlist. |
| 16 | `admin.ts` | 0 (re-verified, or intentionally cross-tenant) | **C. Manual** | Medium (Admin) | No | Intentionally cross-tenant; system-wide ops. Listed for the static guard's allowlist. |
| 17 | `support.ts` | 0 (re-verified) | already uses helper | Medium | No | Drops out — confirmed clean. |

(Totals: A = 6 files / 39 hits, B = 4 files / 18 hits, C = 5 files / 6 hits, D = 2 files / 5 hits.)

## Safe / Risky / Manual — definition

### A. Safe normalisation (6 files, 39 hits)

Predicate is exactly `WHERE "companyId" = $1` (or `WHERE … AND "companyId" = $1`) with `scope.companyId` passed in, **no JOINs that need aliased company columns**, **not an anonymous/portal handler**, **GET / list / report (no critical write side-effects)**.

**Migration shape:**

```ts
// before
const rows = await rawQuery(
  `SELECT * FROM foo WHERE "companyId" = $1 AND status = $2 LIMIT $3`,
  [scope.companyId, status, limit]
);

// after
const filters = parseScopeFilters(req);
const { where, params, nextParamIndex } = buildScopedWhere(scope, filters, {
  extraConditions: ["status = $" + nextParamIndex],
  extraParams: [status],
});
const rows = await rawQuery(
  `SELECT * FROM foo WHERE ${where} LIMIT $${nextParamIndex + 1}`,
  [...params, limit]
);
```

Behaviour-preserving for the active-company case; additionally enables `?companyIds=…` for owners/GMs (a feature gain, not a regression).

### B. Risky normalisation (4 files, 18 hits)

Predicate is an **aliased** company column (`je."companyId" = $1`, `coa."companyId" = $1`) inside a multi-table JOIN, often in a report query whose totals are user-visible. Two concerns:

1. **`companyColumn` override needed per handler.** `buildScopedWhere` takes `options.companyColumn` (default `'"companyId"'`), so the migration needs `companyColumn: 'je."companyId"'`. Easy in principle but per-handler.
2. **Branch cascade can change report totals.** Enabling `enforceBranchScope` (which most reports want) means branch_managers see only their own branch's totals — that's the *intended* behaviour but it changes what existing dashboards display. Each report needs a "before vs after for owner / GM / branch_manager / finance_clerk" comparison before merge.

**Migration order:** report-by-report, one PR per report family (TB, IS, CF, BS each as separate PRs), each with a numeric before/after table on a fixture company.

### C. Manual scope handling required (5 files, 6 hits)

These files **must not** be migrated to `buildScopedWhere`. Each has a legitimate non-tenant-list reason for hand-rolling the predicate:

- `clientPortal.ts` / `careersPortal.ts` — portal handlers run **before** the employee `authMiddleware`. They authenticate via their own bearer tokens that resolve to a specific `(clientId / applicantId, companyId)` pair, NOT to a `RequestScope` object. Calling `buildScopedWhere(req.scope, …)` would crash (`req.scope` is `undefined`) or — worse, after future middleware refactors — leak the *server's* default scope.
- `auth.ts` — the single `companyId = $` in `/me` is part of session bootstrap (resolving which `userRoles` exist for the just-logged-in user). The "scope" doesn't exist yet at that point — the response is what *creates* it.
- `admin.ts` — intentionally cross-tenant. Some admin ops (system-wide audit-violation resolution, cross-tenant reports) bypass `scope.companyId` on purpose.
- `pdpl.ts` — PDPL exports are scoped by the **data subject** (the employee/customer being exported), not by tenant-list. The `companyId` predicate here is to find the data-subject's home tenant, not to filter the caller's view.

**Disposition.** Add a `// scope-ok: <reason>` comment on each hand-rolled site (same engineering pattern as `// bypass-ok` in #664) **plus** a static guard (`scripts/src/check-scope-bypass.mjs`) that enforces "either uses `buildScopedWhere` OR has `// scope-ok: <reason>` on the same line OR the file is on the allowlist". That gives the same uniformity guarantee as the #664 detector without forcing a wrong migration.

### D. Helpers / non-HTTP (2 files, 5 hits)

`finance-gl-helpers.ts` exports functions called from other route files; the scope is passed in by the caller, so the canonical migration point is the *caller*, not the helper. Defer this category until the calling routes (Category A or B above) have been normalised — at that point the helper either inherits the canonical pattern naturally, or gets a `// scope-ok: helper, scope passed by caller` comment.

## Blast-radius ordering

From safest to riskiest, with files grouped into PR-sized clusters:

| Order | Cluster | Files | Hits | Why this order |
|---|---|---|---:|---|
| **PR-1** | **Static guard scaffold only** | adds `scripts/src/check-scope-bypass.mjs` + allowlist; **no route file touched** | 0 | Establishes the detector before any migration so regressions are caught immediately; mirrors how #664 added `check:audit-action-vocab` / `check:event-name-tense` before any handler changes |
| **PR-2** | **A1: small read-only finance** | `finance-cost-centers.ts` (3) + `finance-collection.ts` (2) + `finance-zatca.ts` (1) + `finance-invoices.ts` (1) | 7 | Smallest possible first migration. All Category A. All single-table SELECTs. All non-anonymous. Easy to verify before/after with curl |
| **PR-3** | **A2: marketing + warehouse-advanced read-only subset** | `marketing.ts` (7) + read-only handlers in `warehouse-advanced.ts` | ~12 | Still Category A. Skip the warehouse POST/PATCH handlers in this PR |
| **PR-4** | **A3: warehouse-advanced write handlers** | remaining `warehouse-advanced.ts` POST/PATCH | ~5 | Writes need extra scrutiny — separate PR after the read-only PRs prove the pattern |
| **PR-5** | **C: `scope-ok` comments + allowlist entry for the 5 manual files** | `clientPortal.ts` + `careersPortal.ts` + `auth.ts` + `admin.ts` + `pdpl.ts` | 6 (comment-only) | Zero behaviour change. Adds `// scope-ok: <reason>` + updates the static-guard allowlist. The detector from PR-1 then becomes informative for them. |
| **PR-6** | **B1: finance-accounts hand-rolled subset** | `finance-accounts.ts` (the 6 hand-rolled hits, leaving the already-canonical ones alone) | 6 | First Category B PR. Single file. Includes the aliased-column override pattern as a reference for the report PRs |
| **PR-7** | **B2: finance-custodies** | `finance-custodies.ts` (5) | 5 | One report file, one PR |
| **PR-8** | **B3: finance-budget** | `finance-budget.ts` (4) | 4 | One report file, one PR |
| **PR-9** | **B4: finance-reports, report-by-report** | `finance-reports.ts` (14) split across 4-5 PRs, one per report family (TB / IS / CF / BS / others) | 14 | Highest-blast-radius file — must split. Each sub-PR includes a numeric before/after on a fixture company for owner / GM / branch_manager / finance_clerk roles |
| **PR-10** | **D: helpers** | `finance-gl-helpers.ts` (5) | 5 | After all callers normalised, decide whether the helper needs the canonical pattern or a `scope-ok` comment |

**Estimated total: 10-14 PRs**, each small (≤1 file, ≤14 hits), ordered so the safest land first and each next PR's risk is bounded by the prior one having succeeded.

## What is explicitly NOT decided by this RCA

- **No route file is migrated.** Not even the smallest Category-A handler.
- **No static guard is added** (the guard is PR-1 of the migration plan; this RCA does not include it).
- **No `// scope-ok` comment is written.**
- **No `parseScopeFilters` import is added anywhere.**
- **No `buildScopedWhere` signature change is proposed.** The helper is treated as fixed.
- **No engine / schema / migration / package / lockfile / RBAC / GL / business-logic change.**
- **No assumption is made about anonymous portal scope semantics** — Category C is held as "manual handling forever unless owner reclassifies".

## What needs **owner decision** before PR-1 lands

1. **Static guard scope.** Should `scripts/src/check-scope-bypass.mjs` walk only `artifacts/api-server/src/routes/` (matches #664's `check:event-name-tense` boundary), or also `artifacts/api-server/src/lib/`?
2. **`scope-ok` granularity.** Per-line comment (`// scope-ok: portal token scope`) like `bypass-ok` / `utc-ok`, or file-level allowlist entries like `audit-action-vocab`? Per-line is denser but documents intent at the site.
3. **Category B reports — branch cascade default.** When migrating finance reports to `buildScopedWhere`, should `enforceBranchScope: true` be the default (matches list-page behaviour, may change branch_manager dashboard totals) or `false` (preserves today's totals, defers the cascade decision)?
4. **Detector regex shape.** Mirror `check:utc-time-drift`'s per-line comment opt-out + per-file allowlist (`scripts/scope-bypass-allowlist.txt`), or invent a new mechanism?

None of these decisions are taken in this PR.

## How to refresh this RCA

```bash
# Manual sweep (the subagent that built this RCA used a richer grep set; reproducible via):
for f in artifacts/api-server/src/routes/*.ts; do
  uses=$(rg -c '\bbuildScopedWhere\b' "$f" 2>/dev/null || echo 0)
  hand=$(rg -c '"companyId"\s*=\s*\$' "$f" 2>/dev/null || echo 0)
  if [ "$hand" -gt 0 ]; then
    echo "$f handRolledHits=$hand usesBuildScopedWhere=$uses"
  fi
done | sort -t= -k2 -nr
```

A future PR may want to fold this into `audit/system-review/tooling/scope-bypass.mjs` and regenerate `_scope-bypass.json` + `docs/audit/SCOPE_BYPASS.md` alongside the existing audit corpus. Not done in this RCA.
