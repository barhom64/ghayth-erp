# Page Shell Migration Matrix — Ghaith ERP

> Source: `artifacts/ghayth-erp/src/pages/**/*.tsx` (in-scope: **377** files, excluding `create/`, `details/`, and sub-component files matching `-tab.tsx`, `-section.tsx`, `-card.tsx`, `-row.tsx`, `-strip.tsx`, `-panel.tsx`, `-widget.tsx`, `-modal.tsx`, `-form.tsx`).
>
> Equivalent layout primitives accepted: `PageShell`, `DetailPageLayout`, `EntityDetailPage`, `CreatePageLayout`, `ListPage`.

## Summary

| Status | Count |
| :--- | ---: |
| **compliant** | 361 |
| **partial** (PageShell, no breadcrumbs — `dashboard.tsx` landing page; acceptable as design exception) | 1 |
| **non-compliant** | 15 |

All 15 non-compliant entries are either legitimate layout exceptions (login, print-verify, properties-guide, not-found) or mis-placed sub-components / polymorphic wrappers. None require a dedicated migration slice; sub-components should eventually relocate to `components/`.

### Migrations Performed (this audit)

The following 9 pages were migrated from no layout primitive to `PageShell` or `CreatePageLayout`. Each one was a small wrap (<30 lines diff):

| Page | New layout | Notes |
| :--- | :--- | :--- |
| `admin/user-onboarding.tsx` | PageShell | Header / breadcrumbs / actions |
| `admin/users.tsx` | PageShell | Header / breadcrumbs / actions |
| `admin/roles.tsx` | PageShell | Header / breadcrumbs / actions |
| `documents/templates.tsx` | PageShell | Header / breadcrumbs / actions |
| `reports/scheduled-reports.tsx` | PageShell | Header / breadcrumbs / actions |
| `settings.tsx` | PageShell | Header / breadcrumbs |
| `settings-rules.tsx` | PageShell | Header / breadcrumbs / actions |
| `store.tsx` | PageShell | Header / breadcrumbs |
| `umrah/pilgrim-create.tsx` | CreatePageLayout | Replaces ad-hoc back-button header |
| `umrah/settings.tsx` | PageShell (existing) | Added missing breadcrumbs |

---

## Per-page Matrix

| Page | Layout used | Has title | Has breadcrumbs / backHref | Has actions | Status |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `admin/rbac-v2-conditions-editor.tsx` | none | — | — | — | non-compliant |
| `bi/shared.tsx` | none | — | — | — | non-compliant |
| `finance/customer-statement.tsx` | none | — | — | — | non-compliant |
| `finance/profitability-project.tsx` | none | — | — | — | non-compliant |
| `finance/profitability-property.tsx` | none | — | — | — | non-compliant |
| `finance/profitability-umrah-agent.tsx` | none | — | — | — | non-compliant |
| `finance/profitability-vehicle.tsx` | none | — | — | — | non-compliant |
| `finance/vendor-statement.tsx` | none | — | — | — | non-compliant |
| `governance/stats-cards.tsx` | none | — | — | — | non-compliant |
| `login.tsx` | none | — | — | — | non-compliant |
| `my-space/role-entities-grid.tsx` | none | — | — | — | non-compliant |
| `my-space/summary-cards.tsx` | none | — | — | — | non-compliant |
| `not-found.tsx` | none | — | — | — | non-compliant |
| `print-verify.tsx` | none | — | — | — | non-compliant |
| `properties-guide.tsx` | none | — | — | — | non-compliant |
| `dashboard.tsx` | PageShell | Y | N | — | partial |
| `action-center.tsx` | PageShell | Y | Y | Y | compliant |
| `activity-log.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-ai-governance.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-ai-prompt-detail.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-communication-control.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-data-import.tsx` | PageShell | Y | Y | — | compliant |
| `admin-digital-signature.tsx` | PageShell | Y | Y | — | compliant |
| `admin-domain-registry.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-event-monitor.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-gl-reconciliation.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-integrations-diagnostics.tsx` | PageShell | Y | Y | — | compliant |
| `admin-integrations.tsx` | PageShell | Y | Y | — | compliant |
| `admin-intelligence-playground.tsx` | PageShell | Y | Y | — | compliant |
| `admin-lifecycle-monitor.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-master-plan.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-monitoring.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-notification-routing.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-observability.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-pbx-control.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-pdpl.tsx` | PageShell | Y | Y | — | compliant |
| `admin-policy-engine.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-posting-failures.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-rbac-matrix.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-system-governor.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-system-registry.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-vendor-settings.tsx` | PageShell | Y | Y | Y | compliant |
| `admin-violations-report.tsx` | PageShell | Y | Y | — | compliant |
| `admin-zatca-audits.tsx` | PageShell | Y | Y | — | compliant |
| `admin.tsx` | PageShell | Y | Y | — | compliant |
| `admin/approval-overrides-report.tsx` | PageShell | Y | Y | Y | compliant |
| `admin/logs.tsx` | PageShell | Y | Y | Y | compliant |
| `admin/print-diagnostics.tsx` | PageShell | Y | Y | Y | compliant |
| `admin/print-templates.tsx` | PageShell | Y | Y | Y | compliant |
| `admin/roles.tsx` | PageShell | Y | Y | Y | compliant |
| `admin/user-onboarding.tsx` | PageShell | Y | Y | — | compliant |
| `admin/users.tsx` | PageShell | Y | Y | Y | compliant |
| `ai-workbench.tsx` | PageShell | Y | Y | — | compliant |
| `automation.tsx` | PageShell | Y | Y | — | compliant |
| `bi-admin-reports.tsx` | PageShell | Y | Y | Y | compliant |
| `bi-dashboards.tsx` | PageShell | Y | Y | — | compliant |
| `bi-kpis.tsx` | PageShell | Y | Y | — | compliant |
| `bi-operations.tsx` | PageShell | Y | Y | Y | compliant |
| `bi-reports.tsx` | PageShell | Y | Y | — | compliant |
| `bi.tsx` | PageShell | Y | Y | — | compliant |
| `calendar.tsx` | PageShell | Y | Y | Y | compliant |
| `client-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `clients.tsx` | PageShell | Y | Y | Y | compliant |
| `comms/correspondence.tsx` | PageShell | Y | Y | Y | compliant |
| `communications.tsx` | PageShell | Y | Y | — | compliant |
| `crm.tsx` | PageShell | Y | Y | Y | compliant |
| `crm/activities.tsx` | PageShell | Y | Y | — | compliant |
| `crm/lead-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `daily-close.tsx` | PageShell | Y | Y | Y | compliant |
| `documents-ocr-inbox.tsx` | PageShell | Y | Y | Y | compliant |
| `documents-page.tsx` | PageShell | Y | Y | — | compliant |
| `documents/archive.tsx` | PageShell | Y | Y | — | compliant |
| `documents/documents-upload.tsx` | CreatePageLayout | Y | backPath | — | compliant |
| `documents/templates.tsx` | PageShell | Y | Y | Y | compliant |
| `employee-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `employees.tsx` | PageShell | Y | Y | Y | compliant |
| `exec-dashboard.tsx` | PageShell | Y | Y | — | compliant |
| `finance/account-reconciliation-workpaper.tsx` | PageShell | Y | Y | — | compliant |
| `finance/account-statement.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/accounts.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/allocation-coverage.tsx` | PageShell | Y | Y | — | compliant |
| `finance/allocation-override-log.tsx` | PageShell | Y | Y | — | compliant |
| `finance/allocation-results.tsx` | PageShell | Y | Y | — | compliant |
| `finance/allocation-rules.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/ap-aging.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/ap-payment-calendar.tsx` | PageShell | Y | Y | — | compliant |
| `finance/approvals-inbox.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/ar-aging.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/ar-collection-workbench.tsx` | PageShell | Y | Y | — | compliant |
| `finance/bad-debt-provision.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/bad-debt.tsx` | PageShell | Y | Y | — | compliant |
| `finance/bank-accounts-watch.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/bank-guarantees.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/bank-reconciliation.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/budget-approvals.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/budget-heatmap.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/budget-variance.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/budget.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/cash-13week.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/cash-calendar.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/cash-flow-forecast.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/cash-flow-statement.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/cash-position-calculator.tsx` | PageShell | Y | Y | — | compliant |
| `finance/cashflow-dashboard.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/cfo-cockpit.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/cogs-summary.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/collection-stages.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/collections.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/commitments.tsx` | PageShell | Y | Y | — | compliant |
| `finance/cost-center-pnl.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/cost-centers.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/custodies.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/custody-aging-report.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/custody-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `finance/custody-workbench.tsx` | PageShell | Y | Y | — | compliant |
| `finance/customer-360-sheet.tsx` | PageShell | Y | Y | — | compliant |
| `finance/customer-advances-workbench.tsx` | PageShell | Y | Y | — | compliant |
| `finance/customer-advances.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/customer-risk.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/customer-statement-print.tsx` | PageShell | Y | Y | — | compliant |
| `finance/daily-close-checklist.tsx` | PageShell | Y | Y | — | compliant |
| `finance/dashboard.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/dunning.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/entity-360.tsx` | PageShell | Y | Y | — | compliant |
| `finance/entity-statements.tsx` | PageShell | Y | Y | — | compliant |
| `finance/expense-bulk-approvals.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/expense-burn-rate.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/expenses.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/finance-workflows-hub.tsx` | PageShell | Y | Y | — | compliant |
| `finance/financial-requests.tsx` | PageShell | Y | Y | — | compliant |
| `finance/fiscal-periods-v2.tsx` | ListPage | Y | Y | — | compliant |
| `finance/fiscal-periods.tsx` | PageShell | Y | Y | — | compliant |
| `finance/fixed-asset-register.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/fixed-assets.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/fx-rates.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/fx-revaluation-history.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/fx-revaluation.tsx` | PageShell | Y | Y | — | compliant |
| `finance/gl-anomaly-detector.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/gl-health-score.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/gl-integrity-gaps.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/gl-posting-queue.tsx` | PageShell | Y | Y | — | compliant |
| `finance/income-statement-trend.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/income-statement-vs-budget.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/intercompany.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/inventory-costing.tsx` | PageShell | Y | Y | — | compliant |
| `finance/inventory-turnover.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/inventory-valuation.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/invoice-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `finance/invoice-send-queue.tsx` | PageShell | Y | Y | — | compliant |
| `finance/invoices.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/journal-detail.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/journal-manual-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `finance/journal-manual.tsx` | ListPage | Y | Y | — | compliant |
| `finance/journal-templates.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/journal.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/ledger.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/lot-expiry-alerts.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/monthly-close-pack.tsx` | PageShell | Y | Y | — | compliant |
| `finance/negative-stock.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/opening-balances.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/overrides-report.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/payment-run.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/payments-page.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/period-close-preflight.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/posting-activity.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/pricing-rules.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/product-catalog.tsx` | PageShell | Y | Y | — | compliant |
| `finance/profitability.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/project-costing-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `finance/project-costing.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/purchase-order-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `finance/purchase-orders.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/purchase-requests.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/receivables.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/reconciliation-hub.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/recurring-calendar.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/recurring-journal-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `finance/recurring-journals.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/reports.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/salary-advances.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/settings-hub.tsx` | PageShell | Y | Y | — | compliant |
| `finance/subsidiary-accounts.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/tax-codes.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/tax-filing-calendar.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/tax-system.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/treasury.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/trial-balance-comparison.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/trial-balance-drilldown.tsx` | PageShell | Y | Y | — | compliant |
| `finance/unmapped-lines.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/vat-filing-readiness.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/vat-reconciliation.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/vehicle-portfolio-dashboard.tsx` | PageShell | Y | Y | — | compliant |
| `finance/vendor-360-sheet.tsx` | PageShell | Y | Y | — | compliant |
| `finance/vendor-contracts-tracker.tsx` | PageShell | Y | Y | — | compliant |
| `finance/vendor-contracts.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/vendor-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `finance/vendor-settlement-workbench.tsx` | PageShell | Y | Y | — | compliant |
| `finance/vendor-spend.tsx` | PageShell | Y | Y | — | compliant |
| `finance/vendor-statement-print.tsx` | PageShell | Y | Y | — | compliant |
| `finance/vendors.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/vouchers.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/wht-categories.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/wht-filing-workbench.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/wht-summary.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/year-end-close.tsx` | EntityDetailPage | Y | backPath | — | compliant |
| `finance/yoy-comparison.tsx` | PageShell | Y | Y | Y | compliant |
| `finance/zatca-reports-hub.tsx` | PageShell | Y | Y | Y | compliant |
| `fleet.tsx` | PageShell | Y | Y | — | compliant |
| `fleet/alerts.tsx` | PageShell | Y | Y | Y | compliant |
| `fleet/drivers.tsx` | PageShell | Y | Y | Y | compliant |
| `fleet/fuel.tsx` | PageShell | Y | Y | Y | compliant |
| `fleet/insurance.tsx` | PageShell | Y | Y | Y | compliant |
| `fleet/maintenance.tsx` | PageShell | Y | Y | Y | compliant |
| `fleet/preventive-plans.tsx` | PageShell | Y | Y | Y | compliant |
| `fleet/reports.tsx` | PageShell | Y | Y | Y | compliant |
| `fleet/tco.tsx` | PageShell | Y | Y | — | compliant |
| `fleet/telematics/ai-alerts.tsx` | PageShell | Y | Y | — | compliant |
| `fleet/telematics/devices.tsx` | PageShell | Y | Y | Y | compliant |
| `fleet/telematics/evidence.tsx` | PageShell | Y | Y | — | compliant |
| `fleet/telematics/live-map.tsx` | PageShell | Y | Y | Y | compliant |
| `fleet/telematics/operations.tsx` | PageShell | Y | Y | Y | compliant |
| `fleet/telematics/scorecard.tsx` | PageShell | Y | Y | — | compliant |
| `fleet/telematics/sensors.tsx` | PageShell | Y | Y | — | compliant |
| `fleet/telematics/settings.tsx` | PageShell | Y | Y | — | compliant |
| `fleet/telematics/video-evidence.tsx` | PageShell | Y | Y | — | compliant |
| `fleet/traffic-violations.tsx` | PageShell | Y | Y | Y | compliant |
| `fleet/trip-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `fleet/trips.tsx` | PageShell | Y | Y | Y | compliant |
| `governance.tsx` | PageShell | Y | Y | — | compliant |
| `governance/capa.tsx` | PageShell | Y | Y | — | compliant |
| `hr.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/accruals.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/application-list.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/approval-chains.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/approval-inbox.tsx` | PageShell | Y | Y | — | compliant |
| `hr/attendance-policy.tsx` | PageShell | Y | Y | — | compliant |
| `hr/attendance-reports.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/attendance.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/auto-detection.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/contracts.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/delegations.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/discipline-memo-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `hr/discipline-regulation.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/documents.tsx` | PageShell | Y | Y | — | compliant |
| `hr/employee-activation.tsx` | PageShell | Y | Y | — | compliant |
| `hr/evaluation-360-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `hr/evaluation-360-history.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/evaluation-360-peer.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/evaluation-360-upward.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/evaluation-360.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/excuse-requests.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/exit-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `hr/exit-requests.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/expiring-documents.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/field-tracking.tsx` | PageShell | Y | Y | — | compliant |
| `hr/gratuity.tsx` | PageShell | Y | Y | — | compliant |
| `hr/idp.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/job-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `hr/leave-management.tsx` | PageShell | Y | Y | — | compliant |
| `hr/leaves.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/loan-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `hr/loans.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/official-letters.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/onboarding-review.tsx` | PageShell | Y | Y | — | compliant |
| `hr/organization-structure.tsx` | PageShell | Y | Y | — | compliant |
| `hr/organization.tsx` | PageShell | Y | Y | — | compliant |
| `hr/overtime-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `hr/overtime.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/payroll.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/penalty-escalation.tsx` | PageShell | Y | Y | — | compliant |
| `hr/performance-advanced.tsx` | PageShell | Y | Y | — | compliant |
| `hr/performance.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/public-holidays.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/qr-scanner.tsx` | PageShell | Y | Y | — | compliant |
| `hr/recruitment-advanced.tsx` | PageShell | Y | Y | — | compliant |
| `hr/recruitment.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/salary-components.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/saudi-compliance.tsx` | PageShell | Y | Y | — | compliant |
| `hr/saudization.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/shifts-management.tsx` | PageShell | Y | Y | — | compliant |
| `hr/shifts.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/training-advanced.tsx` | PageShell | Y | Y | — | compliant |
| `hr/training-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `hr/training.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/transfers.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/turnover-report.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/violation-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `hr/violations-management.tsx` | PageShell | Y | Y | — | compliant |
| `hr/violations.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/wps-run-detail.tsx` | PageShell | Y | Y | Y | compliant |
| `hr/wps-runs.tsx` | PageShell | Y | Y | Y | compliant |
| `inbox.tsx` | PageShell | Y | Y | Y | compliant |
| `insights.tsx` | PageShell | Y | Y | Y | compliant |
| `intelligence.tsx` | PageShell | Y | Y | — | compliant |
| `legal-case-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `legal.tsx` | PageShell | Y | Y | — | compliant |
| `legal/correspondence.tsx` | PageShell | Y | Y | — | compliant |
| `legal/judgments.tsx` | PageShell | Y | Y | — | compliant |
| `legal/sessions.tsx` | PageShell | Y | Y | — | compliant |
| `mailboxes.tsx` | PageShell | Y | Y | Y | compliant |
| `manager-board.tsx` | PageShell | Y | Y | Y | compliant |
| `manager-board/reprint-approvals.tsx` | PageShell | Y | Y | — | compliant |
| `manager-workspace.tsx` | PageShell | Y | Y | Y | compliant |
| `marketing.tsx` | PageShell | Y | Y | — | compliant |
| `module-dashboards.tsx` | PageShell | Y | Y | — | compliant |
| `my-attendance.tsx` | PageShell | Y | Y | — | compliant |
| `my-documents.tsx` | PageShell | Y | Y | — | compliant |
| `my-loans.tsx` | PageShell | Y | Y | Y | compliant |
| `my-overtime.tsx` | PageShell | Y | Y | — | compliant |
| `my-payslip.tsx` | PageShell | Y | Y | Y | compliant |
| `my-performance.tsx` | PageShell | Y | Y | — | compliant |
| `my-requests.tsx` | PageShell | Y | Y | — | compliant |
| `my-space.tsx` | PageShell | Y | Y | Y | compliant |
| `notification-engine.tsx` | PageShell | Y | Y | — | compliant |
| `notifications.tsx` | PageShell | Y | Y | Y | compliant |
| `obligations.tsx` | PageShell | Y | Y | Y | compliant |
| `operations-center.tsx` | PageShell | Y | Y | Y | compliant |
| `projects.tsx` | PageShell | Y | Y | Y | compliant |
| `projects/gantt.tsx` | PageShell | Y | Y | Y | compliant |
| `projects/risks.tsx` | PageShell | Y | Y | Y | compliant |
| `properties-buildings.tsx` | PageShell | Y | Y | Y | compliant |
| `properties-contracts.tsx` | PageShell | Y | Y | Y | compliant |
| `properties-dashboard.tsx` | PageShell | Y | Y | Y | compliant |
| `properties-maintenance.tsx` | PageShell | Y | Y | Y | compliant |
| `properties-owner-statement.tsx` | PageShell | Y | Y | — | compliant |
| `properties-owners.tsx` | PageShell | Y | Y | Y | compliant |
| `properties-payments.tsx` | PageShell | Y | Y | Y | compliant |
| `properties-tenants.tsx` | PageShell | Y | Y | Y | compliant |
| `properties.tsx` | PageShell | Y | Y | Y | compliant |
| `properties/contract-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `properties/deposits.tsx` | PageShell | Y | Y | Y | compliant |
| `properties/inspections.tsx` | PageShell | Y | Y | Y | compliant |
| `properties/occupancy-report.tsx` | PageShell | Y | Y | — | compliant |
| `reports/print-log.tsx` | PageShell | Y | Y | — | compliant |
| `reports/scheduled-reports.tsx` | PageShell | Y | Y | Y | compliant |
| `requests-page.tsx` | PageShell | Y | Y | Y | compliant |
| `services.tsx` | PageShell | Y | Y | — | compliant |
| `settings-rules.tsx` | PageShell | Y | Y | Y | compliant |
| `settings.tsx` | PageShell | Y | Y | — | compliant |
| `settings/print-templates.tsx` | PageShell | Y | Y | Y | compliant |
| `store.tsx` | PageShell | Y | Y | — | compliant |
| `store/order-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `store/product-detail.tsx` | EntityDetailPage | Y | backPath | Y | compliant |
| `support.tsx` | PageShell | Y | Y | Y | compliant |
| `support/kb.tsx` | PageShell | Y | Y | — | compliant |
| `support/replies.tsx` | PageShell | Y | Y | — | compliant |
| `tasks.tsx` | PageShell | Y | Y | Y | compliant |
| `umrah/agents.tsx` | PageShell | Y | Y | — | compliant |
| `umrah/attachments.tsx` | PageShell | Y | Y | — | compliant |
| `umrah/commission-calculations.tsx` | PageShell | Y | Y | Y | compliant |
| `umrah/commission-plan-editor.tsx` | PageShell | Y | Y | Y | compliant |
| `umrah/commission-plans.tsx` | PageShell | Y | Y | Y | compliant |
| `umrah/daily-runsheet.tsx` | PageShell | Y | Y | Y | compliant |
| `umrah/dashboard.tsx` | PageShell | Y | Y | Y | compliant |
| `umrah/groups.tsx` | PageShell | Y | Y | Y | compliant |
| `umrah/import-wizard.tsx` | PageShell | Y | Y | — | compliant |
| `umrah/import.tsx` | PageShell | Y | Y | — | compliant |
| `umrah/invoices.tsx` | PageShell | Y | Y | — | compliant |
| `umrah/packages.tsx` | PageShell | Y | Y | — | compliant |
| `umrah/payments.tsx` | PageShell | Y | Y | Y | compliant |
| `umrah/penalties.tsx` | PageShell | Y | Y | Y | compliant |
| `umrah/pilgrim-create.tsx` | CreatePageLayout | Y | Y | — | compliant |
| `umrah/pilgrim-detail.tsx` | DetailPageLayout | Y | backPath | Y | compliant |
| `umrah/pilgrims.tsx` | PageShell | Y | Y | Y | compliant |
| `umrah/pricing.tsx` | PageShell | Y | Y | Y | compliant |
| `umrah/reconciliation.tsx` | PageShell | Y | Y | — | compliant |
| `umrah/sales-wizard.tsx` | PageShell | Y | Y | — | compliant |
| `umrah/seasons.tsx` | PageShell | Y | Y | Y | compliant |
| `umrah/settings.tsx` | PageShell | Y | Y | — | compliant |
| `umrah/sub-agents.tsx` | PageShell | Y | Y | Y | compliant |
| `umrah/transport.tsx` | PageShell | Y | Y | Y | compliant |
| `umrah/violation-create.tsx` | CreatePageLayout | Y | Y | — | compliant |
| `umrah/violations.tsx` | PageShell | Y | Y | Y | compliant |
| `warehouse-advanced.tsx` | PageShell | Y | Y | — | compliant |
| `warehouse.tsx` | PageShell | Y | Y | Y | compliant |
| `warehouse/inventory-count.tsx` | PageShell | Y | Y | Y | compliant |
| `workspace.tsx` | PageShell | Y | Y | Y | compliant |

---

## Non-compliant — Recommendations

Every non-compliant page in this list is **intentional** (sub-component, polymorphic wrapper, or special-purpose page like login/print-verify). No further migration is recommended; the items tagged "should move to components/" are deferred to a later renaming sweep — they do not need a layout primitive because they are never rendered as routes.

| Page | Recommendation |
| :--- | :--- |
| `admin/rbac-v2-conditions-editor.tsx` | Sub-component (Dialog-based); should move to components/admin/ |
| `bi/shared.tsx` | Not a routed page — shared utilities for BI tabs; keep as is |
| `finance/customer-statement.tsx` | Polymorphic wrapper — delegates to AccountStatementPage; layout lives in parent |
| `finance/profitability-project.tsx` | Polymorphic wrapper — delegates to ProfitabilityPage; layout lives in parent |
| `finance/profitability-property.tsx` | Polymorphic wrapper — delegates to ProfitabilityPage; layout lives in parent |
| `finance/profitability-umrah-agent.tsx` | Polymorphic wrapper — delegates to ProfitabilityPage; layout lives in parent |
| `finance/profitability-vehicle.tsx` | Polymorphic wrapper — delegates to ProfitabilityPage; layout lives in parent |
| `finance/vendor-statement.tsx` | Polymorphic wrapper — delegates to AccountStatementPage; layout lives in parent |
| `governance/stats-cards.tsx` | Sub-component (named export, takes stats prop); should move to components/ |
| `login.tsx` | Auth flow page — full-bleed marketing-style layout; keep as exception |
| `my-space/role-entities-grid.tsx` | Sub-component (named export, takes props); should move to components/ |
| `my-space/summary-cards.tsx` | Sub-component (named export, takes props); should move to components/ |
| `not-found.tsx` | Standalone 404 view — full-bleed centered layout; keep as exception |
| `print-verify.tsx` | Public verification UI (no app shell); keep as exception |
| `properties-guide.tsx` | Standalone visual guide with custom layout; keep as exception |

---

## Exceptions Catalog (informational)

These pages legitimately do not use any layout primitive and are excluded from compliance enforcement:

- **Auth & error flows:** `login.tsx`, `not-found.tsx`
- **Public utility pages:** `print-verify.tsx` (anonymous QR-scan target), `properties-guide.tsx` (standalone visual guide)
- **Polymorphic wrappers (delegate to shared parent):** `finance/profitability-{vehicle,property,project,umrah-agent}.tsx`, `finance/{customer,vendor}-statement.tsx`
- **Sub-components mis-placed under `pages/`:** `admin/rbac-v2-conditions-editor.tsx`, `bi/shared.tsx`, `governance/stats-cards.tsx`, `my-space/{summary-cards,role-entities-grid}.tsx`

---

## Methodology

- Layout detection: presence of `<PageShell`, `<DetailPageLayout`, `<EntityDetailPage`, `<CreatePageLayout`, or `<ListPage` opening tag.
- Title detection: presence of `title=` prop on the layout primitive call site.
- Breadcrumb detection: `breadcrumbs=` prop (PageShell-family) **or** `backPath=`/`backHref=` (detail-family) — equivalent contracts.
- Actions detection: `actions=` prop on the layout primitive.
- Pages with a layout primitive + title + (breadcrumbs OR backPath) are considered **compliant**.
