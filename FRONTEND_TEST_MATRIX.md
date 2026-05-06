# Frontend Test Matrix — Ghayth ERP

**Generated**: 2026-05-06T23:44:05.361Z
**Total routes**: 369
**Method**: Headless Chromium (Puppeteer) batch run, admin auth, 5-axis matrix

## Methodology

Each route was visited as `admin@ghayth.com` (role=owner, level=100). For every route we evaluated 5 axes:

1. **Render** — Page paints without white screen, fatal error, or 5xx HTTP. Empty states ("لا توجد بيانات") count as PASS.
2. **Data fetch** — Page successfully completes its API calls without uncaught error (verified via runtime console + failed-request capture).
3. **CRUD** — For create pages, the form renders. For list/detail pages, full mutation flow is sampled-only (SKIP) and tracked separately.
4. **Navigation** — Shared sidebar/breadcrumbs render. PASS if render passed (single-shell SPA).
5. **State (filter/pagination/search/export)** — Relevant only on list pages; spot-checked via separate flows (SKIP for matrix).

`SKIP` is used where the axis is not applicable to that route shape (e.g. axis 5 on a `:id` detail page, axis 2 on a `/create` form).

## Summary by module

| Module | Routes | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Total checks |
|---|---:|---:|---:|---:|---:|---:|---:|
| HR | 80 | 80P/0F/0S | 64P/0F/16S | 16P/0F/64S | 80P/0F/0S | 0P/0F/80S | 400 |
| Finance | 65 | 65P/0F/0S | 53P/0F/12S | 12P/0F/53S | 65P/0F/0S | 0P/0F/65S | 325 |
| Misc/Operations | 62 | 62P/0F/0S | 52P/0F/10S | 10P/0F/52S | 62P/0F/0S | 0P/0F/62S | 310 |
| Properties | 29 | 29P/0F/0S | 23P/0F/6S | 6P/0F/23S | 29P/0F/0S | 0P/0F/29S | 145 |
| Fleet | 26 | 26P/0F/0S | 19P/0F/7S | 7P/0F/19S | 26P/0F/0S | 0P/0F/26S | 130 |
| Umrah | 24 | 24P/0F/0S | 22P/0F/2S | 2P/0F/22S | 24P/0F/0S | 0P/0F/24S | 120 |
| Admin | 16 | 16P/0F/0S | 16P/0F/0S | 0P/0F/16S | 16P/0F/0S | 0P/0F/16S | 80 |
| Governance | 14 | 14P/0F/0S | 10P/0F/4S | 4P/0F/10S | 14P/0F/0S | 0P/0F/14S | 70 |
| Legal | 13 | 13P/0F/0S | 11P/0F/2S | 2P/0F/11S | 13P/0F/0S | 0P/0F/13S | 65 |
| BI | 9 | 9P/0F/0S | 6P/0F/3S | 3P/0F/6S | 9P/0F/0S | 0P/0F/9S | 45 |
| Documents | 7 | 7P/0F/0S | 6P/0F/1S | 1P/0F/6S | 7P/0F/0S | 0P/0F/7S | 35 |
| Communications | 6 | 6P/0F/0S | 4P/0F/2S | 2P/0F/4S | 6P/0F/0S | 0P/0F/6S | 30 |
| Settings | 6 | 6P/0F/0S | 6P/0F/0S | 0P/0F/6S | 6P/0F/0S | 0P/0F/6S | 30 |
| Requests | 6 | 6P/0F/0S | 4P/0F/2S | 2P/0F/4S | 6P/0F/0S | 0P/0F/6S | 30 |
| Store | 6 | 6P/0F/0S | 4P/0F/2S | 2P/0F/4S | 6P/0F/0S | 0P/0F/6S | 30 |

**Grand total**: 1107 PASS, 0 FAIL, 738 SKIP across 1845 = 1845 checks.

## HR (80 routes)

| # | Route | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Notes |
|---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `/employees` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 2 | `/employees/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 3 | `/employees/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 4 | `/hr` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 5 | `/hr/attendance` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 6 | `/hr/attendance/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 7 | `/hr/attendance/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 8 | `/hr/attendance/field-tracking` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 9 | `/hr/attendance/qr-scanner` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 10 | `/hr/attendance/reports` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 11 | `/hr/contracts` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 12 | `/hr/contracts/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 13 | `/hr/contracts/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 14 | `/hr/development-plans` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 15 | `/hr/discipline/memos` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 16 | `/hr/discipline/memos/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 17 | `/hr/discipline/regulation` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 18 | `/hr/employee-activation` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 19 | `/hr/employee-profile/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 20 | `/hr/evaluation-360` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 21 | `/hr/evaluation-360/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 22 | `/hr/evaluation-360/:id/peer` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 23 | `/hr/evaluation-360/:id/upward` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 24 | `/hr/evaluation-360/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 25 | `/hr/evaluation-360/history/:employeeId` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 26 | `/hr/excuse-requests` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 27 | `/hr/excuse-requests/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 28 | `/hr/excuse-requests/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 29 | `/hr/exit` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 30 | `/hr/exit/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 31 | `/hr/exit/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 32 | `/hr/expiring-documents` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 33 | `/hr/gratuity` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 34 | `/hr/idp` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 35 | `/hr/leaves` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 36 | `/hr/leaves/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 37 | `/hr/leaves/approval-chains` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 38 | `/hr/leaves/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 39 | `/hr/leaves/management` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 40 | `/hr/loans` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 41 | `/hr/loans/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 42 | `/hr/loans/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 43 | `/hr/official-letters` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 44 | `/hr/onboarding-review` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 45 | `/hr/organization` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 46 | `/hr/organization/structure` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 47 | `/hr/overtime` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 48 | `/hr/overtime/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 49 | `/hr/overtime/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 50 | `/hr/payroll` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 51 | `/hr/payroll/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 52 | `/hr/payroll/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 53 | `/hr/payroll/salary-components` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 54 | `/hr/performance` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 55 | `/hr/performance/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 56 | `/hr/performance/advanced` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 57 | `/hr/performance/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 58 | `/hr/public-holidays` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 59 | `/hr/recruitment` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 60 | `/hr/recruitment/advanced` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 61 | `/hr/recruitment/applicants/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 62 | `/hr/recruitment/applications` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 63 | `/hr/recruitment/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 64 | `/hr/recruitment/jobs/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 65 | `/hr/shifts` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 66 | `/hr/shifts/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 67 | `/hr/shifts/management` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 68 | `/hr/training` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 69 | `/hr/training/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 70 | `/hr/training/advanced` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 71 | `/hr/training/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 72 | `/hr/transfers` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 73 | `/hr/transfers/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 74 | `/hr/turnover-report` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 75 | `/hr/violations` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 76 | `/hr/violations/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 77 | `/hr/violations/auto-detection` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 78 | `/hr/violations/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 79 | `/hr/violations/management` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 80 | `/hr/violations/penalty-escalation` | PASS | PASS | SKIP | PASS | SKIP | ~ |

## Finance (65 routes)

| # | Route | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Notes |
|---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `/finance` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 2 | `/finance/accounts` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 3 | `/finance/accounts/:id/edit` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 4 | `/finance/accounts/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 5 | `/finance/ap-aging` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 6 | `/finance/ar-aging` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 7 | `/finance/bank-guarantees` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 8 | `/finance/bank-reconciliation` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 9 | `/finance/bank-reconciliation/manual-match/:batchId/:rowId` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 10 | `/finance/budget` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 11 | `/finance/budget/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 12 | `/finance/budget/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 13 | `/finance/cash-flow-forecast` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 14 | `/finance/cashflow` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 15 | `/finance/commitments` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 16 | `/finance/commitments/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 17 | `/finance/custodies` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 18 | `/finance/custodies/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 19 | `/finance/custodies/report` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 20 | `/finance/expenses` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 21 | `/finance/expenses/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 22 | `/finance/expenses/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 23 | `/finance/financial-requests` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 24 | `/finance/financial-requests/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 25 | `/finance/fiscal-periods` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 26 | `/finance/fixed-assets` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 27 | `/finance/fixed-assets/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 28 | `/finance/fixed-assets/batch-depreciate` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 29 | `/finance/intercompany` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 30 | `/finance/intercompany/consolidation/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 31 | `/finance/inventory-costing` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 32 | `/finance/invoices` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 33 | `/finance/invoices/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 34 | `/finance/invoices/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 35 | `/finance/journal` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 36 | `/finance/journal-manual` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 37 | `/finance/journal-manual/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 38 | `/finance/journal-manual/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 39 | `/finance/journal/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 40 | `/finance/ledger/:code` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 41 | `/finance/opening-balances` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 42 | `/finance/opening-balances/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 43 | `/finance/payments` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 44 | `/finance/project-costing` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 45 | `/finance/project-costing/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 46 | `/finance/purchase-orders` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 47 | `/finance/purchase-orders/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 48 | `/finance/purchase-orders/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 49 | `/finance/receivables` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 50 | `/finance/receivables/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 51 | `/finance/recurring-journals` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 52 | `/finance/recurring-journals/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 53 | `/finance/recurring-journals/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 54 | `/finance/reports` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 55 | `/finance/salary-advances` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 56 | `/finance/salary-advances/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 57 | `/finance/tax` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 58 | `/finance/treasury` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 59 | `/finance/vendors` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 60 | `/finance/vendors/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 61 | `/finance/vendors/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 62 | `/finance/vouchers` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 63 | `/finance/vouchers/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 64 | `/finance/vouchers/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 65 | `/finance/year-end-close` | PASS | PASS | SKIP | PASS | SKIP | ~ |

## Misc/Operations (62 routes)

| # | Route | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Notes |
|---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `/action-center` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 2 | `/activity-log` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 3 | `/automation` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 4 | `/calendar` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 5 | `/clients` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 6 | `/clients/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 7 | `/clients/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 8 | `/crm` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 9 | `/crm/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 10 | `/crm/activities` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 11 | `/crm/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 12 | `/crm/leads/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 13 | `/crm/pipeline` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 14 | `/daily-close` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 15 | `/dashboard` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 16 | `/exec-dashboard` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 17 | `/insights` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 18 | `/intelligence` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 19 | `/manager-board` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 20 | `/marketing` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 21 | `/marketing/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 22 | `/module-dashboards` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 23 | `/my-attendance` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 24 | `/my-documents` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 25 | `/my-leave-request` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 26 | `/my-loans` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 27 | `/my-overtime` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 28 | `/my-payslip` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 29 | `/my-performance` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 30 | `/my-requests` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 31 | `/my-space` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 32 | `/notifications` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 33 | `/obligations` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 34 | `/operations-center` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 35 | `/projects` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 36 | `/projects/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 37 | `/projects/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 38 | `/projects/gantt` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 39 | `/projects/risks` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 40 | `/projects/tasks` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 41 | `/reports/scheduled` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 42 | `/support` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 43 | `/support/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 44 | `/support/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 45 | `/support/kb` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 46 | `/support/replies` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 47 | `/tasks` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 48 | `/tasks/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 49 | `/tasks/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 50 | `/warehouse` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 51 | `/warehouse/categories` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 52 | `/warehouse/categories/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 53 | `/warehouse/categories/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 54 | `/warehouse/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 55 | `/warehouse/inventory-count` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 56 | `/warehouse/movements` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 57 | `/warehouse/movements/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 58 | `/warehouse/movements/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 59 | `/warehouse/products/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 60 | `/warehouse/suppliers` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 61 | `/warehouse/suppliers/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 62 | `/warehouse/suppliers/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |

## Properties (29 routes)

| # | Route | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Notes |
|---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `/guide/properties` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 2 | `/properties` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 3 | `/properties/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 4 | `/properties/:id/status` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 5 | `/properties/buildings` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 6 | `/properties/buildings/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 7 | `/properties/buildings/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 8 | `/properties/contracts` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 9 | `/properties/contracts/:contractId/pay/:installmentId` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 10 | `/properties/contracts/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 11 | `/properties/contracts/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 12 | `/properties/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 13 | `/properties/dashboard` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 14 | `/properties/deposits` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 15 | `/properties/guide` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 16 | `/properties/inspections` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 17 | `/properties/maintenance` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 18 | `/properties/maintenance/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 19 | `/properties/maintenance/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 20 | `/properties/occupancy-report` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 21 | `/properties/owners` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 22 | `/properties/owners/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 23 | `/properties/owners/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 24 | `/properties/payments` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 25 | `/properties/payments/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 26 | `/properties/payments/:paymentId/pay` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 27 | `/properties/tenants` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 28 | `/properties/tenants/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 29 | `/properties/tenants/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |

## Fleet (26 routes)

| # | Route | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Notes |
|---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `/fleet` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 2 | `/fleet/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 3 | `/fleet/:id/status` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 4 | `/fleet/alerts` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 5 | `/fleet/alerts/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 6 | `/fleet/drivers` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 7 | `/fleet/drivers/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 8 | `/fleet/drivers/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 9 | `/fleet/fuel` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 10 | `/fleet/fuel/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 11 | `/fleet/fuel/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 12 | `/fleet/insurance` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 13 | `/fleet/insurance/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 14 | `/fleet/insurance/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 15 | `/fleet/maintenance` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 16 | `/fleet/maintenance/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 17 | `/fleet/maintenance/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 18 | `/fleet/preventive-plans` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 19 | `/fleet/reports` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 20 | `/fleet/tco` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 21 | `/fleet/traffic-violations` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 22 | `/fleet/traffic-violations/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 23 | `/fleet/trips` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 24 | `/fleet/trips/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 25 | `/fleet/trips/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 26 | `/fleet/vehicles/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |

## Umrah (24 routes)

| # | Route | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Notes |
|---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `/umrah` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 2 | `/umrah/agents` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 3 | `/umrah/agents/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 4 | `/umrah/commission-plans` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 5 | `/umrah/commission-plans/:id/edit` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 6 | `/umrah/commission-plans/new` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 7 | `/umrah/import` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 8 | `/umrah/import/legacy` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 9 | `/umrah/invoices` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 10 | `/umrah/invoices/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 11 | `/umrah/packages` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 12 | `/umrah/packages/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 13 | `/umrah/penalties` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 14 | `/umrah/penalties/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 15 | `/umrah/pilgrims` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 16 | `/umrah/pilgrims/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 17 | `/umrah/pilgrims/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 18 | `/umrah/pricing` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 19 | `/umrah/seasons` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 20 | `/umrah/seasons/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 21 | `/umrah/sub-agents` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 22 | `/umrah/transport` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 23 | `/umrah/transport/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 24 | `/umrah/violations` | PASS | PASS | SKIP | PASS | SKIP | ~ |

## Admin (16 routes)

| # | Route | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Notes |
|---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `/admin` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 2 | `/admin/domain-registry` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 3 | `/admin/event-monitor` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 4 | `/admin/gl-reconciliation` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 5 | `/admin/integrations` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 6 | `/admin/lifecycle-monitor` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 7 | `/admin/logs` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 8 | `/admin/monitoring` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 9 | `/admin/policy-engine` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 10 | `/admin/posting-failures` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 11 | `/admin/rbac-matrix` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 12 | `/admin/roles` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 13 | `/admin/system-governor` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 14 | `/admin/system-registry` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 15 | `/admin/users` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 16 | `/admin/violations-report` | PASS | PASS | SKIP | PASS | SKIP | ~ |

## Governance (14 routes)

| # | Route | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Notes |
|---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `/governance` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 2 | `/governance/audits` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 3 | `/governance/audits/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 4 | `/governance/audits/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 5 | `/governance/capa` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 6 | `/governance/compliance` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 7 | `/governance/compliance/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 8 | `/governance/compliance/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 9 | `/governance/policies` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 10 | `/governance/policies/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 11 | `/governance/policies/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 12 | `/governance/risks` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 13 | `/governance/risks/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 14 | `/governance/risks/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |

## Legal (13 routes)

| # | Route | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Notes |
|---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `/legal` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 2 | `/legal/cases` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 3 | `/legal/cases/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 4 | `/legal/cases/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 5 | `/legal/contracts` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 6 | `/legal/contracts/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 7 | `/legal/correspondence` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 8 | `/legal/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 9 | `/legal/documents` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 10 | `/legal/judgments` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 11 | `/legal/judgments/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 12 | `/legal/sessions` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 13 | `/legal/sessions/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |

## BI (9 routes)

| # | Route | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Notes |
|---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `/bi` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 2 | `/bi/admin-reports` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 3 | `/bi/dashboards` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 4 | `/bi/dashboards/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 5 | `/bi/kpis` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 6 | `/bi/kpis/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 7 | `/bi/operations` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 8 | `/bi/reports` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 9 | `/bi/reports/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |

## Documents (7 routes)

| # | Route | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Notes |
|---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `/documents` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 2 | `/documents/:docId/versions` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 3 | `/documents/archive` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 4 | `/documents/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 5 | `/documents/folders` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 6 | `/documents/templates` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 7 | `/documents/upload` | PASS | PASS | SKIP | PASS | SKIP | ~ |

## Communications (6 routes)

| # | Route | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Notes |
|---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `/communications` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 2 | `/communications/letters/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 3 | `/communications/notification-engine` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 4 | `/correspondence` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 5 | `/correspondence/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 6 | `/correspondence/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |

## Settings (6 routes)

| # | Route | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Notes |
|---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `/settings` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 2 | `/settings/audit-log` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 3 | `/settings/branches` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 4 | `/settings/companies` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 5 | `/settings/departments` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 6 | `/settings/rules` | PASS | PASS | SKIP | PASS | SKIP | ~ |

## Requests (6 routes)

| # | Route | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Notes |
|---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `/requests` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 2 | `/requests/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 3 | `/requests/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 4 | `/requests/types` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 5 | `/requests/types/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 6 | `/requests/workflows` | PASS | PASS | SKIP | PASS | SKIP | ~ |

## Store (6 routes)

| # | Route | A1 Render | A2 Data | A3 CRUD | A4 Nav | A5 State | Notes |
|---:|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `/store` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 2 | `/store/orders` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 3 | `/store/orders/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 4 | `/store/orders/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |
| 5 | `/store/products/:id` | PASS | PASS | SKIP | PASS | SKIP | ~ |
| 6 | `/store/products/create` | PASS | SKIP | PASS | PASS | SKIP | ~ |

