# FRONTEND_RUNTIME_AUDIT.md

**Date:** 2026-05-07  
**Harness:** `scripts/src/runtime-audit.cjs` (Puppeteer/Chromium, in-page-fetch login, 5-axis probe)  
**Run command:** `pnpm run audit:runtime`  
**Raw results:** `audit/runtime-audit-results.json` (373 rows)  
**Screenshots (FAILs):** `audit/screenshots/` (69 files)

## Honesty notice

Previous claims of "1510/1510 PASS (100%)" in `FRONTEND_TEST_MATRIX.md` and `replit.md` were **source-review-only** — no real browser ever loaded those routes. This audit replaces them with results from a headless Chromium that actually navigated to every route, watched the network, clicked the primary CTA where applicable, and captured screenshots of failures.

## Axes

| Axis | What it checks | PASS criterion |
|------|----------------|----------------|
| A1 — render  | Page mounts, no React error boundary, no "يحدث خطأ" Arabic error | DOM has body content > 200 chars and no .error-boundary |
| A2 — data fetch | At least one /api/* request and 2xx response after mount | network event captured |
| A3 — primary CTA | Detail/list pages: a primary action button exists & is enabled | button matches /إضافة|تعديل|حفظ|بحث|تنزيل/ |
| A4 — navigation | Page reachable via direct URL (no 404, redirect lands on the same path family) | landedUrl matches expected base |
| A5 — page smoke (create/edit only) | Form fields > 0 AND save button visible | both true |

## Totals across 373 routes

| Axis | PASS | FAIL | SKIP |
|------|------|------|------|
| A1  | 302 | 0 | 71 |
| A2  | 233 | 0 | 140 |
| A3  | 69 | 0 | 304 |
| A4  | 302 | 0 | 71 |
| A5  | 0 | 69 | 304 |

**Per-route disposition:** 233 PASS (no FAIL on any axis), 69 FAIL (≥1 axis FAIL), 71 SKIP (route unreachable, e.g. `:id` could not be resolved because the underlying list API returned 404 or empty).

## Why the previous matrix was wrong

The earlier "1510/1510" was computed from `scripts/src/verify-create-pages.cjs` and `scripts/src/deepCrudTest.cjs` which only covered ~158 of the 373 routes. The remaining ~215 routes were marked PASS purely because their source files existed and exported a default React component. That is not a runtime check.

## A5 FAILs — all 69 are on `/create` and `/edit` pages

All 69 A5 FAILs share the pattern `form=0/save=Y`: the probe found a save button (so the form scaffold rendered) but counted zero `<input|select|textarea>` elements. Manual spot-checks against the screenshots show three classes:

- **Custom field components** (e.g. shadcn `<Combobox>`, `<DatePicker>`, `<RichEditor>`) that don't expose a native form element until first interaction. The probe undercounts these.
- **Lazy hydration** — fields render after a debounced data fetch (e.g. account-tree dropdown) that exceeds the 1500ms grace window.
- **Genuinely read-only pages** that exposed a save button by mistake (1 case: `/finance/intercompany/consolidation/create`).

These are reported here as **A5 FAIL** rather than silently massaged into PASS so the result stays auditable. Follow-up Task #186 will re-run with a hardened probe (interact-then-count) and reclassify.

## Skipped routes (71)

All A1 SKIPs are detail/edit routes whose `:id` could not be resolved. Reasons:

- 5 unresolved: no row in /api/properties/units
- 4 unresolved: /api/hr/evaluation-360 → 404
- 2 unresolved: no row in /api/properties/owners
- 2 unresolved: no row in /api/properties/contracts
- 2 unresolved: /api/crm/leads → 404
- 1 unresolved: no row in /api/warehouse/movements
- 1 unresolved: no row in /api/umrah/violations
- 1 unresolved: no row in /api/umrah/transport
- 1 unresolved: no row in /api/umrah/packages
- 1 unresolved: no row in /api/umrah/commission-plans
- 1 unresolved: no row in /api/properties/tenants
- 1 unresolved: no row in /api/properties/buildings
- 1 unresolved: no row in /api/legal/cases
- 1 unresolved: no row in /api/hr/transfers
- 1 unresolved: no row in /api/hr/performance
- 1 unresolved: no row in /api/hr/payroll
- 1 unresolved: no row in /api/hr/overtime
- 1 unresolved: no row in /api/hr/loans
- 1 unresolved: no row in /api/hr/exit
- 1 unresolved: no row in /api/hr/excuse-requests
- 1 unresolved: no row in /api/governance/policies
- 1 unresolved: no row in /api/governance/compliance
- 1 unresolved: no row in /api/governance/audits
- 1 unresolved: no row in /api/fleet/trips
- 1 unresolved: no row in /api/fleet/traffic-violations
- 1 unresolved: no row in /api/fleet/maintenance
- 1 unresolved: no row in /api/fleet/insurance
- 1 unresolved: no row in /api/fleet/fuel-logs
- 1 unresolved: no row in /api/fleet/drivers
- 1 unresolved: no row in /api/finance/vouchers
- 1 unresolved: no row in /api/finance/salary-advances
- 1 unresolved: no row in /api/finance/recurring-journals
- 1 unresolved: no row in /api/finance/purchase-orders
- 1 unresolved: no row in /api/finance/journal-manual
- 1 unresolved: no row in /api/finance/fixed-assets
- 1 unresolved: no row in /api/finance/financial-requests
- 1 unresolved: no row in /api/finance/expenses
- 1 unresolved: no row in /api/finance/custodies
- 1 unresolved: no row in /api/finance/commitments
- 1 unresolved: no row in /api/finance/budget
- 1 unresolved: no row in /api/correspondence
- 1 unresolved: no id resolver for /umrah/pilgrims/:id
- 1 unresolved: no id resolver for /umrah/penalties/:id
- 1 unresolved: no id resolver for /umrah/invoices/:id
- 1 unresolved: no id resolver for /tasks/:id
- 1 unresolved: no id resolver for /support/:id
- 1 unresolved: no id resolver for /store/products/:id
- 1 unresolved: no id resolver for /store/orders/:id
- 1 unresolved: no id resolver for /requests/:id
- 1 unresolved: no id resolver for /projects/:id
- 1 unresolved: no id resolver for /hr/shifts/:id
- 1 unresolved: no id resolver for /hr/employee-profile/:id
- 1 unresolved: no id resolver for /hr/discipline/memos/:id
- 1 unresolved: no id resolver for /finance/project-costing/:id
- 1 unresolved: no id resolver for /finance/ledger/:code
- 1 unresolved: no id resolver for /finance/bank-reconciliation/manual-match/:batchId/:rowId
- 1 unresolved: /api/legal/sessions → 404
- 1 unresolved: /api/legal/judgments → 404
- 1 unresolved: /api/hr/training → 404
- 1 unresolved: /api/hr/recruitment → 404
- 1 unresolved: /api/hr/leaves → 404

## Per-route results

| Route | A1 | A2 | A3 | A4 | A5 | Note |
|-------|----|----|----|----|----|------|
| /action-center | PASS | PASS | SKIP | PASS | SKIP |  |
| /activity-log | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin/domain-registry | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin/event-monitor | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin/gl-reconciliation | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin/integrations | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin/lifecycle-monitor | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin/logs | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin/monitoring | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin/policy-engine | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin/posting-failures | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin/rbac-matrix | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin/roles | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin/system-governor | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin/system-registry | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin/users | PASS | PASS | SKIP | PASS | SKIP |  |
| /admin/violations-report | PASS | PASS | SKIP | PASS | SKIP |  |
| /automation | PASS | PASS | SKIP | PASS | SKIP |  |
| /bi | PASS | PASS | SKIP | PASS | SKIP |  |
| /bi/admin-reports | PASS | PASS | SKIP | PASS | SKIP |  |
| /bi/dashboards | PASS | PASS | SKIP | PASS | SKIP |  |
| /bi/dashboards/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /bi/kpis | PASS | PASS | SKIP | PASS | SKIP |  |
| /bi/kpis/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /bi/operations | PASS | PASS | SKIP | PASS | SKIP |  |
| /bi/reports | PASS | PASS | SKIP | PASS | SKIP |  |
| /bi/reports/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /calendar | PASS | PASS | SKIP | PASS | SKIP |  |
| /clients | PASS | PASS | SKIP | PASS | SKIP |  |
| /clients/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /clients/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /communications | PASS | PASS | SKIP | PASS | SKIP |  |
| /communications/letters/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /communications/notification-engine | PASS | PASS | SKIP | PASS | SKIP |  |
| /correspondence | PASS | PASS | SKIP | PASS | SKIP |  |
| /correspondence/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/correspondence |
| /correspondence/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /crm | PASS | PASS | SKIP | PASS | SKIP |  |
| /crm/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/crm/leads → 404 |
| /crm/activities | PASS | PASS | SKIP | PASS | SKIP |  |
| /crm/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /crm/leads/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/crm/leads → 404 |
| /crm/pipeline | PASS | PASS | SKIP | PASS | SKIP |  |
| /daily-close | PASS | PASS | SKIP | PASS | SKIP |  |
| /dashboard | PASS | PASS | SKIP | PASS | SKIP |  |
| /documents | PASS | PASS | SKIP | PASS | SKIP |  |
| /documents/:docId/versions | PASS | PASS | SKIP | PASS | SKIP |  |
| /documents/archive | PASS | PASS | SKIP | PASS | SKIP |  |
| /documents/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /documents/folders | PASS | PASS | SKIP | PASS | SKIP |  |
| /documents/templates | PASS | PASS | SKIP | PASS | SKIP |  |
| /documents/upload | PASS | PASS | SKIP | PASS | SKIP |  |
| /employees | PASS | PASS | SKIP | PASS | SKIP |  |
| /employees/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /employees/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /exec-dashboard | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/accounts | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/accounts/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/accounts/:id/edit | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /finance/accounts/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /finance/ap-aging | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/ar-aging | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/bank-guarantees | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/bank-reconciliation | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/bank-reconciliation/manual-match/:batchId/:rowId | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /finance/bank-reconciliation/manual-match/:batchId/:rowId |
| /finance/budget | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/budget/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/budget |
| /finance/budget/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /finance/cash-flow-forecast | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/cashflow | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/commitments | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/commitments/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/commitments |
| /finance/custodies | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/custodies/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/custodies |
| /finance/custodies/report | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/expenses | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/expenses/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/expenses |
| /finance/expenses/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /finance/financial-requests | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/financial-requests/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/financial-requests |
| /finance/fiscal-periods | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/fixed-assets | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/fixed-assets/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/fixed-assets |
| /finance/fixed-assets/batch-depreciate | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/intercompany | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/intercompany/consolidation/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /finance/inventory-costing | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/invoices | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/invoices/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/invoices/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /finance/journal | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/journal-manual | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/journal-manual/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/journal-manual |
| /finance/journal-manual/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /finance/journal/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /finance/ledger/:code | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /finance/ledger/:code |
| /finance/opening-balances | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/opening-balances/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /finance/payments | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/project-costing | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/project-costing/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /finance/project-costing/:id |
| /finance/purchase-orders | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/purchase-orders/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/purchase-orders |
| /finance/purchase-orders/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /finance/receivables | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/receivables/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/recurring-journals | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/recurring-journals/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/recurring-journals |
| /finance/recurring-journals/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /finance/reports | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/salary-advances | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/salary-advances/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/salary-advances |
| /finance/tax | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/treasury | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/vendors | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/vendors/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/vendors/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /finance/vouchers | PASS | PASS | SKIP | PASS | SKIP |  |
| /finance/vouchers/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/finance/vouchers |
| /finance/vouchers/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /finance/year-end-close | PASS | PASS | SKIP | PASS | SKIP |  |
| /fleet | PASS | PASS | SKIP | PASS | SKIP |  |
| /fleet/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /fleet/:id/status | PASS | PASS | SKIP | PASS | SKIP |  |
| /fleet/alerts | PASS | PASS | SKIP | PASS | SKIP |  |
| /fleet/alerts/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /fleet/drivers | PASS | PASS | SKIP | PASS | SKIP |  |
| /fleet/drivers/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/fleet/drivers |
| /fleet/drivers/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /fleet/fuel | PASS | PASS | SKIP | PASS | SKIP |  |
| /fleet/fuel/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/fleet/fuel-logs |
| /fleet/fuel/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /fleet/insurance | PASS | PASS | SKIP | PASS | SKIP |  |
| /fleet/insurance/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/fleet/insurance |
| /fleet/insurance/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /fleet/maintenance | PASS | PASS | SKIP | PASS | SKIP |  |
| /fleet/maintenance/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/fleet/maintenance |
| /fleet/maintenance/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /fleet/preventive-plans | PASS | PASS | SKIP | PASS | SKIP |  |
| /fleet/reports | PASS | PASS | SKIP | PASS | SKIP |  |
| /fleet/tco | PASS | PASS | SKIP | PASS | SKIP |  |
| /fleet/traffic-violations | PASS | PASS | SKIP | PASS | SKIP |  |
| /fleet/traffic-violations/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/fleet/traffic-violations |
| /fleet/trips | PASS | PASS | SKIP | PASS | SKIP |  |
| /fleet/trips/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/fleet/trips |
| /fleet/trips/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /fleet/vehicles/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /governance | PASS | PASS | SKIP | PASS | SKIP |  |
| /governance/audits | PASS | PASS | SKIP | PASS | SKIP |  |
| /governance/audits/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/governance/audits |
| /governance/audits/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /governance/capa | PASS | PASS | SKIP | PASS | SKIP |  |
| /governance/compliance | PASS | PASS | SKIP | PASS | SKIP |  |
| /governance/compliance/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/governance/compliance |
| /governance/compliance/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /governance/policies | PASS | PASS | SKIP | PASS | SKIP |  |
| /governance/policies/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/governance/policies |
| /governance/policies/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /governance/risks | PASS | PASS | SKIP | PASS | SKIP |  |
| /governance/risks/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /governance/risks/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /guide/properties | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/attendance | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/attendance/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/attendance/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /hr/attendance/field-tracking | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/attendance/qr-scanner | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/attendance/reports | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/contracts | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/contracts/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/contracts/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /hr/development-plans | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/discipline/memos | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/discipline/memos/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /hr/discipline/memos/:id |
| /hr/discipline/regulation | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/employee-activation | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/employee-profile/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /hr/employee-profile/:id |
| /hr/evaluation-360 | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/evaluation-360/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/evaluation-360 → 404 |
| /hr/evaluation-360/:id/peer | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/evaluation-360 → 404 |
| /hr/evaluation-360/:id/upward | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/evaluation-360 → 404 |
| /hr/evaluation-360/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /hr/evaluation-360/history/:employeeId | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/evaluation-360 → 404 |
| /hr/excuse-requests | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/excuse-requests/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/hr/excuse-requests |
| /hr/excuse-requests/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /hr/exit | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/exit/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/hr/exit |
| /hr/exit/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /hr/expiring-documents | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/gratuity | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/idp | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/leaves | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/leaves/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/leaves → 404 |
| /hr/leaves/approval-chains | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/leaves/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /hr/leaves/management | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/loans | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/loans/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/hr/loans |
| /hr/loans/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /hr/official-letters | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/onboarding-review | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/organization | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/organization/structure | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/overtime | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/overtime/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/hr/overtime |
| /hr/overtime/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /hr/payroll | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/payroll/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/hr/payroll |
| /hr/payroll/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /hr/payroll/salary-components | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/performance | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/performance/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/hr/performance |
| /hr/performance/advanced | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/performance/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /hr/public-holidays | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/recruitment | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/recruitment/advanced | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/recruitment/applicants/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /hr/recruitment/applications | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/recruitment/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /hr/recruitment/jobs/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/recruitment → 404 |
| /hr/shifts | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/shifts/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /hr/shifts/:id |
| /hr/shifts/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /hr/shifts/management | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/training | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/training/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/training → 404 |
| /hr/training/advanced | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/training/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /hr/transfers | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/transfers/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/hr/transfers |
| /hr/turnover-report | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/violations | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/violations/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/violations/auto-detection | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/violations/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /hr/violations/management | PASS | PASS | SKIP | PASS | SKIP |  |
| /hr/violations/penalty-escalation | PASS | PASS | SKIP | PASS | SKIP |  |
| /insights | PASS | PASS | SKIP | PASS | SKIP |  |
| /intelligence | PASS | PASS | SKIP | PASS | SKIP |  |
| /legal | PASS | PASS | SKIP | PASS | SKIP |  |
| /legal/cases | PASS | PASS | SKIP | PASS | SKIP |  |
| /legal/cases/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/legal/cases |
| /legal/cases/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /legal/contracts | PASS | PASS | SKIP | PASS | SKIP |  |
| /legal/contracts/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /legal/correspondence | PASS | PASS | SKIP | PASS | SKIP |  |
| /legal/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /legal/documents | PASS | PASS | SKIP | PASS | SKIP |  |
| /legal/judgments | PASS | PASS | SKIP | PASS | SKIP |  |
| /legal/judgments/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/legal/judgments → 404 |
| /legal/sessions | PASS | PASS | SKIP | PASS | SKIP |  |
| /legal/sessions/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/legal/sessions → 404 |
| /manager-board | PASS | PASS | SKIP | PASS | SKIP |  |
| /marketing | PASS | PASS | SKIP | PASS | SKIP |  |
| /marketing/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /module-dashboards | PASS | PASS | SKIP | PASS | SKIP |  |
| /my-attendance | PASS | PASS | SKIP | PASS | SKIP |  |
| /my-documents | PASS | PASS | SKIP | PASS | SKIP |  |
| /my-leave-request | PASS | PASS | SKIP | PASS | SKIP |  |
| /my-loans | PASS | PASS | SKIP | PASS | SKIP |  |
| /my-overtime | PASS | PASS | SKIP | PASS | SKIP |  |
| /my-payslip | PASS | PASS | SKIP | PASS | SKIP |  |
| /my-performance | PASS | PASS | SKIP | PASS | SKIP |  |
| /my-requests | PASS | PASS | SKIP | PASS | SKIP |  |
| /my-space | PASS | PASS | SKIP | PASS | SKIP |  |
| /notifications | PASS | PASS | SKIP | PASS | SKIP |  |
| /obligations | PASS | PASS | SKIP | PASS | SKIP |  |
| /operations-center | PASS | PASS | SKIP | PASS | SKIP |  |
| /projects | PASS | PASS | SKIP | PASS | SKIP |  |
| /projects/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /projects/:id |
| /projects/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /projects/gantt | PASS | PASS | SKIP | PASS | SKIP |  |
| /projects/risks | PASS | PASS | SKIP | PASS | SKIP |  |
| /projects/tasks | PASS | PASS | SKIP | PASS | SKIP |  |
| /properties | PASS | PASS | SKIP | PASS | SKIP |  |
| /properties/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/properties/units |
| /properties/:id/status | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/properties/units |
| /properties/buildings | PASS | PASS | SKIP | PASS | SKIP |  |
| /properties/buildings/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/properties/buildings |
| /properties/buildings/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /properties/contracts | PASS | PASS | SKIP | PASS | SKIP |  |
| /properties/contracts/:contractId/pay/:installmentId | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/properties/contracts |
| /properties/contracts/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/properties/contracts |
| /properties/contracts/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /properties/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /properties/dashboard | PASS | PASS | SKIP | PASS | SKIP |  |
| /properties/deposits | PASS | PASS | SKIP | PASS | SKIP |  |
| /properties/guide | PASS | PASS | SKIP | PASS | SKIP |  |
| /properties/inspections | PASS | PASS | SKIP | PASS | SKIP |  |
| /properties/maintenance | PASS | PASS | SKIP | PASS | SKIP |  |
| /properties/maintenance/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/properties/units |
| /properties/maintenance/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /properties/occupancy-report | PASS | PASS | SKIP | PASS | SKIP |  |
| /properties/owners | PASS | PASS | SKIP | PASS | SKIP |  |
| /properties/owners/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/properties/owners |
| /properties/owners/:id/edit | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/properties/owners |
| /properties/owners/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /properties/payments | PASS | PASS | SKIP | PASS | SKIP |  |
| /properties/payments/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/properties/units |
| /properties/payments/:paymentId/pay | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/properties/units |
| /properties/tenants | PASS | PASS | SKIP | PASS | SKIP |  |
| /properties/tenants/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/properties/tenants |
| /properties/tenants/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /reports/scheduled | PASS | PASS | SKIP | PASS | SKIP |  |
| /requests | PASS | PASS | SKIP | PASS | SKIP |  |
| /requests/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /requests/:id |
| /requests/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /requests/types | PASS | PASS | SKIP | PASS | SKIP |  |
| /requests/types/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /requests/workflows | PASS | PASS | SKIP | PASS | SKIP |  |
| /settings | PASS | PASS | SKIP | PASS | SKIP |  |
| /settings/audit-log | PASS | PASS | SKIP | PASS | SKIP |  |
| /settings/branches | PASS | PASS | SKIP | PASS | SKIP |  |
| /settings/companies | PASS | PASS | SKIP | PASS | SKIP |  |
| /settings/departments | PASS | PASS | SKIP | PASS | SKIP |  |
| /settings/rules | PASS | PASS | SKIP | PASS | SKIP |  |
| /store | PASS | PASS | SKIP | PASS | SKIP |  |
| /store/orders | PASS | PASS | SKIP | PASS | SKIP |  |
| /store/orders/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /store/orders/:id |
| /store/orders/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /store/products/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /store/products/:id |
| /store/products/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /support | PASS | PASS | SKIP | PASS | SKIP |  |
| /support/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /support/:id |
| /support/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /support/kb | PASS | PASS | SKIP | PASS | SKIP |  |
| /support/replies | PASS | PASS | SKIP | PASS | SKIP |  |
| /tasks | PASS | PASS | SKIP | PASS | SKIP |  |
| /tasks/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /tasks/:id |
| /tasks/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /umrah | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/agents | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/agents/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/commission-plans | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/commission-plans/:id/edit | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/umrah/commission-plans |
| /umrah/commission-plans/new | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/import | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/import/legacy | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/invoices | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/invoices/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /umrah/invoices/:id |
| /umrah/packages | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/packages/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/umrah/packages |
| /umrah/penalties | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/penalties/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /umrah/penalties/:id |
| /umrah/pilgrims | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/pilgrims/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /umrah/pilgrims/:id |
| /umrah/pilgrims/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /umrah/pricing | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/seasons | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/seasons/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/sub-agents | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/transport | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/transport/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/umrah/transport |
| /umrah/violations | PASS | PASS | SKIP | PASS | SKIP |  |
| /umrah/violations/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/umrah/violations |
| /warehouse | PASS | PASS | SKIP | PASS | SKIP |  |
| /warehouse/categories | PASS | PASS | SKIP | PASS | SKIP |  |
| /warehouse/categories/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /warehouse/categories/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /warehouse/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /warehouse/inventory-count | PASS | PASS | SKIP | PASS | SKIP |  |
| /warehouse/movements | PASS | PASS | SKIP | PASS | SKIP |  |
| /warehouse/movements/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no row in /api/warehouse/movements |
| /warehouse/movements/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
| /warehouse/products/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /warehouse/suppliers | PASS | PASS | SKIP | PASS | SKIP |  |
| /warehouse/suppliers/:id | PASS | PASS | SKIP | PASS | SKIP |  |
| /warehouse/suppliers/create | PASS | SKIP | PASS | PASS | FAIL | form=0/save=Y |
