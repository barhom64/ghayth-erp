# ثغرات النمذجة — Modeling Gaps

إجمالي: **15**

## `/finance/bank-reconciliation` — 2

- _medium_ **missing-audit** — artifacts/api-server/src/routes/finance-algorithms.ts:347 POST /finance/bank-reconciliation/import
- _medium_ **missing-audit** — artifacts/api-server/src/routes/finance-algorithms.ts:389 POST /finance/bank-reconciliation/auto-match

## `journal_lines` — 2

- _high_ **modeling-no-tenant** — lib/db/src/schema/index.ts: table journal_lines has no tenant column
- _medium_ **modeling-no-createdAt** — lib/db/src/schema/index.ts: table journal_lines has no createdAt

## `approval_chain_steps` — 2

- _high_ **modeling-no-tenant** — lib/db/src/schema/index.ts: table approval_chain_steps has no tenant column
- _medium_ **modeling-no-createdAt** — lib/db/src/schema/index.ts: table approval_chain_steps has no createdAt

## `/finance/bank-reconciliation/manual-match/:batchId/:rowId` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/finance-algorithms.ts:496 POST /finance/bank-reconciliation/manual-match

## `/finance/fixed-assets` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/finance-algorithms.ts:889 POST /finance/fixed-assets/depreciate-all

## `/finance/fixed-assets/batch-depreciate` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/finance-algorithms.ts:889 POST /finance/fixed-assets/depreciate-all

## `/finance/inventory-costing` — 1

- _medium_ **missing-audit** — artifacts/api-server/src/routes/finance-algorithms.ts:1071 POST /finance/rounding-account/setup

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
