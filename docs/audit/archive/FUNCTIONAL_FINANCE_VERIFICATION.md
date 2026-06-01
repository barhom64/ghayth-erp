# Functional Finance Verification — Ghayth ERP

Generated: 2026-05-20
Mode: **static code-trace, report-only** (no code change, no runtime).
Scope: the Finance / Accounting module — **69 frontend pages** (`financeRoutes.tsx`
+ 2 settings tabs) traced end-to-end against **17 backend route files**
(`finance-*.ts` + `accounting-engine.ts`, ~229 endpoints).

> This is a *functional* verification — does each page actually work as an
> operational path (Page → API → handler → DB → GL → audit/events →
> permissions → export)? It is the companion to the file-level
> `FINANCE_CERTIFICATION.md` (which checks backend dimensions only) and
> deliberately adds the **frontend + wiring** dimension on top.

---

## 0. Executive summary — هل المالية مسار تشغيلي فعلي؟

**الجواب المباشر:** المالية في غيث **ليست واجهات فقط** — يوجد backend حقيقي وغني:
محرّك ترحيل GL فعلي (`postJournalEntry` يكتب `journal_entries` + `journal_lines`
متوازنة داخل transaction)، استعلامات SQL حقيقية، RBAC على كل endpoint، وتدقيق/أحداث
على كثير من العمليات. **لكنها ليست مسارًا تشغيليًا موثوقًا end-to-end.** طبقة الربط
(UI ↔ API، تسلسل الحالات، وأثر GL) مليئة بالثقوب — وأخطرها أن **اعتماد الفاتورة من
الواجهة لا يُنشئ أي قيد محاسبي**.

**Bottom line:** Finance is a *real but unfinished* operational system. The
plumbing exists; the connections leak. Of 69 pages:

| Verdict | Count | Share |
|---|---:|---:|
| ✅ شغّال (works end-to-end) | 12 | 17% |
| 🟡 ناقص (incomplete) | 41 | 59% |
| ❌ مكسور (broken) | 16 | 23% |

Only **17%** of Finance pages work end-to-end — and almost all of those are
**read-only report pages** (ledger, AR aging, treasury, fixed-assets list,
custodies, recurring journals). Every page that *moves money* has at least one
broken or missing link. The single most important finance flow — **approving a
customer invoice — posts nothing to the general ledger when done through the
UI**. The system can display finance data convincingly; it cannot yet be
trusted to *record* finance operations correctly.

---

## 1. Method & coverage

For each page: opened the `.tsx`, enumerated every `apiFetch` /
`useApiQuery` / `useApiMutation` / `apiPatch` / `apiDelete` call, located the
matching Express handler, and verified 14 criteria. Verdict scale per the task
brief: **شغّال** / **ناقص** / **مكسور** / **غير قابل للتحقق static-only**.

**Shared architecture confirmed:**
- All finance routers mount under `/finance` behind `requireModule("finance")`;
  most also behind `requireGuards("financial")` — **but `finance-reports.ts`,
  `finance-algorithms.ts` and `finance-hardening.ts` are mounted WITHOUT that
  guard** (`index.ts:296,300,306`).
- RBAC: `authorize({feature,action})` (`lib/rbac/authorize.ts`) — verified
  present on every finance handler (consistent with `FINANCE_CERTIFICATION.md`).
- GL: `postJournalEntry` (`lib/gl/posting.ts`) inserts a balanced
  `journal_entries` + `journal_lines` row inside a transaction. "GL effect" =
  a reachable call path into this (or `financialEngine.postJournalEntry`).

**Runtime:** not performed. The app is not runnable without an environment
change — there is no `.env` (only `.env.example`), and the stack needs
Postgres + migrations + seed via Docker. Per the task constraint ("Runtime only
if ready without env/code change") this pass is **static-only**; runtime items
are listed in §6.

---

## 2. Route-by-route / page-by-page matrix

Legend — verdict is the page's *overall* result. `GL` column: ✅ posts/consumes
GL correctly · ❌ expected but missing/broken · — not expected.

### 2.1 Accounts & General Ledger

| Page | Route | Verdict | GL | Key finding |
|---|---|---|---|---|
| Finance dashboard | `/finance` | 🟡 ناقص | — | Activity feed needs role ≥70; client-side filter of 15 global logs |
| Chart of accounts | `/finance/accounts` | 🟡 ناقص | — | Tree/flat edit+delete buttons have **no permission guard** |
| Account create | `/finance/accounts/create` | 🟡 ناقص | — | Submit button not `GuardedButton` (page-level only) |
| Account edit | `/finance/accounts/:id/edit` | 🟡 ناقص | — | No `GET /accounts/:id`; fetches whole 5000-row list |
| Account detail | `/finance/accounts/:id` | 🟡 ناقص | — | `balance` field always renders `—` (not returned by API) |
| Ledger | `/finance/ledger/:code` | ✅ شغّال | ✅ | Date filter uses `createdAt` not accounting `date` |
| GL posting queue | `/finance/gl-posting-queue` | ✅ شغّال | ✅ | Works; queues hard-capped at 200 rows, no filters |
| Accounting mappings | `settings → mappings` | 🟡 ناقص | — | journal-templates & subsidiary-accounts CRUD are API-only |

### 2.2 Journal & Periods

| Page | Route | Verdict | GL | Key finding |
|---|---|---|---|---|
| Journal | `/finance/journal` | 🟡 ناقص | ✅ | Row-click → `/finance/journal/:id` — **route not registered** |
| Journal create | `/finance/journal/create` | 🟡 ناقص | ✅ | `FileDropZone` collects files, never sent |
| Manual journal | `/finance/journal-manual` | ❌ مكسور | ❌ | **GL posted at draft creation; no reversal on reject** |
| Manual journal create | `/finance/journal-manual/create` | ❌ مكسور | ❌ | Same GL-at-draft defect |
| Manual journal detail | `/finance/journal-manual/:id` | 🟡 ناقص | ✅ | Submit/review/post buttons absent from detail page |
| Fiscal periods | `/finance/fiscal-periods` | ❌ مكسور | — | Cosmetic "closed" status; **no UI to actually close a period** |
| Opening balances | `/finance/opening-balances` | ✅ شغّال | — | — |
| Opening balances create | `/finance/opening-balances/create` | 🟡 ناقص | ✅ | No `createAuditLog` on opening-balance creation |
| Year-end close | `/finance/year-end-close` | 🟡 ناقص | ✅ | Posts real closing entries; **no audit log** for it |

### 2.3 Expenses, Vouchers & Salary Advances

| Page | Route | Verdict | GL | Key finding |
|---|---|---|---|---|
| Vouchers | `/finance/vouchers` | 🟡 ناقص | — | Expand button has no `onClick`; PDF export unreachable |
| Voucher create | `/finance/vouchers/create` | 🟡 ناقص | ✅ | No `createAuditLog`; attachments dropped |
| Voucher detail | `/finance/vouchers/:id` | ❌ مكسور | — | **Approve hits `ref LIKE 'VOUCHER%'`; real vouchers are `RV-/PV-`** |
| Expenses | `/finance/expenses` | ✅ شغّال | — | — |
| Expense create | `/finance/expenses/create` | 🟡 ناقص | ✅ | No `createAuditLog`; attachments dropped |
| Expense detail | `/finance/expenses/:id` | 🟡 ناقص | ✅ | Edit button → unregistered `/expenses/:id/edit` route |
| Salary advances | `/finance/salary-advances` | ❌ مكسور | ✅ | **List hardcodes status `'active'`** — approval buttons never show |
| Salary advance detail | `/finance/salary-advances/:id` | ❌ مكسور | ❌ | Reject leaves GL un-reversed; key fields not returned |

### 2.4 Invoices, Tax & ZATCA

| Page | Route | Verdict | GL | Key finding |
|---|---|---|---|---|
| Invoices | `/finance/invoices` | 🟡 ناقص | — | `pending_approval` rows show an approve button that always errors |
| Invoice create | `/finance/invoices/create` | 🟡 ناقص | — | Dead `resolveAccountCode` calls; attachments dropped |
| Invoice detail | `/finance/invoices/:id` | ❌ مكسور | ❌ | **UI approve (PATCH) posts NO GL**; send/post steps have no button |
| Tax system | `/finance/tax` | 🟡 ناقص | — | `inputVat` hardcoded to account `1400`; declarations `inputVat`=0 |
| ZATCA settings | `settings → zatca` | ❌ مكسور | — | **`enabled` sent as string → never persists `true`** |

### 2.5 Purchasing

| Page | Route | Verdict | GL | Key finding |
|---|---|---|---|---|
| Purchase orders | `/finance/purchase-orders` | 🟡 ناقص | — | Bulk approve/reject silently 400s (`purchase-order` not in tableMap) |
| PO create | `/finance/purchase-orders/create` | 🟡 ناقص | — | Creates a PR not a PO; `copyFrom` drops all line items |
| PO detail | `/finance/purchase-orders/:id` | 🟡 ناقص | ❌ | GRN / 3-way-match / payment steps **unreachable from UI** |

### 2.6 Vendors & AR/AP

| Page | Route | Verdict | GL | Key finding |
|---|---|---|---|---|
| Vendors | `/finance/vendors` | 🟡 ناقص | — | "Active" KPI always equals total (fake metric) |
| Vendor create | `/finance/vendors/create` | 🟡 ناقص | — | Attachments dropped |
| Vendor detail | `/finance/vendors/:id` | ❌ مكسور | — | Invoices + payments tabs **permanently empty** (`vendorId` ignored) |
| Receivables | `/finance/receivables` | 🟡 ناقص | — | KPI cards always 0 (`summary` not in API response) |
| Receivable detail | `/finance/receivables/:id` | 🟡 ناقص | — | Dead edit button; payment history always empty |
| Payments | `/finance/payments` | 🟡 ناقص | — | KPI cards always 0; `/payables` API has no UI |
| Commitments | `/finance/commitments` | 🟡 ناقص | — | KPI cards always 0 |
| Commitment detail | `/finance/commitments/:id` | 🟡 ناقص | — | Dead edit button; progress fields absent from PO schema |
| Financial requests | `/finance/financial-requests` | ❌ مكسور | — | 3/6 columns always blank; column/schema mismatch |
| Financial request detail | `/finance/financial-requests/:id` | ❌ مكسور | — | **Approve targets wrong table** (`workflow_instances` vs `workflow_requests`) |

### 2.7 Budget, Custodies, Cost Centers & Reports

| Page | Route | Verdict | GL | Key finding |
|---|---|---|---|---|
| Budget | `/finance/budget` | 🟡 ناقص | — | No server-side period filter; approval-requests API has no UI |
| Budget create | `/finance/budget/create` | ✅ شغّال | — | — |
| Budget detail | `/finance/budget/:id` | 🟡 ناقص | — | Approve path crosses into vendors router; status may be null |
| Financial reports | `/finance/reports` | ❌ مكسور | — | **CashFlow tab reads `inflows/outflows`; API returns `sections.*`** |
| Custodies | `/finance/custodies` | ✅ شغّال | ✅ | Works; `POST /custodies/:id/settle` orphaned |
| Custody aging report | `/finance/custodies/report` | 🟡 ناقص | — | No date filter, no export |
| Custody detail | `/finance/custodies/:id` | 🟡 ناقص | — | No settle/approve action from detail page |
| Recurring journals | `/finance/recurring-journals` | ✅ شغّال | ✅ | `run-now` posts a real journal entry |
| Recurring journal create | `/finance/recurring-journals/create` | ✅ شغّال | — | — |
| Recurring journal detail | `/finance/recurring-journals/:id` | 🟡 ناقص | — | Run-history `runDate` always `—` (field is `createdAt`) |

### 2.8 Bank-rec, FX, Fixed Assets, Treasury

| Page | Route | Verdict | GL | Key finding |
|---|---|---|---|---|
| AR aging | `/finance/ar-aging` | ✅ شغّال | — | — |
| AP aging | `/finance/ap-aging` | 🟡 ناقص | — | **`paidAmount` hardcoded 0 — payables overstated** |
| Bank reconciliation | `/finance/bank-reconciliation` | ❌ مكسور | ❌ | No GL entry on match confirmation |
| Bank manual match | `/finance/bank-reconciliation/manual-match/...` | ❌ مكسور | ❌ | **100% broken** — wrong POST field name + wrong id type |
| Fixed assets | `/finance/fixed-assets` | ✅ شغّال | ✅ | Depreciation posts GL correctly |
| Batch depreciate | `/finance/fixed-assets/batch-depreciate` | ✅ شغّال | ✅ | — |
| Fixed asset detail | `/finance/fixed-assets/:id` | ❌ مكسور | — | Edit button → list; depreciation schedule never rendered |
| Inventory costing | `/finance/inventory-costing` | 🟡 ناقص | — | `rounding-differences/apply` has no UI |
| Treasury | `/finance/treasury` | ✅ شغّال | — | — |

### 2.9 Bank Guarantees, Intercompany, Project Costing, Cashflow

| Page | Route | Verdict | GL | Key finding |
|---|---|---|---|---|
| Bank guarantees | `/finance/bank-guarantees` | 🟡 ناقص | ❌ | No GL contingent-liability entry; no `requireGuards` |
| Intercompany | `/finance/intercompany` | 🟡 ناقص | ✅ | Posts both legs' GL; no void/cancel path |
| Intercompany consolidation | `/finance/intercompany/consolidation/create` | 🟡 ناقص | — | Mislabeled "create" — read-only report; dead hook imports |
| Cash-flow forecast | `/finance/cash-flow-forecast` | 🟡 ناقص | — | 60/90-day outflow reuses the 30-day figure |
| Project costing | `/finance/project-costing` | ❌ مكسور | ❌ | **`POST /finance/projects/:id/costs` does not exist** — add-cost 404s |
| Project costing detail | `/finance/project-costing/:id` | 🟡 ناقص | — | Read-only; `spentAmount` may diverge from live journal cost |
| Cashflow dashboard | `/finance/cashflow` | 🟡 ناقص | — | `?period=` param ignored server-side — selector inert |

---

## 3. Critical gaps

Money-correctness, data-integrity and security defects. Each verified against
source; the top four were independently re-confirmed by direct read.

### C1 — Invoice approval through the UI posts NO general-ledger entry ✅verified
The UI's `ApprovalActions` hardcodes `approveMethod="PATCH"`
(`invoice-detail.tsx:449`, `invoices.tsx`). `PATCH /invoices/:id/approve`
(`finance-invoices.ts:1073`) delegates to `invoiceApprovalAction`, which only
runs `applyTransition` (status → `approved`) and inserts an `approval_actions`
row — **no `postJournalEntry` call**. The GL-posting handler is
`POST /invoices/:id/approve` (`finance-invoices.ts:570-633`, posts DR AR /
CR Revenue / CR VAT) — and it has **no caller anywhere in the frontend**.
Consequence: every invoice approved in the product has no journal entry; the
ledger never recognises revenue or AR; a later payment posts `DR Cash / CR AR`
against an AR that was never debited (AR goes negative); and the delete-handler's
GL reversal (`if (je) …`) silently no-ops because `JE-<ref>` never existed.
**This is the single most damaging finding in the module.**

### C2 — `PATCH /invoices/:id/approve` bypasses the approval-amount limit ✅verified
`POST /approve` carries `authorize({action:"approve", amount:{from:"resource",
field:"total"}})` which enforces `rbac_approval_limits.max_amount`. The PATCH
variant the UI actually uses carries only `authorize({action:"update"})` —
**no amount check** (`finance-invoices.ts:1073`). Any user with `finance:update`
can approve an invoice of any amount.

### C3 — Manual journals post their GL at draft creation; rejection never reverses it ✅verified
`POST /journal-manual` calls `financialEngine.postJournalEntry` at creation time
with `headerMeta:{approvalStatus:"draft"}` (`finance-hardening.ts:345-361`) —
`journal_entries` + `journal_lines` are written immediately. The `/post` step
(`finance-hardening.ts:616`) only flips `approvalStatus`/`status`; the
`/review` rejection path runs `applyTransition` with **no `reverseAccountBalances`
call**. A manual journal that is created and then rejected leaves real ledger
lines on the books permanently.

### C4 — Voucher approval is impossible ✅verified
`PATCH /vouchers/:id/approve` filters `extraWhere: ref LIKE 'VOUCHER%'`
(`finance-vendors.ts:655`). Vouchers created by `POST /vouchers` get refs
`RV-<token>` / `PV-<token>` (`finance-journal.ts:771-773`). The approve query
never matches a real voucher → every approve/reject/return on a voucher fails.

### C5 — 3-way-match accounting chain is structurally broken
`match-invoice` (`finance-purchase.ts:1408`) posts **no GL clearing entry** —
the GRN booked `DR Inventory / CR GRNI-2115`, but matching the supplier invoice
never does `DR GRNI / CR AP`. Payment-run then posts `DR AP / CR Cash` against
an AP that was never credited. GRNI is never cleared; AP is understated.

### C6 — PO state transitions violate the DB CHECK constraint
`invoice_mismatch` and `payment_scheduled` are not in `chk_purchase_orders_status`.
`schedule-payment` commits its GL journal **before** `applyTransition`
(`finance-purchase.ts:1550` then `:1567`); when the transition then fails the
constraint, the journal entry is already in the ledger with no matching PO —
an orphan GL row. `payment-run` has the same GL-before-status ordering.

### C7 — Bank manual-match is 100% non-functional
Frontend POSTs `{bankLineId, journalLineId}`; backend schema expects
`{bankStatementId, journalLineId}` (`finance-algorithms.ts:49`). `bankStatementId`
coerces to `0`; lookup always returns empty → `NotFoundError` every time.
Compounding it, the JE search returns `journal_entries` rows and passes a
journal-*entry* id where the backend queries `journal_lines` by id.

### C8 — Bank reconciliation posts no GL on confirmation
Auto-match and manual-match only annotate `bank_statements.matchStatus`; no
reconciliation/clearing journal is ever posted (`finance-algorithms.ts:413-594`).

### C9 — Financial-request approval targets the wrong table
`GET /financial-requests/:id` reads `workflow_requests`; the approve handler's
`applyTransition` targets `workflow_instances` by the same id
(`finance-vendors.ts:675`) — independent tables / sequences. Approve produces a
`NotFoundError` or mutates an unrelated record.

### C10 — `finance-hardening` router bypasses the `financial` system guard
`financeHardeningRouter` is mounted **without `requireGuards("financial")`**
(`index.ts:306`) — unlike every other write-bearing finance router. Manual
journals, bank guarantees, intercompany and projects all skip the financial
capability/health gate. (`finance-algorithms.ts` and `finance-reports.ts` are
also un-guarded — acceptable for the read-only reports, not for hardening.)

### C11 — Financial-reports CashFlow tab renders empty
`reports.tsx:554-555` reads `data?.inflows` / `data?.outflows`; the API returns
`{sections:{operating,investing,financing}, openingCash, closingCash}`
(`finance-reports.ts:327`). The two CashFlow tables are always empty.

### C12 — AP aging overstates every payable
`paidAmount` is hardcoded `0::numeric` in all three UNION branches
(`finance-algorithms.ts:225,245,266`) — no join to payments. Every payable
shows 100% outstanding.

### C13 — Salary-advance list hides its own workflow
`GET /salary-advances` projects `'active' AS status` (`finance-journal.ts:867`)
instead of `je.status`. The list's `ApprovalActions` (`pendingStatuses:["pending"]`)
therefore never renders — advances cannot be approved from the list, and status
KPIs are wrong. Reject also posts no GL reversal.

### C14 — ZATCA cannot be enabled
`zatca-settings-tab.tsx:72` sends `enabled` as the string `"true"`/`"false"`;
the Zod schema is `z.boolean()` with no coercion → the toggle never persists
`true`. `POST /zatca/invoice/:id/submit` checks `if(!settings?.enabled)` and
blocks all submissions. E-invoicing is effectively off.

### C15 — Dead shadowed routes / missing route
`finance-accounts.ts` declares `GET`/`POST /journal` (`:328,:348`) and `/stats`
(`:485`) — `journalRouter` is mounted earlier (`index.ts:293` vs `:303`) so the
accounts `/journal` handlers are **dead code**; `accountsRouter` is mounted
before `vendorsRouter` so `finance-vendors.ts:253 GET /stats` is also dead. The
`journal.tsx` row-click navigates to `/finance/journal/:id` which is **not
registered** in `financeRoutes.tsx` — a guaranteed dead navigation.

---

## 4. Medium gaps

1. **Four list pages show all-zero KPI cards** — receivables, payments,
   commitments, financial-requests expect a `summary` object the API never
   returns (`finance-vendors.ts:313,448,478,541`).
2. **`FileDropZone` is decorative on 5+ create pages** — journal, expenses,
   vouchers, invoices, vendors, purchase-orders create pages collect attachments
   into state that is never POSTed; no attachment endpoint exists for them.
3. **Dead "Edit" buttons** — voucher-detail, expense-detail, receivable-detail,
   commitment-detail, financial-request-detail and fixed-asset-detail all carry
   an Edit button that navigates to an unregistered route or back to the list.
4. **Cash-flow forecast** reuses the 30-day outflow for the 60- and 90-day
   projections (`finance-hardening.ts:1332`).
5. **Cashflow dashboard `?period=` ignored** — `/finance/summary` exists
   (`finance-accounts.ts:500`) and returns the right keys, but ignores the
   `period` query param, so the month/quarter/year selector is inert. *(Note:
   this corrects an over-statement during verification — the page is `ناقص`,
   not broken; revenue/expense KPIs do render real all-time figures.)*
6. **No `createAuditLog`** on: expense create, voucher create, salary-advance
   create, opening-balance create, year-end close, invoice payment, ZATCA submit.
7. **Missing `GET /:id` endpoints** — accounts and budget detail pages re-fetch
   the entire list and filter client-side.
8. **Branch scope missing** on `GET /salary-advances`, `GET /journal-manual`,
   `GET /finance/ledger/:code`, `GET /payments` — branch-restricted users see
   company-wide rows.
9. **Unguarded action buttons** — chart-of-accounts tree/flat edit & delete
   buttons render without `GuardedButton` (server still enforces).
10. **Two fiscal-period systems** — `/fiscal-periods` (heuristic, read-only) vs
    `/fiscal-periods-v2` (real `financial_periods` CRUD); the page uses the
    heuristic one and shows a cosmetic "closed" label; no UI closes a period.
11. **`convert` vs `convert-to-po`** duplicate PR→PO endpoints; the newer one
    does not copy line items.
12. **PO `pending_approval` blind spot** — the PO detail page only shows
    approval actions for `status==="pending"`, not `pending_approval`.
13. **Ledger date filter** uses `je.createdAt` (insertion time) not the
    accounting `date` column.
14. **Recurring-journal detail** run history `runDate` field is misnamed
    (API returns `createdAt`).
15. **Custody RBAC** references `resource:{table:"custodies"}` but custody data
    lives in `journal_entries` — resource ownership check may silently skip.
16. **Two redundant Copy buttons** on each invoice list row with different
    payloads.

---

## 5. UI-only / API-only mismatches

### 5.1 Whole subsystems built in the API with NO user interface
| Subsystem | Endpoints | File |
|---|---|---|
| **FX rates & revaluation** | `/fx/rates`, `/fx/revaluation/preview\|post\|list` | `finance-algorithms.ts:1391-1786` |
| **Dunning** | `/dunning/preview\|send\|history` | `finance-invoices.ts:1879-2053` |
| **Bad debt** | `/bad-debt/preview\|post` | `finance-invoices.ts:1404-1503` |
| **Customer advances** | `/customer-advances` (+`/apply`, list) | `finance-invoices.ts:1579-1862` |
| **Credit / debit memos** | `/invoices/:id/credit-memo\|debit-memo\|memos` | `finance-invoices.ts:1107-1403` |
| **Payment run** | `/payment-run/pending\|execute`, `/payment-run` | `finance-purchase.ts:984-1211` |
| **GRN / 3-way match** | `/receive`, `/receipts`, `/match`, `/match-invoice`, `/vendor-confirm`, `/schedule-payment`, `/pending-grn` | `finance-purchase.ts` |
| **Vendor contracts** | full CRUD `/finance/contracts` | `finance-vendor-contracts.ts` (router live, zero UI) |
| **Journal templates** & **subsidiary accounts** | full CRUD | `accounting-engine.ts:287-557` |
| **Budget approval queue** | `/budget/approval-requests` (+`/decide`) | `finance-budget.ts:403-558` |
| **Cost centers** | full CRUD | `finance-cost-centers.ts` (used only as a dropdown) |
| **Fiscal periods v2** | `/fiscal-periods-v2` create/close/reopen | `finance-hardening.ts` |
| **Rounding** | `/rounding-account`, `/rounding-differences/apply` | `finance-algorithms.ts` |
| Customer / vendor / subsidiary statements | `/reports/customer-statement`, `/vendor-statement`, `/subsidiary-ledger` | `finance-reports.ts` |
| `/finance/payables`, `/finance/custodies/summary`, `/budget-vs-actual`, `/budget/variance`, fixed-asset `/schedule`, `/journal-lines/search` | various | various |

### 5.2 UI calls that hit nothing / the wrong thing
| Page | Calls | Problem |
|---|---|---|
| project-costing | `POST /finance/projects/:id/costs` | Endpoint does not exist on the finance router |
| purchase-orders (bulk) | `POST /entity-meta/bulk-action` `purchase-order` | `purchase-order` absent from `tableMap` → always 400 |
| vendor-detail | `GET /invoices?vendorId=`, `/payments?vendorId=` | `vendorId` param ignored server-side → tabs always empty |
| journal (row click) | `/finance/journal/:id` | No route registered |
| voucher / expense / receivable / commitment detail | `/.../:id/edit` | No such route |

### 5.3 Dead (shadowed) backend routes
`finance-accounts.ts` `GET`/`POST /journal` and `finance-vendors.ts` `GET /stats`
are shadowed by earlier-mounted routers (see C15).

---

## 6. Needs runtime validation

Items that static analysis flags but only a running instance can confirm:

1. **DB sequences** — `invoice_number_seq`, `journal_number_seq`, `pr_number_seq`,
   `po_number_seq` are used via `nextval()` with random fallbacks; confirm they
   exist (missing → silent non-sequential refs).
2. **DB CHECK constraint** on `purchase_orders.status` — confirm whether
   `invoice_mismatch` / `payment_scheduled` are accepted (C6).
3. **`payment_runs` table** — created lazily via `CREATE TABLE IF NOT EXISTS`
   inside the handler rather than a migration.
4. **`accounting_mappings` seeding** — confirm GRN/AP/GRNI/VAT mappings exist
   per company (only backfilled at migration time, not for new tenants).
5. **ZATCA `enabled` Zod behaviour** — confirm whether the string→boolean
   mismatch throws or silently defaults to `false` (C14).
6. **Branch-scope behaviour** of `buildScopedWhere` with `enforceBranchScope`
   for unrestricted (company-wide) users.
7. **FX lazy DDL** — `fx_rates` / `fx_revaluations` and the lazy
   `ALTER TABLE invoices ADD COLUMN currency` only run when an FX endpoint is
   hit; with no FX UI they may never be created.
8. **`financial_periods` emptiness** vs year-end-close 12-month validation.
9. Whether 404s from `/finance/projects/:id/costs` surface as a visible error
   or a silent failure to the user.

---

## 7. Recommended PR ordering (for the later fix pass — no PR opened here)

Ordered by money-correctness risk, then by blast radius. Each is independently
shippable.

| # | PR | Addresses | Risk if unfixed |
|---|---|---|---|
| 1 | **Invoice GL on approval** — route the UI to `POST /approve`, or post GL inside the PATCH path | C1, C2 | Ledger never records revenue/AR — fatal |
| 2 | **Manual-journal GL timing** — post GL at `/post`, not at draft; reverse on reject | C3 | Rejected drafts permanently skew balances |
| 3 | **Voucher approval ref fix** — align `extraWhere` with `RV-/PV-` refs | C4 | Vouchers cannot be approved |
| 4 | **Purchasing GL chain** — add GRNI-clearing entry to `match-invoice`; fix PO status CHECK constraint; move GL post after `applyTransition` | C5, C6 | AP understated, orphan GL rows |
| 5 | **Bank reconciliation** — fix manual-match field/id contract; post GL on confirmation | C7, C8 | Reconciliation non-functional |
| 6 | **Salary-advance** — return real `status`; reverse GL on reject | C13 | Workflow invisible; GL skew |
| 7 | **Financial-request approval** — target the correct table; align list/detail columns | C9 | Approval corrupts/aborts |
| 8 | **List `summary` objects + CashFlow report shape** | C11, M1 | KPI cards & cash-flow report blank |
| 9 | **RBAC hardening** — restore `requireGuards("financial")` on `finance-hardening`; add amount-limit to PATCH approve | C2, C10 | Guard + limit bypass |
| 10 | **Route integrity** — remove dead `/journal` & `/stats`; register `/finance/journal/:id`; fix AP-aging `paidAmount`; ZATCA `enabled` coercion | C12, C14, C15 | Dead code, blank pages, ZATCA off |
| 11 | **Dead-UI cleanup** — wire or remove the dead Edit buttons and `FileDropZone`s; fix the PO bulk-action `tableMap` entry | M2, M3 | Misleading UI |
| 12 | **Orphan-subsystem UI** (separate feature track) — FX, dunning, bad-debt, customer-advances, memos, payment-run, GRN, vendor-contracts, budget-approval queue | §5.1 | Large built-but-unreachable surface |

---

## Appendix A — cross-reference with `FINANCE_CERTIFICATION.md`

The earlier file-level certification (2026-05-19) found RBAC fully PASS, Scope
14/16 PARTIAL, Audit/Events many PARTIAL, Lifecycle 5 FAIL. This functional
pass **confirms and sharpens** those signals: the PARTIAL audit/events cells
correspond to the un-audited approve/payment/ZATCA paths in §4.6; the Lifecycle
FAILs correspond to the direct-`UPDATE status` issues that interact with the GL
gaps in C1/C3. The new information here is the **frontend wiring layer** — which
the file-level cert could not see — and that is where the most severe defects
(C1, C4, C7, C9) actually live.

## Appendix B — verification notes

Four headline claims were re-verified by direct source read after the agent
pass: C1 (invoice PATCH approve has no `postJournalEntry` — confirmed,
`finance-invoices.ts:996-1075`), C3 (manual journal posts GL at draft —
confirmed, `finance-hardening.ts:345`), C4 (voucher ref mismatch — confirmed,
`finance-vendors.ts:655` vs `finance-journal.ts:771`), and the
`/finance/summary` question (endpoint **exists** at `finance-accounts.ts:500`;
the cashflow-dashboard defect is the ignored `period` param, downgraded from
"broken" to "incomplete" — see M5).
