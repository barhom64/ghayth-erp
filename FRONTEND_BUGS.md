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

## Task #185 — Runtime audit findings (2026-05-07, regenerated v2 with re-login)

Honest 5-axis runtime walk of all 373 frontend routes via `scripts/src/runtime-audit.cjs` with periodic re-login (every 25 routes) so no result is a tool-induced session-expiry failure. Full report: `FRONTEND_RUNTIME_AUDIT.md`. Raw JSON: `audit/runtime-audit-results.json`. Screenshots of every A4 FAIL: `audit/screenshots/` (291 PNGs).

**Per-route disposition:** 1 PASS (`/dashboard` only) / 291 FAIL (all A4) / 81 SKIP.

**Per-axis totals:** A1 292 PASS / 0 FAIL / 81 SKIP · A2 223 / 0 / 150 · A3 69 / 0 / 304 · A4 1 / 291 / 81 · A5 285 / 0 / 88. With re-login in place every other axis passes cleanly; the only failure mode in this run is A4.

### Class N1 — فتح المسار مباشرة من شريط العنوان يعيد التوجيه إلى /dashboard بدلاً من المسار المطلوب  *(HIGH, 291 routes)*

Each row below has the route, the path the SPA actually landed on, the screenshot proof in `audit/screenshots/`, and the Arabic bug description. The HTTP evidence is the redirect itself: `page.goto(<route>)` returns 200 but `page.url()` after `domcontentloaded + networkIdle` is `/dashboard`, not `<route>`.

| # | Route | Landed | Screenshot | الوصف العربي |
|---|-------|--------|------------|--------------|
| 1 | `/action-center` | `/dashboard` | `audit/screenshots/action_center.png` | عند فتح `/action-center` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 2 | `/activity-log` | `/dashboard` | `audit/screenshots/activity_log.png` | عند فتح `/activity-log` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 3 | `/admin` | `/dashboard` | `audit/screenshots/admin.png` | عند فتح `/admin` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 4 | `/admin/domain-registry` | `/dashboard` | `audit/screenshots/admin_domain_registry.png` | عند فتح `/admin/domain-registry` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 5 | `/admin/event-monitor` | `/dashboard` | `audit/screenshots/admin_event_monitor.png` | عند فتح `/admin/event-monitor` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 6 | `/admin/gl-reconciliation` | `/dashboard` | `audit/screenshots/admin_gl_reconciliation.png` | عند فتح `/admin/gl-reconciliation` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 7 | `/admin/integrations` | `/dashboard` | `audit/screenshots/admin_integrations.png` | عند فتح `/admin/integrations` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 8 | `/admin/lifecycle-monitor` | `/dashboard` | `audit/screenshots/admin_lifecycle_monitor.png` | عند فتح `/admin/lifecycle-monitor` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 9 | `/admin/logs` | `/dashboard` | `audit/screenshots/admin_logs.png` | عند فتح `/admin/logs` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 10 | `/admin/monitoring` | `/dashboard` | `audit/screenshots/admin_monitoring.png` | عند فتح `/admin/monitoring` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 11 | `/admin/policy-engine` | `/dashboard` | `audit/screenshots/admin_policy_engine.png` | عند فتح `/admin/policy-engine` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 12 | `/admin/posting-failures` | `/dashboard` | `audit/screenshots/admin_posting_failures.png` | عند فتح `/admin/posting-failures` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 13 | `/admin/rbac-matrix` | `/dashboard` | `audit/screenshots/admin_rbac_matrix.png` | عند فتح `/admin/rbac-matrix` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 14 | `/admin/roles` | `/dashboard` | `audit/screenshots/admin_roles.png` | عند فتح `/admin/roles` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 15 | `/admin/system-governor` | `/dashboard` | `audit/screenshots/admin_system_governor.png` | عند فتح `/admin/system-governor` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 16 | `/admin/system-registry` | `/dashboard` | `audit/screenshots/admin_system_registry.png` | عند فتح `/admin/system-registry` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 17 | `/admin/users` | `/dashboard` | `audit/screenshots/admin_users.png` | عند فتح `/admin/users` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 18 | `/admin/violations-report` | `/dashboard` | `audit/screenshots/admin_violations_report.png` | عند فتح `/admin/violations-report` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 19 | `/automation` | `/dashboard` | `audit/screenshots/automation.png` | عند فتح `/automation` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 20 | `/bi` | `/dashboard` | `audit/screenshots/bi.png` | عند فتح `/bi` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 21 | `/bi/admin-reports` | `/dashboard` | `audit/screenshots/bi_admin_reports.png` | عند فتح `/bi/admin-reports` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 22 | `/bi/dashboards` | `/dashboard` | `audit/screenshots/bi_dashboards.png` | عند فتح `/bi/dashboards` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 23 | `/bi/dashboards/create` | `/dashboard` | `audit/screenshots/bi_dashboards_create.png` | عند فتح `/bi/dashboards/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 24 | `/bi/kpis` | `/dashboard` | `audit/screenshots/bi_kpis.png` | عند فتح `/bi/kpis` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 25 | `/bi/kpis/create` | `/dashboard` | `audit/screenshots/bi_kpis_create.png` | عند فتح `/bi/kpis/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 26 | `/bi/operations` | `/dashboard` | `audit/screenshots/bi_operations.png` | عند فتح `/bi/operations` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 27 | `/bi/reports` | `/dashboard` | `audit/screenshots/bi_reports.png` | عند فتح `/bi/reports` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 28 | `/bi/reports/create` | `/dashboard` | `audit/screenshots/bi_reports_create.png` | عند فتح `/bi/reports/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 29 | `/calendar` | `/dashboard` | `audit/screenshots/calendar.png` | عند فتح `/calendar` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 30 | `/clients` | `/dashboard` | `audit/screenshots/clients.png` | عند فتح `/clients` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 31 | `/clients/:id` | `/dashboard` | `audit/screenshots/clients_id.png` | عند فتح `/clients/3` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 32 | `/clients/create` | `/dashboard` | `audit/screenshots/clients_create.png` | عند فتح `/clients/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 33 | `/communications` | `/dashboard` | `audit/screenshots/communications.png` | عند فتح `/communications` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 34 | `/communications/letters/create` | `/dashboard` | `audit/screenshots/communications_letters_create.png` | عند فتح `/communications/letters/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 35 | `/communications/notification-engine` | `/dashboard` | `audit/screenshots/communications_notification_engine.png` | عند فتح `/communications/notification-engine` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 36 | `/correspondence` | `/dashboard` | `audit/screenshots/correspondence.png` | عند فتح `/correspondence` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 37 | `/correspondence/create` | `/dashboard` | `audit/screenshots/correspondence_create.png` | عند فتح `/correspondence/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 38 | `/crm` | `/dashboard` | `audit/screenshots/crm.png` | عند فتح `/crm` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 39 | `/crm/activities` | `/dashboard` | `audit/screenshots/crm_activities.png` | عند فتح `/crm/activities` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 40 | `/crm/create` | `/dashboard` | `audit/screenshots/crm_create.png` | عند فتح `/crm/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 41 | `/crm/pipeline` | `/dashboard` | `audit/screenshots/crm_pipeline.png` | عند فتح `/crm/pipeline` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 42 | `/daily-close` | `/dashboard` | `audit/screenshots/daily_close.png` | عند فتح `/daily-close` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 43 | `/documents` | `/dashboard` | `audit/screenshots/documents.png` | عند فتح `/documents` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 44 | `/documents/:docId/versions` | `/dashboard` | `audit/screenshots/documents_docId_versions.png` | عند فتح `/documents/1/versions` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 45 | `/documents/archive` | `/dashboard` | `audit/screenshots/documents_archive.png` | عند فتح `/documents/archive` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 46 | `/documents/create` | `/dashboard` | `audit/screenshots/documents_create.png` | عند فتح `/documents/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 47 | `/documents/folders` | `/dashboard` | `audit/screenshots/documents_folders.png` | عند فتح `/documents/folders` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 48 | `/documents/templates` | `/dashboard` | `audit/screenshots/documents_templates.png` | عند فتح `/documents/templates` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 49 | `/documents/upload` | `/dashboard` | `audit/screenshots/documents_upload.png` | عند فتح `/documents/upload` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 50 | `/employees` | `/dashboard` | `audit/screenshots/employees.png` | عند فتح `/employees` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 51 | `/employees/:id` | `/dashboard` | `audit/screenshots/employees_id.png` | عند فتح `/employees/3` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 52 | `/employees/create` | `/dashboard` | `audit/screenshots/employees_create.png` | عند فتح `/employees/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 53 | `/exec-dashboard` | `/dashboard` | `audit/screenshots/exec_dashboard.png` | عند فتح `/exec-dashboard` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 54 | `/finance` | `/dashboard` | `audit/screenshots/finance.png` | عند فتح `/finance` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 55 | `/finance/accounts` | `/dashboard` | `audit/screenshots/finance_accounts.png` | عند فتح `/finance/accounts` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 56 | `/finance/accounts/:id` | `/dashboard` | `audit/screenshots/finance_accounts_id.png` | عند فتح `/finance/accounts/2` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 57 | `/finance/accounts/:id/edit` | `/dashboard` | `audit/screenshots/finance_accounts_id_edit.png` | عند فتح `/finance/accounts/2/edit;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 58 | `/finance/accounts/create` | `/dashboard` | `audit/screenshots/finance_accounts_create.png` | عند فتح `/finance/accounts/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 59 | `/finance/ap-aging` | `/dashboard` | `audit/screenshots/finance_ap_aging.png` | عند فتح `/finance/ap-aging` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 60 | `/finance/ar-aging` | `/dashboard` | `audit/screenshots/finance_ar_aging.png` | عند فتح `/finance/ar-aging` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 61 | `/finance/bank-guarantees` | `/dashboard` | `audit/screenshots/finance_bank_guarantees.png` | عند فتح `/finance/bank-guarantees` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 62 | `/finance/bank-reconciliation` | `/dashboard` | `audit/screenshots/finance_bank_reconciliation.png` | عند فتح `/finance/bank-reconciliation` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 63 | `/finance/budget` | `/dashboard` | `audit/screenshots/finance_budget.png` | عند فتح `/finance/budget` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 64 | `/finance/budget/create` | `/dashboard` | `audit/screenshots/finance_budget_create.png` | عند فتح `/finance/budget/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 65 | `/finance/cash-flow-forecast` | `/dashboard` | `audit/screenshots/finance_cash_flow_forecast.png` | عند فتح `/finance/cash-flow-forecast` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 66 | `/finance/cashflow` | `/dashboard` | `audit/screenshots/finance_cashflow.png` | عند فتح `/finance/cashflow` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 67 | `/finance/commitments` | `/dashboard` | `audit/screenshots/finance_commitments.png` | عند فتح `/finance/commitments` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 68 | `/finance/custodies` | `/dashboard` | `audit/screenshots/finance_custodies.png` | عند فتح `/finance/custodies` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 69 | `/finance/custodies/report` | `/dashboard` | `audit/screenshots/finance_custodies_report.png` | عند فتح `/finance/custodies/report` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 70 | `/finance/expenses` | `/dashboard` | `audit/screenshots/finance_expenses.png` | عند فتح `/finance/expenses` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 71 | `/finance/expenses/create` | `/dashboard` | `audit/screenshots/finance_expenses_create.png` | عند فتح `/finance/expenses/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 72 | `/finance/financial-requests` | `/dashboard` | `audit/screenshots/finance_financial_requests.png` | عند فتح `/finance/financial-requests` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 73 | `/finance/fiscal-periods` | `/dashboard` | `audit/screenshots/finance_fiscal_periods.png` | عند فتح `/finance/fiscal-periods` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 74 | `/finance/fixed-assets` | `/dashboard` | `audit/screenshots/finance_fixed_assets.png` | عند فتح `/finance/fixed-assets` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 75 | `/finance/fixed-assets/batch-depreciate` | `/dashboard` | `audit/screenshots/finance_fixed_assets_batch_depreciate.png` | عند فتح `/finance/fixed-assets/batch-depreciate` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 76 | `/finance/intercompany` | `/dashboard` | `audit/screenshots/finance_intercompany.png` | عند فتح `/finance/intercompany` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 77 | `/finance/intercompany/consolidation/create` | `/dashboard` | `audit/screenshots/finance_intercompany_consolidation_create.png` | عند فتح `/finance/intercompany/consolidation/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 78 | `/finance/inventory-costing` | `/dashboard` | `audit/screenshots/finance_inventory_costing.png` | عند فتح `/finance/inventory-costing` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 79 | `/finance/invoices` | `/dashboard` | `audit/screenshots/finance_invoices.png` | عند فتح `/finance/invoices` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 80 | `/finance/invoices/:id` | `/dashboard` | `audit/screenshots/finance_invoices_id.png` | عند فتح `/finance/invoices/1` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 81 | `/finance/invoices/create` | `/dashboard` | `audit/screenshots/finance_invoices_create.png` | عند فتح `/finance/invoices/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 82 | `/finance/journal` | `/dashboard` | `audit/screenshots/finance_journal.png` | عند فتح `/finance/journal` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 83 | `/finance/journal-manual` | `/dashboard` | `audit/screenshots/finance_journal_manual.png` | عند فتح `/finance/journal-manual` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 84 | `/finance/journal-manual/create` | `/dashboard` | `audit/screenshots/finance_journal_manual_create.png` | عند فتح `/finance/journal-manual/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 85 | `/finance/journal/create` | `/dashboard` | `audit/screenshots/finance_journal_create.png` | عند فتح `/finance/journal/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 86 | `/finance/opening-balances` | `/dashboard` | `audit/screenshots/finance_opening_balances.png` | عند فتح `/finance/opening-balances` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 87 | `/finance/opening-balances/create` | `/dashboard` | `audit/screenshots/finance_opening_balances_create.png` | عند فتح `/finance/opening-balances/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 88 | `/finance/payments` | `/dashboard` | `audit/screenshots/finance_payments.png` | عند فتح `/finance/payments` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 89 | `/finance/project-costing` | `/dashboard` | `audit/screenshots/finance_project_costing.png` | عند فتح `/finance/project-costing` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 90 | `/finance/purchase-orders` | `/dashboard` | `audit/screenshots/finance_purchase_orders.png` | عند فتح `/finance/purchase-orders` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 91 | `/finance/purchase-orders/create` | `/dashboard` | `audit/screenshots/finance_purchase_orders_create.png` | عند فتح `/finance/purchase-orders/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 92 | `/finance/receivables` | `/dashboard` | `audit/screenshots/finance_receivables.png` | عند فتح `/finance/receivables` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 93 | `/finance/receivables/:id` | `/dashboard` | `audit/screenshots/finance_receivables_id.png` | عند فتح `/finance/receivables/3` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 94 | `/finance/recurring-journals` | `/dashboard` | `audit/screenshots/finance_recurring_journals.png` | عند فتح `/finance/recurring-journals` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 95 | `/finance/recurring-journals/create` | `/dashboard` | `audit/screenshots/finance_recurring_journals_create.png` | عند فتح `/finance/recurring-journals/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 96 | `/finance/reports` | `/dashboard` | `audit/screenshots/finance_reports.png` | عند فتح `/finance/reports` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 97 | `/finance/salary-advances` | `/dashboard` | `audit/screenshots/finance_salary_advances.png` | عند فتح `/finance/salary-advances` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 98 | `/finance/tax` | `/dashboard` | `audit/screenshots/finance_tax.png` | عند فتح `/finance/tax` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 99 | `/finance/treasury` | `/dashboard` | `audit/screenshots/finance_treasury.png` | عند فتح `/finance/treasury` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 100 | `/finance/vendors` | `/dashboard` | `audit/screenshots/finance_vendors.png` | عند فتح `/finance/vendors` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 101 | `/finance/vendors/:id` | `/dashboard` | `audit/screenshots/finance_vendors_id.png` | عند فتح `/finance/vendors/1` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 102 | `/finance/vendors/create` | `/dashboard` | `audit/screenshots/finance_vendors_create.png` | عند فتح `/finance/vendors/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 103 | `/finance/vouchers` | `/dashboard` | `audit/screenshots/finance_vouchers.png` | عند فتح `/finance/vouchers` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 104 | `/finance/vouchers/create` | `/dashboard` | `audit/screenshots/finance_vouchers_create.png` | عند فتح `/finance/vouchers/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 105 | `/finance/year-end-close` | `/dashboard` | `audit/screenshots/finance_year_end_close.png` | عند فتح `/finance/year-end-close` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 106 | `/fleet` | `/dashboard` | `audit/screenshots/fleet.png` | عند فتح `/fleet` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 107 | `/fleet/:id` | `/dashboard` | `audit/screenshots/fleet_id.png` | عند فتح `/fleet/7` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 108 | `/fleet/:id/status` | `/dashboard` | `audit/screenshots/fleet_id_status.png` | عند فتح `/fleet/7/status` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 109 | `/fleet/alerts` | `/dashboard` | `audit/screenshots/fleet_alerts.png` | عند فتح `/fleet/alerts` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 110 | `/fleet/alerts/create` | `/dashboard` | `audit/screenshots/fleet_alerts_create.png` | عند فتح `/fleet/alerts/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 111 | `/fleet/drivers` | `/dashboard` | `audit/screenshots/fleet_drivers.png` | عند فتح `/fleet/drivers` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 112 | `/fleet/drivers/create` | `/dashboard` | `audit/screenshots/fleet_drivers_create.png` | عند فتح `/fleet/drivers/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 113 | `/fleet/fuel` | `/dashboard` | `audit/screenshots/fleet_fuel.png` | عند فتح `/fleet/fuel` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 114 | `/fleet/fuel/create` | `/dashboard` | `audit/screenshots/fleet_fuel_create.png` | عند فتح `/fleet/fuel/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 115 | `/fleet/insurance` | `/dashboard` | `audit/screenshots/fleet_insurance.png` | عند فتح `/fleet/insurance` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 116 | `/fleet/insurance/create` | `/dashboard` | `audit/screenshots/fleet_insurance_create.png` | عند فتح `/fleet/insurance/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 117 | `/fleet/maintenance` | `/dashboard` | `audit/screenshots/fleet_maintenance.png` | عند فتح `/fleet/maintenance` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 118 | `/fleet/maintenance/create` | `/dashboard` | `audit/screenshots/fleet_maintenance_create.png` | عند فتح `/fleet/maintenance/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 119 | `/fleet/preventive-plans` | `/dashboard` | `audit/screenshots/fleet_preventive_plans.png` | عند فتح `/fleet/preventive-plans` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 120 | `/fleet/reports` | `/dashboard` | `audit/screenshots/fleet_reports.png` | عند فتح `/fleet/reports` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 121 | `/fleet/tco` | `/dashboard` | `audit/screenshots/fleet_tco.png` | عند فتح `/fleet/tco` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 122 | `/fleet/traffic-violations` | `/dashboard` | `audit/screenshots/fleet_traffic_violations.png` | عند فتح `/fleet/traffic-violations` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 123 | `/fleet/trips` | `/dashboard` | `audit/screenshots/fleet_trips.png` | عند فتح `/fleet/trips` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 124 | `/fleet/trips/create` | `/dashboard` | `audit/screenshots/fleet_trips_create.png` | عند فتح `/fleet/trips/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 125 | `/fleet/vehicles/create` | `/dashboard` | `audit/screenshots/fleet_vehicles_create.png` | عند فتح `/fleet/vehicles/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 126 | `/governance` | `/dashboard` | `audit/screenshots/governance.png` | عند فتح `/governance` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 127 | `/governance/audits` | `/dashboard` | `audit/screenshots/governance_audits.png` | عند فتح `/governance/audits` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 128 | `/governance/audits/create` | `/dashboard` | `audit/screenshots/governance_audits_create.png` | عند فتح `/governance/audits/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 129 | `/governance/capa` | `/dashboard` | `audit/screenshots/governance_capa.png` | عند فتح `/governance/capa` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 130 | `/governance/compliance` | `/dashboard` | `audit/screenshots/governance_compliance.png` | عند فتح `/governance/compliance` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 131 | `/governance/compliance/create` | `/dashboard` | `audit/screenshots/governance_compliance_create.png` | عند فتح `/governance/compliance/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 132 | `/governance/policies` | `/dashboard` | `audit/screenshots/governance_policies.png` | عند فتح `/governance/policies` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 133 | `/governance/policies/create` | `/dashboard` | `audit/screenshots/governance_policies_create.png` | عند فتح `/governance/policies/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 134 | `/governance/risks` | `/dashboard` | `audit/screenshots/governance_risks.png` | عند فتح `/governance/risks` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 135 | `/governance/risks/create` | `/dashboard` | `audit/screenshots/governance_risks_create.png` | عند فتح `/governance/risks/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 136 | `/guide/properties` | `/dashboard` | `audit/screenshots/guide_properties.png` | عند فتح `/guide/properties` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 137 | `/hr` | `/dashboard` | `audit/screenshots/hr.png` | عند فتح `/hr` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 138 | `/hr/attendance` | `/dashboard` | `audit/screenshots/hr_attendance.png` | عند فتح `/hr/attendance` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 139 | `/hr/attendance/create` | `/dashboard` | `audit/screenshots/hr_attendance_create.png` | عند فتح `/hr/attendance/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 140 | `/hr/attendance/field-tracking` | `/dashboard` | `audit/screenshots/hr_attendance_field_tracking.png` | عند فتح `/hr/attendance/field-tracking` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 141 | `/hr/attendance/qr-scanner` | `/dashboard` | `audit/screenshots/hr_attendance_qr_scanner.png` | عند فتح `/hr/attendance/qr-scanner` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 142 | `/hr/attendance/reports` | `/dashboard` | `audit/screenshots/hr_attendance_reports.png` | عند فتح `/hr/attendance/reports` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 143 | `/hr/contracts` | `/dashboard` | `audit/screenshots/hr_contracts.png` | عند فتح `/hr/contracts` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 144 | `/hr/contracts/create` | `/dashboard` | `audit/screenshots/hr_contracts_create.png` | عند فتح `/hr/contracts/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 145 | `/hr/development-plans` | `/dashboard` | `audit/screenshots/hr_development_plans.png` | عند فتح `/hr/development-plans;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 146 | `/hr/discipline/memos` | `/dashboard` | `audit/screenshots/hr_discipline_memos.png` | عند فتح `/hr/discipline/memos` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 147 | `/hr/discipline/regulation` | `/dashboard` | `audit/screenshots/hr_discipline_regulation.png` | عند فتح `/hr/discipline/regulation` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 148 | `/hr/employee-activation` | `/dashboard` | `audit/screenshots/hr_employee_activation.png` | عند فتح `/hr/employee-activation` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 149 | `/hr/evaluation-360` | `/dashboard` | `audit/screenshots/hr_evaluation_360.png` | عند فتح `/hr/evaluation-360` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 150 | `/hr/evaluation-360/create` | `/dashboard` | `audit/screenshots/hr_evaluation_360_create.png` | عند فتح `/hr/evaluation-360/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 151 | `/hr/excuse-requests` | `/dashboard` | `audit/screenshots/hr_excuse_requests.png` | عند فتح `/hr/excuse-requests` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 152 | `/hr/excuse-requests/create` | `/dashboard` | `audit/screenshots/hr_excuse_requests_create.png` | عند فتح `/hr/excuse-requests/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 153 | `/hr/exit` | `/dashboard` | `audit/screenshots/hr_exit.png` | عند فتح `/hr/exit` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 154 | `/hr/exit/create` | `/dashboard` | `audit/screenshots/hr_exit_create.png` | عند فتح `/hr/exit/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 155 | `/hr/expiring-documents` | `/dashboard` | `audit/screenshots/hr_expiring_documents.png` | عند فتح `/hr/expiring-documents` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 156 | `/hr/gratuity` | `/dashboard` | `audit/screenshots/hr_gratuity.png` | عند فتح `/hr/gratuity` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 157 | `/hr/idp` | `/dashboard` | `audit/screenshots/hr_idp.png` | عند فتح `/hr/idp` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 158 | `/hr/leaves` | `/dashboard` | `audit/screenshots/hr_leaves.png` | عند فتح `/hr/leaves` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 159 | `/hr/leaves/approval-chains` | `/dashboard` | `audit/screenshots/hr_leaves_approval_chains.png` | عند فتح `/hr/leaves/approval-chains` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 160 | `/hr/leaves/create` | `/dashboard` | `audit/screenshots/hr_leaves_create.png` | عند فتح `/hr/leaves/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 161 | `/hr/leaves/management` | `/dashboard` | `audit/screenshots/hr_leaves_management.png` | عند فتح `/hr/leaves/management` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 162 | `/hr/loans` | `/dashboard` | `audit/screenshots/hr_loans.png` | عند فتح `/hr/loans` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 163 | `/hr/loans/create` | `/dashboard` | `audit/screenshots/hr_loans_create.png` | عند فتح `/hr/loans/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 164 | `/hr/official-letters` | `/dashboard` | `audit/screenshots/hr_official_letters.png` | عند فتح `/hr/official-letters` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 165 | `/hr/onboarding-review` | `/dashboard` | `audit/screenshots/hr_onboarding_review.png` | عند فتح `/hr/onboarding-review` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 166 | `/hr/organization` | `/dashboard` | `audit/screenshots/hr_organization.png` | عند فتح `/hr/organization` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 167 | `/hr/organization/structure` | `/dashboard` | `audit/screenshots/hr_organization_structure.png` | عند فتح `/hr/organization/structure` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 168 | `/hr/overtime` | `/dashboard` | `audit/screenshots/hr_overtime.png` | عند فتح `/hr/overtime` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 169 | `/hr/overtime/create` | `/dashboard` | `audit/screenshots/hr_overtime_create.png` | عند فتح `/hr/overtime/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 170 | `/hr/payroll` | `/dashboard` | `audit/screenshots/hr_payroll.png` | عند فتح `/hr/payroll` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 171 | `/hr/payroll/create` | `/dashboard` | `audit/screenshots/hr_payroll_create.png` | عند فتح `/hr/payroll/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 172 | `/hr/payroll/salary-components` | `/dashboard` | `audit/screenshots/hr_payroll_salary_components.png` | عند فتح `/hr/payroll/salary-components` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 173 | `/hr/performance` | `/dashboard` | `audit/screenshots/hr_performance.png` | عند فتح `/hr/performance` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 174 | `/hr/performance/advanced` | `/dashboard` | `audit/screenshots/hr_performance_advanced.png` | عند فتح `/hr/performance/advanced` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 175 | `/hr/performance/create` | `/dashboard` | `audit/screenshots/hr_performance_create.png` | عند فتح `/hr/performance/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 176 | `/hr/public-holidays` | `/dashboard` | `audit/screenshots/hr_public_holidays.png` | عند فتح `/hr/public-holidays` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 177 | `/hr/recruitment` | `/dashboard` | `audit/screenshots/hr_recruitment.png` | عند فتح `/hr/recruitment` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 178 | `/hr/recruitment/advanced` | `/dashboard` | `audit/screenshots/hr_recruitment_advanced.png` | عند فتح `/hr/recruitment/advanced` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 179 | `/hr/recruitment/applicants/create` | `/dashboard` | `audit/screenshots/hr_recruitment_applicants_create.png` | عند فتح `/hr/recruitment/applicants/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 180 | `/hr/recruitment/applications` | `/dashboard` | `audit/screenshots/hr_recruitment_applications.png` | عند فتح `/hr/recruitment/applications` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 181 | `/hr/recruitment/create` | `/dashboard` | `audit/screenshots/hr_recruitment_create.png` | عند فتح `/hr/recruitment/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 182 | `/hr/shifts` | `/dashboard` | `audit/screenshots/hr_shifts.png` | عند فتح `/hr/shifts` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 183 | `/hr/shifts/create` | `/dashboard` | `audit/screenshots/hr_shifts_create.png` | عند فتح `/hr/shifts/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 184 | `/hr/shifts/management` | `/dashboard` | `audit/screenshots/hr_shifts_management.png` | عند فتح `/hr/shifts/management` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 185 | `/hr/training` | `/dashboard` | `audit/screenshots/hr_training.png` | عند فتح `/hr/training` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 186 | `/hr/training/advanced` | `/dashboard` | `audit/screenshots/hr_training_advanced.png` | عند فتح `/hr/training/advanced` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 187 | `/hr/training/create` | `/dashboard` | `audit/screenshots/hr_training_create.png` | عند فتح `/hr/training/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 188 | `/hr/transfers` | `/dashboard` | `audit/screenshots/hr_transfers.png` | عند فتح `/hr/transfers` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 189 | `/hr/turnover-report` | `/dashboard` | `audit/screenshots/hr_turnover_report.png` | عند فتح `/hr/turnover-report` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 190 | `/hr/violations` | `/dashboard` | `audit/screenshots/hr_violations.png` | عند فتح `/hr/violations` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 191 | `/hr/violations/auto-detection` | `/dashboard` | `audit/screenshots/hr_violations_auto_detection.png` | عند فتح `/hr/violations/auto-detection` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 192 | `/hr/violations/create` | `/dashboard` | `audit/screenshots/hr_violations_create.png` | عند فتح `/hr/violations/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 193 | `/hr/violations/management` | `/dashboard` | `audit/screenshots/hr_violations_management.png` | عند فتح `/hr/violations/management` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 194 | `/hr/violations/penalty-escalation` | `/dashboard` | `audit/screenshots/hr_violations_penalty_escalation.png` | عند فتح `/hr/violations/penalty-escalation` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 195 | `/insights` | `/dashboard` | `audit/screenshots/insights.png` | عند فتح `/insights` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 196 | `/intelligence` | `/dashboard` | `audit/screenshots/intelligence.png` | عند فتح `/intelligence` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 197 | `/legal` | `/dashboard` | `audit/screenshots/legal.png` | عند فتح `/legal` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 198 | `/legal/cases` | `/dashboard` | `audit/screenshots/legal_cases.png` | عند فتح `/legal/cases` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 199 | `/legal/cases/create` | `/dashboard` | `audit/screenshots/legal_cases_create.png` | عند فتح `/legal/cases/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 200 | `/legal/contracts` | `/dashboard` | `audit/screenshots/legal_contracts.png` | عند فتح `/legal/contracts` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 201 | `/legal/correspondence` | `/dashboard` | `audit/screenshots/legal_correspondence.png` | عند فتح `/legal/correspondence` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 202 | `/legal/create` | `/dashboard` | `audit/screenshots/legal_create.png` | عند فتح `/legal/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 203 | `/legal/documents` | `/dashboard` | `audit/screenshots/legal_documents.png` | عند فتح `/legal/documents` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 204 | `/legal/judgments` | `/dashboard` | `audit/screenshots/legal_judgments.png` | عند فتح `/legal/judgments` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 205 | `/legal/sessions` | `/dashboard` | `audit/screenshots/legal_sessions.png` | عند فتح `/legal/sessions` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 206 | `/manager-board` | `/dashboard` | `audit/screenshots/manager_board.png` | عند فتح `/manager-board` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 207 | `/marketing` | `/dashboard` | `audit/screenshots/marketing.png` | عند فتح `/marketing` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 208 | `/marketing/create` | `/dashboard` | `audit/screenshots/marketing_create.png` | عند فتح `/marketing/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 209 | `/module-dashboards` | `/dashboard` | `audit/screenshots/module_dashboards.png` | عند فتح `/module-dashboards` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 210 | `/my-attendance` | `/dashboard` | `audit/screenshots/my_attendance.png` | عند فتح `/my-attendance` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 211 | `/my-documents` | `/dashboard` | `audit/screenshots/my_documents.png` | عند فتح `/my-documents` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 212 | `/my-leave-request` | `/dashboard` | `audit/screenshots/my_leave_request.png` | عند فتح `/my-leave-request` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 213 | `/my-loans` | `/dashboard` | `audit/screenshots/my_loans.png` | عند فتح `/my-loans` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 214 | `/my-overtime` | `/dashboard` | `audit/screenshots/my_overtime.png` | عند فتح `/my-overtime` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 215 | `/my-payslip` | `/dashboard` | `audit/screenshots/my_payslip.png` | عند فتح `/my-payslip` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 216 | `/my-performance` | `/dashboard` | `audit/screenshots/my_performance.png` | عند فتح `/my-performance` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 217 | `/my-requests` | `/dashboard` | `audit/screenshots/my_requests.png` | عند فتح `/my-requests` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 218 | `/my-space` | `/dashboard` | `audit/screenshots/my_space.png` | عند فتح `/my-space` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 219 | `/notifications` | `/dashboard` | `audit/screenshots/notifications.png` | عند فتح `/notifications` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 220 | `/obligations` | `/dashboard` | `audit/screenshots/obligations.png` | عند فتح `/obligations` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 221 | `/operations-center` | `/dashboard` | `audit/screenshots/operations_center.png` | عند فتح `/operations-center` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 222 | `/projects` | `/dashboard` | `audit/screenshots/projects.png` | عند فتح `/projects` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 223 | `/projects/create` | `/dashboard` | `audit/screenshots/projects_create.png` | عند فتح `/projects/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 224 | `/projects/gantt` | `/dashboard` | `audit/screenshots/projects_gantt.png` | عند فتح `/projects/gantt` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 225 | `/projects/risks` | `/dashboard` | `audit/screenshots/projects_risks.png` | عند فتح `/projects/risks` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 226 | `/projects/tasks` | `/dashboard` | `audit/screenshots/projects_tasks.png` | عند فتح `/projects/tasks` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 227 | `/properties` | `/dashboard` | `audit/screenshots/properties.png` | عند فتح `/properties` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 228 | `/properties/buildings` | `/dashboard` | `audit/screenshots/properties_buildings.png` | عند فتح `/properties/buildings` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 229 | `/properties/buildings/create` | `/dashboard` | `audit/screenshots/properties_buildings_create.png` | عند فتح `/properties/buildings/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 230 | `/properties/contracts` | `/dashboard` | `audit/screenshots/properties_contracts.png` | عند فتح `/properties/contracts` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 231 | `/properties/contracts/create` | `/dashboard` | `audit/screenshots/properties_contracts_create.png` | عند فتح `/properties/contracts/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 232 | `/properties/create` | `/dashboard` | `audit/screenshots/properties_create.png` | عند فتح `/properties/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 233 | `/properties/dashboard` | `/dashboard` | `audit/screenshots/properties_dashboard.png` | عند فتح `/properties/dashboard` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 234 | `/properties/deposits` | `/dashboard` | `audit/screenshots/properties_deposits.png` | عند فتح `/properties/deposits` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 235 | `/properties/guide` | `/dashboard` | `audit/screenshots/properties_guide.png` | عند فتح `/properties/guide` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 236 | `/properties/inspections` | `/dashboard` | `audit/screenshots/properties_inspections.png` | عند فتح `/properties/inspections` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 237 | `/properties/maintenance` | `/dashboard` | `audit/screenshots/properties_maintenance.png` | عند فتح `/properties/maintenance` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 238 | `/properties/maintenance/create` | `/dashboard` | `audit/screenshots/properties_maintenance_create.png` | عند فتح `/properties/maintenance/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 239 | `/properties/occupancy-report` | `/dashboard` | `audit/screenshots/properties_occupancy_report.png` | عند فتح `/properties/occupancy-report` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 240 | `/properties/owners` | `/dashboard` | `audit/screenshots/properties_owners.png` | عند فتح `/properties/owners` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 241 | `/properties/owners/create` | `/dashboard` | `audit/screenshots/properties_owners_create.png` | عند فتح `/properties/owners/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 242 | `/properties/payments` | `/dashboard` | `audit/screenshots/properties_payments.png` | عند فتح `/properties/payments` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 243 | `/properties/tenants` | `/dashboard` | `audit/screenshots/properties_tenants.png` | عند فتح `/properties/tenants` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 244 | `/properties/tenants/create` | `/dashboard` | `audit/screenshots/properties_tenants_create.png` | عند فتح `/properties/tenants/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 245 | `/reports/scheduled` | `/dashboard` | `audit/screenshots/reports_scheduled.png` | عند فتح `/reports/scheduled` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 246 | `/requests` | `/dashboard` | `audit/screenshots/requests.png` | عند فتح `/requests` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 247 | `/requests/create` | `/dashboard` | `audit/screenshots/requests_create.png` | عند فتح `/requests/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 248 | `/requests/types` | `/dashboard` | `audit/screenshots/requests_types.png` | عند فتح `/requests/types` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 249 | `/requests/types/create` | `/dashboard` | `audit/screenshots/requests_types_create.png` | عند فتح `/requests/types/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 250 | `/requests/workflows` | `/dashboard` | `audit/screenshots/requests_workflows.png` | عند فتح `/requests/workflows` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 251 | `/settings` | `/dashboard` | `audit/screenshots/settings.png` | عند فتح `/settings` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 252 | `/settings/audit-log` | `/dashboard` | `audit/screenshots/settings_audit_log.png` | عند فتح `/settings/audit-log` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 253 | `/settings/branches` | `/dashboard` | `audit/screenshots/settings_branches.png` | عند فتح `/settings/branches` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 254 | `/settings/companies` | `/dashboard` | `audit/screenshots/settings_companies.png` | عند فتح `/settings/companies` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 255 | `/settings/departments` | `/dashboard` | `audit/screenshots/settings_departments.png` | عند فتح `/settings/departments` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 256 | `/settings/rules` | `/dashboard` | `audit/screenshots/settings_rules.png` | عند فتح `/settings/rules` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 257 | `/store` | `/dashboard` | `audit/screenshots/store.png` | عند فتح `/store` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 258 | `/store/orders` | `/dashboard` | `audit/screenshots/store_orders.png` | عند فتح `/store/orders` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 259 | `/store/orders/create` | `/dashboard` | `audit/screenshots/store_orders_create.png` | عند فتح `/store/orders/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 260 | `/store/products/create` | `/dashboard` | `audit/screenshots/store_products_create.png` | عند فتح `/store/products/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 261 | `/support` | `/dashboard` | `audit/screenshots/support.png` | عند فتح `/support` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 262 | `/support/create` | `/dashboard` | `audit/screenshots/support_create.png` | عند فتح `/support/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 263 | `/support/kb` | `/dashboard` | `audit/screenshots/support_kb.png` | عند فتح `/support/kb` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 264 | `/support/replies` | `/dashboard` | `audit/screenshots/support_replies.png` | عند فتح `/support/replies` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 265 | `/tasks` | `/dashboard` | `audit/screenshots/tasks.png` | عند فتح `/tasks` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 266 | `/tasks/create` | `/dashboard` | `audit/screenshots/tasks_create.png` | عند فتح `/tasks/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 267 | `/umrah` | `/dashboard` | `audit/screenshots/umrah.png` | عند فتح `/umrah` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 268 | `/umrah/agents` | `/dashboard` | `audit/screenshots/umrah_agents.png` | عند فتح `/umrah/agents` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 269 | `/umrah/commission-plans` | `/dashboard` | `audit/screenshots/umrah_commission_plans.png` | عند فتح `/umrah/commission-plans` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 270 | `/umrah/commission-plans/new` | `/dashboard` | `audit/screenshots/umrah_commission_plans_new.png` | عند فتح `/umrah/commission-plans/new` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 271 | `/umrah/import` | `/dashboard` | `audit/screenshots/umrah_import.png` | عند فتح `/umrah/import` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 272 | `/umrah/import/legacy` | `/dashboard` | `audit/screenshots/umrah_import_legacy.png` | عند فتح `/umrah/import/legacy` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 273 | `/umrah/invoices` | `/dashboard` | `audit/screenshots/umrah_invoices.png` | عند فتح `/umrah/invoices` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 274 | `/umrah/packages` | `/dashboard` | `audit/screenshots/umrah_packages.png` | عند فتح `/umrah/packages` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 275 | `/umrah/penalties` | `/dashboard` | `audit/screenshots/umrah_penalties.png` | عند فتح `/umrah/penalties` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 276 | `/umrah/pilgrims` | `/dashboard` | `audit/screenshots/umrah_pilgrims.png` | عند فتح `/umrah/pilgrims` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 277 | `/umrah/pilgrims/create` | `/dashboard` | `audit/screenshots/umrah_pilgrims_create.png` | عند فتح `/umrah/pilgrims/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 278 | `/umrah/pricing` | `/dashboard` | `audit/screenshots/umrah_pricing.png` | عند فتح `/umrah/pricing` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 279 | `/umrah/seasons` | `/dashboard` | `audit/screenshots/umrah_seasons.png` | عند فتح `/umrah/seasons` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 280 | `/umrah/sub-agents` | `/dashboard` | `audit/screenshots/umrah_sub_agents.png` | عند فتح `/umrah/sub-agents` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 281 | `/umrah/transport` | `/dashboard` | `audit/screenshots/umrah_transport.png` | عند فتح `/umrah/transport` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 282 | `/umrah/violations` | `/dashboard` | `audit/screenshots/umrah_violations.png` | عند فتح `/umrah/violations` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 283 | `/warehouse` | `/dashboard` | `audit/screenshots/warehouse.png` | عند فتح `/warehouse` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 284 | `/warehouse/categories` | `/dashboard` | `audit/screenshots/warehouse_categories.png` | عند فتح `/warehouse/categories` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 285 | `/warehouse/categories/create` | `/dashboard` | `audit/screenshots/warehouse_categories_create.png` | عند فتح `/warehouse/categories/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 286 | `/warehouse/create` | `/dashboard` | `audit/screenshots/warehouse_create.png` | عند فتح `/warehouse/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 287 | `/warehouse/inventory-count` | `/dashboard` | `audit/screenshots/warehouse_inventory_count.png` | عند فتح `/warehouse/inventory-count` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 288 | `/warehouse/movements` | `/dashboard` | `audit/screenshots/warehouse_movements.png` | عند فتح `/warehouse/movements` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 289 | `/warehouse/movements/create` | `/dashboard` | `audit/screenshots/warehouse_movements_create.png` | عند فتح `/warehouse/movements/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 290 | `/warehouse/suppliers` | `/dashboard` | `audit/screenshots/warehouse_suppliers.png` | عند فتح `/warehouse/suppliers` مباشرة يُعاد التوجيه إلى `/dashboard` |
| 291 | `/warehouse/suppliers/create` | `/dashboard` | `audit/screenshots/warehouse_suppliers_create.png` | عند فتح `/warehouse/suppliers/create;` مباشرة يُعاد التوجيه إلى `/dashboard` |

### Class K — مسار `:id` لم يُحلَّ لأن قائمة المصدر فارغة أو غير موجودة (SKIP, 81 routes)

These are not bugs in the route itself — they could not be probed because the source list returned 404 or had no rows. Listed for completeness so the auditor can see why they were skipped.

| # | Route | Reason |
|---|-------|--------|
| 1 | `/correspondence/:id` | unresolved: no row in /api/correspondence |
| 2 | `/crm/:id` | unresolved: /api/crm/leads → 404 |
| 3 | `/crm/leads/:id` | unresolved: /api/crm/leads → 404 |
| 4 | `/finance/bank-reconciliation/manual-match/:batchId/:rowId` | unresolved: no id resolver for /finance/bank-reconciliation/manual-match/:batchId/:rowId |
| 5 | `/finance/budget/:id` | unresolved: no row in /api/finance/budget |
| 6 | `/finance/commitments/:id` | unresolved: no row in /api/finance/commitments |
| 7 | `/finance/custodies/:id` | unresolved: no row in /api/finance/custodies |
| 8 | `/finance/expenses/:id` | unresolved: no row in /api/finance/expenses |
| 9 | `/finance/financial-requests/:id` | unresolved: no row in /api/finance/financial-requests |
| 10 | `/finance/fixed-assets/:id` | unresolved: no row in /api/finance/fixed-assets |
| 11 | `/finance/journal-manual/:id` | unresolved: no row in /api/finance/journal-manual |
| 12 | `/finance/ledger/:code` | unresolved: no id resolver for /finance/ledger/:code |
| 13 | `/finance/project-costing/:id` | unresolved: no id resolver for /finance/project-costing/:id |
| 14 | `/finance/purchase-orders/:id` | unresolved: no row in /api/finance/purchase-orders |
| 15 | `/finance/recurring-journals/:id` | unresolved: no row in /api/finance/recurring-journals |
| 16 | `/finance/salary-advances/:id` | unresolved: no row in /api/finance/salary-advances |
| 17 | `/finance/vouchers/:id` | unresolved: no row in /api/finance/vouchers |
| 18 | `/fleet/drivers/:id` | unresolved: /api/fleet/drivers → 401 |
| 19 | `/fleet/fuel/:id` | unresolved: /api/fleet/fuel-logs → 401 |
| 20 | `/fleet/insurance/:id` | unresolved: /api/fleet/insurance → 401 |
| 21 | `/fleet/maintenance/:id` | unresolved: /api/fleet/maintenance → 401 |
| 22 | `/fleet/traffic-violations/:id` | unresolved: /api/fleet/traffic-violations → 401 |
| 23 | `/fleet/trips/:id` | unresolved: /api/fleet/trips → 401 |
| 24 | `/governance/audits/:id` | unresolved: /api/governance/audits → 401 |
| 25 | `/governance/compliance/:id` | unresolved: /api/governance/compliance → 401 |
| 26 | `/governance/policies/:id` | unresolved: /api/governance/policies → 401 |
| 27 | `/governance/risks/:id` | unresolved: /api/governance/risks → 401 |
| 28 | `/hr/attendance/:id` | unresolved: /api/hr/attendance → 401 |
| 29 | `/hr/contracts/:id` | unresolved: /api/hr/contracts → 401 |
| 30 | `/hr/discipline/memos/:id` | unresolved: no id resolver for /hr/discipline/memos/:id |
| 31 | `/hr/employee-profile/:id` | unresolved: no id resolver for /hr/employee-profile/:id |
| 32 | `/hr/evaluation-360/:id` | unresolved: /api/hr/evaluation-360 → 401 |
| 33 | `/hr/evaluation-360/:id/peer` | unresolved: /api/hr/evaluation-360 → 401 |
| 34 | `/hr/evaluation-360/:id/upward` | unresolved: /api/hr/evaluation-360 → 401 |
| 35 | `/hr/evaluation-360/history/:employeeId` | unresolved: /api/hr/evaluation-360 → 401 |
| 36 | `/hr/excuse-requests/:id` | unresolved: /api/hr/excuse-requests → 401 |
| 37 | `/hr/exit/:id` | unresolved: /api/hr/exit → 401 |
| 38 | `/hr/leaves/:id` | unresolved: /api/hr/leaves → 401 |
| 39 | `/hr/loans/:id` | unresolved: /api/hr/loans → 401 |
| 40 | `/hr/overtime/:id` | unresolved: /api/hr/overtime → 401 |
| 41 | `/hr/payroll/:id` | unresolved: /api/hr/payroll → 401 |
| 42 | `/hr/performance/:id` | unresolved: /api/hr/performance → 401 |
| 43 | `/hr/recruitment/jobs/:id` | unresolved: /api/hr/recruitment → 401 |
| 44 | `/hr/shifts/:id` | unresolved: no id resolver for /hr/shifts/:id |
| 45 | `/hr/training/:id` | unresolved: /api/hr/training → 401 |
| 46 | `/hr/transfers/:id` | unresolved: /api/hr/transfers → 401 |
| 47 | `/hr/violations/:id` | unresolved: /api/hr/violations → 401 |
| 48 | `/legal/cases/:id` | unresolved: /api/legal/cases → 401 |
| 49 | `/legal/contracts/:id` | unresolved: /api/legal/contracts → 401 |
| 50 | `/legal/judgments/:id` | unresolved: /api/legal/judgments → 401 |
| 51 | `/legal/sessions/:id` | unresolved: /api/legal/sessions → 401 |
| 52 | `/projects/:id` | unresolved: no id resolver for /projects/:id |
| 53 | `/properties/:id` | unresolved: /api/properties/units → 401 |
| 54 | `/properties/:id/status` | unresolved: /api/properties/units → 401 |
| 55 | `/properties/buildings/:id` | unresolved: /api/properties/buildings → 401 |
| 56 | `/properties/contracts/:contractId/pay/:installmentId` | unresolved: /api/properties/contracts → 401 |
| 57 | `/properties/contracts/:id` | unresolved: /api/properties/contracts → 401 |
| 58 | `/properties/maintenance/:id` | unresolved: /api/properties/units → 401 |
| 59 | `/properties/owners/:id` | unresolved: /api/properties/owners → 401 |
| 60 | `/properties/owners/:id/edit` | unresolved: /api/properties/owners → 401 |
| 61 | `/properties/payments/:id` | unresolved: /api/properties/units → 401 |
| 62 | `/properties/payments/:paymentId/pay` | unresolved: /api/properties/units → 401 |
| 63 | `/properties/tenants/:id` | unresolved: /api/properties/tenants → 401 |
| 64 | `/requests/:id` | unresolved: no id resolver for /requests/:id |
| 65 | `/store/orders/:id` | unresolved: no id resolver for /store/orders/:id |
| 66 | `/store/products/:id` | unresolved: no id resolver for /store/products/:id |
| 67 | `/support/:id` | unresolved: no id resolver for /support/:id |
| 68 | `/tasks/:id` | unresolved: no id resolver for /tasks/:id |
| 69 | `/umrah/agents/:id` | unresolved: /api/umrah/agents → 401 |
| 70 | `/umrah/commission-plans/:id/edit` | unresolved: /api/umrah/commission-plans → 401 |
| 71 | `/umrah/invoices/:id` | unresolved: no id resolver for /umrah/invoices/:id |
| 72 | `/umrah/packages/:id` | unresolved: /api/umrah/packages → 401 |
| 73 | `/umrah/penalties/:id` | unresolved: no id resolver for /umrah/penalties/:id |
| 74 | `/umrah/pilgrims/:id` | unresolved: no id resolver for /umrah/pilgrims/:id |
| 75 | `/umrah/seasons/:id` | unresolved: /api/umrah/seasons → 401 |
| 76 | `/umrah/transport/:id` | unresolved: /api/umrah/transport → 401 |
| 77 | `/umrah/violations/:id` | unresolved: /api/umrah/violations → 401 |
| 78 | `/warehouse/categories/:id` | unresolved: /api/warehouse/categories → 401 |
| 79 | `/warehouse/movements/:id` | unresolved: /api/warehouse/movements → 401 |
| 80 | `/warehouse/products/:id` | unresolved: /api/warehouse/products → 401 |
| 81 | `/warehouse/suppliers/:id` | unresolved: /api/warehouse/suppliers → 401 |

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
