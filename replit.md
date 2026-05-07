# Ghayth ERP

A comprehensive, full-stack Arabic enterprise resource planning system centralizing operations and enhancing efficiency for Al Door Group.

## Run & Operate

-   **Install dependencies**: `pnpm install`
-   **Build**: `pnpm build`
-   **Typecheck**: `pnpm typecheck`
-   **API Codegen**: `pnpm --filter @ghayth-erp/api-spec run generate` (from OpenAPI spec)
-   **Ghost-row check**: `pnpm run check:ghost-rows` — connects to `$DATABASE_URL`, lists every table that has a `deletedAt` column, then walks `artifacts/api-server/src/routes/**` and flags any `rawQuery` SELECT statement that reads from one of those tables without a `"deletedAt" IS NULL` predicate (the bug class Task #161 fixed). Statements containing `${…}` interpolation are skipped because helpers like `buildScopedWhere(…, { softDeleteColumn })` may inject the predicate. **Also scans Drizzle typed-builder calls** of the form `db.select().from(<tableVar>).leftJoin(...).where(...)` and asserts the chained predicates (or the join's ON arg) include `isNull(<tableVar>.deletedAt)` or `eq(<tableVar>.deletedAt, null)` — the equivalent guard for the typed builder, mirroring what `check:schema-drift` already does for `.insert().values()` / `.update().set()` (Task #168). Both guards share `scripts/src/lib/drizzle-schema.mjs::loadDrizzleSchema()` to resolve `tableVar → SQL table name`. Intentional exceptions (audit reports, restore-from-trash flows) live in `scripts/ghost-row-allowlist.txt` as `routes/<file>.ts[:tableName]` lines and apply to both raw SQL and Drizzle findings. Wired in as step 6 of `pnpm run guard` (and the `guard` GitHub Action) gated on `$DATABASE_URL`.
-   **Schema-drift check**: `pnpm run check:schema-drift` — connects to `$DATABASE_URL` and asserts that every quoted/INSERT/UPDATE identifier in `artifacts/api-server/src/routes/**` exists in `information_schema`. Catches the class of bug where a route references a column the live DB does not have (e.g. `suppliers.category`, `invoices.costCenter`, `umrah_packages.updatedAt`, `employees.attachments`, `financial_posting_failures` table) before it surfaces as a runtime 500. Identifiers declared by `CREATE TABLE IF NOT EXISTS` inside a `rawQuery()` are treated as locally defined so route-managed auxiliary tables don't false-positive. **Fires automatically** as step 5 of `pnpm run guard` (and the `guard` GitHub Action on every push/PR), gated on `$DATABASE_URL` being set; a failed check blocks the merge with the same readable diff users see locally.
-   **DB Migrations**: Migrations are applied automatically by `api-server` on startup. Manual migration files in `artifacts/api-server/src/migrations/`.
-   **Required Env Vars**: `REPLIT_DEV_DOMAIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (for screenshot generation).

## Stack

-   **Monorepo**: pnpm workspaces
-   **Node.js**: 24
-   **TypeScript**: 5.9
-   **API**: Express 5
-   **Database**: PostgreSQL (raw `pg` pool, Drizzle ORM)
-   **ORM**: Drizzle ORM
-   **Authentication**: JWT with refresh tokens
-   **Validation**: Zod
-   **API Codegen**: Orval (from OpenAPI spec)
-   **Frontend**: React, Vite, TailwindCSS, shadcn/ui

## Where things live

-   **API Server**: `artifacts/api-server`
-   **Main Frontend**: `artifacts/ghayth-erp`
-   **Client Portal**: `artifacts/client-portal`
-   **Careers Portal**: `artifacts/careers-portal`
-   **OpenAPI Spec**: `lib/api-spec`
-   **DB Schema**: `lib/db/schema.ts`
-   **Frontend Routes**: `artifacts/ghayth-erp/src/routes/` (modular, `React.lazy()` for performance)
-   **Shared API Client (React Hooks)**: `lib/api-client-react`
-   **Shared Zod Schemas**: `lib/api-zod`
-   **Screenshot Generation Scripts**: `artifacts/ghayth-erp-deck/scripts/`
-   **Health Check Script**: `scripts/health-check.sh`
-   **Full Verification Report**: `GHAITH_FULL_SYSTEM_VERIFICATION_REPORT.md` (15 sections, regenerated 2026-05-06)
-   **Services Index**: `SERVICES_INDEX.md` (369 FE pages × 48 modules × 928 API endpoints, with Playwright e2e results)
-   **Latest API Smoke (2026-05-06)**: 56/56 endpoints PASS (100%) with admin auth — see `/tmp/api_final_results.txt`. Previous "failures" were path mismatches in the test script, not real bugs (recruitment/postings not /jobs; discipline/memos not /cases; fleet/fuel-logs not /fuel).
-   **Frontend Runtime Audit (2026-05-07, Task #185 — supersedes the matrix below)**: Real headless-Chromium walk of every frontend route via `scripts/src/runtime-audit.cjs` (run with `pnpm run audit:runtime`; runbook in `audit/RUNTIME_AUDIT_README.md`). **82 PASS (no FAIL on any axis) / 291 FAIL (≥1 axis FAIL) across 373 routes** on 5 axes — A1 render (207 PASS / 85 FAIL / 81 SKIP), A2 data fetch (157/66/150), A3 primary CTA (69/0/304), A4 navigation (1/291/81), A5 runtime smoke (200/85/88). A5 actually fills every `<input>/<textarea>/<select>` and clicks save and watches for a `POST/PATCH/PUT` to `/api/*` — 200 routes returned a 2xx-4xx (real PASS). **Headline finding**: 206 routes (class N1) bounce to `/dashboard` on direct URL navigation — the SPA's wouter router does not honor deep links. 85 routes (class L1) had their session cookie expire mid-run (harness limitation). Per-class per-route Arabic descriptions in `FRONTEND_BUGS.md` "Task #185" section; full table + screenshots in `FRONTEND_RUNTIME_AUDIT.md` and `audit/screenshots/`.
-   **⚠️ Retracted: Frontend Test Matrix (2026-05-07, "1510/1510 (100%)")**: The previous claim in `FRONTEND_TEST_MATRIX.md` was source-review-only — no browser ever loaded those routes. Replaced by the runtime audit above. The matrix file carries a retraction banner; do not quote the old number.
-   **Deep CRUD Round-Trip (2026-05-07, Task #144 — extends #139)**: 124/137 applicable PASS (90.5%), 13 FAIL, 115 SKIP across 21 high-traffic entities × **12 axes** (252 checks) covering HR, Finance, Properties, Fleet, Umrah. Axes added in #144: **uE/uD** = real edit/delete via the row's "تعديل" pencil and "حذف" trash buttons (click pencil → tweak input → click "حفظ التعديلات" → assert PATCH 2xx; click trash → wait for "تأكيد الحذف" → assert DELETE 2xx + row vanishes after 3 cache-busting refreshes). Generic DOM walker finds the row's actions on both `<table>` rows and Card grids (hr/shifts). uE/uD PASS on hr/shifts, fleet/vehicles, fleet/drivers; SKIP (no row affordance) on finance/vendors, properties/buildings; surfaced **2 new High-severity bugs (C11/C12)** — see `FRONTEND_BUGS.md`: (C11) `DELETE /api/finance/accounts/:id` soft-delete leaks (row stays visible after delete + 3 refreshes); (C12) `/properties/owners/:id/edit` route is unrouted (Pencil button → blank). Browser-crash recovery added to harness (`recreatePage`) so a single delete that triggers a full page reload can no longer poison the rest of the run. New `APPEND=1` env merges results from a prior partial run so the canonical 21-entity matrix can be assembled in two halves under bash's 120s ceiling. Harness: `scripts/src/deepCrudTest.cjs`. JSON: `audit/report/deep_crud_results.json`.
-   **Audit Artifacts**: `audit/report/{auth_coverage,boundary_writes,db_tables,db_audit_cols,db_rowcounts,code_tables_not_in_db,db_tables_not_in_code}` and `audit/api-smoke-results.json`, `audit/inventory.json`

## Architecture decisions

-   **Monorepo Structure**: pnpm workspaces are used to manage multiple interdependent applications and libraries within a single repository.
-   **Frontend Routing**: Modular route files using `React.lazy()` ensure efficient code-splitting and improved initial load performance.
-   **Create/Edit UI**: Operations use standalone full pages instead of popups/modals to provide a consistent and robust user experience, reserving dialogs for read-only previews or confirmations.
-   **GitHub Integration**: Custom GitHub API sync (`scripts/_push2.mjs`) is used for incremental, resumable pushes due to limitations with `git` commands in the environment.
-   **Multi-tenancy**: Implemented with a 3-level settings engine (system → company → branch) and multi-filter system.

## Product

Ghayth ERP centralizes operations across 28+ modules (HR, Finance, Fleet, Warehouse, Properties, Legal, Projects, CRM, Support, Governance, BI) for Al Door Group. It features a behavioral intelligence layer for analytics and personalized recommendations, granular RBAC, a generic approval chain engine, and comprehensive operational dashboards. It also includes an enterprise-grade multi-channel notification system and a full Document Management System.

## User preferences

-   **Frontend Layout**:
    -   **Sidebar**: White light theme, expandable sub-menus for all 20+ modules, RTL (right-side), filtered by selected role.
    -   **Breadcrumbs**: Built into `sidebar-layout.tsx`, auto-generated from nav structure.
    -   **Topbar**: Page title with icon, Role dropdown (الصفة), Notification bell, Branch dropdown (الفرع).
    -   **Routing**: Modular route files in `routes/` directory, all use `React.lazy()` for performance.
    -   **No popups/modals for create/edit**: Create/edit operations use standalone full pages (navigated via `<Link>`), not Sheet/Dialog popups. `QuickPreviewDialog` (read-only preview) and `AlertDialog` (delete confirmations) are the only allowed dialog patterns.
-   **RTL Arabic layout**: `dir="rtl"`, `lang="ar"`.
-   **Pagination**: All list pages use `?page=X&limit=20` query params, including HR tabs (attendance, leaves, payroll).
-   **Error/Empty States**: All tables should show Arabic error messages with retry buttons and descriptive empty states with icons.
-   **`lib/formatters.ts`**: `formatDateAr()` (Arabic date like "١٤ يناير ٢٠٢٦"), `formatNumber()` (Arabic-Indic numerals), `formatCurrency()` (ر.س symbol).
-   **404 Page**: Arabic design with CloudRain icon, Arabic numerals (٤٠٤), navigation buttons.

## Gotchas

-   **GitHub Sync**: `.github/workflows/*` files cannot be pushed via `scripts/_push2.mjs` and must be edited directly on GitHub. Local `git` commands are blocked.
-   **API Recurring Bugs**: Be aware of common API query discrepancies (e.g., `hireDate` vs `startDate`, `entityType` vs `relatedEntity`, missing `fullName` on `users` table).
-   **Migration Overwrites**: Upstream pulls often overwrite local fixes; re-apply known fixes related to column names, `SAVEPOINT` usage, `rawExecute` vs `pool.query`, and conditional DDL statements.
-   **DB Schema Inconsistencies**: Key tables like `employees`, `invoices`, `official_letters`, `company_settings`, `obligations`, `purchase_requests`, and `property_buildings` have specific column constraints or dynamic creation that must be respected.
-   **JSX Generics**: Avoid `<DataTable<any>>` due to Babel JSX parser limitations; use `(DataTable as any)` or remove generics.
-   **Stale Guards**: Remove any stale `if (req.path.includes("/pay")) return;` type guards as they can cause infinite hangs.
-   **Screenshot Refresh**: Always refresh screenshots via `pnpm --filter @workspace/ghayth-erp-deck run export-pdf-fresh` before any presentation or sharing a PDF with the GM.

## Pointers

-   **OpenAPI Specification**: `lib/api-spec`
-   **Drizzle ORM**: [https://orm.drizzle.team/](https://orm.drizzle.team/)
-   **Zod**: [https://zod.dev/](https://zod.dev/)
-   **Orval**: [https://orval.dev/](https://orval.dev/)
-   **TailwindCSS**: [https://tailwindcss.com/](https://tailwindcss.com/)
-   **shadcn/ui**: [https://ui.shadcn.com/](https://ui.shadcn.com/)
-   **React**: [https://react.dev/](https://react.dev/)
-   **Vite**: [https://vitejs.dev/](https://vitejs.dev/)