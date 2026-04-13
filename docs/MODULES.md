# Modules map — Ghayth ERP

Every business module is backed by one or more Express routers in
`artifacts/api-server/src/routes/` and one or more pages under
`artifacts/ghayth-erp/src/pages/`. This document is the quick index.

> Route files listed are relative to `artifacts/api-server/src/routes/`.
> Page paths are the URL paths served by the SPA (`artifacts/ghayth-erp/src/pages/*` for the implementation).

---

## Identity & access

| Area                 | Routers                         | Frontend pages |
| -------------------- | ------------------------------- | -------------- |
| Auth / login         | `auth.ts`                       | `/login` |
| Admin — users        | `admin.ts`, `permissions.ts`    | `/admin/users` |
| Admin — roles        | `admin.ts`, `permissions.ts`    | `/admin/roles` |
| Admin — audit logs   | `auditLogs.ts`                  | `/admin/logs` |
| PDPL / privacy       | `pdpl.ts`                       | `/admin/pdpl` |
| Settings engine      | `settings.ts`                   | `/settings` |

## HR

| Area                          | Routers                                 | Frontend pages |
| ----------------------------- | --------------------------------------- | -------------- |
| Employees / profiles          | `employees.ts`, `hr.ts`                 | `/employees`, `/hr/employee-profile/:id` |
| Attendance (check-in/out, GPS, late-penalty tiers) | `hr-attendance.ts` (specific), `hr.ts` fallback | `/hr/attendance`, `/hr/attendance/reports`, `/hr/attendance/field-tracking`, `/hr/attendance/qr-scanner` |
| Leaves                        | `hr.ts`                                 | `/hr/leaves`, `/hr/leaves/management`, `/hr/leaves/approval-chains` |
| Payroll                       | `hr.ts`                                 | `/hr/payroll`, `/hr/payroll/salary-components` |
| Performance (incl. 360°)      | `hr.ts`                                 | `/hr/performance`, `/hr/evaluation-360` |
| Recruitment / jobs            | `recruitment.ts`                        | `/hr/recruitment`, `/hr/recruitment/jobs/:id`, `/hr/recruitment/applications`, `/hr/recruitment/advanced` |
| Training                      | `training.ts`                           | `/hr/training`, `/hr/training/advanced` |
| Organization / structure      | `hr.ts`                                 | `/hr/organization`, `/hr/organization/structure` |
| Violations                    | `hr.ts`                                 | `/hr/violations`, `/hr/violations/management`, `/hr/violations/penalty-escalation` |
| **Discipline (living regulation + inquiry memos)** | **`hr-discipline.ts`** | **`/hr/discipline/regulation`, `/hr/discipline/memos`, `/hr/discipline/memos/:id`** |
| Shifts                        | `hr.ts`                                 | `/hr/shifts`, `/hr/shifts/management` |
| Transfers, IDP, gratuity      | `hr.ts`                                 | `/hr/transfers`, `/hr/idp`, `/hr/gratuity`, `/hr/turnover-report`, `/hr/expiring-documents` |

## Finance

| Area                    | Routers                          | Frontend pages |
| ----------------------- | -------------------------------- | -------------- |
| Main ledger             | `finance.ts`                     | `/finance` |
| Accounts (CoA, journal, ledger) | `finance-accounts.ts`    | `/finance/accounts`, `/finance/journal`, `/finance/ledger` |
| Journal (manual entries) | `finance-journal.ts`            | `/finance/journal-manual` |
| Invoices                | `finance-invoices.ts`            | `/finance/invoices` |
| Purchase / vendors      | `finance-purchase.ts`, `finance-vendors.ts` | `/finance/purchase`, `/finance/vendors` |
| Budget                  | `finance-budget.ts`              | `/finance/budget` |
| Collection pipeline     | `finance-collection.ts`          | `/finance/collection` |
| Custodies (cash floats) | `finance-custodies.ts`           | `/finance/custodies` |
| Reports                 | `finance-reports.ts`             | `/finance/reports` |
| Financial algorithms (AR/AP aging, depreciation, reconciliation) | `finance-algorithms.ts` | `/finance/algorithms/*` |
| Hardening / safety      | `finance-hardening.ts`           | — |
| ZATCA e-invoicing       | `finance-zatca.ts`               | `/finance/zatca` |
| Cash flow dashboard     | `finance.ts`                     | `/finance/cashflow` |
| Accounting engine       | `accounting-engine.ts`           | (internal) |

## Operations / asset modules

| Area              | Routers             | Frontend pages |
| ----------------- | ------------------- | -------------- |
| Fleet             | `fleet.ts`          | `/fleet/*` |
| Warehouse         | `warehouse.ts`      | `/warehouse/*` |
| Properties / Ejar | `properties.ts`     | `/properties/*` |
| Projects          | `projects.ts`       | `/projects/*` |
| Store (inventory) | `store.ts`          | `/store/*` |

## CRM / clients / portals

| Area               | Routers                          | Frontend pages |
| ------------------ | -------------------------------- | -------------- |
| Clients / Client 360° | `clients.ts`, `crm.ts`        | `/crm/clients`, `/crm/leads`, … |
| Marketing          | `marketing.ts`                   | `/marketing/*` |
| Support            | `support.ts`                     | `/support/*` |
| Client portal      | `clientPortal.ts`                | `artifacts/client-portal` |
| Careers portal     | `careersPortal.ts`               | `artifacts/careers-portal` |

## Legal / governance

| Area              | Routers                          | Frontend pages |
| ----------------- | -------------------------------- | -------------- |
| Legal cases       | `legal.ts`                       | `/legal/*` |
| Governance / policies | `governance.ts`              | `/governance/*` |
| Documents (DMS)   | `documents.ts`                   | `/documents/*` |
| Approval actions  | `approvalActions.ts`             | (cross-module) |
| Workflows         | `workflows.ts`                   | `/workflows` |
| Business rules    | `rules.ts`                       | `/rules` |

## Operations centre / BI

| Area                      | Routers                                 | Frontend pages |
| ------------------------- | --------------------------------------- | -------------- |
| Dashboard                 | `dashboard.ts`                          | `/` |
| Action centre             | `actionCenter.ts`                       | `/action-center` |
| Operations centre         | `operationsCenter.ts`                   | `/operations-center` |
| BI / analytics            | `bi.ts`                                 | `/bi/*` |
| Module dashboards         | `moduleDashboards.ts`                   | per-module BI tabs |
| Scheduled reports         | `scheduled-reports.ts`                  | `/reports/scheduled` |
| Intelligence / recommendations | `intelligence.ts`                  | (cross-module) |
| Impact preview            | `impactPreview.ts`                      | (cross-module) |
| My Space                  | `mySpace.ts`                            | `/my-space` |
| Tasks                     | `tasks.ts`                              | `/tasks` |
| Requests catalogue        | `requests.ts`                           | `/requests` |
| Search                    | `search.ts`                             | (command palette) |
| Health                    | `health.ts`                             | `/health` |
| Export                    | `export.ts`                             | (cross-module) |

## Communications

| Area                    | Routers                   | Frontend pages |
| ----------------------- | ------------------------- | -------------- |
| Letters / templates     | `communications.ts`       | `/letters`, `/letters/create` |
| Notifications           | `notifications.ts`, `notification-engine.ts` | `/notifications`, `/admin/notification-engine` |
| WhatsApp / webhooks     | `communications.ts`       | (webhook only) |

## Umrah (specialised module)

| Area        | Routers       | Frontend pages |
| ----------- | ------------- | -------------- |
| Umrah ops   | `umrah.ts`    | `/umrah/*` (seasons, agents, pilgrims, packages, transport, penalties, invoicing, import) |

## Integration surfaces

| Area                     | Routers                          |
| ------------------------ | -------------------------------- |
| Government integrations (Muqeem, TAM, Absher Business) | `gov-integrations.ts` |
| Digital signature        | `digital-signature.ts`           |
| Activity ingest          | `activityIngest.ts`              |
| Automation               | `automation.ts`                  |
| Entity metadata          | `entityMeta.ts`                  |
| Activity log             | `activityLog.ts`                 |
| Public (no auth) data    | `publicData.ts`                  |

---

## Cross-reference rules

1. **Sub-router precedence.** Any file named like `hr-*.ts` / `finance-*.ts` is mounted **before** its monolithic parent (`hr.ts` / `finance.ts`) in `routes/index.ts`. When adding a new specialised file, keep that ordering to avoid the parent router swallowing the new paths.
2. **One router = one permission family.** Route files should use a single permission namespace (`hr:discipline:*`, `finance:invoices:*`) so the RBAC matrix in `permissions.ts` stays readable.
3. **Detail endpoints live next to their list endpoints.** A new `GET /X/:id` belongs in the same router as `GET /X`, not in a separate file. (See `docs/KNOWN_ISSUES.md` for the list of modules that still rely on list-then-filter and need real detail endpoints.)
