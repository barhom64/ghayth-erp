# Stop-Ship Compliance Report — #1139 §8

> Generated: 2026-05-26T02:25:04.612Z
> Scope: every `.ts` file under `artifacts/api-server/src/routes/`

## Summary

| Metric | Value |
|---|---|
| Files scanned | 88 |
| Allowlisted | 10 |
| Write endpoints | 692 |
| Read endpoints | 687 |
| Critical violations | **0** |
| Warnings | 9 |

## Rules

- **rbac.missing** (critical) — a write endpoint (POST/PATCH/PUT/DELETE) without `authorize()` in its middleware chain.
- **audit.missing** (critical) — a route file with write endpoints but no `createAuditLog()` call anywhere.
- **events.missing** (warning) — a route file with write endpoints but no `emitEvent()` call anywhere.

## Warnings

| Rule | File | Endpoint | Message |
|---|---|---|---|
| `audit.missing` | `artifacts/api-server/src/routes/import.ts` | `(file-level — 2 write endpoint(s))` | Route file has write endpoints but no createAuditLog() call. Verify the path is covered by auditMiddleware ENTITY_MAP, or add explicit audit calls for business-level events. |
| `events.missing` | `artifacts/api-server/src/routes/import.ts` | `(file-level — 2 write endpoint(s))` | Route file has write endpoints but no emitEvent() call anywhere. |
| `audit.missing` | `artifacts/api-server/src/routes/obligations.ts` | `(file-level — 6 write endpoint(s))` | Route file has write endpoints but no createAuditLog() call. Verify the path is covered by auditMiddleware ENTITY_MAP, or add explicit audit calls for business-level events. |
| `audit.missing` | `artifacts/api-server/src/routes/print.ts` | `(file-level — 13 write endpoint(s))` | Route file has write endpoints but no createAuditLog() call. Verify the path is covered by auditMiddleware ENTITY_MAP, or add explicit audit calls for business-level events. |
| `events.missing` | `artifacts/api-server/src/routes/print.ts` | `(file-level — 13 write endpoint(s))` | Route file has write endpoints but no emitEvent() call anywhere. |
| `audit.missing` | `artifacts/api-server/src/routes/rbacV2.ts` | `(file-level — 19 write endpoint(s))` | Route file has write endpoints but no createAuditLog() call. Verify the path is covered by auditMiddleware ENTITY_MAP, or add explicit audit calls for business-level events. |
| `events.missing` | `artifacts/api-server/src/routes/rbacV2.ts` | `(file-level — 19 write endpoint(s))` | Route file has write endpoints but no emitEvent() call anywhere. |
| `audit.missing` | `artifacts/api-server/src/routes/scheduled-reports.ts` | `(file-level — 3 write endpoint(s))` | Route file has write endpoints but no createAuditLog() call. Verify the path is covered by auditMiddleware ENTITY_MAP, or add explicit audit calls for business-level events. |
| `events.missing` | `artifacts/api-server/src/routes/scheduled-reports.ts` | `(file-level — 3 write endpoint(s))` | Route file has write endpoints but no emitEvent() call anywhere. |

## Per-file Inventory

| File | Writes | Reads | audit | events | authorize | Allowlist |
|---|---:|---:|:---:|:---:|:---:|---|
| `accounting-engine.ts` | 7 | 6 | ✓ | ✓ | ✓ |  |
| `actionCenter.ts` | 0 | 1 | — | — | ✓ |  |
| `activityIngest.ts` | 1 | 0 | ✓ | ✓ | ✓ | fire-and-forget activity ingest — audited at the read side |
| `activityLog.ts` | 0 | 2 | — | — | ✓ |  |
| `admin-ai-governance.ts` | 8 | 5 | ✓ | ✓ | ✓ |  |
| `admin-observability.ts` | 0 | 1 | — | — | ✓ |  |
| `admin.ts` | 20 | 31 | ✓ | ✓ | ✓ |  |
| `approvalActions.ts` | 0 | 2 | — | — | ✓ |  |
| `auditLogs.ts` | 0 | 3 | — | — | ✓ |  |
| `auth.ts` | 7 | 1 | ✓ | ✓ | — | anonymous login/register/refresh endpoints — pre-auth by design |
| `automation.ts` | 3 | 7 | ✓ | ✓ | ✓ |  |
| `bi.ts` | 7 | 25 | ✓ | ✓ | ✓ |  |
| `calendar.ts` | 0 | 1 | — | — | ✓ |  |
| `careersPortal.ts` | 5 | 4 | ✓ | ✓ | — | uses its own careersPortalJwt middleware, not authorize() |
| `clientPortal.ts` | 7 | 9 | ✓ | ✓ | ✓ | uses its own clientPortalJwt middleware, not authorize() |
| `clients.ts` | 6 | 3 | ✓ | ✓ | ✓ |  |
| `communications.ts` | 11 | 11 | ✓ | ✓ | ✓ |  |
| `correspondence.ts` | 4 | 3 | ✓ | ✓ | ✓ |  |
| `crm.ts` | 6 | 8 | ✓ | ✓ | ✓ |  |
| `dashboard.ts` | 0 | 7 | — | — | ✓ |  |
| `digital-signature.ts` | 2 | 1 | ✓ | ✓ | ✓ |  |
| `documents.ts` | 12 | 11 | ✓ | ✓ | ✓ |  |
| `employees.ts` | 5 | 5 | ✓ | ✓ | ✓ |  |
| `entityMeta.ts` | 5 | 4 | ✓ | ✓ | ✓ |  |
| `events.ts` | 0 | 4 | — | — | — | event subscriber lifecycle — manages its own audit/events internally |
| `execDashboard.ts` | 0 | 3 | — | — | ✓ |  |
| `export.ts` | 0 | 14 | — | — | ✓ |  |
| `finance-accounts.ts` | 13 | 13 | ✓ | ✓ | ✓ |  |
| `finance-algorithms.ts` | 11 | 16 | ✓ | ✓ | ✓ |  |
| `finance-budget.ts` | 7 | 6 | ✓ | ✓ | ✓ |  |
| `finance-collection.ts` | 1 | 2 | ✓ | ✓ | ✓ |  |
| `finance-cost-centers.ts` | 3 | 2 | ✓ | ✓ | ✓ |  |
| `finance-custodies.ts` | 4 | 4 | ✓ | ✓ | ✓ |  |
| `finance-gl-helpers.ts` | 5 | 5 | ✓ | ✓ | ✓ |  |
| `finance-hardening.ts` | 17 | 12 | ✓ | ✓ | ✓ |  |
| `finance-invoices.ts` | 20 | 9 | ✓ | ✓ | ✓ |  |
| `finance-journal.ts` | 17 | 8 | ✓ | ✓ | ✓ |  |
| `finance-purchase.ts` | 15 | 8 | ✓ | ✓ | ✓ |  |
| `finance-recurring.ts` | 4 | 2 | ✓ | ✓ | ✓ |  |
| `finance-reports.ts` | 0 | 29 | — | — | ✓ |  |
| `finance-vendor-contracts.ts` | 3 | 2 | ✓ | ✓ | ✓ |  |
| `finance-vendors.ts` | 8 | 10 | ✓ | ✓ | ✓ |  |
| `finance-zatca.ts` | 6 | 3 | ✓ | ✓ | ✓ |  |
| `fleet.ts` | 29 | 19 | ✓ | ✓ | ✓ |  |
| `gov-integrations.ts` | 5 | 4 | ✓ | ✓ | ✓ |  |
| `governance.ts` | 20 | 15 | ✓ | ✓ | ✓ |  |
| `health.ts` | 0 | 8 | — | — | ✓ | public liveness/readiness probes — read-only |
| `hr-contracts.ts` | 10 | 2 | ✓ | ✓ | ✓ |  |
| `hr-discipline.ts` | 15 | 9 | ✓ | ✓ | ✓ |  |
| `hr-exit.ts` | 4 | 2 | ✓ | ✓ | ✓ |  |
| `hr-loans.ts` | 3 | 3 | ✓ | ✓ | ✓ |  |
| `hr-overtime.ts` | 3 | 4 | ✓ | ✓ | ✓ |  |
| `hr.ts` | 62 | 57 | ✓ | ✓ | ✓ |  |
| `impactPreview.ts` | 1 | 0 | ✓ | ✓ | ✓ |  |
| `import.ts` | 2 | 4 | — | — | ✓ |  |
| `index.ts` | 0 | 2 | — | — | ✓ | router composition only — no endpoint logic |
| `intelligence.ts` | 12 | 15 | ✓ | ✓ | ✓ |  |
| `legal.ts` | 15 | 15 | ✓ | ✓ | ✓ |  |
| `marketing.ts` | 4 | 6 | ✓ | ✓ | ✓ |  |
| `moduleDashboards.ts` | 0 | 11 | — | — | ✓ |  |
| `mySpace.ts` | 0 | 6 | — | — | ✓ |  |
| `notification-engine.ts` | 13 | 7 | ✓ | ✓ | ✓ |  |
| `notifications.ts` | 3 | 3 | ✓ | ✓ | ✓ |  |
| `obligations.ts` | 6 | 2 | — | ✓ | ✓ |  |
| `operationsCenter.ts` | 1 | 2 | ✓ | ✓ | ✓ |  |
| `pdpl.ts` | 1 | 4 | ✓ | ✓ | ✓ |  |
| `permissions.ts` | 4 | 3 | ✓ | ✓ | ✓ |  |
| `print.ts` | 13 | 10 | — | — | ✓ |  |
| `printVerify.ts` | 0 | 1 | — | — | — | anonymous QR verify — read-only by design |
| `projects.ts` | 15 | 11 | ✓ | ✓ | ✓ |  |
| `properties.ts` | 30 | 25 | ✓ | ✓ | ✓ |  |
| `publicData.ts` | 1 | 2 | ✓ | ✓ | — | public anonymous-read surface — no writes |
| `rbacV2.ts` | 19 | 13 | — | — | ✓ |  |
| `recruitment.ts` | 8 | 5 | ✓ | ✓ | ✓ |  |
| `requests.ts` | 9 | 7 | ✓ | ✓ | ✓ |  |
| `rules.ts` | 4 | 2 | ✓ | ✓ | ✓ |  |
| `scheduled-reports.ts` | 3 | 2 | — | — | ✓ |  |
| `search.ts` | 0 | 1 | — | — | ✓ | read-only search |
| `settings.ts` | 17 | 15 | ✓ | ✓ | ✓ |  |
| `storage.ts` | 1 | 2 | ✓ | ✓ | ✓ |  |
| `store.ts` | 6 | 5 | ✓ | ✓ | ✓ |  |
| `support.ts` | 11 | 7 | ✓ | ✓ | ✓ |  |
| `tasks.ts` | 3 | 3 | ✓ | ✓ | ✓ |  |
| `training.ts` | 8 | 5 | ✓ | ✓ | ✓ |  |
| `umrah-entities.ts` | 27 | 27 | ✓ | ✓ | ✓ |  |
| `umrah.ts` | 30 | 19 | ✓ | ✓ | ✓ |  |
| `warehouse.ts` | 14 | 11 | ✓ | ✓ | ✓ |  |
| `workflows.ts` | 10 | 8 | ✓ | ✓ | ✓ |  |
