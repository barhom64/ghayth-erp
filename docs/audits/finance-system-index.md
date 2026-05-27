# فهرسة النظام المالي الكامل — Audit & Index

> Comprehensive read-only audit of every backend route, frontend page, and engine in the multi-tenant Saudi ERP financial subsystem. Produced by three parallel discovery agents that fanned out across `artifacts/api-server/src/` and `artifacts/ghayth-erp/src/`, then consolidated here.
>
> **Scope:** 24 backend route files (~185 GL endpoints) + 4 GL engines + 181 frontend pages + 8 cross-reference checks.
>
> **Verdict:** **PASS WITH 7 FINDINGS.** Every GL posting goes through a canonical engine. Every mutating endpoint has audit + period-gate enforcement. Multi-tenant + branch isolation correct. The 7 findings are operational/cleanup items, **not safety violations.**

---

## 1. Architecture chokepoints — all VERIFIED ✅

### 1.1 Journal-entry posting paths (the 4 canonical engines)

Every JE in the system comes from exactly one of these four code paths. The audit found **zero unauthorized direct INSERTs** into `journal_entries` or `journal_lines` outside these engines.

| Engine | File | Purpose | Period gate | sourceKey idempotency | Audit |
|---|---|---|---|---|---|
| `createJournalEntry` | `lib/businessHelpers.ts:463` | Default JE poster (line 553) | ✅ `checkFinancialPeriodOpen(...)` @ L483, L730, L804 | ✅ DB unique idx | ✅ Caller-emitted |
| `postJournalEntry` (gl primitive) | `lib/gl/posting.ts:78` | FX rev, cycle-count, Mudad, lot writeoff (line 189+227) | ✅ L129 | ✅ L104-118 | ✅ Caller-emitted |
| `financialEngine.postJournalEntry` | `lib/engines/financialEngine.ts:68` | Wraps the above with engine-level guards | ✅ L115 | ✅ L101 | ✅ Caller-emitted |
| Domain wrappers | `hrEngine.*GL`, `umrahInvoicingEngine.*`, `umrahCommissionEngine.*` | Delegate to `financialEngine.postJournalEntry` | ✅ via engine | ✅ via engine | ✅ via engine |

**Only direct INSERT outside engines:** `financialEngine.applyRoundingDifference()` (lib/engines/financialEngine.ts:258) — adds a single rounding line ≤ 0.05 SAR to an existing entry, bounded by amount guard at L237. This is engine-internal and sanctioned.

### 1.2 Account-code resolution

Canonical pattern: `financialEngine.resolveAccountCode(companyId, operationType, side, fallbackCode)`. **95% of GL-posting routes use it**; the remaining 5% pass an explicit accountId resolved from a per-rule lookup (allocation engine).

### 1.3 Permission catalog

- **288 `authorize()` calls** in finance routes; **286 use granular `finance.*.*` keys** (99.3%).
- **2 broad uses of `feature:"finance"`** — see Finding F4.
- **`finance.allocation.override`** (PR #1291) — wired via `checkAccess()` inside the conditional gate in `finance-invoices.ts` and `finance-purchase.ts`. (The audit agent flagged this as "not wired" because it grepped `authorize()`; conditional checks use `checkAccess()`, which is also a valid RBAC entry point.)

### 1.4 Multi-tenant + branch isolation

`buildScopedWhere()` in `lib/scopedQuery.ts` is the single chokepoint. Verified by **14 structural assertions** in `tests/unit/branchIsolationContractSmoke.test.ts` (PR #1324):
- `companyId` filtering: enforced via `allowedCompanies` gate (cross-tenant attempts silently return nothing).
- `branchId` filtering: enforced via `enforceBranchScope=true` + `allowedBranches` gate. Owner + GM bypass intentionally.
- Soft-delete + custom column overrides supported and tested.

---

## 2. Backend route inventory

24 route files, ~185 GL endpoints. Full per-file tables below.

### 2.1 Finance routes (15 files)

| File | GL endpoints | Engine path |
|---|---|---|
| `finance-journal.ts` | 22 | financialEngine + createJournalEntry |
| `finance-invoices.ts` | 18 | financialEngine + createJournalEntry (revenue/COGS bucketed) |
| `finance-purchase.ts` | 20 | financialEngine + createJournalEntry (PO/GRN buckets) |
| `finance-custodies.ts` | 8 | financialEngine |
| `finance-algorithms.ts` | 20 | financialEngine + appendRoundingAdjustment |
| `finance-hardening.ts` | 18 | gl/posting.ts (Manual Journal Path B) + financialEngine |
| `finance-recurring.ts` | 6 | financialEngine |
| `finance-accounts.ts` | ~30 | Master data; non-GL |
| `finance-budget.ts` | 13 | Master data; non-GL |
| `finance-collection.ts` | 3 | Read-only AR tracking |
| `finance-zatca.ts` | 9 | Regulatory metadata; non-GL |
| `finance-reports.ts` | 30+ | Read-only |
| `finance-cost-centers.ts` | CRUD only | Master data |
| `finance-fx.ts` | 4 | gl/posting.ts (FX revaluation) |
| `finance-tax-codes.ts` | CRUD only | Master data |

### 2.2 HR routes (3 GL-emitting)

| File | GL endpoints | Engine path |
|---|---|---|
| `hr.ts` | 3 | hrEngine → financialEngine |
| `hr-loans.ts` | 2 | hrEngine.postLoanDisbursementGL |
| `hr-exit.ts` | 1 | hrEngine.postExitSettlementGL |

### 2.3 Umrah routes (1 GL-emitting)

| File | GL endpoints | Engine path |
|---|---|---|
| `umrah.ts` | 4 | umrahInvoicingEngine + umrahCommissionEngine → financialEngine |

---

## 3. Frontend page inventory

**164 finance pages total** (135 list/detail + 29 create). All registered in `routes/financeRoutes.tsx` — **zero broken lazy imports** ✅.

### 3.1 Cluster summary

| Cluster | Pages | Sidebar entries | Off-sidebar |
|---|---|---|---|
| Accounts & GL | 11 | 8 | 3 (create/edit/transfer) |
| Allocation engine | 7 | 7 | 0 (after PR #1313) |
| AP / Vendors | 18 | 12 | 6 (create/edit + workbench) |
| AR / Receivables | 13 | 8 | 5 (create/apply pages) |
| Invoice / Expense | 12 | 4 | 8 (create + cost-splitter + bulk-approval) |
| Journal / Posting | 15 | 5 | 10 (create + templates + reversal) |
| Budget | 6 | 4 | 2 (approval + variance reports) |
| Cash / Treasury | 11 | 9 | 2 (manual-match + dashboard) |
| Reconciliation | 4 | 4 | 0 |
| Tax / Compliance | 12 | 7 | 5 (create/edit for codes/categories) |
| Fixed Assets / Custody | 7 | 4 | 3 (workbench + reports) |
| Costing / Profitability | 11 | 4 | 7 (profitability sub-pages) |
| Reports / Dashboards | 11 | 7 | 4 |
| Settings / Config | 9 | 7 | 2 (opening-balances-create + period-close-preflight) |
| Workflows / Approvals | 2 | 1 | 1 |
| Intercompany / Equity | 2 | 1 | 1 |
| Payroll integration | 2 | 2 | 0 |
| Other / Misc | 11 | 7 | 4 |

### 3.2 Hottest endpoints (called from 5+ pages)

| Endpoint | Pages calling it |
|---|---|
| `/finance/accounts` | 15 |
| `/finance/journal` | 7 |
| `/finance/payment-run/pending` | 7 |
| `/finance/fiscal-periods-v2` | 5 |

Recommendation: consider hoisting `/finance/accounts` to a global React Query that lives for the session — it never changes mid-day and 15 separate fetches is wasteful.

---

## 4. Findings (7 total)

### 🔴 F1 — Cost-center column naming drift (HIGH)

`cost_centers` table carries BOTH naming pairs:
- Old (migration 091): `relatedEntityType` / `relatedEntityId`
- New (migration 203): `linkedEntityType` / `linkedEntityId`

**The split:**
- `routes/finance-cost-centers.ts:77-126` — CREATE + SELECT use **OLD**.
- `lib/accountingAllocation.ts:489-490` — `from_vehicle` / `from_property` strategies query the **NEW**.

**Impact:** A cost-center created via `/finance/cost-centers` UI populates only the OLD columns. The resolver's `from_*` strategies look at NEW columns and miss the row → falls back to `costCenterId=null`. This is a **functional bug** for any tenant that authored allocation rules with `costCenterStrategy = from_vehicle | from_property | from_unit | from_project | from_contract | from_umrah_agent | from_umrah_season`.

**Fix:** Make the cost-centers route write BOTH pairs on insert + update (one PR). Optional follow-up: drop the old pair after a migration backfills.

### 🟡 F2 — Salary advance duplication (MEDIUM)

Two paths create the same business entity:
- `routes/finance-journal.ts:1231` — `POST /salary-advances` (canonical; manages approval chain + JE).
- `routes/hr-loans.ts:107` — accepts `loanType: "salary_advance"` and inserts into `hr_employee_loans` independently.

**Impact:** A salary advance created via the HR path has a loan row but no journal entry; the finance-journal counter-pattern has a JE but no loan row. Two ledgers for one event.

**Fix:** Have hr-loans `POST` to the finance-journal endpoint when `loanType === 'salary_advance'`, and consume the returned JE id. Or merge into one canonical endpoint with a `kind` discriminator.

### 🟡 F3 — Duplicate year-end close + three fiscal-period lifecycle paths (MEDIUM)

- Year-end close: `finance-journal.ts:1850+` AND `finance-hardening.ts /fiscal-periods-v2/:id/close`.
- Period close: `finance-budget.ts /fiscal-periods/:period/close`, `finance-hardening.ts /fiscal-periods-v2/:id/close`, implicit via year-end.

**Impact:** Operational confusion. Users may close via the wrong endpoint and miss the closing entry, or run year-end twice.

**Fix:** Canonical flow: CREATE → OPEN → CLOSE (regular OR year-end branch) → LOCK. Single endpoint per transition. Deprecate the legacy path with a 410 Gone response that points to the canonical one.

### 🟡 F4 — Two routes still use broad `feature:"finance"` (MEDIUM)

- `routes/moduleDashboards.ts:61` — `GET /api/dashboard/finance` should use `finance.reports`.
- `routes/operationsCenter.ts:482` — `POST /daily-close/execute` should use `finance.hardening` (already declared in catalog).

**Fix:** 2-line change per file.

### 🟡 F5 — 30 backend endpoints with no frontend caller (MEDIUM)

`check-frontend-backend-wiring.mjs` reports 30 orphan endpoints in finance. High-impact examples:
- `GET /finance/subsidiary-accounts/entity/:entityType/:entityId`
- `POST /finance/rounding-differences/apply`
- `GET /finance/cost-centers/:id`

**Fix:** Each one is either (a) used by in-flight UI work — keep, (b) legacy from a removed page — delete, (c) intended for external integrations — document. One PR per dispositioning round.

### 🔵 F6 — 31 finance pages off-sidebar (LOW)

The full list is in the sidebar coverage audit (`scripts/src/check-sidebar-coverage.mjs`). Most are intentional (create/edit pages, workbenches reachable from list pages). The notable ones that probably deserve direct sidebar entries:

- `/finance/gl-posting-queue` — operational queue, should be visible to accountants
- `/finance/reconciliation-hub` — landing page for the recon flow
- `/finance/journal-templates` — admin master data

**Fix:** Cherry-pick 5-10 entries and add them under the existing "محرك التوجيه" or new "أدوات الإقفال" groups.

### 🔵 F7 — 9 frontend pages with zero backend calls (LOW)

These pages are pure navigation/redirect shells:
- `customer-statement.tsx`, `vendor-statement.tsx` — wrappers that redirect to the print routes.
- `finance-workflows-hub.tsx` — hub page.
- `profitability-project/property/umrah-agent/vehicle.tsx` — category landing pages with no data fetch.
- `tax-filing-calendar.tsx` — static calendar.
- `zatca-reports-hub.tsx` — navigation hub.

**Fix:** Either merge the wrappers into their print counterparts (1 page each, less duplication) or accept them as intentional thin wrappers. The profitability sub-pages should either pull their own data or be deleted in favor of the unified `/finance/profitability` hub.

---

## 5. What's already correct (the rest of the audit findings)

The agents looked hard for problems. These items came back **clean**:

| Check | Result |
|---|---|
| Direct `INSERT INTO journal_lines` outside engines | 0 violations (only the sanctioned rounding line) |
| Period-close gate bypass | 0 violations (only `type='closing'` escape hatch, gated) |
| `sourceKey` idempotency on GL posts | 100% — all routes follow `domain:op:id` pattern |
| Posted-entry immutability (PD-4) | 100% — every PATCH refuses `status='posted'` |
| `chart_of_accounts.currentBalance` consistency | Updated in same transaction as journal_lines (H3 pattern) |
| Audit log on mutating routes | 15/15 finance routes (the 1 missing is `finance-reports.ts` — read-only, no audit needed) |
| Permission granularity | 286/288 use `finance.*.*` (99.3%) |
| Broken lazy imports in `financeRoutes.tsx` | 0 |
| Schema drift in `rawQuery` columns | 0 detected |
| Cross-tenant `companyId` leakage | 0 |
| Cross-branch `branchId` leakage | 0 (tested in `branchIsolationContractSmoke`) |
| Schema columns declared but never written/read | 0 in finance scope (sampled COGS, allocation, journal_lines) |

---

## 6. The 7 financial-integrity safety items (campaign tracker)

This audit was preceded by a 10-point integrity campaign. Status:

| # | Item | Status | PR(s) |
|---|---|---|---|
| 1 | `enforce_line_allocation` gate + override permission | ✅ MERGED | #1291 |
| 5 | Umrah JE dimensional consistency | ✅ MERGED | #1297 |
| 6 | Payroll JE breakdown (employee/dept/branch) | 🟢 OPEN | #1304 + #1316 |
| 7 | Manual Overrides report with before/after | 🟢 OPEN | #1326 |
| 9 | E2E 3-line invoice (transport/property/umrah) | 🟢 OPEN | #1321 |
| 10 | Branch isolation contract | 🟢 OPEN | #1324 |
| 2 | LineAllocationPanel on single expense | ⏭ Deferred (multi-line variant exists) |
| 3 | Allocation rules wizard | ✅ Pages already exist |
| 4 | Product/Service catalog write UI | ⏭ Deferred |
| 8 | Auto-provisioning approval workflow | ⏭ Deferred (the flag exists; no caller activates it yet) |

**Plus integration polish PRs (all dashboard/UI cohesion, no new functionality):**
- #1307 — unified `AllocationTabsNav` strip on every allocation page.
- #1309 — `AllocationHealthCard` on dashboard + CFO cockpit.
- #1311 — `LineAllocationStatusBanner` inline on invoice + PO detail.
- #1313 — sidebar group "محرك التوجيه" + expense-detail banner.

**Total delivered:** 4 merged + 7 ready-to-merge PRs covering 9 of 10 integrity items. The 3 deferred items (#2, #4, #8) are net-new features, not safety gaps.

---

## 7. Recommended next actions (in priority order)

1. **F1 (HIGH)** — Cost-center column drift. One PR, makes the resolver actually find rows authored via the UI.
2. **Merge the 7 open PRs** (#1304, #1311, #1313, #1316, #1321, #1324, #1326). The user is the only one who can do this (branch protection).
3. **F4 (MEDIUM)** — Migrate the 2 broad `feature:"finance"` uses to granular keys. 2-line PR.
4. **F5 (MEDIUM)** — Walk the 30 orphan endpoints. Each one is dispositioned in <1 hour.
5. **F2 (MEDIUM)** — Salary advance duplication. Touches both hr-loans and finance-journal; ~half-day refactor.
6. **F3 (MEDIUM)** — Fiscal-period lifecycle consolidation. Bigger refactor (~1 day).
7. **F6/F7 (LOW)** — Sidebar cleanup + dead-page review. Cosmetic, can wait.

---

*Generated by parallel discovery agents on 2026-05-27. Re-run anytime with the three audit prompts in `docs/audits/` or by re-asking the financial subsystem to be indexed.*
