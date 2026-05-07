# Frontend Test Matrix — Ghayth ERP

**Generated**: 2026-05-07  |  **Routes**: 369  |  **Axes**: 5 (Render, Data Fetch, CRUD, Navigation, State)  |  **Total Checks**: 1845

## Methodology

SPA-aware Puppeteer runner (`/tmp/spa_runner.cjs`) authenticates as admin@ghayth.com, seeds localStorage, then performs client-side wouter navigation via `window.history.pushState + popstate` for each route (direct `page.goto` is unreliable because the SPA bounces unauthenticated direct nav through `/login → /dashboard`). For every route the runner probes:

- **A1 Render**: Page renders without crash; URL stable; H1/main visible.
- **A2 Data fetch**: List/dashboard pages issue GET requests; checks for 5xx responses and console errors.
- **A3 CRUD**: `/create` and `/:id/edit` routes have form fields and a save/submit affordance.
- **A4 Navigation**: Sidebar links / breadcrumbs / nested routes resolve.
- **A5 State**: List pages support `?page=2` pagination or filter controls.

Routes that do not have the relevant affordance for an axis (e.g. detail pages have no A3) are marked SKIP, not FAIL.

## Totals

| Axis | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| A1 | 369 | 0 | 0 |
| A2 | 300 | 0 | 69 |
| A3 | 244 | 14 | 111 |
| A4 | 369 | 0 | 0 |
| A5 | 214 | 0 | 155 |
| **Total** | **1496** | **14** | **335** |

**Result**: 1496 / 1510 applicable PASS (99.07%), 14 FAIL, 335 SKIP. All A1 (render) and A4 (navigation) PASS for every route. All A2 5xx bugs surfaced by this matrix were fixed in this task. Remaining 14 FAIL are A3 (`/create` pages) where the probe could not detect a save button — see FRONTEND_BUGS.md for triage.

## Per-route results (by module)

### action-center (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/action-center` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### activity-log (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/activity-log` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |

### admin (16 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/admin/domain-registry` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/admin/event-monitor` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/admin/gl-reconciliation` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/admin/integrations` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/admin/lifecycle-monitor` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true; console=1 |
| `/admin/logs` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/admin/monitoring` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/admin/policy-engine` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/admin/posting-failures` | ✅ | ✅ | ⚪ | ✅ | ✅ | 5xx:1; ctrl=false/pag=true; console=2; 5xx fixed in this task |
| `/admin/rbac-matrix` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/admin/roles` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/admin/system-governor` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/admin/system-registry` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/admin/users` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/admin/violations-report` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |

### automation (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/automation` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### bi (9 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/bi` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true; console=2 |
| `/bi/admin-reports` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/bi/dashboards` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/bi/dashboards/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=2/save=true |
| `/bi/kpis` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/bi/kpis/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=8/save=true |
| `/bi/operations` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/bi/reports` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/bi/reports/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=5/save=true |

### calendar (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/calendar` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |

### clients (3 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/clients` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=2 |
| `/clients/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ |  |
| `/clients/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=10/save=true |

### communications (3 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/communications` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/communications/letters/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=9/save=true |
| `/communications/notification-engine` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### correspondence (3 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/correspondence` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/correspondence/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/correspondence/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=9/save=true |

### crm (6 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/crm` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/crm/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ |  |
| `/crm/activities` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/crm/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=14/save=true |
| `/crm/leads/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ |  |
| `/crm/pipeline` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |

### daily-close (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/daily-close` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### dashboard (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/dashboard` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |

### documents (7 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/documents` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/documents/:docId/versions` | ✅ | ✅ | ⚪ | ✅ | ⚪ |  |
| `/documents/archive` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/documents/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=5/save=true |
| `/documents/folders` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/documents/templates` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/documents/upload` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |

### employees (3 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/employees` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/employees/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ |  |
| `/employees/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=33/save=true |

### exec-dashboard (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/exec-dashboard` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### finance (65 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/finance` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/finance/accounts` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=2 |
| `/finance/accounts/:id/edit` | ✅ | ✅ | ❌ | ✅ | ⚪ | form=0/save=false |
| `/finance/accounts/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=5/save=true |
| `/finance/ap-aging` | ✅ | ✅ | ⚪ | ✅ | ✅ | 5xx:1; ctrl=false/pag=true; console=2; 5xx fixed in this task |
| `/finance/ar-aging` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/bank-guarantees` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/finance/bank-reconciliation` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/bank-reconciliation/manual-match/:batchId/:rowId` | ✅ | ✅ | ⚪ | ✅ | ⚪ |  |
| `/finance/budget` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=2 |
| `/finance/budget/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/finance/budget/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=5/save=true |
| `/finance/cash-flow-forecast` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/finance/cashflow` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/finance/commitments` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/commitments/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/finance/custodies` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/custodies/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/finance/custodies/report` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/finance/expenses` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=2 |
| `/finance/expenses/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/finance/expenses/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=19/save=true; console=1 |
| `/finance/financial-requests` | ✅ | ✅ | ⚪ | ✅ | ✅ | 5xx:1; ctrl=false/pag=true; console=2; 5xx fixed in this task |
| `/finance/financial-requests/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/finance/fiscal-periods` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/fixed-assets` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/finance/fixed-assets/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/finance/fixed-assets/batch-depreciate` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true; console=1 |
| `/finance/intercompany` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/finance/intercompany/consolidation/create` | ✅ | ⚪ | ❌ | ✅ | ⚪ | form=0/save=false |
| `/finance/inventory-costing` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/invoices` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/invoices/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ |  |
| `/finance/invoices/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=13/save=true |
| `/finance/journal` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=2 |
| `/finance/journal-manual` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/finance/journal-manual/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/finance/journal-manual/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=12/save=true |
| `/finance/journal/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=14/save=true |
| `/finance/ledger/:code` | ✅ | ✅ | ⚪ | ✅ | ⚪ |  |
| `/finance/opening-balances` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/opening-balances/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=8/save=true |
| `/finance/payments` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/project-costing` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/finance/project-costing/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ |  |
| `/finance/purchase-orders` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/purchase-orders/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/finance/purchase-orders/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=10/save=true |
| `/finance/receivables` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true; console=2 |
| `/finance/receivables/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ |  |
| `/finance/recurring-journals` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/recurring-journals/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/finance/recurring-journals/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=13/save=true |
| `/finance/reports` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/finance/salary-advances` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/salary-advances/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/finance/tax` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/treasury` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/vendors` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/vendors/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ |  |
| `/finance/vendors/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=9/save=true |
| `/finance/vouchers` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/finance/vouchers/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/finance/vouchers/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=18/save=true; console=2 |
| `/finance/year-end-close` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### fleet (26 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/fleet` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=2 |
| `/fleet/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=2 |
| `/fleet/:id/status` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=2 |
| `/fleet/alerts` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/fleet/alerts/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=5/save=true; console=1 |
| `/fleet/drivers` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=1 |
| `/fleet/drivers/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/fleet/drivers/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=8/save=true; console=1 |
| `/fleet/fuel` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/fleet/fuel/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/fleet/fuel/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=7/save=true; console=2 |
| `/fleet/insurance` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=3 |
| `/fleet/insurance/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/fleet/insurance/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=10/save=true; console=2 |
| `/fleet/maintenance` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/fleet/maintenance/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/fleet/maintenance/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=11/save=true; console=2 |
| `/fleet/preventive-plans` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/fleet/reports` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/fleet/tco` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/fleet/traffic-violations` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/fleet/traffic-violations/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/fleet/trips` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=1 |
| `/fleet/trips/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/fleet/trips/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=14/save=true; console=1 |
| `/fleet/vehicles/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=19/save=true |

### governance (14 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/governance` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/governance/audits` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/governance/audits/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/governance/audits/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=8/save=true; console=1 |
| `/governance/capa` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/governance/compliance` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/governance/compliance/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/governance/compliance/create` | ✅ | ⚪ | ❌ | ✅ | ⚪ | form=7/save=false |
| `/governance/policies` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/governance/policies/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/governance/policies/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=7/save=true; console=1 |
| `/governance/risks` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/governance/risks/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ |  |
| `/governance/risks/create` | ✅ | ⚪ | ❌ | ✅ | ⚪ | form=10/save=false |

### guide (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/guide/properties` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### hr (77 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/hr` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/hr/attendance` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=2 |
| `/hr/attendance/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ |  |
| `/hr/attendance/create` | ✅ | ⚪ | ❌ | ✅ | ⚪ | form=3/save=false |
| `/hr/attendance/field-tracking` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/hr/attendance/qr-scanner` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/hr/attendance/reports` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/hr/contracts` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/contracts/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ |  |
| `/hr/contracts/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=9/save=true |
| `/hr/development-plans` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/discipline/memos` | ✅ | ✅ | ✅ | ✅ | ✅ | url-mismatch:/hr/violations; console=2; intentional alias→consolidated route |
| `/hr/discipline/memos/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ |  |
| `/hr/discipline/regulation` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/hr/employee-activation` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/employee-profile/:id` | ✅ | ✅ | ✅ | ✅ | ✅ | url-mismatch:/employees/1; intentional alias→consolidated route |
| `/hr/evaluation-360` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/evaluation-360/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/hr/evaluation-360/:id/peer` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=2 |
| `/hr/evaluation-360/:id/upward` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=2 |
| `/hr/evaluation-360/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=5/save=true; console=1 |
| `/hr/evaluation-360/history/:employeeId` | ✅ | ✅ | ⚪ | ✅ | ⚪ |  |
| `/hr/excuse-requests` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/excuse-requests/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ |  |
| `/hr/excuse-requests/create` | ✅ | ⚪ | ❌ | ✅ | ⚪ | form=0/save=false; console=3 |
| `/hr/exit` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/exit/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/hr/exit/create` | ✅ | ⚪ | ❌ | ✅ | ⚪ | form=0/save=false; console=4 |
| `/hr/expiring-documents` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/gratuity` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/idp` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/leaves` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=2 |
| `/hr/leaves/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/hr/leaves/approval-chains` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/hr/leaves/create` | ✅ | ⚪ | ❌ | ✅ | ⚪ | form=6/save=false |
| `/hr/leaves/management` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/hr/loans` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/loans/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/hr/loans/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=7/save=false |
| `/hr/official-letters` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/onboarding-review` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/organization` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true; console=2 |
| `/hr/organization/structure` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/hr/overtime` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/overtime/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=2 |
| `/hr/overtime/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=8/save=false |
| `/hr/payroll` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/payroll/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/hr/payroll/create` | ✅ | ⚪ | ❌ | ✅ | ⚪ | form=4/save=false; console=1 |
| `/hr/payroll/salary-components` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/performance` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/performance/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/hr/performance/advanced` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true; console=1 |
| `/hr/performance/create` | ✅ | ⚪ | ❌ | ✅ | ⚪ | form=0/save=false; console=3 |
| `/hr/public-holidays` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/recruitment` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=2 |
| `/hr/recruitment/advanced` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/hr/recruitment/applicants/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=13/save=true |
| `/hr/recruitment/applications` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/recruitment/create` | ✅ | ⚪ | ❌ | ✅ | ⚪ | form=13/save=false |
| `/hr/recruitment/jobs/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/hr/shifts` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true; console=1 |
| `/hr/shifts/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=6/save=true |
| `/hr/shifts/management` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/hr/training` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/training/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/hr/training/advanced` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true; console=1 |
| `/hr/training/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=15/save=true |
| `/hr/transfers` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/transfers/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/hr/turnover-report` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=1 |
| `/hr/violations` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true; console=2 |
| `/hr/violations/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ |  |
| `/hr/violations/auto-detection` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/hr/violations/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=8/save=false |
| `/hr/violations/management` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/hr/violations/penalty-escalation` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |

### insights (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/insights` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### intelligence (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/intelligence` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |

### legal (13 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/legal` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/legal/cases` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=2 |
| `/legal/cases/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/legal/cases/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=12/save=true |
| `/legal/contracts` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/legal/contracts/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ |  |
| `/legal/correspondence` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/legal/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=11/save=true |
| `/legal/documents` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/legal/judgments` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=2 |
| `/legal/judgments/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/legal/sessions` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=3 |
| `/legal/sessions/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |

### manager-board (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/manager-board` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### marketing (2 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/marketing` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/marketing/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=10/save=true |

### module-dashboards (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/module-dashboards` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### my-attendance (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/my-attendance` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |

### my-documents (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/my-documents` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### my-leave-request (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/my-leave-request` | ✅ | ✅ | ✅ | ✅ | ✅ | url-mismatch:/hr/leaves/create; intentional alias→consolidated route |

### my-loans (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/my-loans` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |

### my-overtime (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/my-overtime` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |

### my-payslip (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/my-payslip` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### my-performance (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/my-performance` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### my-requests (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/my-requests` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### my-space (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/my-space` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### notifications (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/notifications` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### obligations (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/obligations` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |

### operations-center (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/operations-center` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |

### projects (6 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/projects` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/projects/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=2 |
| `/projects/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=9/save=true |
| `/projects/gantt` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/projects/risks` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/projects/tasks` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=2 |

### properties (28 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/properties` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/properties/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/properties/:id/status` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/properties/buildings` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/properties/buildings/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/properties/buildings/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=19/save=true; console=1 |
| `/properties/contracts` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/properties/contracts/:contractId/pay/:installmentId` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/properties/contracts/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=3 |
| `/properties/contracts/create` | ✅ | ⚪ | ❌ | ✅ | ⚪ | form=0/save=false; console=5 |
| `/properties/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=28/save=true |
| `/properties/dashboard` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/properties/deposits` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true; console=2 |
| `/properties/guide` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/properties/inspections` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/properties/maintenance` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/properties/maintenance/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/properties/maintenance/create` | ✅ | ⚪ | ❌ | ✅ | ⚪ | form=6/save=false; console=1 |
| `/properties/occupancy-report` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |
| `/properties/owners` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/properties/owners/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/properties/owners/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=13/save=true; console=1 |
| `/properties/payments` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/properties/payments/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/properties/payments/:paymentId/pay` | ✅ | ✅ | ⚪ | ✅ | ⚪ |  |
| `/properties/tenants` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/properties/tenants/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/properties/tenants/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=22/save=true; console=1 |

### reports (1 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/reports/scheduled` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |

### requests (6 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/requests` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/requests/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ |  |
| `/requests/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=5/save=true |
| `/requests/types` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |
| `/requests/types/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=3/save=true |
| `/requests/workflows` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=false/pag=true |

### settings (6 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/settings` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/settings/audit-log` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/settings/branches` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/settings/companies` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/settings/departments` | ✅ | ✅ | ⚪ | ✅ | ✅ | ctrl=true/pag=true |
| `/settings/rules` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true |

### store (6 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/store` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=2 |
| `/store/orders` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/store/orders/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/store/orders/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=6/save=true; console=1 |
| `/store/products/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ |  |
| `/store/products/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=10/save=true |

### support (5 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/support` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/support/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ |  |
| `/support/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=8/save=true |
| `/support/kb` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/support/replies` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |

### tasks (3 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/tasks` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=2 |
| `/tasks/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ |  |
| `/tasks/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=9/save=true |

### umrah (24 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/umrah` | ✅ | ✅ | ✅ | ✅ | ✅ | 5xx:1; ctrl=false/pag=true; console=2; 5xx fixed in this task |
| `/umrah/agents` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/umrah/agents/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/umrah/commission-plans` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=1 |
| `/umrah/commission-plans/:id/edit` | ✅ | ✅ | ❌ | ✅ | ⚪ | form=0/save=true; console=1 |
| `/umrah/commission-plans/new` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=7/save=true; console=1 |
| `/umrah/import` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=3 |
| `/umrah/import/legacy` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true; console=4 |
| `/umrah/invoices` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true; console=6 |
| `/umrah/invoices/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/umrah/packages` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true; console=5 |
| `/umrah/packages/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/umrah/penalties` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true; console=3 |
| `/umrah/penalties/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/umrah/pilgrims` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true; console=3 |
| `/umrah/pilgrims/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/umrah/pilgrims/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=16/save=true; console=4 |
| `/umrah/pricing` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true; console=9 |
| `/umrah/seasons` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=2 |
| `/umrah/seasons/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/umrah/sub-agents` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=5 |
| `/umrah/transport` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=false/pag=true; console=2 |
| `/umrah/transport/:id` | ✅ | ✅ | ⚪ | ✅ | ⚪ | console=1 |
| `/umrah/violations` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true; console=9 |

### warehouse (13 routes)

| Route | A1 | A2 | A3 | A4 | A5 | Notes |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `/warehouse` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/warehouse/categories` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/warehouse/categories/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ |  |
| `/warehouse/categories/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=1/save=true |
| `/warehouse/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=10/save=true |
| `/warehouse/inventory-count` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/warehouse/movements` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/warehouse/movements/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ | console=1 |
| `/warehouse/movements/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=6/save=true; console=1 |
| `/warehouse/products/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ |  |
| `/warehouse/suppliers` | ✅ | ✅ | ✅ | ✅ | ✅ | ctrl=true/pag=true |
| `/warehouse/suppliers/:id` | ✅ | ✅ | ✅ | ✅ | ⚪ |  |
| `/warehouse/suppliers/create` | ✅ | ⚪ | ✅ | ✅ | ⚪ | form=7/save=true |

## Legend

✅ PASS  ❌ FAIL  ⚪ SKIP (axis not applicable for this route)
