# ثغرات النمذجة — Modeling Gaps

إجمالي: **30**

## `/dashboard` — 4

- _medium_ **missing-audit** — artifacts/api-server/src/routes/hr.ts:421 POST /hr/check-in
- _medium_ **missing-audit** — artifacts/api-server/src/routes/hr.ts:789 POST /hr/check-out
- _medium_ **missing-audit** — artifacts/api-server/src/routes/hr.ts:421 POST /hr/check-in
- _medium_ **missing-audit** — artifacts/api-server/src/routes/hr.ts:789 POST /hr/check-out

## `/finance/bank-reconciliation` — 2

- _medium_ **missing-audit** — artifacts/api-server/src/routes/finance-algorithms.ts:347 POST /finance/bank-reconciliation/import
- _medium_ **missing-audit** — artifacts/api-server/src/routes/finance-algorithms.ts:389 POST /finance/bank-reconciliation/auto-match

## `/hr/attendance/create` — 2

- _medium_ **missing-audit** — artifacts/api-server/src/routes/hr.ts:421 POST /hr/check-in
- _medium_ **missing-audit** — artifacts/api-server/src/routes/hr.ts:789 POST /hr/check-out

## `journal_lines` — 2

- _high_ **modeling-no-tenant** — lib/db/src/schema/index.ts: table journal_lines has no tenant column
- _medium_ **modeling-no-createdAt** — lib/db/src/schema/index.ts: table journal_lines has no createdAt

## `approval_chain_steps` — 2

- _high_ **modeling-no-tenant** — lib/db/src/schema/index.ts: table approval_chain_steps has no tenant column
- _medium_ **modeling-no-createdAt** — lib/db/src/schema/index.ts: table approval_chain_steps has no createdAt

## `/finance/vouchers/create` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/finance-journal.ts:688 POST /finance/vouchers

## `/finance/expenses/create` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/finance-journal.ts:366 POST /finance/expenses

## `/finance/purchase-orders/create` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/finance-purchase.ts:251 POST /finance/purchase-requests

## `/finance/bank-reconciliation/manual-match/:batchId/:rowId` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/finance-algorithms.ts:496 POST /finance/bank-reconciliation/manual-match

## `/finance/fixed-assets` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/finance-algorithms.ts:889 POST /finance/fixed-assets/depreciate-all

## `/finance/fixed-assets/batch-depreciate` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/finance-algorithms.ts:889 POST /finance/fixed-assets/depreciate-all

## `/finance/inventory-costing` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/finance-algorithms.ts:1071 POST /finance/rounding-account/setup

## `/fleet/trips/create` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/fleet.ts:903 POST /fleet/trips

## `/employees/create` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/employees.ts:263 POST /employees

## `/hr/leaves/create` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/hr.ts:1321 POST /hr/leave-requests

## `/hr/payroll/create` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/hr.ts:2384 POST /hr/payroll

## `/hr/evaluation-360/create` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/hr.ts:5094 POST /hr/evaluation-cycles

## `/warehouse/movements/create` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/warehouse.ts:583 POST /warehouse/movements

## `/reports/scheduled` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/scheduled-reports.ts:82 POST /scheduled-reports

## `companies` — 1

- _high_ **modeling-no-tenant** — lib/db/src/schema/index.ts: table companies has no tenant column

## `employees` — 1

- _high_ **modeling-no-tenant** — lib/db/src/schema/index.ts: table employees has no tenant column

## `hr_leave_balances` — 1

- _medium_ **modeling-no-createdAt** — lib/db/src/schema/index.ts: table hr_leave_balances has no createdAt

## `payroll_lines` — 1

- _medium_ **modeling-no-createdAt** — lib/db/src/schema/index.ts: table payroll_lines has no createdAt
