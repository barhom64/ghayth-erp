# Finance Module Static Certification

Generated: 2026-05-19

> **Read-only.** Regenerate with
> `node audit/system-review/tooling/finance-cert.mjs`. Each cell
> here is one of `PASS` / `PARTIAL` / `FAIL` / `SKIP`;
> non-PASS cells should turn into an issue or a small PR.

## Scope

Files audited: **16** under `artifacts/api-server/src/routes/finance-*.ts`.
Endpoints: **229** total, **119** writes.

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
| `finance-accounts.ts` | 10 (4w) | ✅ PASS | 🟡 PARTIAL | ✅ PASS | ✅ PASS | — SKIP | ✅ PASS |
| `finance-algorithms.ts` | 27 (11w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | ❌ FAIL | ✅ PASS |
| `finance-budget.ts` | 13 (7w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | — SKIP | ✅ PASS |
| `finance-collection.ts` | 3 (1w) | ✅ PASS | 🟡 PARTIAL | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| `finance-cost-centers.ts` | 5 (3w) | ✅ PASS | 🟡 PARTIAL | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP |
| `finance-custodies.ts` | 8 (4w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | ❌ FAIL | ✅ PASS |
| `finance-gl-helpers.ts` | 10 (5w) | ✅ PASS | 🟡 PARTIAL | ✅ PASS | ✅ PASS | — SKIP | — SKIP |
| `finance-hardening.ts` | 28 (16w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | — SKIP | ✅ PASS |
| `finance-invoices.ts` | 26 (17w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL |
| `finance-journal.ts` | 23 (15w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | ❌ FAIL | 🟡 PARTIAL |
| `finance-purchase.ts` | 23 (15w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | ✅ PASS | 🟡 PARTIAL |
| `finance-recurring.ts` | 6 (4w) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | — SKIP |
| `finance-reports.ts` | 14 (0w) | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| `finance-vendor-contracts.ts` | 5 (3w) | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | — SKIP |
| `finance-vendors.ts` | 19 (8w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | — SKIP | ✅ PASS |
| `finance-zatca.ts` | 9 (6w) | ✅ PASS | 🟡 PARTIAL | 🟡 PARTIAL | 🟡 PARTIAL | ❌ FAIL | ✅ PASS |

## Module-level totals (files)

| Dimension | PASS | PARTIAL | FAIL | SKIP |
|---|---:|---:|---:|---:|
| RBAC | 16 | 0 | 0 | 0 |
| Scope | 2 | 14 | 0 | 0 |
| Audit | 6 | 9 | 0 | 1 |
| Events | 6 | 9 | 0 | 1 |
| Lifecycle | 2 | 1 | 5 | 8 |
| GL bridge | 7 | 4 | 0 | 5 |

## Cross-reference: workflow-audit findings on Finance files

From `audit/system-review/tooling/_workflow-audit.json`:

- **Direct `UPDATE … SET "status" = …` bypassing `applyTransition`**: **20** hits across Finance files (see #664). Breakdown:
  - `finance-invoices.ts` — 8
  - `finance-journal.ts` — 5
  - `finance-zatca.ts` — 3
  - `finance-algorithms.ts` — 2
  - `finance-cost-centers.ts` — 1
  - `finance-custodies.ts` — 1

- **fromState graph mismatches** on Finance files: **0** hits (after PR #667 closes 1).

## Endpoint-level non-PASS detail

### `finance-accounts.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 485 | `GET /stats` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 500 | `GET /summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |

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
| 673 | `POST /fixed-assets` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 726 | `PATCH /fixed-assets/:id` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 805 | `GET /fixed-assets/:id/schedule` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 880 | `POST /fixed-assets/:id/depreciate` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 960 | `POST /fixed-assets/depreciate-all` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | — SKIP | ✅ PASS |
| 1044 | `GET /inventory-costing` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1140 | `GET /rounding-account` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1153 | `POST /rounding-account/setup` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | — SKIP | — SKIP |
| 1190 | `POST /rounding-differences/apply` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 1276 | `GET /fx/rates` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1297 | `POST /fx/rates` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 1318 | `GET /fx/revaluation/preview` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1444 | `POST /fx/revaluation/post` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 1607 | `GET /fx/revaluation` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1625 | `GET /treasury` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1731 | `GET /entity-financial-profile` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |

### `finance-budget.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 133 | `GET /budget-vs-actual` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 215 | `POST /budget/validate` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 472 | `GET /budget/approval-requests` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 492 | `POST /budget/approval-requests/:id/decide` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 564 | `GET /budget/variance` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 665 | `GET /fiscal-periods` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 703 | `POST /fiscal-periods/:period/close` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |

### `finance-collection.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 125 | `POST /collection/:invoiceId/action` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 219 | `GET /collection/:invoiceId/history` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |

### `finance-cost-centers.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 57 | `GET /cost-centers` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 159 | `DELETE /cost-centers/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | — SKIP |

### `finance-custodies.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 176 | `GET /custodies` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 272 | `GET /custodies/report` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 370 | `GET /custodies/summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 517 | `POST /custodies` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS |
| 932 | `PATCH /custodies/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |

### `finance-gl-helpers.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 96 | `GET /gl-helpers/mudad-salary/pending` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 133 | `GET /gl-helpers/fx-revaluation/pending` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 170 | `GET /gl-helpers/cycle-count/pending` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 213 | `GET /gl-helpers/realized-fx/history` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 250 | `GET /gl-helpers/lot-writeoff/pending` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |

### `finance-hardening.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 132 | `GET /fiscal-periods-v2` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 189 | `POST /fiscal-periods-v2/:id/close` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 259 | `POST /fiscal-periods-v2/:id/reopen` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 396 | `GET /journal-manual` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 463 | `PATCH /journal-manual/:id/submit` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 500 | `PATCH /journal-manual/:id/review` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 564 | `PATCH /journal-manual/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 616 | `PATCH /journal-manual/:id/post` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 666 | `GET /bank-guarantees` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 855 | `POST /bank-guarantees/:id/cancel` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 902 | `POST /bank-guarantees/:id/release` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 951 | `GET /intercompany` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1099 | `GET /intercompany/consolidation` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1150 | `GET /projects` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1227 | `GET /projects/:id/costs` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1264 | `GET /cash-flow-forecast` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1348 | `GET /cost-center-report` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1393 | `GET /posting-failures` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1409 | `PATCH /posting-failures/:id/resolve` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | — SKIP | — SKIP |

### `finance-invoices.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 163 | `POST /invoices/impact-preview` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 307 | `POST /invoices` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 500 | `POST /invoices/:id/send` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 704 | `POST /invoices/:id/payment` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | ❌ FAIL | ✅ PASS |
| 834 | `PATCH /invoices/:id` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | — SKIP | 🟡 PARTIAL |
| 1073 | `PATCH /invoices/:id/approve` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 1074 | `PATCH /invoices/:id/reject` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 1075 | `PATCH /invoices/:id/return` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 1077 | `GET /tax/summary` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1107 | `POST /invoices/:id/credit-memo` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | ❌ FAIL | ✅ PASS |
| 1246 | `POST /invoices/:id/debit-memo` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | — SKIP | ✅ PASS |
| 1369 | `GET /invoices/:id/memos` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1404 | `GET /bad-debt/preview` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1456 | `POST /bad-debt/post` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | — SKIP | ✅ PASS |
| 1579 | `POST /customer-advances` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 1680 | `POST /customer-advances/:id/apply` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | ✅ PASS |
| 1774 | `GET /customer-advances` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1879 | `GET /dunning/preview` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1957 | `POST /dunning/send` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 2029 | `GET /dunning/history` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 2055 | `GET /tax/declarations` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |

### `finance-journal.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 267 | `POST /expenses/impact-preview` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 373 | `POST /expenses` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | ❌ FAIL | ✅ PASS |
| 546 | `PATCH /expenses/:id` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 566 | `DELETE /expenses/:id` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | ✅ PASS |
| 579 | `PATCH /expenses/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 702 | `POST /vouchers` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | — SKIP | ✅ PASS |
| 838 | `PATCH /vouchers/:id` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 851 | `DELETE /vouchers/:id` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | ✅ PASS |
| 864 | `GET /salary-advances` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 894 | `POST /salary-advances` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | ✅ PASS |
| 954 | `PATCH /salary-advances/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 1145 | `POST /journal/:id/reverse` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS |
| 1331 | `POST /fiscal-periods/:period/year-end-close` | ✅ PASS | ✅ PASS | ❌ FAIL | ✅ PASS | ❌ FAIL | ✅ PASS |
| 1592 | `POST /opening-balances` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 1608 | `POST /opening-balances/import-csv` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |

### `finance-purchase.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 123 | `POST /purchase-requests/impact-preview` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 254 | `POST /purchase-requests` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 373 | `PATCH /purchase-requests/:id/submit` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 398 | `PATCH /purchase-requests/:id/approve` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 456 | `POST /purchase-requests/:id/convert` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 570 | `POST /purchase-orders` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 677 | `PATCH /purchase-orders/:id/approve` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 678 | `PATCH /purchase-orders/:id/reject` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 679 | `PATCH /purchase-orders/:id/return` | ✅ PASS | ❌ FAIL | ❌ FAIL | ❌ FAIL | — SKIP | 🟡 PARTIAL |
| 900 | `GET /purchase-orders/:id/receipts` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 929 | `GET /purchase-orders/:id/match` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 984 | `GET /payment-run/pending` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1191 | `GET /payment-run` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1213 | `POST /purchase-requests/:id/convert-to-po` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 1319 | `GET /purchase-orders/pending-grn` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1368 | `PATCH /purchase-orders/:id/vendor-confirm` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |
| 1408 | `POST /purchase-orders/:id/match-invoice` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | 🟡 PARTIAL |

### `finance-reports.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 81 | `GET /reports/trial-balance` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 126 | `GET /reports/income-statement` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 145 | `GET /reports/balance-sheet` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 191 | `GET /reports/cash-flow` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 728 | `GET /reports/entity-statement` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 808 | `GET /reports/custody-advances` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 867 | `GET /reports/expenses-analysis` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 913 | `GET /reports/revenue-analysis` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 958 | `GET /reports/budget-variance` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 1002 | `GET /reports/cash-bank-statement` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |

### `finance-vendors.ts`

| Line | Endpoint | RBAC | Scope | Audit | Events | Lifecycle | GL bridge |
|---:|---|---|---|---|---|---|---|
| 289 | `GET /receivables` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 327 | `GET /payables` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 426 | `GET /payments` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 454 | `GET /commitments` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 519 | `GET /financial-requests` | ✅ PASS | 🟡 PARTIAL | — SKIP | — SKIP | — SKIP | — SKIP |
| 551 | `GET /vendors/:id` | ✅ PASS | ❌ FAIL | — SKIP | — SKIP | — SKIP | — SKIP |
| 586 | `PATCH /commitments/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 613 | `PATCH /receivables/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 640 | `PATCH /vouchers/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | ✅ PASS |
| 667 | `PATCH /financial-requests/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |
| 693 | `PATCH /budgets/:id/approve` | ✅ PASS | ✅ PASS | ❌ FAIL | ❌ FAIL | — SKIP | — SKIP |

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
