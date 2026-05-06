# Ghayth ERP

A comprehensive, full-stack Arabic enterprise resource planning system centralizing operations and enhancing efficiency for Al Door Group.

## Run & Operate

-   **Install dependencies**: `pnpm install`
-   **Build**: `pnpm build`
-   **Typecheck**: `pnpm typecheck`
-   **API Codegen**: `pnpm --filter @ghayth-erp/api-spec run generate` (from OpenAPI spec)
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