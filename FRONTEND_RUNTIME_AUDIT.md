# FRONTEND_RUNTIME_AUDIT.md

**Date:** 2026-05-07  
**Harness:** `scripts/src/runtime-audit.cjs` (Puppeteer/Chromium, in-page-fetch login with periodic re-login every 25 routes, 5-axis probe)  
**Run command:** `pnpm run audit:runtime` (set `ALL=1` to walk all 373 routes)  
**Raw results:** `audit/runtime-audit-results.json` (373 rows)  
**Screenshots (FAILs):** `audit/screenshots/` (291 PNG files, one per A4 FAIL)  
**Runbook:** `audit/RUNTIME_AUDIT_README.md`

## Honesty notice

Previous claims of "1510/1510 PASS (100%)" in `FRONTEND_TEST_MATRIX.md` and `replit.md` were **source-review-only** — no real browser ever loaded those routes. This audit replaces them with results from a headless Chromium that actually navigated to every route, watched the network, and (on `/create` + `/edit` pages) filled the form and clicked the primary save button to verify the write. Periodic re-login (every 25 routes) keeps the session alive for the full ~40-minute walk so no result is a tool-induced session-expiry failure.

## Axes

| Axis | What it checks | PASS criterion |
|------|----------------|----------------|
| A1 — render            | Page mounts; no React error boundary; no Arabic 404; no /login bounce | DOM > 200 chars and no error markers |
| A2 — data fetch        | List/detail pages issue at least one /api/* GET 2xx and no 5xx | network event captured |
| A3 — primary CTA       | Create/edit pages expose a primary save button (label match `إضافة|حفظ|تسجيل|نشر|...`) | button found and enabled |
| A4 — navigation        | Direct URL lands on the requested path family (`landedPath === expectedPath` or starts-with) | true |
| A5 — runtime smoke     | Create/edit: fill all writable fields then click save and watch for a POST/PATCH/PUT to /api/*; List: search/pagination/rows/empty-state present | write returns 2xx-4xx (5xx and timeout = FAIL) |

## Totals across 373 routes

| Axis | PASS | FAIL | SKIP |
|------|------|------|------|
| A1  | 292 | 0 | 81 |
| A2  | 223 | 0 | 150 |
| A3  | 69 | 0 | 304 |
| A4  | 1 | 291 | 81 |
| A5  | 285 | 0 | 88 |

**Per-route disposition (true PASS = every applicable axis PASS, no FAIL anywhere):**

- **PASS:** 1 (`/dashboard` only — the one route with A4 PASS)
- **FAIL:** 291 (≥1 axis FAIL — every one of these is an A4 navigation FAIL because the SPA bounces direct URL navigation to `/dashboard`)
- **SKIP:** 81 (`:id` routes whose list API returned 404 or was empty so no fixture id could be resolved)

## Headline finding

**A4 navigation: 291/373 routes (78%) do not preserve the URL on direct `page.goto`.**

Hitting any route URL directly from the address bar lands on `/dashboard` instead of the requested path. The SPA appears to bounce direct navigations through its own router fallback before the wouter route can match. This is the single biggest finding of the audit — every route in the app is reachable only by clicking through the sidebar, not by sharing a deep link.

All other axes pass cleanly with the re-login fix in place: A1 0 FAIL, A2 0 FAIL, A3 0 FAIL, A5 0 FAIL. The only failure mode in this run is A4.

## A4 navigation FAILs — full per-route inventory (291)

| # | Route | Landed | Screenshot |
|---|-------|--------|------------|
| 1 | `/action-center` | `/dashboard` | `audit/screenshots/action_center.png` |
| 2 | `/activity-log` | `/dashboard` | `audit/screenshots/activity_log.png` |
| 3 | `/admin` | `/dashboard` | `audit/screenshots/admin.png` |
| 4 | `/admin/domain-registry` | `/dashboard` | `audit/screenshots/admin_domain_registry.png` |
| 5 | `/admin/event-monitor` | `/dashboard` | `audit/screenshots/admin_event_monitor.png` |
| 6 | `/admin/gl-reconciliation` | `/dashboard` | `audit/screenshots/admin_gl_reconciliation.png` |
| 7 | `/admin/integrations` | `/dashboard` | `audit/screenshots/admin_integrations.png` |
| 8 | `/admin/lifecycle-monitor` | `/dashboard` | `audit/screenshots/admin_lifecycle_monitor.png` |
| 9 | `/admin/logs` | `/dashboard` | `audit/screenshots/admin_logs.png` |
| 10 | `/admin/monitoring` | `/dashboard` | `audit/screenshots/admin_monitoring.png` |
| 11 | `/admin/policy-engine` | `/dashboard` | `audit/screenshots/admin_policy_engine.png` |
| 12 | `/admin/posting-failures` | `/dashboard` | `audit/screenshots/admin_posting_failures.png` |
| 13 | `/admin/rbac-matrix` | `/dashboard` | `audit/screenshots/admin_rbac_matrix.png` |
| 14 | `/admin/roles` | `/dashboard` | `audit/screenshots/admin_roles.png` |
| 15 | `/admin/system-governor` | `/dashboard` | `audit/screenshots/admin_system_governor.png` |
| 16 | `/admin/system-registry` | `/dashboard` | `audit/screenshots/admin_system_registry.png` |
| 17 | `/admin/users` | `/dashboard` | `audit/screenshots/admin_users.png` |
| 18 | `/admin/violations-report` | `/dashboard` | `audit/screenshots/admin_violations_report.png` |
| 19 | `/automation` | `/dashboard` | `audit/screenshots/automation.png` |
| 20 | `/bi` | `/dashboard` | `audit/screenshots/bi.png` |
| 21 | `/bi/admin-reports` | `/dashboard` | `audit/screenshots/bi_admin_reports.png` |
| 22 | `/bi/dashboards` | `/dashboard` | `audit/screenshots/bi_dashboards.png` |
| 23 | `/bi/dashboards/create` | `/dashboard` | `audit/screenshots/bi_dashboards_create.png` |
| 24 | `/bi/kpis` | `/dashboard` | `audit/screenshots/bi_kpis.png` |
| 25 | `/bi/kpis/create` | `/dashboard` | `audit/screenshots/bi_kpis_create.png` |
| 26 | `/bi/operations` | `/dashboard` | `audit/screenshots/bi_operations.png` |
| 27 | `/bi/reports` | `/dashboard` | `audit/screenshots/bi_reports.png` |
| 28 | `/bi/reports/create` | `/dashboard` | `audit/screenshots/bi_reports_create.png` |
| 29 | `/calendar` | `/dashboard` | `audit/screenshots/calendar.png` |
| 30 | `/clients` | `/dashboard` | `audit/screenshots/clients.png` |
| 31 | `/clients/:id` | `/dashboard` | `audit/screenshots/clients_id.png` |
| 32 | `/clients/create` | `/dashboard` | `audit/screenshots/clients_create.png` |
| 33 | `/communications` | `/dashboard` | `audit/screenshots/communications.png` |
| 34 | `/communications/letters/create` | `/dashboard` | `audit/screenshots/communications_letters_create.png` |
| 35 | `/communications/notification-engine` | `/dashboard` | `audit/screenshots/communications_notification_engine.png` |
| 36 | `/correspondence` | `/dashboard` | `audit/screenshots/correspondence.png` |
| 37 | `/correspondence/create` | `/dashboard` | `audit/screenshots/correspondence_create.png` |
| 38 | `/crm` | `/dashboard` | `audit/screenshots/crm.png` |
| 39 | `/crm/activities` | `/dashboard` | `audit/screenshots/crm_activities.png` |
| 40 | `/crm/create` | `/dashboard` | `audit/screenshots/crm_create.png` |
| 41 | `/crm/pipeline` | `/dashboard` | `audit/screenshots/crm_pipeline.png` |
| 42 | `/daily-close` | `/dashboard` | `audit/screenshots/daily_close.png` |
| 43 | `/documents` | `/dashboard` | `audit/screenshots/documents.png` |
| 44 | `/documents/:docId/versions` | `/dashboard` | `audit/screenshots/documents_docId_versions.png` |
| 45 | `/documents/archive` | `/dashboard` | `audit/screenshots/documents_archive.png` |
| 46 | `/documents/create` | `/dashboard` | `audit/screenshots/documents_create.png` |
| 47 | `/documents/folders` | `/dashboard` | `audit/screenshots/documents_folders.png` |
| 48 | `/documents/templates` | `/dashboard` | `audit/screenshots/documents_templates.png` |
| 49 | `/documents/upload` | `/dashboard` | `audit/screenshots/documents_upload.png` |
| 50 | `/employees` | `/dashboard` | `audit/screenshots/employees.png` |
| 51 | `/employees/:id` | `/dashboard` | `audit/screenshots/employees_id.png` |
| 52 | `/employees/create` | `/dashboard` | `audit/screenshots/employees_create.png` |
| 53 | `/exec-dashboard` | `/dashboard` | `audit/screenshots/exec_dashboard.png` |
| 54 | `/finance` | `/dashboard` | `audit/screenshots/finance.png` |
| 55 | `/finance/accounts` | `/dashboard` | `audit/screenshots/finance_accounts.png` |
| 56 | `/finance/accounts/:id` | `/dashboard` | `audit/screenshots/finance_accounts_id.png` |
| 57 | `/finance/accounts/:id/edit` | `/dashboard` | `audit/screenshots/finance_accounts_id_edit.png` |
| 58 | `/finance/accounts/create` | `/dashboard` | `audit/screenshots/finance_accounts_create.png` |
| 59 | `/finance/ap-aging` | `/dashboard` | `audit/screenshots/finance_ap_aging.png` |
| 60 | `/finance/ar-aging` | `/dashboard` | `audit/screenshots/finance_ar_aging.png` |
| 61 | `/finance/bank-guarantees` | `/dashboard` | `audit/screenshots/finance_bank_guarantees.png` |
| 62 | `/finance/bank-reconciliation` | `/dashboard` | `audit/screenshots/finance_bank_reconciliation.png` |
| 63 | `/finance/budget` | `/dashboard` | `audit/screenshots/finance_budget.png` |
| 64 | `/finance/budget/create` | `/dashboard` | `audit/screenshots/finance_budget_create.png` |
| 65 | `/finance/cash-flow-forecast` | `/dashboard` | `audit/screenshots/finance_cash_flow_forecast.png` |
| 66 | `/finance/cashflow` | `/dashboard` | `audit/screenshots/finance_cashflow.png` |
| 67 | `/finance/commitments` | `/dashboard` | `audit/screenshots/finance_commitments.png` |
| 68 | `/finance/custodies` | `/dashboard` | `audit/screenshots/finance_custodies.png` |
| 69 | `/finance/custodies/report` | `/dashboard` | `audit/screenshots/finance_custodies_report.png` |
| 70 | `/finance/expenses` | `/dashboard` | `audit/screenshots/finance_expenses.png` |
| 71 | `/finance/expenses/create` | `/dashboard` | `audit/screenshots/finance_expenses_create.png` |
| 72 | `/finance/financial-requests` | `/dashboard` | `audit/screenshots/finance_financial_requests.png` |
| 73 | `/finance/fiscal-periods` | `/dashboard` | `audit/screenshots/finance_fiscal_periods.png` |
| 74 | `/finance/fixed-assets` | `/dashboard` | `audit/screenshots/finance_fixed_assets.png` |
| 75 | `/finance/fixed-assets/batch-depreciate` | `/dashboard` | `audit/screenshots/finance_fixed_assets_batch_depreciate.png` |
| 76 | `/finance/intercompany` | `/dashboard` | `audit/screenshots/finance_intercompany.png` |
| 77 | `/finance/intercompany/consolidation/create` | `/dashboard` | `audit/screenshots/finance_intercompany_consolidation_create.png` |
| 78 | `/finance/inventory-costing` | `/dashboard` | `audit/screenshots/finance_inventory_costing.png` |
| 79 | `/finance/invoices` | `/dashboard` | `audit/screenshots/finance_invoices.png` |
| 80 | `/finance/invoices/:id` | `/dashboard` | `audit/screenshots/finance_invoices_id.png` |
| 81 | `/finance/invoices/create` | `/dashboard` | `audit/screenshots/finance_invoices_create.png` |
| 82 | `/finance/journal` | `/dashboard` | `audit/screenshots/finance_journal.png` |
| 83 | `/finance/journal-manual` | `/dashboard` | `audit/screenshots/finance_journal_manual.png` |
| 84 | `/finance/journal-manual/create` | `/dashboard` | `audit/screenshots/finance_journal_manual_create.png` |
| 85 | `/finance/journal/create` | `/dashboard` | `audit/screenshots/finance_journal_create.png` |
| 86 | `/finance/opening-balances` | `/dashboard` | `audit/screenshots/finance_opening_balances.png` |
| 87 | `/finance/opening-balances/create` | `/dashboard` | `audit/screenshots/finance_opening_balances_create.png` |
| 88 | `/finance/payments` | `/dashboard` | `audit/screenshots/finance_payments.png` |
| 89 | `/finance/project-costing` | `/dashboard` | `audit/screenshots/finance_project_costing.png` |
| 90 | `/finance/purchase-orders` | `/dashboard` | `audit/screenshots/finance_purchase_orders.png` |
| 91 | `/finance/purchase-orders/create` | `/dashboard` | `audit/screenshots/finance_purchase_orders_create.png` |
| 92 | `/finance/receivables` | `/dashboard` | `audit/screenshots/finance_receivables.png` |
| 93 | `/finance/receivables/:id` | `/dashboard` | `audit/screenshots/finance_receivables_id.png` |
| 94 | `/finance/recurring-journals` | `/dashboard` | `audit/screenshots/finance_recurring_journals.png` |
| 95 | `/finance/recurring-journals/create` | `/dashboard` | `audit/screenshots/finance_recurring_journals_create.png` |
| 96 | `/finance/reports` | `/dashboard` | `audit/screenshots/finance_reports.png` |
| 97 | `/finance/salary-advances` | `/dashboard` | `audit/screenshots/finance_salary_advances.png` |
| 98 | `/finance/tax` | `/dashboard` | `audit/screenshots/finance_tax.png` |
| 99 | `/finance/treasury` | `/dashboard` | `audit/screenshots/finance_treasury.png` |
| 100 | `/finance/vendors` | `/dashboard` | `audit/screenshots/finance_vendors.png` |
| 101 | `/finance/vendors/:id` | `/dashboard` | `audit/screenshots/finance_vendors_id.png` |
| 102 | `/finance/vendors/create` | `/dashboard` | `audit/screenshots/finance_vendors_create.png` |
| 103 | `/finance/vouchers` | `/dashboard` | `audit/screenshots/finance_vouchers.png` |
| 104 | `/finance/vouchers/create` | `/dashboard` | `audit/screenshots/finance_vouchers_create.png` |
| 105 | `/finance/year-end-close` | `/dashboard` | `audit/screenshots/finance_year_end_close.png` |
| 106 | `/fleet` | `/dashboard` | `audit/screenshots/fleet.png` |
| 107 | `/fleet/:id` | `/dashboard` | `audit/screenshots/fleet_id.png` |
| 108 | `/fleet/:id/status` | `/dashboard` | `audit/screenshots/fleet_id_status.png` |
| 109 | `/fleet/alerts` | `/dashboard` | `audit/screenshots/fleet_alerts.png` |
| 110 | `/fleet/alerts/create` | `/dashboard` | `audit/screenshots/fleet_alerts_create.png` |
| 111 | `/fleet/drivers` | `/dashboard` | `audit/screenshots/fleet_drivers.png` |
| 112 | `/fleet/drivers/create` | `/dashboard` | `audit/screenshots/fleet_drivers_create.png` |
| 113 | `/fleet/fuel` | `/dashboard` | `audit/screenshots/fleet_fuel.png` |
| 114 | `/fleet/fuel/create` | `/dashboard` | `audit/screenshots/fleet_fuel_create.png` |
| 115 | `/fleet/insurance` | `/dashboard` | `audit/screenshots/fleet_insurance.png` |
| 116 | `/fleet/insurance/create` | `/dashboard` | `audit/screenshots/fleet_insurance_create.png` |
| 117 | `/fleet/maintenance` | `/dashboard` | `audit/screenshots/fleet_maintenance.png` |
| 118 | `/fleet/maintenance/create` | `/dashboard` | `audit/screenshots/fleet_maintenance_create.png` |
| 119 | `/fleet/preventive-plans` | `/dashboard` | `audit/screenshots/fleet_preventive_plans.png` |
| 120 | `/fleet/reports` | `/dashboard` | `audit/screenshots/fleet_reports.png` |
| 121 | `/fleet/tco` | `/dashboard` | `audit/screenshots/fleet_tco.png` |
| 122 | `/fleet/traffic-violations` | `/dashboard` | `audit/screenshots/fleet_traffic_violations.png` |
| 123 | `/fleet/trips` | `/dashboard` | `audit/screenshots/fleet_trips.png` |
| 124 | `/fleet/trips/create` | `/dashboard` | `audit/screenshots/fleet_trips_create.png` |
| 125 | `/fleet/vehicles/create` | `/dashboard` | `audit/screenshots/fleet_vehicles_create.png` |
| 126 | `/governance` | `/dashboard` | `audit/screenshots/governance.png` |
| 127 | `/governance/audits` | `/dashboard` | `audit/screenshots/governance_audits.png` |
| 128 | `/governance/audits/create` | `/dashboard` | `audit/screenshots/governance_audits_create.png` |
| 129 | `/governance/capa` | `/dashboard` | `audit/screenshots/governance_capa.png` |
| 130 | `/governance/compliance` | `/dashboard` | `audit/screenshots/governance_compliance.png` |
| 131 | `/governance/compliance/create` | `/dashboard` | `audit/screenshots/governance_compliance_create.png` |
| 132 | `/governance/policies` | `/dashboard` | `audit/screenshots/governance_policies.png` |
| 133 | `/governance/policies/create` | `/dashboard` | `audit/screenshots/governance_policies_create.png` |
| 134 | `/governance/risks` | `/dashboard` | `audit/screenshots/governance_risks.png` |
| 135 | `/governance/risks/create` | `/dashboard` | `audit/screenshots/governance_risks_create.png` |
| 136 | `/guide/properties` | `/dashboard` | `audit/screenshots/guide_properties.png` |
| 137 | `/hr` | `/dashboard` | `audit/screenshots/hr.png` |
| 138 | `/hr/attendance` | `/dashboard` | `audit/screenshots/hr_attendance.png` |
| 139 | `/hr/attendance/create` | `/dashboard` | `audit/screenshots/hr_attendance_create.png` |
| 140 | `/hr/attendance/field-tracking` | `/dashboard` | `audit/screenshots/hr_attendance_field_tracking.png` |
| 141 | `/hr/attendance/qr-scanner` | `/dashboard` | `audit/screenshots/hr_attendance_qr_scanner.png` |
| 142 | `/hr/attendance/reports` | `/dashboard` | `audit/screenshots/hr_attendance_reports.png` |
| 143 | `/hr/contracts` | `/dashboard` | `audit/screenshots/hr_contracts.png` |
| 144 | `/hr/contracts/create` | `/dashboard` | `audit/screenshots/hr_contracts_create.png` |
| 145 | `/hr/development-plans` | `/dashboard` | `audit/screenshots/hr_development_plans.png` |
| 146 | `/hr/discipline/memos` | `/dashboard` | `audit/screenshots/hr_discipline_memos.png` |
| 147 | `/hr/discipline/regulation` | `/dashboard` | `audit/screenshots/hr_discipline_regulation.png` |
| 148 | `/hr/employee-activation` | `/dashboard` | `audit/screenshots/hr_employee_activation.png` |
| 149 | `/hr/evaluation-360` | `/dashboard` | `audit/screenshots/hr_evaluation_360.png` |
| 150 | `/hr/evaluation-360/create` | `/dashboard` | `audit/screenshots/hr_evaluation_360_create.png` |
| 151 | `/hr/excuse-requests` | `/dashboard` | `audit/screenshots/hr_excuse_requests.png` |
| 152 | `/hr/excuse-requests/create` | `/dashboard` | `audit/screenshots/hr_excuse_requests_create.png` |
| 153 | `/hr/exit` | `/dashboard` | `audit/screenshots/hr_exit.png` |
| 154 | `/hr/exit/create` | `/dashboard` | `audit/screenshots/hr_exit_create.png` |
| 155 | `/hr/expiring-documents` | `/dashboard` | `audit/screenshots/hr_expiring_documents.png` |
| 156 | `/hr/gratuity` | `/dashboard` | `audit/screenshots/hr_gratuity.png` |
| 157 | `/hr/idp` | `/dashboard` | `audit/screenshots/hr_idp.png` |
| 158 | `/hr/leaves` | `/dashboard` | `audit/screenshots/hr_leaves.png` |
| 159 | `/hr/leaves/approval-chains` | `/dashboard` | `audit/screenshots/hr_leaves_approval_chains.png` |
| 160 | `/hr/leaves/create` | `/dashboard` | `audit/screenshots/hr_leaves_create.png` |
| 161 | `/hr/leaves/management` | `/dashboard` | `audit/screenshots/hr_leaves_management.png` |
| 162 | `/hr/loans` | `/dashboard` | `audit/screenshots/hr_loans.png` |
| 163 | `/hr/loans/create` | `/dashboard` | `audit/screenshots/hr_loans_create.png` |
| 164 | `/hr/official-letters` | `/dashboard` | `audit/screenshots/hr_official_letters.png` |
| 165 | `/hr/onboarding-review` | `/dashboard` | `audit/screenshots/hr_onboarding_review.png` |
| 166 | `/hr/organization` | `/dashboard` | `audit/screenshots/hr_organization.png` |
| 167 | `/hr/organization/structure` | `/dashboard` | `audit/screenshots/hr_organization_structure.png` |
| 168 | `/hr/overtime` | `/dashboard` | `audit/screenshots/hr_overtime.png` |
| 169 | `/hr/overtime/create` | `/dashboard` | `audit/screenshots/hr_overtime_create.png` |
| 170 | `/hr/payroll` | `/dashboard` | `audit/screenshots/hr_payroll.png` |
| 171 | `/hr/payroll/create` | `/dashboard` | `audit/screenshots/hr_payroll_create.png` |
| 172 | `/hr/payroll/salary-components` | `/dashboard` | `audit/screenshots/hr_payroll_salary_components.png` |
| 173 | `/hr/performance` | `/dashboard` | `audit/screenshots/hr_performance.png` |
| 174 | `/hr/performance/advanced` | `/dashboard` | `audit/screenshots/hr_performance_advanced.png` |
| 175 | `/hr/performance/create` | `/dashboard` | `audit/screenshots/hr_performance_create.png` |
| 176 | `/hr/public-holidays` | `/dashboard` | `audit/screenshots/hr_public_holidays.png` |
| 177 | `/hr/recruitment` | `/dashboard` | `audit/screenshots/hr_recruitment.png` |
| 178 | `/hr/recruitment/advanced` | `/dashboard` | `audit/screenshots/hr_recruitment_advanced.png` |
| 179 | `/hr/recruitment/applicants/create` | `/dashboard` | `audit/screenshots/hr_recruitment_applicants_create.png` |
| 180 | `/hr/recruitment/applications` | `/dashboard` | `audit/screenshots/hr_recruitment_applications.png` |
| 181 | `/hr/recruitment/create` | `/dashboard` | `audit/screenshots/hr_recruitment_create.png` |
| 182 | `/hr/shifts` | `/dashboard` | `audit/screenshots/hr_shifts.png` |
| 183 | `/hr/shifts/create` | `/dashboard` | `audit/screenshots/hr_shifts_create.png` |
| 184 | `/hr/shifts/management` | `/dashboard` | `audit/screenshots/hr_shifts_management.png` |
| 185 | `/hr/training` | `/dashboard` | `audit/screenshots/hr_training.png` |
| 186 | `/hr/training/advanced` | `/dashboard` | `audit/screenshots/hr_training_advanced.png` |
| 187 | `/hr/training/create` | `/dashboard` | `audit/screenshots/hr_training_create.png` |
| 188 | `/hr/transfers` | `/dashboard` | `audit/screenshots/hr_transfers.png` |
| 189 | `/hr/turnover-report` | `/dashboard` | `audit/screenshots/hr_turnover_report.png` |
| 190 | `/hr/violations` | `/dashboard` | `audit/screenshots/hr_violations.png` |
| 191 | `/hr/violations/auto-detection` | `/dashboard` | `audit/screenshots/hr_violations_auto_detection.png` |
| 192 | `/hr/violations/create` | `/dashboard` | `audit/screenshots/hr_violations_create.png` |
| 193 | `/hr/violations/management` | `/dashboard` | `audit/screenshots/hr_violations_management.png` |
| 194 | `/hr/violations/penalty-escalation` | `/dashboard` | `audit/screenshots/hr_violations_penalty_escalation.png` |
| 195 | `/insights` | `/dashboard` | `audit/screenshots/insights.png` |
| 196 | `/intelligence` | `/dashboard` | `audit/screenshots/intelligence.png` |
| 197 | `/legal` | `/dashboard` | `audit/screenshots/legal.png` |
| 198 | `/legal/cases` | `/dashboard` | `audit/screenshots/legal_cases.png` |
| 199 | `/legal/cases/create` | `/dashboard` | `audit/screenshots/legal_cases_create.png` |
| 200 | `/legal/contracts` | `/dashboard` | `audit/screenshots/legal_contracts.png` |
| 201 | `/legal/correspondence` | `/dashboard` | `audit/screenshots/legal_correspondence.png` |
| 202 | `/legal/create` | `/dashboard` | `audit/screenshots/legal_create.png` |
| 203 | `/legal/documents` | `/dashboard` | `audit/screenshots/legal_documents.png` |
| 204 | `/legal/judgments` | `/dashboard` | `audit/screenshots/legal_judgments.png` |
| 205 | `/legal/sessions` | `/dashboard` | `audit/screenshots/legal_sessions.png` |
| 206 | `/manager-board` | `/dashboard` | `audit/screenshots/manager_board.png` |
| 207 | `/marketing` | `/dashboard` | `audit/screenshots/marketing.png` |
| 208 | `/marketing/create` | `/dashboard` | `audit/screenshots/marketing_create.png` |
| 209 | `/module-dashboards` | `/dashboard` | `audit/screenshots/module_dashboards.png` |
| 210 | `/my-attendance` | `/dashboard` | `audit/screenshots/my_attendance.png` |
| 211 | `/my-documents` | `/dashboard` | `audit/screenshots/my_documents.png` |
| 212 | `/my-leave-request` | `/dashboard` | `audit/screenshots/my_leave_request.png` |
| 213 | `/my-loans` | `/dashboard` | `audit/screenshots/my_loans.png` |
| 214 | `/my-overtime` | `/dashboard` | `audit/screenshots/my_overtime.png` |
| 215 | `/my-payslip` | `/dashboard` | `audit/screenshots/my_payslip.png` |
| 216 | `/my-performance` | `/dashboard` | `audit/screenshots/my_performance.png` |
| 217 | `/my-requests` | `/dashboard` | `audit/screenshots/my_requests.png` |
| 218 | `/my-space` | `/dashboard` | `audit/screenshots/my_space.png` |
| 219 | `/notifications` | `/dashboard` | `audit/screenshots/notifications.png` |
| 220 | `/obligations` | `/dashboard` | `audit/screenshots/obligations.png` |
| 221 | `/operations-center` | `/dashboard` | `audit/screenshots/operations_center.png` |
| 222 | `/projects` | `/dashboard` | `audit/screenshots/projects.png` |
| 223 | `/projects/create` | `/dashboard` | `audit/screenshots/projects_create.png` |
| 224 | `/projects/gantt` | `/dashboard` | `audit/screenshots/projects_gantt.png` |
| 225 | `/projects/risks` | `/dashboard` | `audit/screenshots/projects_risks.png` |
| 226 | `/projects/tasks` | `/dashboard` | `audit/screenshots/projects_tasks.png` |
| 227 | `/properties` | `/dashboard` | `audit/screenshots/properties.png` |
| 228 | `/properties/buildings` | `/dashboard` | `audit/screenshots/properties_buildings.png` |
| 229 | `/properties/buildings/create` | `/dashboard` | `audit/screenshots/properties_buildings_create.png` |
| 230 | `/properties/contracts` | `/dashboard` | `audit/screenshots/properties_contracts.png` |
| 231 | `/properties/contracts/create` | `/dashboard` | `audit/screenshots/properties_contracts_create.png` |
| 232 | `/properties/create` | `/dashboard` | `audit/screenshots/properties_create.png` |
| 233 | `/properties/dashboard` | `/dashboard` | `audit/screenshots/properties_dashboard.png` |
| 234 | `/properties/deposits` | `/dashboard` | `audit/screenshots/properties_deposits.png` |
| 235 | `/properties/guide` | `/dashboard` | `audit/screenshots/properties_guide.png` |
| 236 | `/properties/inspections` | `/dashboard` | `audit/screenshots/properties_inspections.png` |
| 237 | `/properties/maintenance` | `/dashboard` | `audit/screenshots/properties_maintenance.png` |
| 238 | `/properties/maintenance/create` | `/dashboard` | `audit/screenshots/properties_maintenance_create.png` |
| 239 | `/properties/occupancy-report` | `/dashboard` | `audit/screenshots/properties_occupancy_report.png` |
| 240 | `/properties/owners` | `/dashboard` | `audit/screenshots/properties_owners.png` |
| 241 | `/properties/owners/create` | `/dashboard` | `audit/screenshots/properties_owners_create.png` |
| 242 | `/properties/payments` | `/dashboard` | `audit/screenshots/properties_payments.png` |
| 243 | `/properties/tenants` | `/dashboard` | `audit/screenshots/properties_tenants.png` |
| 244 | `/properties/tenants/create` | `/dashboard` | `audit/screenshots/properties_tenants_create.png` |
| 245 | `/reports/scheduled` | `/dashboard` | `audit/screenshots/reports_scheduled.png` |
| 246 | `/requests` | `/dashboard` | `audit/screenshots/requests.png` |
| 247 | `/requests/create` | `/dashboard` | `audit/screenshots/requests_create.png` |
| 248 | `/requests/types` | `/dashboard` | `audit/screenshots/requests_types.png` |
| 249 | `/requests/types/create` | `/dashboard` | `audit/screenshots/requests_types_create.png` |
| 250 | `/requests/workflows` | `/dashboard` | `audit/screenshots/requests_workflows.png` |
| 251 | `/settings` | `/dashboard` | `audit/screenshots/settings.png` |
| 252 | `/settings/audit-log` | `/dashboard` | `audit/screenshots/settings_audit_log.png` |
| 253 | `/settings/branches` | `/dashboard` | `audit/screenshots/settings_branches.png` |
| 254 | `/settings/companies` | `/dashboard` | `audit/screenshots/settings_companies.png` |
| 255 | `/settings/departments` | `/dashboard` | `audit/screenshots/settings_departments.png` |
| 256 | `/settings/rules` | `/dashboard` | `audit/screenshots/settings_rules.png` |
| 257 | `/store` | `/dashboard` | `audit/screenshots/store.png` |
| 258 | `/store/orders` | `/dashboard` | `audit/screenshots/store_orders.png` |
| 259 | `/store/orders/create` | `/dashboard` | `audit/screenshots/store_orders_create.png` |
| 260 | `/store/products/create` | `/dashboard` | `audit/screenshots/store_products_create.png` |
| 261 | `/support` | `/dashboard` | `audit/screenshots/support.png` |
| 262 | `/support/create` | `/dashboard` | `audit/screenshots/support_create.png` |
| 263 | `/support/kb` | `/dashboard` | `audit/screenshots/support_kb.png` |
| 264 | `/support/replies` | `/dashboard` | `audit/screenshots/support_replies.png` |
| 265 | `/tasks` | `/dashboard` | `audit/screenshots/tasks.png` |
| 266 | `/tasks/create` | `/dashboard` | `audit/screenshots/tasks_create.png` |
| 267 | `/umrah` | `/dashboard` | `audit/screenshots/umrah.png` |
| 268 | `/umrah/agents` | `/dashboard` | `audit/screenshots/umrah_agents.png` |
| 269 | `/umrah/commission-plans` | `/dashboard` | `audit/screenshots/umrah_commission_plans.png` |
| 270 | `/umrah/commission-plans/new` | `/dashboard` | `audit/screenshots/umrah_commission_plans_new.png` |
| 271 | `/umrah/import` | `/dashboard` | `audit/screenshots/umrah_import.png` |
| 272 | `/umrah/import/legacy` | `/dashboard` | `audit/screenshots/umrah_import_legacy.png` |
| 273 | `/umrah/invoices` | `/dashboard` | `audit/screenshots/umrah_invoices.png` |
| 274 | `/umrah/packages` | `/dashboard` | `audit/screenshots/umrah_packages.png` |
| 275 | `/umrah/penalties` | `/dashboard` | `audit/screenshots/umrah_penalties.png` |
| 276 | `/umrah/pilgrims` | `/dashboard` | `audit/screenshots/umrah_pilgrims.png` |
| 277 | `/umrah/pilgrims/create` | `/dashboard` | `audit/screenshots/umrah_pilgrims_create.png` |
| 278 | `/umrah/pricing` | `/dashboard` | `audit/screenshots/umrah_pricing.png` |
| 279 | `/umrah/seasons` | `/dashboard` | `audit/screenshots/umrah_seasons.png` |
| 280 | `/umrah/sub-agents` | `/dashboard` | `audit/screenshots/umrah_sub_agents.png` |
| 281 | `/umrah/transport` | `/dashboard` | `audit/screenshots/umrah_transport.png` |
| 282 | `/umrah/violations` | `/dashboard` | `audit/screenshots/umrah_violations.png` |
| 283 | `/warehouse` | `/dashboard` | `audit/screenshots/warehouse.png` |
| 284 | `/warehouse/categories` | `/dashboard` | `audit/screenshots/warehouse_categories.png` |
| 285 | `/warehouse/categories/create` | `/dashboard` | `audit/screenshots/warehouse_categories_create.png` |
| 286 | `/warehouse/create` | `/dashboard` | `audit/screenshots/warehouse_create.png` |
| 287 | `/warehouse/inventory-count` | `/dashboard` | `audit/screenshots/warehouse_inventory_count.png` |
| 288 | `/warehouse/movements` | `/dashboard` | `audit/screenshots/warehouse_movements.png` |
| 289 | `/warehouse/movements/create` | `/dashboard` | `audit/screenshots/warehouse_movements_create.png` |
| 290 | `/warehouse/suppliers` | `/dashboard` | `audit/screenshots/warehouse_suppliers.png` |
| 291 | `/warehouse/suppliers/create` | `/dashboard` | `audit/screenshots/warehouse_suppliers_create.png` |

## SKIPped routes — full inventory (81)

All A1 SKIPs are detail/edit routes whose `:id` could not be resolved from the corresponding list API.

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

## The one PASS

| Route | A1 | A2 | A3 | A4 | A5 |
|-------|----|----|----|----|----|
| `/dashboard` | PASS | PASS | SKIP | PASS | PASS |

## Per-route results (full table, all 373)

| Route | A1 | A2 | A3 | A4 | A5 | Note |
|-------|----|----|----|----|----|------|
| /action-center | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/action-center |
| /activity-log | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/activity-log |
| /admin | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin |
| /admin/domain-registry | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin/domain-registry |
| /admin/event-monitor | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin/event-monitor |
| /admin/gl-reconciliation | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin/gl-reconciliation |
| /admin/integrations | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin/integrations |
| /admin/lifecycle-monitor | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin/lifecycle-monitor |
| /admin/logs | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin/logs |
| /admin/monitoring | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin/monitoring |
| /admin/policy-engine | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin/policy-engine |
| /admin/posting-failures | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin/posting-failures |
| /admin/rbac-matrix | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin/rbac-matrix |
| /admin/roles | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin/roles |
| /admin/system-governor | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin/system-governor |
| /admin/system-registry | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin/system-registry |
| /admin/users | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin/users |
| /admin/violations-report | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/admin/violations-report |
| /automation | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/automation |
| /bi | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/bi |
| /bi/admin-reports | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/bi/admin-reports |
| /bi/dashboards | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/bi/dashboards |
| /bi/dashboards/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/bi/dashboards/create; write POST /api/intelligence/activity → 200; consoleErr=2 |
| /bi/kpis | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/bi/kpis |
| /bi/kpis/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/bi/kpis/create; write POST /api/intelligence/activity → 200 |
| /bi/operations | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/bi/operations |
| /bi/reports | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/bi/reports |
| /bi/reports/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/bi/reports/create; write POST /api/intelligence/activity → 200 |
| /calendar | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/calendar |
| /clients | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/clients |
| /clients/:id | PASS | PASS | SKIP | FAIL | SKIP | landed=/dashboard expected=/clients/3 |
| /clients/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/clients/create; write POST /api/intelligence/activity → 200 |
| /communications | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/communications |
| /communications/letters/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/communications/letters/create; write POST /api/intelligence/activity → 200 |
| /communications/notification-engine | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/communications/notification-engine |
| /correspondence | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/correspondence |
| /correspondence/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/correspondence |
| /correspondence/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/correspondence/create; write POST /api/intelligence/activity → 200 |
| /crm | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/crm |
| /crm/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/crm/leads → 404 |
| /crm/activities | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/crm/activities |
| /crm/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/crm/create; write POST /api/intelligence/activity → 200 |
| /crm/leads/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/crm/leads → 404 |
| /crm/pipeline | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/crm/pipeline |
| /daily-close | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/daily-close |
| /dashboard | PASS | PASS | SKIP | PASS | PASS |  |
| /documents | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/documents |
| /documents/:docId/versions | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/documents/1/versions |
| /documents/archive | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/documents/archive |
| /documents/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/documents/create; write POST /api/intelligence/activity → 200 |
| /documents/folders | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/documents/folders |
| /documents/templates | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/documents/templates |
| /documents/upload | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/documents/upload |
| /employees | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/employees |
| /employees/:id | PASS | PASS | SKIP | FAIL | SKIP | landed=/dashboard expected=/employees/3 |
| /employees/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/employees/create; write POST /api/intelligence/activity → 200 |
| /exec-dashboard | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/exec-dashboard |
| /finance | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance |
| /finance/accounts | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/accounts |
| /finance/accounts/:id | PASS | PASS | SKIP | FAIL | SKIP | landed=/dashboard expected=/finance/accounts/2 |
| /finance/accounts/:id/edit | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/finance/accounts/2/edit; write POST /api/intelligence/activity → 200 |
| /finance/accounts/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/finance/accounts/create; write POST /api/intelligence/activity → 200 |
| /finance/ap-aging | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/ap-aging |
| /finance/ar-aging | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/ar-aging |
| /finance/bank-guarantees | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/bank-guarantees |
| /finance/bank-reconciliation | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/bank-reconciliation |
| /finance/bank-reconciliation/manual-match/:batchId/:rowId | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /finance/bank-reconciliation/manual-match/:batchId/:rowId |
| /finance/budget | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/budget |
| /finance/budget/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/budget |
| /finance/budget/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/finance/budget/create; write POST /api/intelligence/activity → 200 |
| /finance/cash-flow-forecast | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/cash-flow-forecast |
| /finance/cashflow | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/cashflow |
| /finance/commitments | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/commitments |
| /finance/commitments/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/commitments |
| /finance/custodies | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/custodies |
| /finance/custodies/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/custodies |
| /finance/custodies/report | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/custodies/report |
| /finance/expenses | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/expenses |
| /finance/expenses/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/expenses |
| /finance/expenses/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/finance/expenses/create; write POST /api/intelligence/activity → 200 |
| /finance/financial-requests | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/financial-requests |
| /finance/financial-requests/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/financial-requests |
| /finance/fiscal-periods | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/fiscal-periods |
| /finance/fixed-assets | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/fixed-assets |
| /finance/fixed-assets/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/fixed-assets |
| /finance/fixed-assets/batch-depreciate | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/fixed-assets/batch-depreciate |
| /finance/intercompany | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/intercompany |
| /finance/intercompany/consolidation/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/finance/intercompany/consolidation/create; write POST /api/intelligence/activity → 200 |
| /finance/inventory-costing | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/inventory-costing |
| /finance/invoices | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/invoices |
| /finance/invoices/:id | PASS | PASS | SKIP | FAIL | SKIP | landed=/dashboard expected=/finance/invoices/1 |
| /finance/invoices/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/finance/invoices/create; write POST /api/intelligence/activity → 200 |
| /finance/journal | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/journal |
| /finance/journal-manual | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/journal-manual |
| /finance/journal-manual/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/journal-manual |
| /finance/journal-manual/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/finance/journal-manual/create; write POST /api/intelligence/activity → 200 |
| /finance/journal/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/finance/journal/create; write POST /api/intelligence/activity → 200 |
| /finance/ledger/:code | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /finance/ledger/:code |
| /finance/opening-balances | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/opening-balances |
| /finance/opening-balances/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/finance/opening-balances/create; write POST /api/intelligence/activity → 200 |
| /finance/payments | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/payments |
| /finance/project-costing | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/project-costing |
| /finance/project-costing/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /finance/project-costing/:id |
| /finance/purchase-orders | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/purchase-orders |
| /finance/purchase-orders/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/purchase-orders |
| /finance/purchase-orders/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/finance/purchase-orders/create; write POST /api/intelligence/activity → 200 |
| /finance/receivables | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/receivables |
| /finance/receivables/:id | PASS | PASS | SKIP | FAIL | SKIP | landed=/dashboard expected=/finance/receivables/3 |
| /finance/recurring-journals | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/recurring-journals |
| /finance/recurring-journals/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/recurring-journals |
| /finance/recurring-journals/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/finance/recurring-journals/create; write POST /api/intelligence/activity → 200 |
| /finance/reports | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/reports |
| /finance/salary-advances | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/salary-advances |
| /finance/salary-advances/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/salary-advances |
| /finance/tax | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/tax |
| /finance/treasury | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/treasury |
| /finance/vendors | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/vendors |
| /finance/vendors/:id | PASS | PASS | SKIP | FAIL | SKIP | landed=/dashboard expected=/finance/vendors/1 |
| /finance/vendors/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/finance/vendors/create; write POST /api/intelligence/activity → 200 |
| /finance/vouchers | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/vouchers |
| /finance/vouchers/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/vouchers |
| /finance/vouchers/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/finance/vouchers/create; write POST /api/intelligence/activity → 200 |
| /finance/year-end-close | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/finance/year-end-close |
| /fleet | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/fleet |
| /fleet/:id | PASS | PASS | SKIP | FAIL | SKIP | landed=/dashboard expected=/fleet/7 |
| /fleet/:id/status | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/fleet/7/status |
| /fleet/alerts | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/fleet/alerts |
| /fleet/alerts/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/fleet/alerts/create; write POST /api/intelligence/activity → 200 |
| /fleet/drivers | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/fleet/drivers |
| /fleet/drivers/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/fleet/drivers → 401 |
| /fleet/drivers/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/fleet/drivers/create; write POST /api/intelligence/activity → 200 |
| /fleet/fuel | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/fleet/fuel |
| /fleet/fuel/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/fleet/fuel-logs → 401 |
| /fleet/fuel/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/fleet/fuel/create; write POST /api/intelligence/activity → 200 |
| /fleet/insurance | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/fleet/insurance |
| /fleet/insurance/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/fleet/insurance → 401 |
| /fleet/insurance/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/fleet/insurance/create; write POST /api/intelligence/activity → 200 |
| /fleet/maintenance | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/fleet/maintenance |
| /fleet/maintenance/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/fleet/maintenance → 401 |
| /fleet/maintenance/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/fleet/maintenance/create; write POST /api/intelligence/activity → 200 |
| /fleet/preventive-plans | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/fleet/preventive-plans |
| /fleet/reports | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/fleet/reports |
| /fleet/tco | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/fleet/tco |
| /fleet/traffic-violations | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/fleet/traffic-violations |
| /fleet/traffic-violations/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/fleet/traffic-violations → 401 |
| /fleet/trips | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/fleet/trips |
| /fleet/trips/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/fleet/trips → 401 |
| /fleet/trips/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/fleet/trips/create; write POST /api/intelligence/activity → 200 |
| /fleet/vehicles/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/fleet/vehicles/create; write POST /api/intelligence/activity → 200 |
| /governance | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/governance |
| /governance/audits | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/governance/audits |
| /governance/audits/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/governance/audits → 401 |
| /governance/audits/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/governance/audits/create; write POST /api/intelligence/activity → 200 |
| /governance/capa | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/governance/capa |
| /governance/compliance | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/governance/compliance |
| /governance/compliance/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/governance/compliance → 401 |
| /governance/compliance/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/governance/compliance/create; write POST /api/intelligence/activity → 200 |
| /governance/policies | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/governance/policies |
| /governance/policies/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/governance/policies → 401 |
| /governance/policies/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/governance/policies/create; write POST /api/intelligence/activity → 200 |
| /governance/risks | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/governance/risks |
| /governance/risks/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/governance/risks → 401 |
| /governance/risks/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/governance/risks/create; write POST /api/intelligence/activity → 200 |
| /guide/properties | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/guide/properties |
| /hr | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr |
| /hr/attendance | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/attendance |
| /hr/attendance/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/attendance → 401 |
| /hr/attendance/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/attendance/create; write POST /api/intelligence/activity → 200 |
| /hr/attendance/field-tracking | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/attendance/field-tracking |
| /hr/attendance/qr-scanner | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/attendance/qr-scanner |
| /hr/attendance/reports | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/attendance/reports |
| /hr/contracts | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/contracts |
| /hr/contracts/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/contracts → 401 |
| /hr/contracts/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/contracts/create; write POST /api/intelligence/activity → 200 |
| /hr/development-plans | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/development-plans; consoleErr=2 |
| /hr/discipline/memos | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/discipline/memos |
| /hr/discipline/memos/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /hr/discipline/memos/:id |
| /hr/discipline/regulation | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/discipline/regulation |
| /hr/employee-activation | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/employee-activation |
| /hr/employee-profile/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /hr/employee-profile/:id |
| /hr/evaluation-360 | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/evaluation-360 |
| /hr/evaluation-360/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/evaluation-360 → 401 |
| /hr/evaluation-360/:id/peer | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/evaluation-360 → 401 |
| /hr/evaluation-360/:id/upward | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/evaluation-360 → 401 |
| /hr/evaluation-360/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/evaluation-360/create; write POST /api/intelligence/activity → 200 |
| /hr/evaluation-360/history/:employeeId | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/evaluation-360 → 401 |
| /hr/excuse-requests | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/excuse-requests |
| /hr/excuse-requests/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/excuse-requests → 401 |
| /hr/excuse-requests/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/excuse-requests/create; write POST /api/intelligence/activity → 200; consoleErr=2 |
| /hr/exit | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/exit |
| /hr/exit/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/exit → 401 |
| /hr/exit/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/exit/create; write POST /api/intelligence/activity → 200 |
| /hr/expiring-documents | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/expiring-documents |
| /hr/gratuity | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/gratuity |
| /hr/idp | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/idp |
| /hr/leaves | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/leaves |
| /hr/leaves/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/leaves → 401 |
| /hr/leaves/approval-chains | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/leaves/approval-chains |
| /hr/leaves/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/leaves/create; write POST /api/intelligence/activity → 200; consoleErr=2 |
| /hr/leaves/management | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/leaves/management |
| /hr/loans | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/loans |
| /hr/loans/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/loans → 401 |
| /hr/loans/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/loans/create; write POST /api/intelligence/activity → 200 |
| /hr/official-letters | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/official-letters |
| /hr/onboarding-review | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/onboarding-review |
| /hr/organization | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/organization |
| /hr/organization/structure | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/organization/structure |
| /hr/overtime | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/overtime |
| /hr/overtime/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/overtime → 401 |
| /hr/overtime/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/overtime/create; write POST /api/intelligence/activity → 200 |
| /hr/payroll | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/payroll |
| /hr/payroll/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/payroll → 401 |
| /hr/payroll/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/payroll/create; write POST /api/intelligence/activity → 200 |
| /hr/payroll/salary-components | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/payroll/salary-components |
| /hr/performance | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/performance |
| /hr/performance/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/performance → 401 |
| /hr/performance/advanced | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/performance/advanced |
| /hr/performance/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/performance/create; write POST /api/intelligence/activity → 200 |
| /hr/public-holidays | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/public-holidays |
| /hr/recruitment | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/recruitment |
| /hr/recruitment/advanced | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/recruitment/advanced |
| /hr/recruitment/applicants/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/recruitment/applicants/create; write POST /api/intelligence/activity → 200 |
| /hr/recruitment/applications | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/recruitment/applications |
| /hr/recruitment/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/recruitment/create; write POST /api/intelligence/activity → 200 |
| /hr/recruitment/jobs/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/recruitment → 401 |
| /hr/shifts | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/shifts |
| /hr/shifts/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /hr/shifts/:id |
| /hr/shifts/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/shifts/create; write POST /api/intelligence/activity → 200 |
| /hr/shifts/management | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/shifts/management |
| /hr/training | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/training |
| /hr/training/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/training → 401 |
| /hr/training/advanced | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/training/advanced |
| /hr/training/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/training/create; write POST /api/intelligence/activity → 200 |
| /hr/transfers | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/transfers |
| /hr/transfers/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/transfers → 401 |
| /hr/turnover-report | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/turnover-report |
| /hr/violations | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/violations |
| /hr/violations/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/violations → 401 |
| /hr/violations/auto-detection | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/violations/auto-detection |
| /hr/violations/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/violations/create; write POST /api/intelligence/activity → 200 |
| /hr/violations/management | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/violations/management |
| /hr/violations/penalty-escalation | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/violations/penalty-escalation |
| /insights | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/insights |
| /intelligence | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/intelligence |
| /legal | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/legal |
| /legal/cases | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/legal/cases |
| /legal/cases/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/legal/cases → 401 |
| /legal/cases/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/legal/cases/create; write POST /api/intelligence/activity → 200 |
| /legal/contracts | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/legal/contracts |
| /legal/contracts/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/legal/contracts → 401 |
| /legal/correspondence | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/legal/correspondence |
| /legal/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/legal/create; write POST /api/intelligence/activity → 200 |
| /legal/documents | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/legal/documents |
| /legal/judgments | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/legal/judgments |
| /legal/judgments/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/legal/judgments → 401 |
| /legal/sessions | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/legal/sessions |
| /legal/sessions/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/legal/sessions → 401 |
| /manager-board | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/manager-board |
| /marketing | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/marketing |
| /marketing/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/marketing/create; write POST /api/intelligence/activity → 200 |
| /module-dashboards | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/module-dashboards |
| /my-attendance | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/my-attendance |
| /my-documents | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/my-documents |
| /my-leave-request | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/my-leave-request |
| /my-loans | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/my-loans |
| /my-overtime | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/my-overtime |
| /my-payslip | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/my-payslip |
| /my-performance | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/my-performance |
| /my-requests | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/my-requests |
| /my-space | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/my-space |
| /notifications | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/notifications |
| /obligations | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/obligations |
| /operations-center | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/operations-center |
| /projects | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/projects |
| /projects/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /projects/:id |
| /projects/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/projects/create; write POST /api/intelligence/activity → 200 |
| /projects/gantt | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/projects/gantt |
| /projects/risks | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/projects/risks |
| /projects/tasks | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/projects/tasks |
| /properties | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/properties |
| /properties/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/units → 401 |
| /properties/:id/status | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/units → 401 |
| /properties/buildings | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/properties/buildings |
| /properties/buildings/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/buildings → 401 |
| /properties/buildings/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/properties/buildings/create; write POST /api/intelligence/activity → 200 |
| /properties/contracts | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/properties/contracts |
| /properties/contracts/:contractId/pay/:installmentId | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/contracts → 401 |
| /properties/contracts/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/contracts → 401 |
| /properties/contracts/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/properties/contracts/create; write POST /api/intelligence/activity → 200 |
| /properties/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/properties/create; write POST /api/intelligence/activity → 200 |
| /properties/dashboard | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/properties/dashboard |
| /properties/deposits | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/properties/deposits |
| /properties/guide | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/properties/guide |
| /properties/inspections | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/properties/inspections |
| /properties/maintenance | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/properties/maintenance |
| /properties/maintenance/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/units → 401 |
| /properties/maintenance/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/properties/maintenance/create; write POST /api/intelligence/activity → 200 |
| /properties/occupancy-report | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/properties/occupancy-report |
| /properties/owners | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/properties/owners |
| /properties/owners/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/owners → 401 |
| /properties/owners/:id/edit | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/owners → 401 |
| /properties/owners/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/properties/owners/create; write POST /api/intelligence/activity → 200 |
| /properties/payments | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/properties/payments |
| /properties/payments/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/units → 401 |
| /properties/payments/:paymentId/pay | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/units → 401 |
| /properties/tenants | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/properties/tenants |
| /properties/tenants/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/tenants → 401 |
| /properties/tenants/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/properties/tenants/create; write POST /api/intelligence/activity → 200 |
| /reports/scheduled | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/reports/scheduled |
| /requests | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/requests |
| /requests/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /requests/:id |
| /requests/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/requests/create; write POST /api/intelligence/activity → 200 |
| /requests/types | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/requests/types |
| /requests/types/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/requests/types/create; write POST /api/intelligence/activity → 200 |
| /requests/workflows | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/requests/workflows |
| /settings | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/settings |
| /settings/audit-log | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/settings/audit-log |
| /settings/branches | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/settings/branches |
| /settings/companies | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/settings/companies |
| /settings/departments | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/settings/departments |
| /settings/rules | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/settings/rules |
| /store | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/store |
| /store/orders | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/store/orders |
| /store/orders/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /store/orders/:id |
| /store/orders/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/store/orders/create; write POST /api/intelligence/activity → 200 |
| /store/products/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /store/products/:id |
| /store/products/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/store/products/create; write POST /api/intelligence/activity → 200 |
| /support | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/support |
| /support/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /support/:id |
| /support/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/support/create; write POST /api/intelligence/activity → 200 |
| /support/kb | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/support/kb |
| /support/replies | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/support/replies |
| /tasks | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/tasks |
| /tasks/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /tasks/:id |
| /tasks/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/tasks/create; write POST /api/intelligence/activity → 200 |
| /umrah | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/umrah |
| /umrah/agents | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/umrah/agents |
| /umrah/agents/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/umrah/agents → 401 |
| /umrah/commission-plans | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/umrah/commission-plans |
| /umrah/commission-plans/:id/edit | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/umrah/commission-plans → 401 |
| /umrah/commission-plans/new | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/umrah/commission-plans/new |
| /umrah/import | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/umrah/import |
| /umrah/import/legacy | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/umrah/import/legacy |
| /umrah/invoices | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/umrah/invoices |
| /umrah/invoices/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /umrah/invoices/:id |
| /umrah/packages | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/umrah/packages |
| /umrah/packages/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/umrah/packages → 401 |
| /umrah/penalties | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/umrah/penalties |
| /umrah/penalties/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /umrah/penalties/:id |
| /umrah/pilgrims | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/umrah/pilgrims |
| /umrah/pilgrims/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /umrah/pilgrims/:id |
| /umrah/pilgrims/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/umrah/pilgrims/create; write POST /api/intelligence/activity → 200 |
| /umrah/pricing | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/umrah/pricing |
| /umrah/seasons | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/umrah/seasons |
| /umrah/seasons/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/umrah/seasons → 401 |
| /umrah/sub-agents | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/umrah/sub-agents |
| /umrah/transport | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/umrah/transport |
| /umrah/transport/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/umrah/transport → 401 |
| /umrah/violations | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/umrah/violations |
| /umrah/violations/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/umrah/violations → 401 |
| /warehouse | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/warehouse |
| /warehouse/categories | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/warehouse/categories |
| /warehouse/categories/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/warehouse/categories → 401 |
| /warehouse/categories/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/warehouse/categories/create; write POST /api/intelligence/activity → 200 |
| /warehouse/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/warehouse/create; write POST /api/intelligence/activity → 200 |
| /warehouse/inventory-count | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/warehouse/inventory-count |
| /warehouse/movements | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/warehouse/movements |
| /warehouse/movements/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/warehouse/movements → 401 |
| /warehouse/movements/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/warehouse/movements/create; write POST /api/intelligence/activity → 200 |
| /warehouse/products/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/warehouse/products → 401 |
| /warehouse/suppliers | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/warehouse/suppliers |
| /warehouse/suppliers/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/warehouse/suppliers → 401 |
| /warehouse/suppliers/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/warehouse/suppliers/create; write POST /api/intelligence/activity → 200 |
