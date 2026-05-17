# SOT-C — Patch Queue Manifest

Generated: `2026-05-17T16:55:13.857Z`
Source:    `/tmp/diag/sot2/LOCAL_ONLY_VALUABLE.txt`
Total:     1016 files (L=218 local-only, D=798 differs)
Skipped:   151 R-marked entries (remote is canonical — local would be overwritten on next pull)

## Purpose

SOT-2 identified 1016 files (L=local-only or D=differs from remote) that may need preservation. Before any restore (SOT-B), cleanup (SOT-D), or further reset operation, this manifest records which of those files deserve preservation as patches, and at what priority. R-marked entries (remote is canonical) are excluded automatically.

This is the **inventory + classification** half of SOT-C. The next phase consumes `MANIFEST.json` to generate actual `.patch` files (`git format-patch`-style or remote-baseline diffs) for each P0/P1 bucket.

## Priority distribution

| Priority | Count | Meaning |
|---|---:|---|
| P0 | 137 | **Must preserve.** Loss = silent regression or data corruption. Generate patch immediately. |
| P1 | 308 | **Should preserve.** Loss = user-visible bug. Generate patch; restore via PR. |
| P2 | 126 | **Nice to preserve.** Tooling/tests. Generate patch; restore at convenience. |
| P3 | 434 | **Do NOT preserve.** Regeneratable from source (Orval codegen) or doc-only churn. |
| P? | 11 | **Triage required.** Unknown classification — human review before patching. |

## Bucket breakdown

| Bucket | Priority | Count | Description |
|---|---|---:|---|
| `api-lib` | P0 | 62 | Business-logic libraries (engines, workers, integrations). |
| `api-middleware` | P0 | 6 | Express middlewares. Loss disables auth/csrf/idempotency/etc. |
| `api-route` | P0 | 51 | Express route handlers. Loss removes endpoints. |
| `api-spec` | P0 | 1 | OpenAPI source-of-truth. Loss breaks codegen. |
| `migration` | P0 | 17 | Numbered append-only DB migration files. Loss reverts schema work. |
| `api-client-hand` | P1 | 3 | Hand-written React Query client (NOT Orval-generated). |
| `frontend-main` | P1 | 305 | Main ERP frontend (artifacts/ghayth-erp). |
| `script-tooling` | P2 | 55 | Maintainer scripts (PR push, CI, audit, self-heal). |
| `system-auditor-tool` | P2 | 12 | — |
| `tests` | P2 | 59 | Unit/integration/e2e test files. |
| `api-zod-gen` | P3 | 23 | Orval-generated Zod schemas. Regeneratable via `pnpm --filter @ghayth-erp/api-spec run generate`. |
| `audit-system-review` | P3 | 391 | — |
| `docs` | P3 | 20 | Markdown documentation. |
| `other` | P? | 11 | Did not match any classification rule — needs human triage. |

## Files by bucket

### `api-lib` (P0 · 62 files)

Business-logic libraries (engines, workers, integrations).

<details><summary>62 files (click to expand)</summary>

```text
[D] artifacts/api-server/src/lib/autoViolationEngine.ts
[D] artifacts/api-server/src/lib/bootstrapAdmin.ts
[D] artifacts/api-server/src/lib/businessHelpers.ts
[D] artifacts/api-server/src/lib/cronScheduler.ts
[D] artifacts/api-server/src/lib/errorHandler.ts
[D] artifacts/api-server/src/lib/eventBus.ts
[D] artifacts/api-server/src/lib/eventCatalog.ts
[D] artifacts/api-server/src/lib/eventListeners.ts
[L] artifacts/api-server/src/lib/excelCompat.ts
[D] artifacts/api-server/src/lib/excelExport.ts
[D] artifacts/api-server/src/lib/fx/post-realized-journal.ts
[D] artifacts/api-server/src/lib/genericImportEngine.ts
[L] artifacts/api-server/src/lib/hrAssignments.ts
[D] artifacts/api-server/src/lib/integrationService.ts
[D] artifacts/api-server/src/lib/inventory/abc-analysis.ts
[L] artifacts/api-server/src/lib/inventory/cycle-count-plan.ts
[L] artifacts/api-server/src/lib/inventory/expiry-warning.ts
[D] artifacts/api-server/src/lib/inventory/index.ts
[D] artifacts/api-server/src/lib/inventory/lots.ts
[D] artifacts/api-server/src/lib/inventory/post-lot-writeoff-journal.ts
[D] artifacts/api-server/src/lib/lifecycleEngine.ts
[L] artifacts/api-server/src/lib/metrics.ts
[D] artifacts/api-server/src/lib/notificationEngine.ts
[L] artifacts/api-server/src/lib/observability/index.ts
[L] artifacts/api-server/src/lib/observability/scrub.ts
[L] artifacts/api-server/src/lib/ocr/engine.ts
[L] artifacts/api-server/src/lib/ocr/entitySync.ts
[L] artifacts/api-server/src/lib/ocr/extractors.ts
[L] artifacts/api-server/src/lib/ocr/worker.ts
[D] artifacts/api-server/src/lib/pdfExport.ts
[L] artifacts/api-server/src/lib/pricingEngine.ts
[D] artifacts/api-server/src/lib/print/adapters/excelAdapter.ts
[D] artifacts/api-server/src/lib/print/printStorage.ts
[D] artifacts/api-server/src/lib/proactiveEngine.ts
[D] artifacts/api-server/src/lib/pushService.ts
[D] artifacts/api-server/src/lib/rbac/authzEngine.ts
[D] artifacts/api-server/src/lib/rbac/autoMigrate.ts
[D] artifacts/api-server/src/lib/rulesEngine.ts
[D] artifacts/api-server/src/lib/saudi-compliance/iqama-cron.ts
[D] artifacts/api-server/src/lib/saudi-compliance/mudad/auth.ts
[D] artifacts/api-server/src/lib/saudi-compliance/mudad/client.ts
[D] artifacts/api-server/src/lib/saudi-compliance/mudad/endpoints.ts
[L] artifacts/api-server/src/lib/saudi-compliance/mudad/retry-worker.ts
[L] artifacts/api-server/src/lib/saudi-compliance/mudad/salary-retry-worker.ts
[L] artifacts/api-server/src/lib/saudi-compliance/mudad/service.ts
[D] artifacts/api-server/src/lib/saudi-compliance/saudization-snapshot.ts
[D] artifacts/api-server/src/lib/saudi-compliance/types.ts
[L] artifacts/api-server/src/lib/saudi-compliance/wps/credentials.ts
[L] artifacts/api-server/src/lib/saudi-compliance/wps/delivery.ts
[L] artifacts/api-server/src/lib/saudi-compliance/wps/formats/albilad.ts
[D] artifacts/api-server/src/lib/saudi-compliance/wps/formats/index.ts
[D] artifacts/api-server/src/lib/saudi-compliance/wps/run.ts
[D] artifacts/api-server/src/lib/systemGovernor.ts
[D] artifacts/api-server/src/lib/umrahImportEngine.ts
[D] artifacts/api-server/src/lib/workflowEngine.ts
[D] artifacts/api-server/src/lib/zatca/client.ts
[L] artifacts/api-server/src/lib/zatca/invoiceBuilder.ts
[L] artifacts/api-server/src/lib/zatca/invoiceXml.ts
[L] artifacts/api-server/src/lib/zatca/orchestrate.ts
[D] artifacts/api-server/src/lib/zatca/settingsResolver.ts
[D] artifacts/api-server/src/lib/zatca/test-pack.ts
[D] artifacts/api-server/src/lib/zatca/worker.ts
```

</details>

### `api-middleware` (P0 · 6 files)

Express middlewares. Loss disables auth/csrf/idempotency/etc.

```text
[D] artifacts/api-server/src/middlewares/auditMiddleware.ts
[D] artifacts/api-server/src/middlewares/authMiddleware.ts
[L] artifacts/api-server/src/middlewares/idempotencyMiddleware.ts
[D] artifacts/api-server/src/middlewares/permissionMiddleware.ts
[D] artifacts/api-server/src/middlewares/roleGuard.ts
[L] artifacts/api-server/src/middlewares/webhookSignature.ts
```

### `api-route` (P0 · 51 files)

Express route handlers. Loss removes endpoints.

<details><summary>51 files (click to expand)</summary>

```text
[D] artifacts/api-server/src/routes/admin.ts
[D] artifacts/api-server/src/routes/auth.ts
[D] artifacts/api-server/src/routes/bi.ts
[D] artifacts/api-server/src/routes/careersPortal.ts
[D] artifacts/api-server/src/routes/clientPortal.ts
[D] artifacts/api-server/src/routes/clients.ts
[D] artifacts/api-server/src/routes/communications.ts
[D] artifacts/api-server/src/routes/correspondence.ts
[D] artifacts/api-server/src/routes/crm.ts
[D] artifacts/api-server/src/routes/dashboard.ts
[D] artifacts/api-server/src/routes/documents.ts
[D] artifacts/api-server/src/routes/finance-algorithms.ts
[D] artifacts/api-server/src/routes/finance-budget.ts
[D] artifacts/api-server/src/routes/finance-collection.ts
[D] artifacts/api-server/src/routes/finance-custodies.ts
[D] artifacts/api-server/src/routes/finance-hardening.ts
[D] artifacts/api-server/src/routes/finance-invoices.ts
[D] artifacts/api-server/src/routes/finance-journal.ts
[D] artifacts/api-server/src/routes/finance-purchase.ts
[D] artifacts/api-server/src/routes/finance-recurring.ts
[D] artifacts/api-server/src/routes/finance-reports.ts
[D] artifacts/api-server/src/routes/finance-vendor-contracts.ts
[D] artifacts/api-server/src/routes/finance-vendors.ts
[D] artifacts/api-server/src/routes/finance-zatca.ts
[D] artifacts/api-server/src/routes/fleet.ts
[D] artifacts/api-server/src/routes/governance.ts
[D] artifacts/api-server/src/routes/hr-contracts.ts
[D] artifacts/api-server/src/routes/hr-discipline.ts
[D] artifacts/api-server/src/routes/hr-exit.ts
[D] artifacts/api-server/src/routes/hr-loans.ts
[D] artifacts/api-server/src/routes/hr-overtime.ts
[L] artifacts/api-server/src/routes/hr-saudi-compliance.ts
[D] artifacts/api-server/src/routes/impactPreview.ts
[D] artifacts/api-server/src/routes/index.ts
[D] artifacts/api-server/src/routes/intelligence.ts
[D] artifacts/api-server/src/routes/legal.ts
[D] artifacts/api-server/src/routes/marketing.ts
[D] artifacts/api-server/src/routes/notifications.ts
[D] artifacts/api-server/src/routes/permissions.ts
[L] artifacts/api-server/src/routes/pricing-rules.ts
[D] artifacts/api-server/src/routes/print.ts
[D] artifacts/api-server/src/routes/properties.ts
[D] artifacts/api-server/src/routes/recruitment.ts
[D] artifacts/api-server/src/routes/requests.ts
[D] artifacts/api-server/src/routes/settings.ts
[D] artifacts/api-server/src/routes/store.ts
[D] artifacts/api-server/src/routes/tasks.ts
[D] artifacts/api-server/src/routes/training.ts
[D] artifacts/api-server/src/routes/umrah-entities.ts
[D] artifacts/api-server/src/routes/umrah.ts
[L] artifacts/api-server/src/routes/warehouse-advanced.ts
```

</details>

### `api-spec` (P0 · 1 files)

OpenAPI source-of-truth. Loss breaks codegen.

```text
[D] lib/api-spec/openapi.yaml
```

### `migration` (P0 · 17 files)

Numbered append-only DB migration files. Loss reverts schema work.

```text
[L] artifacts/api-server/src/migrations/148_requests_converted_to.sql
[L] artifacts/api-server/src/migrations/170_idempotency_keys.sql
[L] artifacts/api-server/src/migrations/171_documents_ocr.sql
[D] artifacts/api-server/src/migrations/171_drop_dead_tables.sql
[L] artifacts/api-server/src/migrations/171_journal_entries_currency_columns.sql
[L] artifacts/api-server/src/migrations/171_mudad_contract_register_type.sql
[L] artifacts/api-server/src/migrations/171_pricing_rules.sql
[L] artifacts/api-server/src/migrations/172_fx_realized_postings_tranche_safe.sql
[L] artifacts/api-server/src/migrations/172z_warehouse_base_tables.sql
[L] artifacts/api-server/src/migrations/173_inventory_movement_lot_serial.sql
[L] artifacts/api-server/src/migrations/173_zatca_phase2_real_integration.sql
[L] artifacts/api-server/src/migrations/174_wps_run_delivery.sql
[L] artifacts/api-server/src/migrations/174_wps_runs_skipped_entries.sql
[L] artifacts/api-server/src/migrations/175_portal_token_version.sql
[L] artifacts/api-server/src/migrations/175_wps_skip_alerts.sql
[L] artifacts/api-server/src/migrations/176_wps_bank_credentials.sql
[L] artifacts/api-server/src/migrations/178_zatca_b2c_pause_events.sql
```

### `api-client-hand` (P1 · 3 files)

Hand-written React Query client (NOT Orval-generated).

```text
[D] lib/api-client-react/src/custom-fetch.ts
[L] lib/api-client-react/src/idempotency.ts
[D] lib/api-client-react/src/index.ts
```

### `frontend-main` (P1 · 305 files)

Main ERP frontend (artifacts/ghayth-erp).

<details><summary>305 files (click to expand)</summary>

```text
[D] artifacts/ghayth-erp/src/App.tsx
[L] artifacts/ghayth-erp/src/components/admin/api-health-widget.tsx
[D] artifacts/ghayth-erp/src/components/approval-actions.tsx
[D] artifacts/ghayth-erp/src/components/command-palette.tsx
[D] artifacts/ghayth-erp/src/components/data-table-presets.tsx
[D] artifacts/ghayth-erp/src/components/delete-confirm-impact.tsx
[D] artifacts/ghayth-erp/src/components/error-boundary.tsx
[D] artifacts/ghayth-erp/src/components/form-shell.tsx
[D] artifacts/ghayth-erp/src/components/global-search.tsx
[D] artifacts/ghayth-erp/src/components/impact-card.tsx
[D] artifacts/ghayth-erp/src/components/inline-actions.tsx
[D] artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx
[D] artifacts/ghayth-erp/src/components/notification-dropdown.tsx
[D] artifacts/ghayth-erp/src/components/page-error-boundary.tsx
[D] artifacts/ghayth-erp/src/components/page-status-badge.tsx
[D] artifacts/ghayth-erp/src/components/policy-banner.tsx
[D] artifacts/ghayth-erp/src/components/print-layout.tsx
[D] artifacts/ghayth-erp/src/components/rate-limit-fallback-banner.tsx
[D] artifacts/ghayth-erp/src/components/shared/advanced-filters.tsx
[D] artifacts/ghayth-erp/src/components/shared/approval-timeline.tsx
[D] artifacts/ghayth-erp/src/components/shared/attachment-preview.tsx
[D] artifacts/ghayth-erp/src/components/shared/avatar-initial.tsx
[D] artifacts/ghayth-erp/src/components/shared/bi-tabs-nav.tsx
[D] artifacts/ghayth-erp/src/components/shared/bulk-actions.tsx
[D] artifacts/ghayth-erp/src/components/shared/client-context-card.tsx
[D] artifacts/ghayth-erp/src/components/shared/confirm-delete-dialog.tsx
[D] artifacts/ghayth-erp/src/components/shared/crm-tabs-nav.tsx
[D] artifacts/ghayth-erp/src/components/shared/detail-edit-delete-actions.tsx
[D] artifacts/ghayth-erp/src/components/shared/detail-page-layout.tsx
[D] artifacts/ghayth-erp/src/components/shared/employee-context-card.tsx
[D] artifacts/ghayth-erp/src/components/shared/employee-discipline-summary.tsx
[D] artifacts/ghayth-erp/src/components/shared/entity-comments.tsx
[D] artifacts/ghayth-erp/src/components/shared/entity-detail-page.tsx
[D] artifacts/ghayth-erp/src/components/shared/entity-documents.tsx
[D] artifacts/ghayth-erp/src/components/shared/entity-financial-profile.tsx
[D] artifacts/ghayth-erp/src/components/shared/entity-obligations.tsx
[D] artifacts/ghayth-erp/src/components/shared/entity-tags.tsx
[D] artifacts/ghayth-erp/src/components/shared/entity-timeline.tsx
[D] artifacts/ghayth-erp/src/components/shared/export-buttons.tsx
[D] artifacts/ghayth-erp/src/components/shared/file-drop-zone.tsx
[D] artifacts/ghayth-erp/src/components/shared/finance-tabs-nav.tsx
[D] artifacts/ghayth-erp/src/components/shared/financial-tab.tsx
[D] artifacts/ghayth-erp/src/components/shared/fleet-tabs-nav.tsx
[D] artifacts/ghayth-erp/src/components/shared/form-field-wrapper.tsx
[D] artifacts/ghayth-erp/src/components/shared/hr-tabs-nav.tsx
[D] artifacts/ghayth-erp/src/components/shared/impact-preview.tsx
[D] artifacts/ghayth-erp/src/components/shared/kpi-card.tsx
[D] artifacts/ghayth-erp/src/components/shared/legal-tabs-nav.tsx
[D] artifacts/ghayth-erp/src/components/shared/linked-tasks.tsx
[D] artifacts/ghayth-erp/src/components/shared/loading-error-states.tsx
[D] artifacts/ghayth-erp/src/components/shared/manager-workload-card.tsx
[D] artifacts/ghayth-erp/src/components/shared/page-state.tsx
[D] artifacts/ghayth-erp/src/components/shared/product-context-card.tsx
[D] artifacts/ghayth-erp/src/components/shared/projects-tabs-nav.tsx
[D] artifacts/ghayth-erp/src/components/shared/property-tabs-nav.tsx
[D] artifacts/ghayth-erp/src/components/shared/property-unit-context-card.tsx
[D] artifacts/ghayth-erp/src/components/shared/quick-preview-dialog.tsx
[L] artifacts/ghayth-erp/src/components/shared/seed-notice.tsx
[D] artifacts/ghayth-erp/src/components/shared/store-tabs-nav.tsx
[D] artifacts/ghayth-erp/src/components/shared/supplier-context-card.tsx
[D] artifacts/ghayth-erp/src/components/shared/support-tabs-nav.tsx
[D] artifacts/ghayth-erp/src/components/shared/umrah-attachments-panel.tsx
[D] artifacts/ghayth-erp/src/components/shared/umrah-tabs-nav.tsx
[D] artifacts/ghayth-erp/src/components/shared/upcoming-events-widget.tsx
[D] artifacts/ghayth-erp/src/components/shared/vehicle-context-card.tsx
[D] artifacts/ghayth-erp/src/components/shared/warehouse-tabs-nav.tsx
[D] artifacts/ghayth-erp/src/components/shared/zatca-clearance-badge.tsx
[D] artifacts/ghayth-erp/src/components/ui/autocomplete.tsx
[D] artifacts/ghayth-erp/src/components/ui/data-table.tsx
[D] artifacts/ghayth-erp/src/contexts/app-context.tsx
[L] artifacts/ghayth-erp/src/hooks/use-lifecycle-action.ts
[D] artifacts/ghayth-erp/src/hooks/use-registry-tabs.tsx
[L] artifacts/ghayth-erp/src/hooks/use-seed-notice.ts
[D] artifacts/ghayth-erp/src/lib/api.ts
[D] artifacts/ghayth-erp/src/lib/date-utils.ts
[D] artifacts/ghayth-erp/src/lib/finance-type-maps.ts
[D] artifacts/ghayth-erp/src/lib/formatters.ts
[D] artifacts/ghayth-erp/src/lib/hr-type-maps.ts
[L] artifacts/ghayth-erp/src/lib/idempotency.ts
[D] artifacts/ghayth-erp/src/lib/observability.ts
[D] artifacts/ghayth-erp/src/main.tsx
[D] artifacts/ghayth-erp/src/pages/action-center.tsx
[D] artifacts/ghayth-erp/src/pages/admin-system-registry.tsx
[D] artifacts/ghayth-erp/src/pages/admin.tsx
[D] artifacts/ghayth-erp/src/pages/admin/rbac-v2-jit-tab.tsx
[D] artifacts/ghayth-erp/src/pages/admin/rbac-v2-sod-tab.tsx
[D] artifacts/ghayth-erp/src/pages/admin/rbac-v2-tab.tsx
[D] artifacts/ghayth-erp/src/pages/admin/users.tsx
[D] artifacts/ghayth-erp/src/pages/automation.tsx
[D] artifacts/ghayth-erp/src/pages/bi/ai-insights-tab.tsx
[D] artifacts/ghayth-erp/src/pages/bi/alert-fatigue-tab.tsx
[D] artifacts/ghayth-erp/src/pages/bi/branch-performance-tab.tsx
[D] artifacts/ghayth-erp/src/pages/bi/fleet-tco-tab.tsx
[D] artifacts/ghayth-erp/src/pages/bi/leave-balance-tab.tsx
[D] artifacts/ghayth-erp/src/pages/bi/property-occupancy-tab.tsx
[D] artifacts/ghayth-erp/src/pages/bi/training-roi-tab.tsx
[D] artifacts/ghayth-erp/src/pages/bi/vendor-performance-tab.tsx
[D] artifacts/ghayth-erp/src/pages/calendar.tsx
[D] artifacts/ghayth-erp/src/pages/clients.tsx
[D] artifacts/ghayth-erp/src/pages/communications.tsx
[D] artifacts/ghayth-erp/src/pages/create/comms/correspondence-create.tsx
[D] artifacts/ghayth-erp/src/pages/create/employees-create.tsx
[D] artifacts/ghayth-erp/src/pages/create/finance/batch-depreciate.tsx
[D] artifacts/ghayth-erp/src/pages/create/finance/budget-create.tsx
[L] artifacts/ghayth-erp/src/pages/create/finance/customer-advance-create.tsx
[D] artifacts/ghayth-erp/src/pages/create/finance/expenses-create.tsx
[D] artifacts/ghayth-erp/src/pages/create/finance/invoices-create.tsx
[D] artifacts/ghayth-erp/src/pages/create/finance/journal-manual-create.tsx
[D] artifacts/ghayth-erp/src/pages/create/finance/opening-balances-create.tsx
[L] artifacts/ghayth-erp/src/pages/create/finance/pricing-rules-create.tsx
[D] artifacts/ghayth-erp/src/pages/create/finance/purchase-orders-create.tsx
[D] artifacts/ghayth-erp/src/pages/create/finance/recurring-journals-create.tsx
[D] artifacts/ghayth-erp/src/pages/create/fleet/vehicles-create.tsx
[D] artifacts/ghayth-erp/src/pages/create/hr/evaluation-360-create.tsx
[D] artifacts/ghayth-erp/src/pages/create/hr/loans-create.tsx
[D] artifacts/ghayth-erp/src/pages/create/hr/payroll-create.tsx
[D] artifacts/ghayth-erp/src/pages/create/properties/contracts-create.tsx
[D] artifacts/ghayth-erp/src/pages/dashboard.tsx
[D] artifacts/ghayth-erp/src/pages/details/account-detail.tsx
[D] artifacts/ghayth-erp/src/pages/details/attendance-detail.tsx
[D] artifacts/ghayth-erp/src/pages/details/budget-detail.tsx
[D] artifacts/ghayth-erp/src/pages/details/fixed-asset-detail.tsx
[D] artifacts/ghayth-erp/src/pages/details/legal-judgment-detail.tsx
[D] artifacts/ghayth-erp/src/pages/details/opportunity-detail.tsx
[D] artifacts/ghayth-erp/src/pages/details/performance-detail.tsx
[D] artifacts/ghayth-erp/src/pages/details/project-detail.tsx
[D] artifacts/ghayth-erp/src/pages/details/risk-detail.tsx
[D] artifacts/ghayth-erp/src/pages/details/shift-detail.tsx
[D] artifacts/ghayth-erp/src/pages/details/task-detail.tsx
[D] artifacts/ghayth-erp/src/pages/details/ticket-detail.tsx
[D] artifacts/ghayth-erp/src/pages/details/umrah-package-detail.tsx
[D] artifacts/ghayth-erp/src/pages/details/umrah-season-detail.tsx
[D] artifacts/ghayth-erp/src/pages/details/unit-detail.tsx
[D] artifacts/ghayth-erp/src/pages/details/vehicle-detail.tsx
[D] artifacts/ghayth-erp/src/pages/documents-page.tsx
[L] artifacts/ghayth-erp/src/pages/documents/ocr-review.tsx
[D] artifacts/ghayth-erp/src/pages/documents/templates.tsx
[D] artifacts/ghayth-erp/src/pages/employee-detail.tsx
[D] artifacts/ghayth-erp/src/pages/exec-dashboard.tsx
[D] artifacts/ghayth-erp/src/pages/finance/accounts.tsx
[D] artifacts/ghayth-erp/src/pages/finance/ap-aging.tsx
[D] artifacts/ghayth-erp/src/pages/finance/ar-aging.tsx
[L] artifacts/ghayth-erp/src/pages/finance/bad-debt.tsx
[D] artifacts/ghayth-erp/src/pages/finance/budget.tsx
[D] artifacts/ghayth-erp/src/pages/finance/cashflow-dashboard.tsx
[D] artifacts/ghayth-erp/src/pages/finance/commitments.tsx
[D] artifacts/ghayth-erp/src/pages/finance/custodies.tsx
[D] artifacts/ghayth-erp/src/pages/finance/custody-detail.tsx
[L] artifacts/ghayth-erp/src/pages/finance/customer-advances.tsx
[D] artifacts/ghayth-erp/src/pages/finance/expenses.tsx
[D] artifacts/ghayth-erp/src/pages/finance/financial-requests.tsx
[D] artifacts/ghayth-erp/src/pages/finance/fixed-assets.tsx
[L] artifacts/ghayth-erp/src/pages/finance/fx-rates.tsx
[D] artifacts/ghayth-erp/src/pages/finance/invoices.tsx
[D] artifacts/ghayth-erp/src/pages/finance/journal.tsx
[D] artifacts/ghayth-erp/src/pages/finance/payments-page.tsx
[L] artifacts/ghayth-erp/src/pages/finance/pricing-rules.tsx
[D] artifacts/ghayth-erp/src/pages/finance/project-costing.tsx
[D] artifacts/ghayth-erp/src/pages/finance/purchase-orders.tsx
[D] artifacts/ghayth-erp/src/pages/finance/receivables.tsx
[D] artifacts/ghayth-erp/src/pages/finance/reports.tsx
[D] artifacts/ghayth-erp/src/pages/finance/salary-advances.tsx
[D] artifacts/ghayth-erp/src/pages/finance/tax-system.tsx
[D] artifacts/ghayth-erp/src/pages/finance/treasury.tsx
[D] artifacts/ghayth-erp/src/pages/finance/vendors.tsx
[D] artifacts/ghayth-erp/src/pages/finance/vouchers.tsx
[D] artifacts/ghayth-erp/src/pages/finance/year-end-close.tsx
[L] artifacts/ghayth-erp/src/pages/finance/zatca-misrouted.tsx
[L] artifacts/ghayth-erp/src/pages/finance/zatca-missing-tax.tsx
[D] artifacts/ghayth-erp/src/pages/fleet/preventive-plans.tsx
[D] artifacts/ghayth-erp/src/pages/fleet/traffic-violations.tsx
[D] artifacts/ghayth-erp/src/pages/governance/compliance-dashboard-tab.tsx
[L] artifacts/ghayth-erp/src/pages/hr/accruals-monthly.tsx
[D] artifacts/ghayth-erp/src/pages/hr/application-list.tsx
[D] artifacts/ghayth-erp/src/pages/hr/attendance-reports.tsx
[D] artifacts/ghayth-erp/src/pages/hr/attendance.tsx
[D] artifacts/ghayth-erp/src/pages/hr/auto-detection.tsx
[D] artifacts/ghayth-erp/src/pages/hr/contracts.tsx
[D] artifacts/ghayth-erp/src/pages/hr/discipline-regulation.tsx
[D] artifacts/ghayth-erp/src/pages/hr/evaluation-360-detail.tsx
[D] artifacts/ghayth-erp/src/pages/hr/evaluation-360-history.tsx
[D] artifacts/ghayth-erp/src/pages/hr/exit-detail.tsx
[D] artifacts/ghayth-erp/src/pages/hr/exit-requests.tsx
[D] artifacts/ghayth-erp/src/pages/hr/loans.tsx
[D] artifacts/ghayth-erp/src/pages/hr/official-letters.tsx
[D] artifacts/ghayth-erp/src/pages/hr/overtime.tsx
[D] artifacts/ghayth-erp/src/pages/hr/performance-advanced.tsx
[D] artifacts/ghayth-erp/src/pages/hr/public-holidays.tsx
[L] artifacts/ghayth-erp/src/pages/hr/saudi-compliance.tsx
[L] artifacts/ghayth-erp/src/pages/hr/saudi-compliance/wps/settings.tsx
[D] artifacts/ghayth-erp/src/pages/hr/training-detail.tsx
[D] artifacts/ghayth-erp/src/pages/hr/transfers.tsx
[D] artifacts/ghayth-erp/src/pages/hr/turnover-report.tsx
[D] artifacts/ghayth-erp/src/pages/hr/violation-detail.tsx
[D] artifacts/ghayth-erp/src/pages/hr/violations-management.tsx
[D] artifacts/ghayth-erp/src/pages/hr/violations.tsx
[D] artifacts/ghayth-erp/src/pages/insights.tsx
[D] artifacts/ghayth-erp/src/pages/intelligence.tsx
[D] artifacts/ghayth-erp/src/pages/legal-case-detail.tsx
[D] artifacts/ghayth-erp/src/pages/legal.tsx
[D] artifacts/ghayth-erp/src/pages/legal/judgments.tsx
[D] artifacts/ghayth-erp/src/pages/legal/sessions.tsx
[D] artifacts/ghayth-erp/src/pages/login.tsx
[D] artifacts/ghayth-erp/src/pages/manager-board.tsx
[D] artifacts/ghayth-erp/src/pages/marketing.tsx
[D] artifacts/ghayth-erp/src/pages/module-dashboards.tsx
[D] artifacts/ghayth-erp/src/pages/my-attendance.tsx
[D] artifacts/ghayth-erp/src/pages/my-documents.tsx
[D] artifacts/ghayth-erp/src/pages/my-loans.tsx
[D] artifacts/ghayth-erp/src/pages/my-overtime.tsx
[D] artifacts/ghayth-erp/src/pages/my-payslip.tsx
[D] artifacts/ghayth-erp/src/pages/my-performance.tsx
[D] artifacts/ghayth-erp/src/pages/my-requests.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/account-info-card.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/active-loans-card.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/alerts-section.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/change-password-section.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/custodies-and-documents-section.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/entity-cards-section.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/leaves-and-requests-section.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/monthly-summary-card.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/pending-approvals-card.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/recent-actions-and-performance-section.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/role-entities-grid.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/secondary-alerts-section.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/shared.ts
[D] artifacts/ghayth-erp/src/pages/my-space/smart-suggestions-card.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/summary-cards.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/tasks-and-notifications-section.tsx
[D] artifacts/ghayth-erp/src/pages/my-space/violations-card.tsx
[D] artifacts/ghayth-erp/src/pages/not-found.tsx
[D] artifacts/ghayth-erp/src/pages/notification-engine.tsx
[D] artifacts/ghayth-erp/src/pages/notifications.tsx
[D] artifacts/ghayth-erp/src/pages/obligations.tsx
[D] artifacts/ghayth-erp/src/pages/operations-center.tsx
[D] artifacts/ghayth-erp/src/pages/projects.tsx
[D] artifacts/ghayth-erp/src/pages/projects/gantt.tsx
[D] artifacts/ghayth-erp/src/pages/projects/risks.tsx
[D] artifacts/ghayth-erp/src/pages/properties-buildings.tsx
[D] artifacts/ghayth-erp/src/pages/properties-contracts.tsx
[D] artifacts/ghayth-erp/src/pages/properties-dashboard.tsx
[D] artifacts/ghayth-erp/src/pages/properties-guide.tsx
[D] artifacts/ghayth-erp/src/pages/properties-maintenance.tsx
[D] artifacts/ghayth-erp/src/pages/properties-owners.tsx
[D] artifacts/ghayth-erp/src/pages/properties-payments.tsx
[D] artifacts/ghayth-erp/src/pages/properties-tenants.tsx
[D] artifacts/ghayth-erp/src/pages/properties.tsx
[D] artifacts/ghayth-erp/src/pages/properties/contract-detail.tsx
[D] artifacts/ghayth-erp/src/pages/properties/deposits.tsx
[D] artifacts/ghayth-erp/src/pages/properties/inspections.tsx
[D] artifacts/ghayth-erp/src/pages/properties/occupancy-report.tsx
[D] artifacts/ghayth-erp/src/pages/reports/scheduled-reports.tsx
[D] artifacts/ghayth-erp/src/pages/requests-page.tsx
[D] artifacts/ghayth-erp/src/pages/settings-rules.tsx
[D] artifacts/ghayth-erp/src/pages/settings.tsx
[D] artifacts/ghayth-erp/src/pages/settings/accounting-mappings-tab.tsx
[D] artifacts/ghayth-erp/src/pages/settings/approval-workflows-tab.tsx
[D] artifacts/ghayth-erp/src/pages/settings/branches-tab.tsx
[D] artifacts/ghayth-erp/src/pages/settings/communication-channels-tab.tsx
[D] artifacts/ghayth-erp/src/pages/settings/companies-tab.tsx
[D] artifacts/ghayth-erp/src/pages/settings/gov-integrations-tab.tsx
[D] artifacts/ghayth-erp/src/pages/settings/letterhead-tab.tsx
[D] artifacts/ghayth-erp/src/pages/settings/role-permissions-tab.tsx
[D] artifacts/ghayth-erp/src/pages/settings/system-controls-tab.tsx
[D] artifacts/ghayth-erp/src/pages/settings/workflow-definitions-tab.tsx
[D] artifacts/ghayth-erp/src/pages/settings/zatca-settings-tab.tsx
[D] artifacts/ghayth-erp/src/pages/store.tsx
[D] artifacts/ghayth-erp/src/pages/store/order-detail.tsx
[D] artifacts/ghayth-erp/src/pages/store/product-detail.tsx
[D] artifacts/ghayth-erp/src/pages/support.tsx
[D] artifacts/ghayth-erp/src/pages/support/replies.tsx
[D] artifacts/ghayth-erp/src/pages/tasks.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/agents.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/attachments.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/commission-plan-editor.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/commission-plans.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/daily-runsheet.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/dashboard.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/groups.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/import-wizard.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/import.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/packages.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/penalties.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/pilgrim-detail.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/pilgrims.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/pricing.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/reconciliation.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/seasons.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/sub-agents.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/transport.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/violation-create.tsx
[D] artifacts/ghayth-erp/src/pages/umrah/violations.tsx
[D] artifacts/ghayth-erp/src/pages/warehouse.tsx
[L] artifacts/ghayth-erp/src/pages/warehouse/abc-classification.tsx
[L] artifacts/ghayth-erp/src/pages/warehouse/cycle-count-accuracy.tsx
[L] artifacts/ghayth-erp/src/pages/warehouse/cycle-count-detail.tsx
[L] artifacts/ghayth-erp/src/pages/warehouse/cycle-counts.tsx
[L] artifacts/ghayth-erp/src/pages/warehouse/expiring-report.tsx
[D] artifacts/ghayth-erp/src/pages/warehouse/inventory-count.tsx
[L] artifacts/ghayth-erp/src/pages/warehouse/lot-aging.tsx
[L] artifacts/ghayth-erp/src/pages/warehouse/lots.tsx
[L] artifacts/ghayth-erp/src/pages/warehouse/serials.tsx
[D] artifacts/ghayth-erp/src/routes/documentsRoutes.tsx
[D] artifacts/ghayth-erp/src/routes/financeRoutes.tsx
[D] artifacts/ghayth-erp/src/routes/hrRoutes.tsx
```

</details>

### `script-tooling` (P2 · 55 files)

Maintainer scripts (PR push, CI, audit, self-heal).

<details><summary>55 files (click to expand)</summary>

```text
[L] scripts/_bulk_close_failed.mjs
[L] scripts/_bypass_push.mjs
[L] scripts/_drift_inventory.mjs
[L] scripts/_fix_audit_hooks.mjs
[L] scripts/_gh_actions_billing_monitor.mjs
[L] scripts/_gh_quota_top.mjs
[D] scripts/_merge_all.mjs
[L] scripts/_merge_typed_queries_followup.mjs
[L] scripts/_open_orphan_prs.mjs
[L] scripts/_post_pr275_final.mjs
[D] scripts/_pr_push.mjs
[L] scripts/_push_followup.mjs
[L] scripts/_push_governance_v2.mjs
[L] scripts/_push_pr275_fixes.mjs
[L] scripts/_rerun_failed_ci.mjs
[L] scripts/_resolve_conflict_prs.mjs
[L] scripts/audit-action-vocab-allowlist.txt
[D] scripts/backup.sh
[L] scripts/check-audit-action-vocab.mjs
[L] scripts/check-audit-payloads.mjs
[L] scripts/check-findings-injection.mjs
[L] scripts/cross-domain-read-denylist.txt
[L] scripts/cross-domain-write-denylist.txt
[L] scripts/dr-decrypt-verify.mjs
[L] scripts/dr-drill.sh
[L] scripts/dr-prune.sh
[L] scripts/observability-coverage-allowlist.txt
[L] scripts/patient_merge.mjs
[D] scripts/restore.sh
[L] scripts/src/_pull2.mjs
[L] scripts/src/aggregate-runtime-audit.cjs
[L] scripts/src/annotate-as-any.mjs
[D] scripts/src/audit-domain-boundaries.mjs
[L] scripts/src/audit-runtime-guard.mjs
[L] scripts/src/check-as-any-comments.mjs
[L] scripts/src/check-cross-domain-reads.mjs
[L] scripts/src/check-cross-domain-writes.mjs
[L] scripts/src/check-event-name-tense.mjs
[L] scripts/src/check-event-orphans.mjs
[L] scripts/src/check-finance-projects-writes.mjs
[D] scripts/src/check-ghost-rows.mjs
[L] scripts/src/check-idempotency-coverage.mjs
[L] scripts/src/check-observability-coverage.mjs
[L] scripts/src/check-prometheus-alerts.mjs
[D] scripts/src/check-schema-drift.mjs
[L] scripts/src/check-where-replace.mjs
[L] scripts/src/check-zatca-spike-pause-test-ran.mjs
[L] scripts/src/lib/_github-client.integration-worker.mjs
[L] scripts/src/lib/github-client.mjs
[L] scripts/src/lintEventCoverage.mjs
[L] scripts/src/lintEventListenerCoverage.mjs
[L] scripts/src/list-as-any.mjs
[D] scripts/src/runtime-audit.cjs
[L] scripts/src/strip-none-placeholders.mjs
[L] scripts/src/test-deep-link-routing.mjs
```

</details>

### `system-auditor-tool` (P2 · 12 files)

—

```text
[L] tools/system-auditor/.gitignore
[L] tools/system-auditor/src/checkers/apiContracts.ts
[L] tools/system-auditor/src/checkers/boundaries.ts
[L] tools/system-auditor/src/checkers/db.ts
[L] tools/system-auditor/src/checkers/events.ts
[L] tools/system-auditor/src/checkers/frontend.ts
[L] tools/system-auditor/src/checkers/rbacAudit.ts
[L] tools/system-auditor/src/index.ts
[L] tools/system-auditor/src/reporter.ts
[L] tools/system-auditor/src/types.ts
[L] tools/system-auditor/src/utils.ts
[L] tools/system-auditor/tsconfig.json
```

### `tests` (P2 · 59 files)

Unit/integration/e2e test files.

<details><summary>59 files (click to expand)</summary>

```text
[L] artifacts/api-server/tests/integration/attendanceTimezone.test.ts
[L] artifacts/api-server/tests/integration/careersPublicationControls.dynamic.test.ts
[L] artifacts/api-server/tests/integration/eventLogsCoverage.test.ts
[L] artifacts/api-server/tests/integration/fxRealizedOnPayment.dynamic.test.ts
[L] artifacts/api-server/tests/integration/idempotencyDoubleClick.dynamic.test.ts
[L] artifacts/api-server/tests/integration/idempotencyMiddleware.dynamic.test.ts
[L] artifacts/api-server/tests/integration/mudadContractRegisterListener.dynamic.test.ts
[L] artifacts/api-server/tests/integration/mudadContractRegisterRetryCron.dynamic.test.ts
[L] artifacts/api-server/tests/integration/mudadSalaryRetryCron.dynamic.test.ts
[L] artifacts/api-server/tests/integration/ocrEntitySync.dynamic.test.ts
[D] artifacts/api-server/tests/integration/tenantIsolation.dynamic.test.ts
[L] artifacts/api-server/tests/integration/wpsDirectDelivery.dynamic.test.ts
[L] artifacts/api-server/tests/integration/wpsSkippedHrNotification.dynamic.test.ts
[L] artifacts/api-server/tests/integration/zatcaB2cSpikePause.dynamic.test.ts
[L] artifacts/api-server/tests/unit/apiHealthSummary.test.ts
[L] artifacts/api-server/tests/unit/attendanceTimezone.test.ts
[D] artifacts/api-server/tests/unit/domainEngines.test.ts
[D] artifacts/api-server/tests/unit/errorHandler.test.ts
[D] artifacts/api-server/tests/unit/eventListenersCatalogSmoke.test.ts
[L] artifacts/api-server/tests/unit/excelRoundTrip.test.ts
[D] artifacts/api-server/tests/unit/financeHardeningSmoke.test.ts
[L] artifacts/api-server/tests/unit/financeProjectsWriteBoundary.test.ts
[D] artifacts/api-server/tests/unit/financialIntegrity.test.ts
[D] artifacts/api-server/tests/unit/formMigrationBatch3Smoke.test.ts
[D] artifacts/api-server/tests/unit/genericImportEngine.test.ts
[L] artifacts/api-server/tests/unit/ghClientQuotaCollector.test.ts
[D] artifacts/api-server/tests/unit/glPosting.test.ts
[D] artifacts/api-server/tests/unit/hrDisciplineSmoke.test.ts
[D] artifacts/api-server/tests/unit/inventoryValuation.test.ts
[D] artifacts/api-server/tests/unit/mudadClient.test.ts
[L] artifacts/api-server/tests/unit/ocrEntitySync.test.ts
[L] artifacts/api-server/tests/unit/ocrPendingCollector.test.ts
[L] artifacts/api-server/tests/unit/pricingEngine.test.ts
[L] artifacts/api-server/tests/unit/pushIntegrationMetrics.test.ts
[D] artifacts/api-server/tests/unit/rateLimitDistributed.test.ts
[D] artifacts/api-server/tests/unit/rbac/abacConditions.test.ts
[D] artifacts/api-server/tests/unit/rbac/endpointCoverage.test.ts
[D] artifacts/api-server/tests/unit/rbac/fieldPolicy.test.ts
[D] artifacts/api-server/tests/unit/rbacConsistency.test.ts
[D] artifacts/api-server/tests/unit/saudiCompliance.test.ts
[L] artifacts/api-server/tests/unit/scrub.test.ts
[D] artifacts/api-server/tests/unit/selfAuditExportSmoke.test.ts
[D] artifacts/api-server/tests/unit/umrahEnginesSmoke.test.ts
[D] artifacts/api-server/tests/unit/wpsBankFormats.test.ts
[L] artifacts/api-server/tests/unit/wpsDelivery.test.ts
[L] artifacts/api-server/tests/unit/wpsSkipReasons.test.ts
[L] e2e/tests/_helpers/db.ts
[L] e2e/tests/double-click-idempotency.spec.ts
[L] scripts/src/check-as-any-comments.test.mjs
[L] scripts/src/check-audit-action-vocab.test.mjs
[L] scripts/src/check-cross-domain-reads.test.mjs
[L] scripts/src/check-cross-domain-writes.test.mjs
[D] scripts/src/check-ghost-rows.test.mjs
[L] scripts/src/check-observability-coverage.test.mjs
[L] scripts/src/check-where-replace.test.mjs
[L] scripts/src/lib/github-client.priority-integration.test.mjs
[L] scripts/src/lib/github-client.test.mjs
[L] scripts/src/lintEventCoverage.test.mjs
[L] scripts/src/lintEventListenerCoverage.test.mjs
```

</details>

### `api-zod-gen` (P3 · 23 files)

Orval-generated Zod schemas. Regeneratable via `pnpm --filter @ghayth-erp/api-spec run generate`.

```text
[L] lib/api-zod/src/generated/types/bulkWaiveUmrahPenalties200.ts
[L] lib/api-zod/src/generated/types/bulkWaiveUmrahPenaltiesBody.ts
[L] lib/api-zod/src/generated/types/createProjectBody.ts
[L] lib/api-zod/src/generated/types/createProjectBodyPhasesItem.ts
[L] lib/api-zod/src/generated/types/createProjectBodyStatus.ts
[L] lib/api-zod/src/generated/types/createUmrahAttachment201.ts
[L] lib/api-zod/src/generated/types/createUmrahAttachmentBody.ts
[L] lib/api-zod/src/generated/types/listUmrahAttachments200.ts
[L] lib/api-zod/src/generated/types/listUmrahAttachmentsEntityType.ts
[L] lib/api-zod/src/generated/types/listUmrahAttachmentsParams.ts
[L] lib/api-zod/src/generated/types/listUmrahAttachmentsType.ts
[L] lib/api-zod/src/generated/types/mergeUmrahGroups200.ts
[L] lib/api-zod/src/generated/types/mergeUmrahGroupsBody.ts
[L] lib/api-zod/src/generated/types/splitUmrahGroup200.ts
[L] lib/api-zod/src/generated/types/splitUmrahGroup200NewGroup.ts
[L] lib/api-zod/src/generated/types/splitUmrahGroupBody.ts
[L] lib/api-zod/src/generated/types/umrahDailyRunsheet200.ts
[L] lib/api-zod/src/generated/types/umrahDailyRunsheetParams.ts
[L] lib/api-zod/src/generated/types/umrahDailyRunsheetPdfParams.ts
[L] lib/api-zod/src/generated/types/umrahReconciliationReport200.ts
[L] lib/api-zod/src/generated/types/umrahReconciliationReport200Summary.ts
[L] lib/api-zod/src/generated/types/umrahReconciliationReportParams.ts
[L] lib/api-zod/src/generated/types/umrahSubAgentStatementPdfParams.ts
```

### `audit-system-review` (P3 · 391 files)

—

<details><summary>391 files (click to expand)</summary>

```text
[D] audit/system-review/findings/broken-integrations.md
[L] audit/system-review/findings/FINDING-003-source-of-truth-drift.md
[D] audit/system-review/findings/FINDINGS.csv
[D] audit/system-review/findings/modeling-gaps.md
[D] audit/system-review/findings/orphan-buttons.md
[D] audit/system-review/modules/admin/_module.md
[D] audit/system-review/modules/admin/admin-domain-registry.md
[D] audit/system-review/modules/admin/admin-event-monitor.md
[D] audit/system-review/modules/admin/admin-gl-reconciliation.md
[D] audit/system-review/modules/admin/admin-integrations.md
[D] audit/system-review/modules/admin/admin-lifecycle-monitor.md
[D] audit/system-review/modules/admin/admin-logs.md
[D] audit/system-review/modules/admin/admin-monitoring.md
[D] audit/system-review/modules/admin/admin-policy-engine.md
[D] audit/system-review/modules/admin/admin-posting-failures.md
[D] audit/system-review/modules/admin/admin-rbac-matrix.md
[D] audit/system-review/modules/admin/admin-roles.md
[D] audit/system-review/modules/admin/admin-system-governor.md
[D] audit/system-review/modules/admin/admin-system-registry.md
[D] audit/system-review/modules/admin/admin-users.md
[D] audit/system-review/modules/admin/admin-violations-report.md
[D] audit/system-review/modules/admin/admin.md
[D] audit/system-review/modules/admin/automation.md
[D] audit/system-review/modules/bi/_module.md
[D] audit/system-review/modules/bi/bi-admin-reports.md
[D] audit/system-review/modules/bi/bi-dashboards-create.md
[D] audit/system-review/modules/bi/bi-dashboards.md
[D] audit/system-review/modules/bi/bi-kpis-create.md
[D] audit/system-review/modules/bi/bi-kpis.md
[D] audit/system-review/modules/bi/bi-operations.md
[D] audit/system-review/modules/bi/bi-reports-create.md
[D] audit/system-review/modules/bi/bi-reports.md
[D] audit/system-review/modules/bi/bi.md
[D] audit/system-review/modules/bi/insights.md
[D] audit/system-review/modules/bi/intelligence.md
[D] audit/system-review/modules/bi/module-dashboards.md
[D] audit/system-review/modules/bi/reports-scheduled.md
[D] audit/system-review/modules/careers-portal/_module.md
[D] audit/system-review/modules/client-portal/_module.md
[D] audit/system-review/modules/communications/_module.md
[D] audit/system-review/modules/communications/communications-letters-create.md
[D] audit/system-review/modules/communications/communications-notification-engine.md
[D] audit/system-review/modules/communications/communications.md
[D] audit/system-review/modules/communications/correspondence-byid.md
[D] audit/system-review/modules/communications/correspondence-create.md
[D] audit/system-review/modules/communications/correspondence.md
[D] audit/system-review/modules/crm/_module.md
[D] audit/system-review/modules/crm/clients-byid.md
[D] audit/system-review/modules/crm/clients-create.md
[D] audit/system-review/modules/crm/clients.md
[D] audit/system-review/modules/crm/crm-activities.md
[D] audit/system-review/modules/crm/crm-byid.md
[D] audit/system-review/modules/crm/crm-create.md
[D] audit/system-review/modules/crm/crm-leads-byid.md
[D] audit/system-review/modules/crm/crm-pipeline.md
[D] audit/system-review/modules/crm/crm.md
[D] audit/system-review/modules/documents/_module.md
[D] audit/system-review/modules/documents/documents-archive.md
[D] audit/system-review/modules/documents/documents-byid-versions.md
[D] audit/system-review/modules/documents/documents-create.md
[D] audit/system-review/modules/documents/documents-folders.md
[D] audit/system-review/modules/documents/documents-templates.md
[D] audit/system-review/modules/documents/documents-upload.md
[D] audit/system-review/modules/documents/documents.md
[D] audit/system-review/modules/finance/_module.md
[D] audit/system-review/modules/finance/finance-accounts-byid-edit.md
[D] audit/system-review/modules/finance/finance-accounts-byid.md
[D] audit/system-review/modules/finance/finance-accounts-create.md
[D] audit/system-review/modules/finance/finance-accounts.md
[D] audit/system-review/modules/finance/finance-ap-aging.md
[D] audit/system-review/modules/finance/finance-ar-aging.md
[D] audit/system-review/modules/finance/finance-bank-guarantees.md
[D] audit/system-review/modules/finance/finance-bank-reconciliation-manual-match-byid-byid.md
[D] audit/system-review/modules/finance/finance-bank-reconciliation.md
[D] audit/system-review/modules/finance/finance-budget-byid.md
[D] audit/system-review/modules/finance/finance-budget-create.md
[D] audit/system-review/modules/finance/finance-budget.md
[D] audit/system-review/modules/finance/finance-cash-flow-forecast.md
[D] audit/system-review/modules/finance/finance-cashflow.md
[D] audit/system-review/modules/finance/finance-commitments-byid.md
[D] audit/system-review/modules/finance/finance-commitments.md
[D] audit/system-review/modules/finance/finance-custodies-byid.md
[D] audit/system-review/modules/finance/finance-custodies-report.md
[D] audit/system-review/modules/finance/finance-custodies.md
[D] audit/system-review/modules/finance/finance-expenses-byid.md
[D] audit/system-review/modules/finance/finance-expenses-create.md
[D] audit/system-review/modules/finance/finance-expenses.md
[D] audit/system-review/modules/finance/finance-financial-requests-byid.md
[D] audit/system-review/modules/finance/finance-financial-requests.md
[D] audit/system-review/modules/finance/finance-fiscal-periods.md
[D] audit/system-review/modules/finance/finance-fixed-assets-batch-depreciate.md
[D] audit/system-review/modules/finance/finance-fixed-assets-byid.md
[D] audit/system-review/modules/finance/finance-fixed-assets.md
[D] audit/system-review/modules/finance/finance-gl-posting-queue.md
[D] audit/system-review/modules/finance/finance-intercompany-consolidation-create.md
[D] audit/system-review/modules/finance/finance-intercompany.md
[D] audit/system-review/modules/finance/finance-inventory-costing.md
[D] audit/system-review/modules/finance/finance-invoices-byid.md
[D] audit/system-review/modules/finance/finance-invoices-create.md
[D] audit/system-review/modules/finance/finance-invoices.md
[D] audit/system-review/modules/finance/finance-journal-create.md
[D] audit/system-review/modules/finance/finance-journal-manual-byid.md
[D] audit/system-review/modules/finance/finance-journal-manual-create.md
[D] audit/system-review/modules/finance/finance-journal-manual.md
[D] audit/system-review/modules/finance/finance-journal.md
[D] audit/system-review/modules/finance/finance-ledger-byid.md
[D] audit/system-review/modules/finance/finance-opening-balances-create.md
[D] audit/system-review/modules/finance/finance-opening-balances.md
[D] audit/system-review/modules/finance/finance-payments.md
[D] audit/system-review/modules/finance/finance-project-costing-byid.md
[D] audit/system-review/modules/finance/finance-project-costing.md
[D] audit/system-review/modules/finance/finance-purchase-orders-byid.md
[D] audit/system-review/modules/finance/finance-purchase-orders-create.md
[D] audit/system-review/modules/finance/finance-purchase-orders.md
[D] audit/system-review/modules/finance/finance-receivables-byid.md
[D] audit/system-review/modules/finance/finance-receivables.md
[D] audit/system-review/modules/finance/finance-recurring-journals-byid.md
[D] audit/system-review/modules/finance/finance-recurring-journals-create.md
[D] audit/system-review/modules/finance/finance-recurring-journals.md
[D] audit/system-review/modules/finance/finance-reports.md
[D] audit/system-review/modules/finance/finance-salary-advances-byid.md
[D] audit/system-review/modules/finance/finance-salary-advances.md
[D] audit/system-review/modules/finance/finance-tax.md
[D] audit/system-review/modules/finance/finance-treasury.md
[D] audit/system-review/modules/finance/finance-vendors-byid.md
[D] audit/system-review/modules/finance/finance-vendors-create.md
[D] audit/system-review/modules/finance/finance-vendors.md
[D] audit/system-review/modules/finance/finance-vouchers-byid.md
[D] audit/system-review/modules/finance/finance-vouchers-create.md
[D] audit/system-review/modules/finance/finance-vouchers.md
[D] audit/system-review/modules/finance/finance-year-end-close.md
[D] audit/system-review/modules/finance/finance.md
[D] audit/system-review/modules/fleet/_module.md
[D] audit/system-review/modules/fleet/fleet-alerts-create.md
[D] audit/system-review/modules/fleet/fleet-alerts.md
[D] audit/system-review/modules/fleet/fleet-byid-status.md
[D] audit/system-review/modules/fleet/fleet-byid.md
[D] audit/system-review/modules/fleet/fleet-drivers-byid.md
[D] audit/system-review/modules/fleet/fleet-drivers-create.md
[D] audit/system-review/modules/fleet/fleet-drivers.md
[D] audit/system-review/modules/fleet/fleet-fuel-byid.md
[D] audit/system-review/modules/fleet/fleet-fuel-create.md
[D] audit/system-review/modules/fleet/fleet-fuel.md
[D] audit/system-review/modules/fleet/fleet-insurance-byid.md
[D] audit/system-review/modules/fleet/fleet-insurance-create.md
[D] audit/system-review/modules/fleet/fleet-insurance.md
[D] audit/system-review/modules/fleet/fleet-maintenance-byid.md
[D] audit/system-review/modules/fleet/fleet-maintenance-create.md
[D] audit/system-review/modules/fleet/fleet-maintenance.md
[D] audit/system-review/modules/fleet/fleet-preventive-plans.md
[D] audit/system-review/modules/fleet/fleet-reports.md
[D] audit/system-review/modules/fleet/fleet-tco.md
[D] audit/system-review/modules/fleet/fleet-traffic-violations-byid.md
[D] audit/system-review/modules/fleet/fleet-traffic-violations.md
[D] audit/system-review/modules/fleet/fleet-trips-byid.md
[D] audit/system-review/modules/fleet/fleet-trips-create.md
[D] audit/system-review/modules/fleet/fleet-trips.md
[D] audit/system-review/modules/fleet/fleet-vehicles-create.md
[D] audit/system-review/modules/fleet/fleet.md
[D] audit/system-review/modules/governance/_module.md
[D] audit/system-review/modules/governance/governance-audits-byid.md
[D] audit/system-review/modules/governance/governance-audits-create.md
[D] audit/system-review/modules/governance/governance-audits.md
[D] audit/system-review/modules/governance/governance-capa.md
[D] audit/system-review/modules/governance/governance-compliance-byid.md
[D] audit/system-review/modules/governance/governance-compliance-create.md
[D] audit/system-review/modules/governance/governance-compliance.md
[D] audit/system-review/modules/governance/governance-policies-byid.md
[D] audit/system-review/modules/governance/governance-policies-create.md
[D] audit/system-review/modules/governance/governance-policies.md
[D] audit/system-review/modules/governance/governance-risks-byid.md
[D] audit/system-review/modules/governance/governance-risks-create.md
[D] audit/system-review/modules/governance/governance-risks.md
[D] audit/system-review/modules/governance/governance.md
[D] audit/system-review/modules/hr/_module.md
[D] audit/system-review/modules/hr/employees-byid.md
[D] audit/system-review/modules/hr/employees-create.md
[D] audit/system-review/modules/hr/employees.md
[D] audit/system-review/modules/hr/hr-attendance-byid.md
[D] audit/system-review/modules/hr/hr-attendance-create.md
[D] audit/system-review/modules/hr/hr-attendance-field-tracking.md
[D] audit/system-review/modules/hr/hr-attendance-qr-scanner.md
[D] audit/system-review/modules/hr/hr-attendance-reports.md
[D] audit/system-review/modules/hr/hr-attendance.md
[D] audit/system-review/modules/hr/hr-contracts-byid.md
[D] audit/system-review/modules/hr/hr-contracts-create.md
[D] audit/system-review/modules/hr/hr-contracts.md
[D] audit/system-review/modules/hr/hr-development-plans.md
[D] audit/system-review/modules/hr/hr-discipline-memos-byid.md
[D] audit/system-review/modules/hr/hr-discipline-memos.md
[D] audit/system-review/modules/hr/hr-discipline-regulation.md
[D] audit/system-review/modules/hr/hr-employee-activation.md
[D] audit/system-review/modules/hr/hr-employee-profile-byid.md
[D] audit/system-review/modules/hr/hr-evaluation-360-byid-peer.md
[D] audit/system-review/modules/hr/hr-evaluation-360-byid-upward.md
[D] audit/system-review/modules/hr/hr-evaluation-360-byid.md
[D] audit/system-review/modules/hr/hr-evaluation-360-create.md
[D] audit/system-review/modules/hr/hr-evaluation-360-history-byid.md
[D] audit/system-review/modules/hr/hr-evaluation-360.md
[D] audit/system-review/modules/hr/hr-excuse-requests-byid.md
[D] audit/system-review/modules/hr/hr-excuse-requests-create.md
[D] audit/system-review/modules/hr/hr-excuse-requests.md
[D] audit/system-review/modules/hr/hr-exit-byid.md
[D] audit/system-review/modules/hr/hr-exit-create.md
[D] audit/system-review/modules/hr/hr-exit.md
[D] audit/system-review/modules/hr/hr-expiring-documents.md
[D] audit/system-review/modules/hr/hr-gratuity.md
[D] audit/system-review/modules/hr/hr-idp.md
[D] audit/system-review/modules/hr/hr-leaves-approval-chains.md
[D] audit/system-review/modules/hr/hr-leaves-byid.md
[D] audit/system-review/modules/hr/hr-leaves-create.md
[D] audit/system-review/modules/hr/hr-leaves-management.md
[D] audit/system-review/modules/hr/hr-leaves.md
[D] audit/system-review/modules/hr/hr-loans-byid.md
[D] audit/system-review/modules/hr/hr-loans-create.md
[D] audit/system-review/modules/hr/hr-loans.md
[D] audit/system-review/modules/hr/hr-official-letters.md
[D] audit/system-review/modules/hr/hr-onboarding-review.md
[D] audit/system-review/modules/hr/hr-organization-structure.md
[D] audit/system-review/modules/hr/hr-organization.md
[D] audit/system-review/modules/hr/hr-overtime-byid.md
[D] audit/system-review/modules/hr/hr-overtime-create.md
[D] audit/system-review/modules/hr/hr-overtime.md
[D] audit/system-review/modules/hr/hr-payroll-byid.md
[D] audit/system-review/modules/hr/hr-payroll-create.md
[D] audit/system-review/modules/hr/hr-payroll-salary-components.md
[D] audit/system-review/modules/hr/hr-payroll.md
[D] audit/system-review/modules/hr/hr-performance-advanced.md
[D] audit/system-review/modules/hr/hr-performance-byid.md
[D] audit/system-review/modules/hr/hr-performance-create.md
[D] audit/system-review/modules/hr/hr-performance.md
[D] audit/system-review/modules/hr/hr-public-holidays.md
[D] audit/system-review/modules/hr/hr-recruitment-advanced.md
[D] audit/system-review/modules/hr/hr-recruitment-applicants-create.md
[D] audit/system-review/modules/hr/hr-recruitment-applications.md
[D] audit/system-review/modules/hr/hr-recruitment-create.md
[D] audit/system-review/modules/hr/hr-recruitment-jobs-byid.md
[D] audit/system-review/modules/hr/hr-recruitment.md
[D] audit/system-review/modules/hr/hr-shifts-byid.md
[D] audit/system-review/modules/hr/hr-shifts-create.md
[D] audit/system-review/modules/hr/hr-shifts-management.md
[D] audit/system-review/modules/hr/hr-shifts.md
[D] audit/system-review/modules/hr/hr-training-advanced.md
[D] audit/system-review/modules/hr/hr-training-byid.md
[D] audit/system-review/modules/hr/hr-training-create.md
[D] audit/system-review/modules/hr/hr-training.md
[D] audit/system-review/modules/hr/hr-transfers-byid.md
[D] audit/system-review/modules/hr/hr-transfers.md
[D] audit/system-review/modules/hr/hr-turnover-report.md
[D] audit/system-review/modules/hr/hr-violations-auto-detection.md
[D] audit/system-review/modules/hr/hr-violations-byid.md
[D] audit/system-review/modules/hr/hr-violations-create.md
[D] audit/system-review/modules/hr/hr-violations-management.md
[D] audit/system-review/modules/hr/hr-violations-penalty-escalation.md
[D] audit/system-review/modules/hr/hr-violations.md
[D] audit/system-review/modules/hr/hr.md
[D] audit/system-review/modules/legal/_module.md
[D] audit/system-review/modules/legal/legal-cases-byid.md
[D] audit/system-review/modules/legal/legal-cases-create.md
[D] audit/system-review/modules/legal/legal-cases.md
[D] audit/system-review/modules/legal/legal-contracts-byid.md
[D] audit/system-review/modules/legal/legal-contracts.md
[D] audit/system-review/modules/legal/legal-correspondence.md
[D] audit/system-review/modules/legal/legal-create.md
[D] audit/system-review/modules/legal/legal-documents.md
[D] audit/system-review/modules/legal/legal-judgments-byid.md
[D] audit/system-review/modules/legal/legal-judgments.md
[D] audit/system-review/modules/legal/legal-sessions-byid.md
[D] audit/system-review/modules/legal/legal-sessions.md
[D] audit/system-review/modules/legal/legal.md
[D] audit/system-review/modules/marketing/_module.md
[D] audit/system-review/modules/marketing/marketing-create.md
[D] audit/system-review/modules/marketing/marketing.md
[D] audit/system-review/modules/misc/_module.md
[D] audit/system-review/modules/misc/action-center.md
[D] audit/system-review/modules/misc/activity-log.md
[D] audit/system-review/modules/misc/calendar.md
[D] audit/system-review/modules/misc/dashboard.md
[D] audit/system-review/modules/misc/exec-dashboard.md
[D] audit/system-review/modules/misc/manager-board.md
[D] audit/system-review/modules/misc/my-attendance.md
[D] audit/system-review/modules/misc/my-documents.md
[D] audit/system-review/modules/misc/my-leave-request.md
[D] audit/system-review/modules/misc/my-loans.md
[D] audit/system-review/modules/misc/my-overtime.md
[D] audit/system-review/modules/misc/my-payslip.md
[D] audit/system-review/modules/misc/my-performance.md
[D] audit/system-review/modules/misc/my-requests.md
[D] audit/system-review/modules/misc/my-space.md
[D] audit/system-review/modules/misc/notifications.md
[D] audit/system-review/modules/operations/_module.md
[D] audit/system-review/modules/operations/daily-close.md
[D] audit/system-review/modules/operations/obligations.md
[D] audit/system-review/modules/operations/operations-center.md
[D] audit/system-review/modules/operations/projects-byid.md
[D] audit/system-review/modules/operations/projects-create.md
[D] audit/system-review/modules/operations/projects-risks.md
[D] audit/system-review/modules/operations/projects-tasks.md
[D] audit/system-review/modules/operations/projects.md
[D] audit/system-review/modules/operations/tasks.md
[D] audit/system-review/modules/operations/umrah-agents-byid.md
[D] audit/system-review/modules/operations/umrah-agents.md
[D] audit/system-review/modules/operations/umrah-attachments.md
[D] audit/system-review/modules/operations/umrah-commission-plans-byid-edit.md
[D] audit/system-review/modules/operations/umrah-commission-plans-new.md
[D] audit/system-review/modules/operations/umrah-commission-plans.md
[D] audit/system-review/modules/operations/umrah-daily-runsheet.md
[D] audit/system-review/modules/operations/umrah-groups.md
[D] audit/system-review/modules/operations/umrah-import-legacy.md
[D] audit/system-review/modules/operations/umrah-import.md
[D] audit/system-review/modules/operations/umrah-invoices-byid.md
[D] audit/system-review/modules/operations/umrah-invoices.md
[D] audit/system-review/modules/operations/umrah-packages-byid.md
[D] audit/system-review/modules/operations/umrah-packages.md
[D] audit/system-review/modules/operations/umrah-penalties-byid.md
[D] audit/system-review/modules/operations/umrah-penalties.md
[D] audit/system-review/modules/operations/umrah-pilgrims-byid.md
[D] audit/system-review/modules/operations/umrah-pilgrims-create.md
[D] audit/system-review/modules/operations/umrah-pilgrims.md
[D] audit/system-review/modules/operations/umrah-pricing.md
[D] audit/system-review/modules/operations/umrah-reconciliation.md
[D] audit/system-review/modules/operations/umrah-seasons-byid.md
[D] audit/system-review/modules/operations/umrah-seasons.md
[D] audit/system-review/modules/operations/umrah-sub-agents-byid.md
[D] audit/system-review/modules/operations/umrah-sub-agents.md
[D] audit/system-review/modules/operations/umrah-transport-byid.md
[D] audit/system-review/modules/operations/umrah-transport.md
[D] audit/system-review/modules/operations/umrah-violations-byid.md
[D] audit/system-review/modules/operations/umrah-violations-create.md
[D] audit/system-review/modules/operations/umrah-violations.md
[D] audit/system-review/modules/operations/umrah.md
[D] audit/system-review/modules/properties/_module.md
[D] audit/system-review/modules/properties/properties-buildings.md
[D] audit/system-review/modules/properties/properties-byid.md
[D] audit/system-review/modules/properties/properties-contracts-byid.md
[D] audit/system-review/modules/properties/properties-contracts-create.md
[D] audit/system-review/modules/properties/properties-contracts.md
[D] audit/system-review/modules/properties/properties-dashboard.md
[D] audit/system-review/modules/properties/properties-deposits.md
[D] audit/system-review/modules/properties/properties-inspections.md
[D] audit/system-review/modules/properties/properties-maintenance-byid.md
[D] audit/system-review/modules/properties/properties-maintenance.md
[D] audit/system-review/modules/properties/properties-occupancy-report.md
[D] audit/system-review/modules/properties/properties-owners-byid-edit.md
[D] audit/system-review/modules/properties/properties-owners-create.md
[D] audit/system-review/modules/properties/properties-owners.md
[D] audit/system-review/modules/properties/properties-payments-byid-pay.md
[D] audit/system-review/modules/properties/properties-payments.md
[D] audit/system-review/modules/properties/properties-tenants-create.md
[D] audit/system-review/modules/properties/properties-tenants.md
[D] audit/system-review/modules/properties/properties.md
[D] audit/system-review/modules/requests/_module.md
[D] audit/system-review/modules/requests/requests-byid.md
[D] audit/system-review/modules/requests/requests-create.md
[D] audit/system-review/modules/requests/requests-types.md
[D] audit/system-review/modules/requests/requests-workflows.md
[D] audit/system-review/modules/requests/requests.md
[D] audit/system-review/modules/settings/_module.md
[D] audit/system-review/modules/settings/settings-audit-log.md
[D] audit/system-review/modules/settings/settings-branches.md
[D] audit/system-review/modules/settings/settings-companies.md
[D] audit/system-review/modules/settings/settings-departments.md
[D] audit/system-review/modules/settings/settings-rules.md
[D] audit/system-review/modules/settings/settings.md
[D] audit/system-review/modules/store/_module.md
[D] audit/system-review/modules/store/store-orders-create.md
[D] audit/system-review/modules/store/store-orders.md
[D] audit/system-review/modules/store/store-products-byid.md
[D] audit/system-review/modules/store/store-products-create.md
[D] audit/system-review/modules/store/store.md
[D] audit/system-review/modules/support/_module.md
[D] audit/system-review/modules/support/support-byid.md
[D] audit/system-review/modules/support/support-create.md
[D] audit/system-review/modules/support/support.md
[D] audit/system-review/modules/warehouse/_module.md
[D] audit/system-review/modules/warehouse/warehouse-categories.md
[D] audit/system-review/modules/warehouse/warehouse-inventory-count.md
[D] audit/system-review/modules/warehouse/warehouse-movements-byid.md
[D] audit/system-review/modules/warehouse/warehouse-movements-create.md
[D] audit/system-review/modules/warehouse/warehouse-movements.md
[D] audit/system-review/modules/warehouse/warehouse-products-byid.md
[D] audit/system-review/modules/warehouse/warehouse-suppliers.md
[D] audit/system-review/modules/warehouse/warehouse.md
[D] audit/system-review/tooling/_buttons-by-page.json
[D] audit/system-review/tooling/_page-inventory.json
[D] audit/system-review/tooling/_schema-by-entity.json
[D] audit/system-review/tooling/button-handler-scan.mjs
[L] audit/system-review/tooling/inject-findings.mjs
[L] audit/system-review/tooling/inject-module-findings.mjs
[D] audit/system-review/tooling/page-inventory.mjs
[D] audit/system-review/tooling/schema-link.mjs
```

</details>

### `docs` (P3 · 20 files)

Markdown documentation.

```text
[L] docs/AI_GUARDIAN_SETUP.md
[L] docs/DR_RUNBOOK.md
[D] docs/freeze/freeze-post-freeze-cleanup.md
[L] docs/GITHUB_OPS.md
[L] docs/grafana/alertmanager.yaml
[L] docs/grafana/alerts.test.yaml
[L] docs/grafana/alerts.yaml
[L] docs/grafana/api-health.json
[L] docs/grafana/cron-health.json
[L] docs/grafana/db-health.json
[L] docs/grafana/gh-client-quota.json
[L] docs/grafana/integrations-health.json
[L] docs/grafana/README.md
[L] docs/GUARD_SUITE.md
[L] docs/OPERATIONAL_REVIEW_01.md
[D] docs/request-approval-matrix.md
[L] docs/UI_TEMPLATES.md
[L] docs/UNIFICATION_PLAN.md
[L] docs/WORKFLOWS_RUNBOOK.md
[L] threat_model.md
```

### `other` (P? · 11 files)

Did not match any classification rule — needs human triage.

```text
[L] artifacts/api-server/scripts/ocr-accuracy-benchmark.mjs
[L] audit/as-any-classification.csv
[L] audit/HTTP_SMOKE_AUDIT_2026-05-15.md
[L] audit/ocr-accuracy-report.json
[L] audit/ocr-fixtures/.gitignore
[L] audit/ocr-fixtures/generate.mjs
[L] audit/ocr-fixtures/manifest.json
[L] audit/ocr-fixtures/README.md
[L] audit/OPS_002_ROOT_CAUSE.md
[D] audit/RUNTIME_AUDIT_README.md
[L] audit/STABILIZATION_CLOSE_2026-05-15.md
```

## Next phase

1. **P0 patches** (highest priority): generate `.patch` files into `audit/patches/p0/` — one per bucket.
2. **P1 patches**: generate into `audit/patches/p1/`.
3. **P2 patches**: optional, batch into `audit/patches/p2/`.
4. **P3 buckets**: skip — regeneratable.
5. **P? bucket (`other`)**: hand-triage each entry before next phase.

Patch generation consumes `MANIFEST.json` deterministically and must NOT touch any file outside `audit/patches/`. Driven by a separate script (not this one — this one is inventory-only).

---

Regenerate: `node scripts/_sot_c_patch_manifest.mjs`
