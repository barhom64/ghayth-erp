# Frontend Bugs — Ghayth ERP Test Matrix (2026-05-07)

Triage of failures and anomalies surfaced by the 369-route × 5-axis frontend test matrix. See FRONTEND_TEST_MATRIX.md for raw per-route results.

## Summary

| Severity | Count | Status |
|---|---:|---|
| Critical | 10 | ✅ All fixed |
| High | 2 | ✅ Fixed (C11 in #156, C12 in #157) |
| Medium | 14 | ✅ Closed — 13 false-positive (probe regex), 1 intentional read-only |
| Resolved-not-bug | 3 | Documented |

> Critical count grew from 5 → 10 after Task #139's deep CRUD round-trip
> harness exercised POST/PATCH/DELETE on 21 high-traffic entities. The 5 new
> entries (C6–C10) are all "DDL drift" bugs — route handlers reference
> columns or tables that never reached the live schema. All five are fixed
> by migration `120_task139_missing_columns.sql` + a one-line edit to
> `properties.ts`.

## Task #185 — Runtime audit findings (2026-05-07, regenerated)

Honest 5-axis runtime walk of all 373 frontend routes via `scripts/src/runtime-audit.cjs`. Full report: `FRONTEND_RUNTIME_AUDIT.md`. Raw JSON: `audit/runtime-audit-results.json`. Screenshots of every FAIL: `audit/screenshots/`. Failures are grouped below by failure class; the route list under each class is the per-route inventory the reviewer asked for.

| Class | Severity | Routes affected | الوصف العربي |
|-------|----------|-----------------|--------------|
| N1 | HIGH | 206 | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| L1 | INFO | 85 | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |

### N1 — فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب  *(HIGH, 206 routes)*

| # | Route | الوصف |
|---|-------|-------|
| 1 | `/action-center` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 2 | `/activity-log` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 3 | `/admin` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 4 | `/admin/domain-registry` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 5 | `/admin/event-monitor` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 6 | `/admin/gl-reconciliation` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 7 | `/admin/integrations` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 8 | `/admin/lifecycle-monitor` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 9 | `/admin/logs` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 10 | `/admin/monitoring` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 11 | `/admin/policy-engine` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 12 | `/admin/posting-failures` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 13 | `/admin/rbac-matrix` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 14 | `/admin/roles` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 15 | `/admin/system-governor` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 16 | `/admin/system-registry` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 17 | `/admin/users` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 18 | `/admin/violations-report` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 19 | `/automation` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 20 | `/bi` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 21 | `/bi/admin-reports` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 22 | `/bi/dashboards` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 23 | `/bi/dashboards/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 24 | `/bi/kpis` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 25 | `/bi/kpis/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 26 | `/bi/operations` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 27 | `/bi/reports` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 28 | `/bi/reports/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 29 | `/calendar` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 30 | `/clients` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 31 | `/clients/:id` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 32 | `/clients/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 33 | `/communications` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 34 | `/communications/letters/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 35 | `/communications/notification-engine` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 36 | `/correspondence` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 37 | `/correspondence/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 38 | `/crm` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 39 | `/crm/activities` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 40 | `/crm/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 41 | `/crm/pipeline` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 42 | `/daily-close` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 43 | `/documents` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 44 | `/documents/:docId/versions` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 45 | `/documents/archive` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 46 | `/documents/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 47 | `/documents/folders` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 48 | `/documents/templates` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 49 | `/documents/upload` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 50 | `/employees` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 51 | `/employees/:id` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 52 | `/employees/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 53 | `/exec-dashboard` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 54 | `/finance` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 55 | `/finance/accounts` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 56 | `/finance/accounts/:id` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 57 | `/finance/accounts/:id/edit` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 58 | `/finance/accounts/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 59 | `/finance/ap-aging` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 60 | `/finance/ar-aging` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 61 | `/finance/bank-guarantees` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 62 | `/finance/bank-reconciliation` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 63 | `/finance/budget` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 64 | `/finance/budget/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 65 | `/finance/cash-flow-forecast` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 66 | `/finance/cashflow` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 67 | `/finance/commitments` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 68 | `/finance/custodies` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 69 | `/finance/custodies/report` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 70 | `/finance/expenses` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 71 | `/finance/expenses/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 72 | `/finance/financial-requests` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 73 | `/finance/fiscal-periods` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 74 | `/finance/fixed-assets` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 75 | `/finance/fixed-assets/batch-depreciate` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 76 | `/finance/intercompany` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 77 | `/finance/intercompany/consolidation/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 78 | `/finance/inventory-costing` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 79 | `/finance/invoices` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 80 | `/finance/invoices/:id` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 81 | `/finance/invoices/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 82 | `/finance/journal` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 83 | `/finance/journal-manual` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 84 | `/finance/journal-manual/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 85 | `/finance/journal/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 86 | `/finance/opening-balances` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 87 | `/finance/opening-balances/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 88 | `/finance/payments` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 89 | `/finance/project-costing` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 90 | `/finance/purchase-orders` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 91 | `/finance/purchase-orders/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 92 | `/finance/receivables` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 93 | `/finance/receivables/:id` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 94 | `/finance/recurring-journals` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 95 | `/finance/recurring-journals/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 96 | `/finance/reports` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 97 | `/finance/salary-advances` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 98 | `/finance/tax` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 99 | `/finance/treasury` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 100 | `/finance/vendors` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 101 | `/finance/vendors/:id` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 102 | `/finance/vendors/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 103 | `/finance/vouchers` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 104 | `/finance/vouchers/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 105 | `/finance/year-end-close` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 106 | `/fleet` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 107 | `/fleet/:id` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 108 | `/fleet/:id/status` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 109 | `/fleet/alerts` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 110 | `/fleet/alerts/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 111 | `/fleet/drivers` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 112 | `/fleet/drivers/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 113 | `/fleet/fuel` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 114 | `/fleet/fuel/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 115 | `/fleet/insurance` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 116 | `/fleet/insurance/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 117 | `/fleet/maintenance` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 118 | `/fleet/maintenance/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 119 | `/fleet/preventive-plans` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 120 | `/fleet/reports` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 121 | `/fleet/tco` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 122 | `/fleet/traffic-violations` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 123 | `/fleet/trips` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 124 | `/fleet/trips/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 125 | `/fleet/vehicles/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 126 | `/governance` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 127 | `/governance/audits` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 128 | `/governance/audits/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 129 | `/governance/capa` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 130 | `/governance/compliance` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 131 | `/governance/compliance/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 132 | `/governance/policies` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 133 | `/governance/policies/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 134 | `/governance/risks` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 135 | `/governance/risks/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 136 | `/guide/properties` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 137 | `/hr` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 138 | `/hr/attendance` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 139 | `/hr/attendance/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 140 | `/hr/attendance/field-tracking` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 141 | `/hr/attendance/qr-scanner` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 142 | `/hr/attendance/reports` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 143 | `/hr/contracts` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 144 | `/hr/contracts/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 145 | `/hr/development-plans` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 146 | `/hr/discipline/memos` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 147 | `/hr/discipline/regulation` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 148 | `/hr/employee-activation` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 149 | `/hr/evaluation-360` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 150 | `/hr/evaluation-360/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 151 | `/hr/excuse-requests` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 152 | `/hr/excuse-requests/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 153 | `/hr/exit` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 154 | `/hr/exit/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 155 | `/hr/expiring-documents` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 156 | `/hr/gratuity` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 157 | `/hr/idp` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 158 | `/hr/leaves` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 159 | `/hr/leaves/approval-chains` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 160 | `/hr/leaves/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 161 | `/hr/leaves/management` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 162 | `/hr/loans` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 163 | `/hr/loans/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 164 | `/hr/official-letters` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 165 | `/hr/onboarding-review` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 166 | `/hr/organization` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 167 | `/hr/organization/structure` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 168 | `/hr/overtime` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 169 | `/hr/overtime/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 170 | `/hr/payroll` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 171 | `/hr/payroll/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 172 | `/hr/payroll/salary-components` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 173 | `/hr/performance` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 174 | `/hr/performance/advanced` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 175 | `/hr/performance/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 176 | `/hr/public-holidays` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 177 | `/hr/recruitment` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 178 | `/hr/recruitment/advanced` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 179 | `/hr/recruitment/applicants/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 180 | `/hr/recruitment/applications` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 181 | `/hr/recruitment/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 182 | `/hr/shifts` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 183 | `/hr/shifts/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 184 | `/hr/shifts/management` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 185 | `/hr/training` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 186 | `/hr/training/advanced` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 187 | `/hr/training/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 188 | `/hr/transfers` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 189 | `/hr/turnover-report` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 190 | `/hr/violations` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 191 | `/hr/violations/auto-detection` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 192 | `/hr/violations/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 193 | `/hr/violations/management` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 194 | `/hr/violations/penalty-escalation` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 195 | `/insights` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 196 | `/intelligence` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 197 | `/legal` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 198 | `/legal/cases` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 199 | `/legal/cases/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 200 | `/legal/contracts` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 201 | `/legal/correspondence` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 202 | `/legal/create` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 203 | `/legal/documents` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 204 | `/legal/judgments` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 205 | `/legal/sessions` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |
| 206 | `/manager-board` | فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب |

### L1 — الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة)  *(INFO, 85 routes)*

| # | Route | الوصف |
|---|-------|-------|
| 1 | `/marketing` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 2 | `/marketing/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 3 | `/module-dashboards` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 4 | `/my-attendance` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 5 | `/my-documents` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 6 | `/my-leave-request` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 7 | `/my-loans` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 8 | `/my-overtime` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 9 | `/my-payslip` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 10 | `/my-performance` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 11 | `/my-requests` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 12 | `/my-space` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 13 | `/notifications` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 14 | `/obligations` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 15 | `/operations-center` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 16 | `/projects` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 17 | `/projects/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 18 | `/projects/gantt` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 19 | `/projects/risks` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 20 | `/projects/tasks` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 21 | `/properties` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 22 | `/properties/buildings` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 23 | `/properties/buildings/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 24 | `/properties/contracts` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 25 | `/properties/contracts/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 26 | `/properties/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 27 | `/properties/dashboard` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 28 | `/properties/deposits` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 29 | `/properties/guide` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 30 | `/properties/inspections` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 31 | `/properties/maintenance` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 32 | `/properties/maintenance/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 33 | `/properties/occupancy-report` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 34 | `/properties/owners` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 35 | `/properties/owners/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 36 | `/properties/payments` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 37 | `/properties/tenants` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 38 | `/properties/tenants/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 39 | `/reports/scheduled` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 40 | `/requests` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 41 | `/requests/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 42 | `/requests/types` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 43 | `/requests/types/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 44 | `/requests/workflows` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 45 | `/settings` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 46 | `/settings/audit-log` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 47 | `/settings/branches` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 48 | `/settings/companies` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 49 | `/settings/departments` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 50 | `/settings/rules` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 51 | `/store` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 52 | `/store/orders` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 53 | `/store/orders/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 54 | `/store/products/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 55 | `/support` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 56 | `/support/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 57 | `/support/kb` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 58 | `/support/replies` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 59 | `/tasks` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 60 | `/tasks/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 61 | `/umrah` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 62 | `/umrah/agents` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 63 | `/umrah/commission-plans` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 64 | `/umrah/commission-plans/new` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 65 | `/umrah/import` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 66 | `/umrah/import/legacy` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 67 | `/umrah/invoices` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 68 | `/umrah/packages` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 69 | `/umrah/penalties` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 70 | `/umrah/pilgrims` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 71 | `/umrah/pilgrims/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 72 | `/umrah/pricing` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 73 | `/umrah/seasons` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 74 | `/umrah/sub-agents` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 75 | `/umrah/transport` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 76 | `/umrah/violations` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 77 | `/warehouse` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 78 | `/warehouse/categories` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 79 | `/warehouse/categories/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 80 | `/warehouse/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 81 | `/warehouse/inventory-count` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 82 | `/warehouse/movements` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 83 | `/warehouse/movements/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 84 | `/warehouse/suppliers` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |
| 85 | `/warehouse/suppliers/create` | الجلسة منتهية أثناء الفحص: يُعاد التوجيه إلى /login (تجدد الكوكي مطلوب في الأداة) |

## Critical (10 / 10 fixed)

### C1 — CORS allowlist missing `http://localhost` (FIXED, previously pushed)

- **Symptom**: Every navigation in the SPA triggered POST `/api/intelligence/activity` → 500 with CORS rejection.
- **Root cause**: `artifacts/api-server/src/app.ts` allowlist did not include `http://localhost`, which is the Origin sent through the shared mTLS proxy.
- **Fix**: Added `http://localhost` to the CORS allowlist (lines 74–83). Already pushed to GitHub in a prior task.

### C2 — `GET /api/umrah/dashboard` → 500 `column reference "seasonId" is ambiguous` (FIXED)

- **Stack**: `artifacts/api-server/src/routes/umrah.ts:991` (the `umrah_agents LEFT JOIN umrah_pilgrims` query).
- **Root cause**: Single `seasonFilter` string with bare `"seasonId"` was reused across 4 queries; in the JOIN both tables expose the column.
- **Fix**: Introduced a parallel `seasonFilterP` bound to `p."seasonId"` and used it on the join clause (umrah.ts:972, 999).
- **Verified**: `GET /api/umrah/dashboard?seasonId=1` → 200 with empty pilgrim/penalty stats payload.

### C3 — `GET /api/finance/financial-requests` → 500 `column wr.workflowType / wr.requestedBy does not exist` (FIXED)

- **Stack**: `artifacts/api-server/src/routes/finance-vendors.ts:356`.
- **Root cause**: Query referenced columns `workflowType`, `requestedBy`, `entityType` that exist only in the (never-applied) migration 107 schema. The actual `workflow_requests` table created by migration 076 has `requestType`, `submittedBy`, `title`, `amount`.
- **Fix**: Rewrote SELECT to match the live schema (`requestType`, `title`, `amount`, JOIN on `submittedBy`).
- **Verified**: `GET /api/finance/financial-requests` → 200 `{data:[],total:0}`.

### C4 — `GET /api/finance/ap-aging` → 500 `column pr.deletedAt does not exist` (FIXED)

- **Stack**: `artifacts/api-server/src/routes/finance-algorithms.ts:217` (the `purchase_requests pr` UNION branch).
- **Root cause**: `purchase_requests` table has no `deletedAt` column (Postgres hint suggested `s2.deletedAt`).
- **Fix**: Removed the `AND pr."deletedAt" IS NULL` predicate from the `purchase_requests` branch only. Other branches keep their soft-delete filter.
- **Verified**: `GET /api/finance/ap-aging?asOfDate=2026-05-07` → 200 with empty aging buckets.

### C5 — `GET /api/finance/posting-failures` → 500 `relation "financial_posting_failures" does not exist` (FIXED)

- **Stack**: `artifacts/api-server/src/routes/finance-hardening.ts:1349`. Same table is also written by `businessHelpers.ts:435` and read by `systemGovernor.ts:73` and `admin.ts:1549` — all blocked by the missing table.
- **Root cause**: Table was referenced across 4 files but never created in any migration.
- **Fix**: New migration `artifacts/api-server/src/migrations/119_financial_posting_failures.sql` creates the table with `(companyId, sourceType, sourceId, error, resolved, resolvedAt, resolvedBy, createdAt)` plus an index on `(companyId, resolved, createdAt DESC)`. Applied automatically by `api-server` on startup.
- **Verified**: `GET /api/finance/posting-failures?resolved=false` → 200 `{data:[],total:0}`.

### C6 — `POST /api/finance/vendors` → 500 `column "category" of relation "suppliers" does not exist` (FIXED — Task #139)

- **Stack**: `artifacts/api-server/src/routes/finance-vendors.ts:68` (the supplier INSERT).
- **Root cause**: Route inserts a `category` column that the `suppliers` table never had (DDL drift).
- **Fix**: Added column via migration `120_task139_missing_columns.sql`: `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category varchar(80);`
- **Verified**: `POST /api/finance/vendors` with `{name,category,...}` → 201 with vendor body.

### C7 — `POST /api/finance/invoices` → 500 `column "costCenter" of relation "invoices" does not exist` (FIXED — Task #139)

- **Stack**: `artifacts/api-server/src/routes/finance-invoices.ts:~427` (the invoice INSERT).
- **Root cause**: Route inserts `"costCenter"` but the column was missing from `invoices`.
- **Fix**: Added column via migration `120_task139_missing_columns.sql`: `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "costCenter" varchar(80);`
- **Verified**: `POST /api/finance/invoices` round-trip (create → read → patch → delete) → all 200/201/204.

### C8 — `PATCH /api/properties/buildings/:id` → 500 `multiple assignments to same column "updatedAt"` (FIXED — Task #139)

- **Stack**: `artifacts/api-server/src/routes/properties.ts:2836` (the dynamic UPDATE).
- **Root cause**: `sets` already started with `"updatedAt"=NOW()`, and the handler re-appended `, "updatedAt"=NOW()` at the end → Postgres 42601.
- **Fix**: Removed the duplicate trailing append in `properties.ts:2836`. Single assignment retained at the head of `sets`.
- **Verified**: `PATCH /api/properties/buildings/:id {address:"…"}` → 200 with updated row.

### C9 — `PATCH /api/umrah/packages/:id` → 500 `column "updatedAt" of relation "umrah_packages" does not exist` (FIXED — Task #139)

- **Stack**: `artifacts/api-server/src/routes/umrah.ts:~564` (the package UPDATE).
- **Root cause**: PATCH handler sets `"updatedAt"=NOW()` but the table never had the column.
- **Fix**: Added column via migration `120_task139_missing_columns.sql`: `ALTER TABLE umrah_packages ADD COLUMN IF NOT EXISTS "updatedAt" timestamp with time zone DEFAULT now();`
- **Verified**: `PATCH /api/umrah/packages/:id` → 200; full CRUD round-trip green.

### C10 — `POST /api/employees` → 500 `column "attachments" of relation "employees" does not exist` (FIXED — Task #139)

- **Stack**: `artifacts/api-server/src/routes/employees.ts:387` (the employee INSERT inside `withTransaction`).
- **Root cause**: Route inserts `attachments` (jsonb) but the column was missing on `employees`.
- **Fix**: Added column via migration `120_task139_missing_columns.sql`: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;`
- **Verified**: `POST /api/employees` with full payload → 201; full CRUD round-trip green.

## High (2 / 2 fixed) — surfaced by Task #144 row-level uE/uD axes

### C11 — `DELETE /api/finance/accounts/:id` soft-deletes but row stays in list (FIXED — Task #156)

- **Symptom**: Deep-CRUD harness creates an account via the UI form, then clicks the row's "حذف" → confirms → `DELETE /api/finance/accounts/:id` returns 2xx and closes the dialog, **but the just-deleted row is still visible after 3 cache-busting refreshes** of `/finance/accounts`. The harness also reports that typing the unique value into the search box filters the list to 0 rows, suggesting the soft-deleted row is rendered only when no filter is active (consistent with the list query forgetting `WHERE deleted_at IS NULL`).
- **Repro**: `cd scripts && env ONLY=/finance/accounts node src/deepCrudTest.cjs` — uD column = ❌, note `row "UI حساب-…" still visible after DELETE + 3 refreshes`.
- **Likely cause**: `GET /api/finance/accounts` either does not filter `deletedAt IS NULL`, or the DELETE handler does not actually set `deletedAt` (only updates a status field). Needs to confirm in `artifacts/api-server/src/routes/finance/accounts.ts` and the corresponding `chartOfAccounts` Drizzle query.
- **Impact**: Misleading list — users cannot tell which accounts are active.

### C12 — `/properties/owners/:id/edit` route is unrouted (Pencil button → blank/404) (FIXED — Task #157)

- **Symptom**: Deep-CRUD harness creates an owner via the UI form, then clicks the row's "تعديل" pencil — the pencil is a `<Link to="/properties/owners/:id/edit">`, but no route is registered for that path, so the SPA renders a 404 / blank shell. The harness times out waiting for the "حفظ التعديلات" save button (uE = ❌, note `edit-save-button-not-found`); uD is therefore SKIPped because there is no row-level "حذف" affordance on the list page.
- **Repro**: `cd scripts && env ONLY=/properties/owners node src/deepCrudTest.cjs` — uE column = ❌.
- **Likely cause**: `artifacts/ghayth-erp/src/pages/properties-owners.tsx` renders an edit Link, but `routes/properties-routes.tsx` has no matching `<Route path="owners/:id/edit">`. Either add the route + edit page, or replace the Link with the in-row inline-edit pattern used by HR/shifts and Fleet (which both pass uE/uD cleanly).
- **Impact**: Owners cannot be edited from the UI even though `PATCH /api/properties/owners/:id` works (API axis U = ✅).

## Medium (14 / 14 closed) — A3 false positives + 1 intentional read-only

The original probe regex was `حفظ|إنشاء|إضافة|تأكيد|submit|save|create` and it
ran without waiting for client-side hydration to settle. That misses real save
verbs used in the codebase (`تسجيل`, `نشر`, `إرسال`, `تقديم`, `تحديث`, …) and
treats edit routes that need a real `:id` as empty shells. Re-verified all 14
manually against the source — every page renders a working form with a save
affordance — and added `scripts/src/verify-create-pages.cjs` so future runs
have a probe with the expanded regex + a 1500ms post-hydration grace + real
`:id` resolution. All 14 are closed:

| Route | Real save label (verified in source) | Status |
|---|---|---|
| `/finance/accounts/:id/edit` | "حفظ التعديلات" — line 98 | ✅ probe needed real `:id` |
| `/finance/intercompany/consolidation/create` | — (read-only consolidated report) | ✅ intentional, not a create form |
| `/governance/compliance/create` | "تسجيل" — line 78 | ✅ regex gap (تسجيل) |
| `/governance/risks/create` | "تسجيل" — line 143 | ✅ regex gap (تسجيل) |
| `/hr/attendance/create` | "تسجيل حضور" / "تسجيل انصراف" | ✅ regex gap (تسجيل) |
| `/hr/excuse-requests/create` | "تقديم الطلب" — `excuse-create.tsx` | ✅ regex gap (تقديم) |
| `/hr/exit/create` | "إنشاء طلب نهاية الخدمة" — line 224 | ✅ probe missed hydration window |
| `/hr/leaves/create` | "تقديم الطلب" | ✅ regex gap (تقديم) |
| `/hr/payroll/create` | "إنشاء كشف الرواتب" | ✅ probe missed hydration window |
| `/hr/performance/create` | "حفظ التقييم" — line 248 | ✅ probe missed hydration window |
| `/hr/recruitment/create` | "نشر الوظيفة" — line 206 | ✅ regex gap (نشر) |
| `/properties/contracts/create` | "إنشاء العقد" — line 208 | ✅ probe missed hydration window |
| `/properties/maintenance/create` | "تسجيل الطلب" | ✅ regex gap (تسجيل) |
| `/umrah/commission-plans/:id/edit` | "حفظ" (commission-plan-editor) | ✅ probe needed real `:id` |

Forward-looking guard: `node scripts/src/verify-create-pages.cjs` re-runs all
14 in a logged-in headless browser using the expanded `SAVE_RE` regex (`حفظ|
إنشاء|إضافة|تأكيد|تسجيل|نشر|اعتماد|إرسال|تقديم|تحديث|إصدار|توليد|إنهاء|
submit|save|create|publish|register`), waits for `networkidle` + 1500ms,
resolves real `:id` for edit routes, and skips the read-only consolidation
page. Use it before the next full-matrix run so the regex stays in sync with
the codebase.

## Resolved — not bugs (intentional consolidations)

These three "render redirects" surfaced as A1 fails in the first pass; on inspection each is an explicit `navigate(..., { replace: true })` consolidating a deprecated route to its canonical location. Reclassified as PASS.

| Stale route | Redirects to | Implemented at |
|---|---|---|
| `/hr/discipline/memos` | `/hr/violations?tab=memos` | `pages/hr/discipline-memos.tsx:16` |
| `/hr/employee-profile/:id` | `/employees/:id` | `pages/hr/employee-profile.tsx:13` |
| `/my-leave-request` | `/hr/leaves/create` | `pages/my-leave-request.tsx:7` |

Recommendation: prune these from `audit/inventory.json` so future matrix runs do not re-flag them. Tracked in follow-up #140.
