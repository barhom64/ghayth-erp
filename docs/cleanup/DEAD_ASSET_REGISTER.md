# Dead Asset Register — Agent 8 Sweep

> **Generated:** 2026-05-31 (Agent 8 — Dead Asset Cleanup).
> **Scope:** `artifacts/api-server/src/`, `artifacts/ghayth-erp/src/`, plus docs under `docs/{audit,architecture,rbac,testing,ux}/` and migration files.
> **Out of scope (other agents):** nav, page shells, UI lib (`components/ui/*`, `components/page-shell|list-page|page-header|form-shell|create-page-layout.tsx`), routes, print, RBAC, docs reconciliation.

## Methodology

Built an import graph across `artifacts/{api-server,ghayth-erp}/src/`, `lib/*` (workspace packages), `scripts/`, and `audit/`. Entry points seeded with `app.ts`, `index.ts`, `otel.ts` (api-server), `main.tsx`, `App.tsx` (ghayth-erp), every barrel under `lib/*/src/index.ts`, and every file under `artifacts/*/tests/`. Re-exports through `@workspace/*` aliases — including the cross-tree re-exports from `lib/ui-core`, `lib/workflow-kit`, `lib/entity-kit`, `lib/report-kit` that reach back into `artifacts/.../src/components/*` — were resolved. A file is **dead** if it is not reachable from any entry point.

## Summary

| Bucket | Count |
|---|---|
| Archived (moved to `_archive/`) | 2 |
| Flag-for-deletion (no reachable consumer; coordinate before delete) | 6 |
| Kept as false-positive (entry point or cross-package re-export discovered) | 32 |
| Migrations marked superseded (documented only — files NOT moved) | 2 |

The initial naive sweep returned 74 dead-looking files. After resolving the workspace package re-exports (`lib/ui-core` re-exports `page-shell`, `list-page`, `page-header`, `form-shell`, `create-page-layout`, `data-table-wrapper`, `data-table-presets`, `sortable-table-head`, `ui/data-table`; `lib/workflow-kit` re-exports `approval-actions`, `use-lifecycle-action`; `lib/entity-kit` re-exports `detail-page-layout`, `entity-detail-page`, etc.) and including the OTel preload entry plus the smoke-test pins, the residue is the table below. Items under `components/ui/*` and `hooks/use-mobile.tsx` are referenced from `components/ui/sidebar.tsx` which is itself only re-exported through a chain that ends at zero consumers — those are excluded from action here because the **UI library agent** owns that surface.

## Asset table

| # | Asset path | Type | Reason dead | Last referenced | Action |
|---|---|---|---|---|---|
| 1 | `artifacts/api-server/src/lib/hrAssignments.ts` | helper | Sole export `listActiveEmployeeAssignments` has zero callers in src/, tests/, or `lib/*` packages. | none | **archive** → `artifacts/api-server/src/_archive/lib/hrAssignments.ts` |
| 2 | `artifacts/api-server/src/lib/pricingEngine.ts` | helper | Module is mentioned only as a string in `lib/eventCatalog.ts` `consumers: ["pricingEngine"]`; never imported. `aiUsage.ts` has a local `resolvePrice` (unrelated). | none (string only) | **archive** → `artifacts/api-server/src/_archive/lib/pricingEngine.ts` |
| 3 | `artifacts/api-server/src/middlewares/idempotencyMiddleware.ts` | middleware | Exports `idempotency()`. No route or app file imports it. The newer `lib/requestIdempotency.ts` (sourceKey-based) is what finance/fleet actually use. The file's own comment claims it is wired through `requestIdempotency.ts`, but that file does not import the middleware. Migration `170_idempotency_keys.sql` table `idempotency_keys` is also touched only from this orphan middleware. | none (in code) | **flag-for-deletion** — coordinate with table 170 removal |
| 4 | `artifacts/api-server/src/lib/inventory/index.ts` | barrel | Re-exports `cycle-count`, `cycle-count-plan`, `expiry-warning`, etc. No consumer imports `lib/inventory` (only `lib/inventory/<sub>` directly). | none | **flag-for-deletion** |
| 5 | `artifacts/api-server/src/lib/inventory/cycle-count-plan.ts` | helper | Sole consumer is the dead barrel `inventory/index.ts`. `generateCycleCountPlan` is never called. | `inventory/index.ts` (dead) | **flag-for-deletion** |
| 6 | `artifacts/api-server/src/lib/inventory/expiry-warning.ts` | helper | Sole consumer is the dead barrel `inventory/index.ts`. `runExpiryWarnings` / `lotExpiryWarningCron` are not registered with the cron scheduler (it imports `lots.ts:lotExpiryScanCron` instead). | `inventory/index.ts` (dead) | **flag-for-deletion** |
| 7 | `artifacts/api-server/src/lib/fx/index.ts` | barrel | Re-exports `convert`, `currencies`, `rate-lookup`, `revaluation`, `types`. Callers import the underlying files directly (e.g. `./fx/jobs.js`, `./fx/staleness-alert.js`, `./fx/post-revaluation-journal.js`); the barrel itself has no importer. | none | **flag-for-deletion** |
| 8 | `artifacts/ghayth-erp/src/components/shared/confirm-action-dialog.tsx` | component | Newly added UI primitive (UI-unification §6.2). Nothing imports `ConfirmActionDialog` yet. **Also triggers a wiring orphan**: the JSDoc example references `/finance/year-end-close` which has no backend route. | none | **flag-for-deletion** — UI-lib agent owns adoption |

### False-positive cluster — cross-package re-exports (resolved, KEPT)

These looked dead by naive grep but are LIVE through `lib/*/src/index.ts` re-exports:

| Asset | Re-exported by |
|---|---|
| `components/approval-actions.tsx` | `lib/workflow-kit/src/index.ts` (`ApprovalActions`, `ActionHistory`, `NotesDisplay`) |
| `components/page-shell.tsx` | `lib/ui-core/src/index.ts` (`PageShell`, `PageSection`) |
| `components/page-header.tsx` | `lib/ui-core/src/index.ts` (`PageHeader`) |
| `components/list-page.tsx` | `lib/ui-core/src/index.ts` (`ListPage`) |
| `components/form-shell.tsx` | `lib/ui-core/src/index.ts` (FormShell + companions) |
| `components/create-page-layout.tsx` | `lib/ui-core/src/index.ts` |
| `components/data-table-wrapper.tsx` | `lib/ui-core/src/index.ts` (`DataTableWrapper`, `PaginationBar`) |
| `components/data-table-presets.tsx` | `lib/ui-core/src/index.ts` |
| `components/sortable-table-head.tsx` | `lib/ui-core/src/index.ts` (transitively via `ui/data-table.tsx`) |
| `components/ui/data-table.tsx` | `lib/ui-core/src/index.ts` (`DataTable`) |
| `components/impact-card.tsx` | reached via `approval-actions.tsx` → `lib/workflow-kit` |
| `hooks/use-lifecycle-action.tsx` | `lib/workflow-kit/src/index.ts` (`useLifecycleAction`) |
| `hooks/use-sorted-data.ts` | transitively via `ui/data-table.tsx` → `lib/ui-core` |
| `lib/inventory/cycle-count.ts` | pinned by `artifacts/api-server/tests/unit/inventoryCycleCount.test.ts` |
| `lib/fx/{convert,currencies,rate-lookup,revaluation,types}.ts` | transitively reachable via `fx/jobs.ts` / `fx/post-*-journal.ts` / `fx/staleness-alert.ts` / `fx/realized.ts` from cron scheduler & finance-gl-helpers |
| `lib/zatca/{auth,canonicalize,client,csr,endpoints,hash,icv,index,pih,qr,response,signing,test-pack,types}.ts` | covered by `tests/unit/*.test.ts` smoke pins for the ZATCA Phase-2 module |
| `otel.ts` | secondary build entry — see `artifacts/api-server/build.mjs` |

### Out-of-scope dead candidates (UI lib agent territory — NOT touched)

These are reachable only through `components/ui/sidebar.tsx`, which is itself orphan. Sidebar is part of the UI library surface and belongs to the UI-lib agent — they should decide whether to revive or remove the cluster:

```
components/ui/{accordion,aspect-ratio,avatar,breadcrumb,breadcrumbs,button-group,
                calendar,carousel,chart,collapsible,context-menu,drawer,empty,
                field,form,hover-card,input-group,input-otp,item,kbd,menubar,
                navigation-menu,pagination,radio-group,resizable,scroll-area,
                separator,sidebar,spinner,toggle-group,toggle}.tsx
hooks/use-mobile.tsx
lib/print/index.ts     (print agent territory; barrel only)
```

### Migrations marked superseded (NOT moved)

Per scope rules, migration files are never moved — they record prod history. The following are documented here as **logically superseded**, meaning the table or behaviour was replaced by a later migration. The files remain in-place.

| Migration | Superseded by | Notes |
|---|---|---|
| `170_idempotency_keys.sql` (`idempotency_keys` table) | request-level `lib/requestIdempotency.ts` (sourceKey pattern) | If middleware row 3 above is deleted, this table can be dropped in a follow-up migration. The only readers/writers are inside the dead middleware. |
| (Note: 241_drop_orphan_wps_bank_credentials already dropped the wps_bank_credentials table from earlier Agent 5 sweep — documented for completeness.) | — | Already executed; no action. |

## Verification

```
$ pnpm run typecheck
artifacts/api-server typecheck: Done
artifacts/ghayth-erp typecheck: Done

$ bash scripts/guard.sh
[typecheck] ok
[lint:patterns] ok
[audit:routes] ok — all 579 page files imported
[audit:route-doubling] ok
[audit:wiring:tests] FAIL — 1 pre-existing orphan in confirm-action-dialog.tsx (UI-lib agent WIP, not introduced by this sweep)
```

The wiring test was already failing before this sweep (orphan introduced by the new `confirm-action-dialog.tsx` from another agent).
