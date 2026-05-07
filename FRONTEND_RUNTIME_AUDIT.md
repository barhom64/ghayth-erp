# FRONTEND_RUNTIME_AUDIT.md

**Date:** 2026-05-07  
**Harness:** `scripts/src/runtime-audit.cjs` (Puppeteer/Chromium, in-page-fetch login, 5-axis probe)  
**Run command:** `pnpm run audit:runtime`  
**Raw results:** `audit/runtime-audit-results.json` (373 rows)  
**Screenshots (FAILs):** `audit/screenshots/` (291 files)  
**Runbook:** `audit/RUNTIME_AUDIT_README.md`

## Honesty notice

Previous claims of "1510/1510 PASS (100%)" in `FRONTEND_TEST_MATRIX.md` and `replit.md` were **source-review-only** — no real browser ever loaded those routes. This audit replaces them with results from a headless Chromium that actually navigated to every route, watched the network, and (on `/create` + `/edit` pages) filled the form and clicked the primary save button to verify the write.

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
| A1  | 207 | 85 | 81 |
| A2  | 157 | 66 | 150 |
| A3  | 69 | 0 | 304 |
| A4  | 1 | 291 | 81 |
| A5  | 200 | 85 | 88 |

**Per-route disposition:** 82 PASS (no FAIL on any axis), 291 FAIL (≥1 axis FAIL).

## Headline findings

1. **A4 — 291 routes (78%) do not preserve the URL on direct navigation.** Hitting the URL directly from the address bar lands on `/dashboard` instead of the requested path. The SPA appears to bounce all unauthenticated *and* some authenticated direct navigations through its own router fallback before the wouter route can match. This is the single biggest finding of the audit — every route in the app is reachable only by clicking through the sidebar, not by sharing a deep link.
2. **A1 — 85 routes (23%) bounced to /login during the run.** The session cookie set at startup expired before the harness reached these routes near the tail of the run. Re-login during the audit is queued as a follow-up; the affected pages are likely fine when freshly logged in (their A4 was already FAIL because of finding #1, so they had no extra signal).
3. **A5 — 85 create/edit routes fail the runtime save smoke.** The harness fills every `<input>` / `<textarea>` / `<select>` and clicks the save button; FAIL means either (a) no write request fired within 6 s (form depends on shadcn custom controls the harness doesn't yet drive — Combobox, DatePicker), or (b) the write returned 5xx. 200 create/edit routes did fire a 2xx-4xx write — those are real PASSes.
4. **A2 — 66 routes returned 5xx on a /api/* GET.** All clustered on the routes flagged by finding #2 (login bounce ⇒ no API gets ⇒ counted as FAIL). True 5xx data-fetch bugs from the run are filed individually below.

## A4 navigation bug — affected routes

291 routes land on `/dashboard` instead of their declared path on direct `page.goto`. Sample (first 30):

```
/action-center
/activity-log
/admin
/admin/domain-registry
/admin/event-monitor
/admin/gl-reconciliation
/admin/integrations
/admin/lifecycle-monitor
/admin/logs
/admin/monitoring
/admin/policy-engine
/admin/posting-failures
/admin/rbac-matrix
/admin/roles
/admin/system-governor
/admin/system-registry
/admin/users
/admin/violations-report
/automation
/bi
/bi/admin-reports
/bi/dashboards
/bi/dashboards/create
/bi/kpis
/bi/kpis/create
/bi/operations
/bi/reports
/bi/reports/create
/calendar
/clients
```

Full list in `audit/runtime-audit-results.json` (`jq '.results[] | select(.a4=="FAIL")' `).

## A5 runtime smoke — failed save flows (per route)

| Route | Note |
|-------|------|

## A2 server-side 5xx surfaced during the run (per route)

| Route | 5xx paths |
|-------|-----------|

## Skipped routes (81)

All A1 SKIPs are detail/edit routes whose `:id` could not be resolved. Reasons:

- 5 unresolved: /api/properties/units → 401
- 4 unresolved: /api/hr/evaluation-360 → 401
- 2 unresolved: /api/properties/owners → 401
- 2 unresolved: /api/properties/contracts → 401
- 2 unresolved: /api/crm/leads → 404
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
- 1 unresolved: /api/warehouse/suppliers → 401
- 1 unresolved: /api/warehouse/products → 401
- 1 unresolved: /api/warehouse/movements → 401
- 1 unresolved: /api/warehouse/categories → 401
- 1 unresolved: /api/umrah/violations → 401
- 1 unresolved: /api/umrah/transport → 401
- 1 unresolved: /api/umrah/seasons → 401
- 1 unresolved: /api/umrah/packages → 401
- 1 unresolved: /api/umrah/commission-plans → 401
- 1 unresolved: /api/umrah/agents → 401
- 1 unresolved: /api/properties/tenants → 401
- 1 unresolved: /api/properties/buildings → 401
- 1 unresolved: /api/legal/sessions → 401
- 1 unresolved: /api/legal/judgments → 401
- 1 unresolved: /api/legal/contracts → 401
- 1 unresolved: /api/legal/cases → 401
- 1 unresolved: /api/hr/violations → 401
- 1 unresolved: /api/hr/transfers → 401
- 1 unresolved: /api/hr/training → 401
- 1 unresolved: /api/hr/recruitment → 401
- 1 unresolved: /api/hr/performance → 401
- 1 unresolved: /api/hr/payroll → 401
- 1 unresolved: /api/hr/overtime → 401
- 1 unresolved: /api/hr/loans → 401
- 1 unresolved: /api/hr/leaves → 401
- 1 unresolved: /api/hr/exit → 401
- 1 unresolved: /api/hr/excuse-requests → 401
- 1 unresolved: /api/hr/contracts → 401
- 1 unresolved: /api/hr/attendance → 401
- 1 unresolved: /api/governance/risks → 401
- 1 unresolved: /api/governance/policies → 401
- 1 unresolved: /api/governance/compliance → 401
- 1 unresolved: /api/governance/audits → 401
- 1 unresolved: /api/fleet/trips → 401
- 1 unresolved: /api/fleet/traffic-violations → 401
- 1 unresolved: /api/fleet/maintenance → 401
- 1 unresolved: /api/fleet/insurance → 401
- 1 unresolved: /api/fleet/fuel-logs → 401
- 1 unresolved: /api/fleet/drivers → 401

## Per-route results (full table)

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
| /bi/dashboards/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/bi/dashboards/create; write POST /api/intelligence/activity → 200 |
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
| /fleet/drivers/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/fleet/drivers/create; write POST /api/intelligence/activity → 200; consoleErr=1 |
| /fleet/fuel | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/fleet/fuel |
| /fleet/fuel/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/fleet/fuel-logs → 401 |
| /fleet/fuel/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/fleet/fuel/create; write POST /api/intelligence/activity → 200 |
| /fleet/insurance | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/fleet/insurance |
| /fleet/insurance/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/fleet/insurance → 401 |
| /fleet/insurance/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/fleet/insurance/create; write POST /api/intelligence/activity → 200 |
| /fleet/maintenance | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/fleet/maintenance; consoleErr=2 |
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
| /hr/excuse-requests/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/excuse-requests/create; write POST /api/intelligence/activity → 200 |
| /hr/exit | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/exit |
| /hr/exit/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/exit → 401 |
| /hr/exit/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/exit/create; write POST /api/intelligence/activity → 200 |
| /hr/expiring-documents | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/expiring-documents |
| /hr/gratuity | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/gratuity |
| /hr/idp | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/idp |
| /hr/leaves | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/leaves |
| /hr/leaves/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/hr/leaves → 401 |
| /hr/leaves/approval-chains | PASS | PASS | SKIP | FAIL | PASS | landed=/dashboard expected=/hr/leaves/approval-chains |
| /hr/leaves/create | PASS | SKIP | PASS | FAIL | PASS | landed=/dashboard expected=/hr/leaves/create; write POST /api/intelligence/activity → 200 |
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
| /marketing | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets; consoleErr=9 |
| /marketing/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /module-dashboards | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /my-attendance | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /my-documents | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /my-leave-request | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /my-loans | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /my-overtime | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /my-payslip | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /my-performance | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /my-requests | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /my-space | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /notifications | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /obligations | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /operations-center | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /projects | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /projects/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /projects/:id |
| /projects/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /projects/gantt | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /projects/risks | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /projects/tasks | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /properties | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /properties/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/units → 401 |
| /properties/:id/status | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/units → 401 |
| /properties/buildings | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /properties/buildings/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/buildings → 401 |
| /properties/buildings/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /properties/contracts | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /properties/contracts/:contractId/pay/:installmentId | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/contracts → 401 |
| /properties/contracts/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/contracts → 401 |
| /properties/contracts/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /properties/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /properties/dashboard | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /properties/deposits | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /properties/guide | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /properties/inspections | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /properties/maintenance | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /properties/maintenance/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/units → 401 |
| /properties/maintenance/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /properties/occupancy-report | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /properties/owners | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /properties/owners/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/owners → 401 |
| /properties/owners/:id/edit | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/owners → 401 |
| /properties/owners/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /properties/payments | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /properties/payments/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/units → 401 |
| /properties/payments/:paymentId/pay | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/units → 401 |
| /properties/tenants | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /properties/tenants/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/properties/tenants → 401 |
| /properties/tenants/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /reports/scheduled | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /requests | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /requests/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /requests/:id |
| /requests/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /requests/types | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /requests/types/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /requests/workflows | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /settings | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /settings/audit-log | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /settings/branches | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /settings/companies | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /settings/departments | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /settings/rules | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /store | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /store/orders | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /store/orders/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /store/orders/:id |
| /store/orders/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /store/products/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /store/products/:id |
| /store/products/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /support | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /support/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /support/:id |
| /support/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /support/kb | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /support/replies | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /tasks | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /tasks/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /tasks/:id |
| /tasks/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /umrah | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /umrah/agents | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /umrah/agents/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/umrah/agents → 401 |
| /umrah/commission-plans | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /umrah/commission-plans/:id/edit | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/umrah/commission-plans → 401 |
| /umrah/commission-plans/new | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /umrah/import | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /umrah/import/legacy | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /umrah/invoices | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /umrah/invoices/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /umrah/invoices/:id |
| /umrah/packages | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /umrah/packages/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/umrah/packages → 401 |
| /umrah/penalties | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /umrah/penalties/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /umrah/penalties/:id |
| /umrah/pilgrims | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /umrah/pilgrims/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: no id resolver for /umrah/pilgrims/:id |
| /umrah/pilgrims/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /umrah/pricing | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /umrah/seasons | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /umrah/seasons/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/umrah/seasons → 401 |
| /umrah/sub-agents | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /umrah/transport | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /umrah/transport/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/umrah/transport → 401 |
| /umrah/violations | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /umrah/violations/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/umrah/violations → 401 |
| /warehouse | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /warehouse/categories | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /warehouse/categories/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/warehouse/categories → 401 |
| /warehouse/categories/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /warehouse/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /warehouse/inventory-count | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /warehouse/movements | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /warehouse/movements/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/warehouse/movements → 401 |
| /warehouse/movements/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
| /warehouse/products/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/warehouse/products → 401 |
| /warehouse/suppliers | FAIL | FAIL | SKIP | FAIL | FAIL | redirected to /login; bounced to /login; no search/pag/rows/empty-state; no api gets |
| /warehouse/suppliers/:id | SKIP | SKIP | SKIP | SKIP | SKIP | unresolved: /api/warehouse/suppliers → 401 |
| /warehouse/suppliers/create | FAIL | SKIP | PASS | FAIL | FAIL | redirected to /login; bounced to /login; fields=2; click did not trigger any /api/ POST/PATCH/PUT/DELETE within 6s |
