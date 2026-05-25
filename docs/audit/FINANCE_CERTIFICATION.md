# Finance Module Static Certification

Generated: 2026-05-25

> **Read-only.** Regenerate with
> `node audit/system-review/tooling/finance-cert.mjs`. Each cell
> here is one of `PASS` / `PARTIAL` / `FAIL` / `SKIP`;
> non-PASS cells should turn into an issue or a small PR.

## Scope

Files audited: **16** under `artifacts/api-server/src/routes/finance-*.ts`.
Endpoints: **262** total, **134** writes.

## Dimensions evaluated

| # | Dimension | Static check |
|---|---|---|
| 1 | RBAC          | every handler is wrapped by `authorize({ feature, action })` |
| 2 | Scope         | list endpoints use `parseScopeFilters` + `buildScopedWhere` ; detail/write reference `scope.companyId` |
| 3 | Audit         | every write endpoint calls `createAuditLog` (or routes via `applyTransition` which emits audit internally) |
| 4 | Events        | every write endpoint calls `emitEvent` / `safeEmitEvent` (or via `applyTransition`) |
| 5 | Lifecycle     | status-flipping endpoints route through `applyTransition` rather than raw `UPDATE … SET status = …` |
| 6 | GL bridge     | financial write endpoints in GL-relevant files reference a journal posting helper (`postJournalEntry`, `finance-gl-helpers`, `finance-algorithms`) |

Out of scope (Phase 5): concurrency / locking correctness, large-dataset performance, real GL posting end-to-end, multi-tenant runtime isolation.

## Per-file matrix

| File | Endpoints | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---|---:|---|---|---|---|---|---|
| `finance-accounts.ts` | 26 (13w) | ✅ PASS | 🟡 PARTIAL | ✅ PASS | 🟡 PARTIAL | — SKIP | ✅ PASS |
| `finance-algorithms.ts` | 27 (11w) | ✅ PASS | 🟡 PARTIAL | ✅ PASS | 🟡 PARTIAL | ❌ FAIL | ✅ PASS |
| `finance-budget.ts` | 13 (7w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | — SKIP | — SKIP |
| `finance-collection.ts` | 3 (1w) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| `finance-cost-centers.ts` | 5 (3w) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP |
| `finance-custodies.ts` | 8 (4w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | ❌ FAIL | ✅ PASS |
| `finance-gl-helpers.ts` | 10 (5w) | ✅ PASS | 🟡 PARTIAL | ✅ PASS | ✅ PASS | — SKIP | — SKIP |
| `finance-hardening.ts` | 29 (17w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | — SKIP | ✅ PASS |
| `finance-invoices.ts` | 29 (20w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL |
| `finance-journal.ts` | 25 (17w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | ❌ FAIL | 🟡 PARTIAL |
| `finance-purchase.ts` | 23 (15w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | ✅ PASS | 🟡 PARTIAL |
| `finance-recurring.ts` | 6 (4w) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | — SKIP |
| `finance-reports.ts` | 26 (0w) | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| `finance-vendor-contracts.ts` | 5 (3w) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | — SKIP |
| `finance-vendors.ts` | 18 (8w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | — SKIP | ✅ PASS |
| `finance-zatca.ts` | 9 (6w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | ❌ FAIL | ✅ PASS |

## Module-level totals (files)

| Dimension | PASS | PARTIAL | FAIL | SKIP |
|---|---:|---:|---:|---:|
| RBAC | 16 | 0 | 0 | 0 |
| Scope | 4 | 12 | 0 | 0 |
| Audit | 7 | 8 | 0 | 1 |
| Events | 5 | 10 | 0 | 1 |
| Lifecycle | 2 | 1 | 5 | 8 |
| GL bridge | 6 | 4 | 0 | 6 |

## Cross-reference: workflow-audit findings on Finance files

From `audit/system-review/tooling/_workflow-audit.json`:

- **Direct `UPDATE … SET "status" = …` bypassing `applyTransition`**: **18** hits across Finance files (see #664). Breakdown:
  - `finance-invoices.ts` — 8
  - `finance-journal.ts` — 3
  - `finance-zatca.ts` — 3
  - `finance-algorithms.ts` — 2
  - `finance-cost-centers.ts` — 1
  - `finance-custodies.ts` — 1

- **fromState graph mismatches** on Finance files: **0** hits (after PR #667 closes 1).

## Endpoint-level non-PASS detail

### `finance-accounts.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 592 | `GET /stats` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 607 | `GET /summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 666 | `GET /tax-codes` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 705 | `POST /tax-codes` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | — SKIP |
| 743 | `PATCH /tax-codes/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | — SKIP |
| 792 | `DELETE /tax-codes/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | — SKIP |
| 843 | `GET /wht-categories` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 879 | `POST /wht-categories` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | — SKIP |
| 909 | `PATCH /wht-categories/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | — SKIP |
| 953 | `DELETE /wht-categories/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | — SKIP |
| 1023 | `GET /allocation-rules` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1128 | `PATCH /allocation-rules/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | — SKIP |
| 1191 | `DELETE /allocation-rules/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | — SKIP |
| 1216 | `GET /allocation-results` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |

### `finance-algorithms.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 123 | `GET /ar-aging` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 213 | `GET /ap-aging` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 413 | `POST /bank-reconciliation/auto-match` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS |
| 543 | `POST /bank-reconciliation/manual-match` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS |
| 598 | `GET /journal-lines/search` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 632 | `GET /bank-reconciliation` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 660 | `GET /fixed-assets` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 673 | `POST /fixed-assets` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | ✅ PASS |
| 751 | `PATCH /fixed-assets/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | ✅ PASS |
| 852 | `GET /fixed-assets/:id/schedule` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 927 | `POST /fixed-assets/:id/depreciate` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | ✅ PASS |
| 1152 | `GET /inventory-costing` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1248 | `GET /rounding-account` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1310 | `POST /rounding-differences/apply` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | ✅ PASS |
| 1410 | `GET /fx/rates` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1431 | `POST /fx/rates` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | ✅ PASS |
| 1475 | `GET /fx/revaluation/preview` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1601 | `POST /fx/revaluation/post` | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP | ✅ PASS |
| 1802 | `GET /fx/revaluation` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1820 | `GET /treasury` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1926 | `GET /entity-financial-profile` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |

### `finance-budget.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 150 | `GET /budget-vs-actual` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 240 | `POST /budget/validate` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 497 | `GET /budget/approval-requests` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 517 | `POST /budget/approval-requests/:id/decide` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 589 | `GET /budget/variance` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 690 | `GET /fiscal-periods` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 739 | `POST /fiscal-periods/:period/close` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |

### `finance-collection.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 125 | `POST /collection/:invoiceId/action` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |

### `finance-cost-centers.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 174 | `DELETE /cost-centers/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP |

### `finance-custodies.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 176 | `GET /custodies` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 273 | `GET /custodies/report` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 372 | `GET /custodies/summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 519 | `POST /custodies` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS |
| 951 | `PATCH /custodies/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |

### `finance-gl-helpers.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 101 | `GET /gl-helpers/mudad-salary/pending` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 138 | `GET /gl-helpers/fx-revaluation/pending` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 175 | `GET /gl-helpers/cycle-count/pending` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 218 | `GET /gl-helpers/realized-fx/history` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 255 | `GET /gl-helpers/lot-writeoff/pending` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |

### `finance-hardening.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 151 | `GET /fiscal-periods-v2` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 208 | `POST /fiscal-periods-v2/:id/close` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 282 | `POST /fiscal-periods-v2/:id/reopen` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 339 | `POST /fiscal-periods-v2/:id/lock` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 583 | `GET /journal-manual` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 650 | `PATCH /journal-manual/:id/submit` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 687 | `PATCH /journal-manual/:id/review` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 751 | `PATCH /journal-manual/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 803 | `PATCH /journal-manual/:id/post` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 890 | `GET /bank-guarantees` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1079 | `POST /bank-guarantees/:id/cancel` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 1126 | `POST /bank-guarantees/:id/release` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 1175 | `GET /intercompany` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1358 | `GET /intercompany/consolidation` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1409 | `GET /projects` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1489 | `GET /projects/:id/costs` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1526 | `GET /cash-flow-forecast` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1610 | `GET /cost-center-report` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1655 | `GET /posting-failures` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1671 | `PATCH /posting-failures/:id/resolve` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | — SKIP | — SKIP |

### `finance-invoices.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 223 | `POST /invoices/impact-preview` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 371 | `POST /invoices` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 755 | `POST /invoices/:id/send` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 1267 | `POST /invoices/:id/preview-posting` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 1675 | `POST /invoices/:id/payment` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | ❌ FAIL | ✅ PASS |
| 1817 | `PATCH /invoices/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 2167 | `PATCH /invoices/:id/approve` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 2168 | `PATCH /invoices/:id/reject` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 2169 | `PATCH /invoices/:id/return` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 2171 | `GET /tax/summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2273 | `POST /invoices/:id/credit-memo/preview` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 2398 | `POST /invoices/:id/credit-memo` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | ❌ FAIL | ✅ PASS |
| 2676 | `POST /invoices/:id/debit-memo/preview` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 2753 | `POST /invoices/:id/debit-memo` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | — SKIP | ✅ PASS |
| 2922 | `GET /invoices/:id/memos` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2957 | `GET /bad-debt/preview` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3009 | `POST /bad-debt/post` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | — SKIP | ✅ PASS |
| 3132 | `POST /customer-advances` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 3233 | `POST /customer-advances/:id/apply` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | ✅ PASS |
| 3327 | `GET /customer-advances` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3432 | `GET /dunning/preview` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3510 | `POST /dunning/send` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 3582 | `GET /dunning/history` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 3608 | `GET /tax/declarations` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |

### `finance-journal.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 276 | `POST /expenses/impact-preview` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 382 | `POST /expenses` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | ❌ FAIL | ✅ PASS |
| 569 | `PATCH /expenses/:id` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 597 | `DELETE /expenses/:id` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | ✅ PASS |
| 658 | `PATCH /expenses/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 807 | `POST /vouchers` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | — SKIP | ✅ PASS |
| 1110 | `PATCH /vouchers/:id` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 1171 | `DELETE /vouchers/:id` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | ✅ PASS |
| 1184 | `GET /salary-advances` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1214 | `POST /salary-advances` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | ✅ PASS |
| 1292 | `PATCH /salary-advances/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 1603 | `POST /journal/:id/reverse` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS |
| 1891 | `POST /fiscal-periods/:period/year-end-close` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | ❌ FAIL | ✅ PASS |
| 2172 | `POST /opening-balances` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 2188 | `POST /opening-balances/import-csv` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |

### `finance-purchase.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 153 | `POST /purchase-requests/impact-preview` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 284 | `POST /purchase-requests` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 435 | `PATCH /purchase-requests/:id/submit` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 460 | `PATCH /purchase-requests/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 518 | `POST /purchase-requests/:id/convert` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 664 | `POST /purchase-orders` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 805 | `PATCH /purchase-orders/:id/approve` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 806 | `PATCH /purchase-orders/:id/reject` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 807 | `PATCH /purchase-orders/:id/return` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 1327 | `GET /purchase-orders/:id/receipts` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1356 | `GET /purchase-orders/:id/match` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1411 | `GET /payment-run/pending` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1711 | `GET /payment-run` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1733 | `POST /purchase-requests/:id/convert-to-po` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 1839 | `GET /purchase-orders/pending-grn` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1888 | `PATCH /purchase-orders/:id/vendor-confirm` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |

### `finance-reports.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 81 | `GET /reports/trial-balance` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 126 | `GET /reports/income-statement` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 145 | `GET /reports/balance-sheet` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 243 | `GET /reports/cash-flow` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 873 | `GET /reports/entity-statement` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 953 | `GET /reports/custody-advances` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1012 | `GET /reports/expenses-analysis` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1058 | `GET /reports/revenue-analysis` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1103 | `GET /reports/budget-variance` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1147 | `GET /reports/cash-bank-statement` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1365 | `GET /reports/revenue-by-activity-type` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1396 | `GET /reports/expenses-by-cost-center` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1435 | `GET /reports/unmapped-lines` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1519 | `GET /reports/wht-summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1712 | `GET /reports/inventory-turnover` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1902 | `GET /reports/inventory-valuation` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2112 | `GET /reports/cogs-summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2346 | `GET /reports/negative-stock` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |

### `finance-vendors.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 293 | `GET /receivables` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 338 | `GET /payables` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 462 | `GET /payments` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 494 | `GET /commitments` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 563 | `GET /financial-requests` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 600 | `GET /vendors/:id` | ✅ PASS | ❌ FAIL | — SKIP | — SKIP | — SKIP | — SKIP |
| 635 | `PATCH /commitments/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 662 | `PATCH /receivables/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 689 | `PATCH /vouchers/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 728 | `PATCH /financial-requests/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 757 | `PATCH /budgets/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |

### `finance-zatca.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 347 | `GET /zatca/settings` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 467 | `POST /zatca/test-connection` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP |
| 503 | `GET /zatca/invoice/:id/xml` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 591 | `POST /zatca/invoice/:id/submit` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP |
| 722 | `POST /zatca/expense/:id/submit` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | ✅ PASS |
| 802 | `GET /zatca/submissions` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 869 | `PATCH /zatca/invoice/:id` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 900 | `PATCH /zatca/expense/:id` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |

## Reproducing this audit

```bash
node audit/system-review/tooling/finance-cert.mjs
```

Re-running regenerates both this file and
`audit/system-review/tooling/_finance-cert.json`. The script is
read-only — it touches no application code.
