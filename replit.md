# Overview

Ghayth ERP (غيث ERP) is a comprehensive, full-stack Arabic enterprise resource planning system for Al Door Group. It centralizes operations, enhances efficiency, and supports strategic decision-making across over 28 business modules (including HR, Finance, Fleet, Warehouse, Properties, Legal, Projects, CRM, Support, Governance, and Business Intelligence). The system provides a unified, user-friendly platform tailored to diverse business requirements, integrating core functions into a single solution. A behavioral intelligence layer offers advanced analytics, personalized recommendations, and proactive alerts across the entire system. The project aims to provide a unified, user-friendly platform tailored to diverse business requirements, integrating core functions into a single solution for Al Door Group.

# User Preferences

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

# System Architecture

The project is structured as a pnpm workspace monorepo.

**Stack:**

-   **Monorepo tool**: pnpm workspaces
-   **Node.js**: 24
-   **TypeScript**: 5.9
-   **API framework**: Express 5
-   **Database**: PostgreSQL (raw queries via `pg` pool, Drizzle ORM)
-   **Authentication**: JWT with refresh tokens
-   **Validation**: Zod
-   **API codegen**: Orval (from OpenAPI spec)
-   **Frontend**: React, Vite, TailwindCSS, shadcn/ui

**Architectural Artifacts:**

-   `artifacts/api-server`: Express 5 REST API (port 8080).
-   `artifacts/ghayth-erp`: React+Vite frontend (port 18822).
-   `artifacts/client-portal`: Client self-service portal (port 25516).
-   `artifacts/careers-portal`: Careers/recruitment portal (port 23179).

**GitHub Sync:** Repository `barhom64/ghayth-erp` (private). Connected via GitHub integration. Changes pushed via GitHub API using `scripts/_push2.mjs` (PUT /contents path-by-path) — incremental, resumable via `/tmp/_push2_state.json`. Note: GitHub App token lacks `workflows: write`, so `.github/workflows/*` files cannot be pushed and must be edited directly on GitHub. Local destructive `git` commands (commit/push/remote ops) are blocked in this environment — all syncs go through the GitHub REST API. Stale `subrepl-*` remote entries in `.git/config` are harmless leftovers from sub-agent clones and can be ignored.

**Upstream batch reconciliation pattern:** When the user pushes a large upstream batch on GitHub and asks to pull it locally:
1. Fetch the diff via the GitHub connector (`scripts/github-pull.mjs`).
2. Copy any new `migrations/NNN_*.sql` into `artifacts/api-server/src/migrations/` using sequential numbers (renumber as needed).
3. Re-apply local fixes that get overwritten by the pull (the recurring ones are listed below in **Local Fixes Re-applied After Each Pull**).
4. Restart `api-server` and verify migrations applied; patch any failed migration with `DO $$ IF EXISTS ... $$` guards (most common: column doesn't exist yet on the target schema).
5. Hit a sweep of endpoints with the admin token to confirm 200/304/404, never 500.
6. Push back to GitHub via `scripts/_push2.mjs`.

**Local Fixes Re-applied After Each Pull (recurring):**
- `routes/permissions.ts`, `routes/correspondence.ts` (list+get), `routes/finance-custodies.ts` (approval actions): replace `users.name` selects with `COALESCE(employees.name, users.email) AS "<alias>"` plus `LEFT JOIN employees e ON e.id = u."employeeId"` — the `users` table has no `name` column.
- `lib/umrahImportEngine.ts`: keep SAVEPOINT/dedupe wrapping in the mutamers and vouchers loops so a single bad row doesn't abort the whole batch.
- `routes/umrah-entities.ts`: drop `deletedAt` and `uploadedAt` from `/import/batches` and `/:id/changes` (those columns don't exist on `umrah_import_batches`); keep `ORDER BY "createdAt" DESC`.
- `lib/obligationsEngine.ts`: `ensureObligationsTable()` must use `pool.query` (not `rawExecute`) — `rawExecute` auto-appends `RETURNING id` which breaks DDL.
- `migrations/106_performance_indexes.sql`: wrap the `payroll_lines` index in a `DO $$ IF EXISTS column 'payrollRunId' THEN ... ELSIF column 'runId' THEN ... END $$` block (the upstream uses `payrollRunId` but our schema has `runId`); also drop `CONCURRENTLY` and wrap the `employees.department` index in a column-exists guard.
- `migrations/105_missing_tables.sql`: add `ALTER TABLE fx_rates ADD COLUMN IF NOT EXISTS "effectiveDate"`, plus `source`, plus a `UPDATE` to backfill from `rateDate`.
- `migrations/107_missing_tables_phase2.sql`: add `ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS "deletedAt"` and same for `company_documents` BEFORE the indexes that reference `deletedAt`.

**Shared Libraries:**

-   `lib/api-spec`: OpenAPI specification and Orval codegen.
-   `lib/api-client-react`: Generated React Query hooks.
-   `lib/api-zod`: Generated Zod schemas.
-   `lib/db`: Drizzle ORM schema and PostgreSQL pool.

**Core Infrastructure & Features:**

-   **Behavioral Intelligence Layer**: User activity logging, RFM scoring, churn prediction, personalized recommendations, KPIs, and smart alerts.
-   **Modular Design**: Standalone admin pages, manager board, finance cash flow dashboard, and enhanced "My Space" for personalized user experiences.
-   **Unified Backend Systems**: Centralized error handling, approval enforcement, event system, and scoped query helpers for data isolation.
-   **Multi-tenant Architecture**: Company bootstrap, multi-filter system, and 3-level settings engine (system → company → branch).
-   **Role-Based Access Control (RBAC)**: Backend-driven multi-role system with granular permissions and tenant isolation.
-   **Comprehensive Module Support**: Enhanced HR module (KPI dashboard, forms, state engine, discipline regulation with inquiry memos), finance (collection, budget, accounting, vendors, ZATCA e-invoicing, financial algorithms, three-way match PO→GRN→Invoice, recurring journals, opening balances), property (lifecycle, Ejar compliance, lease lifecycle), fleet, legal, projects, support, CRM, and Umrah management.
-   **Workflow & Automation**: Generic approval chain engine, automated workflows for various modules, unified workflow and business rules engines, and proactive automation with daily self-audits.
-   **Operational Dashboards**: Command Center, My Space Portal, Action Center, Operations Center, and BI Dashboards for comprehensive oversight and analytics.
-   **Data Integrity & Security**: Atomic payroll transactions, soft delete for financial records, JWT_SECRET enforcement, CORS origin whitelist, rate limiting, and strict business validation guards.
-   **Audit & Reporting**: Evidence-grade audit system with before/after state capture, financial reports system (trial balance, income statement, balance sheet), and impact preview for actions.
-   **TypedError Hierarchy**: All HR routes use `ValidationError(422)`, `ConflictError(409)`, `NotFoundError(404)`, `ForbiddenError(403)` with structured `{code, field, fix, meta}` responses. The old `hr-attendance.ts` router has been removed — all attendance logic is consolidated in `hr.ts`.
-   **Event Dedup**: `emitEvent` in `businessHelpers.ts` writes to `event_logs` once per call (dedup fix commit `3fc9f69`).
-   **User Experience Enhancements**: Global command palette, reusable printing/letterhead system, advanced filters, entity timelines, document management, copy/duplicate, permission guards, autocomplete, auto-draft, keyboard shortcuts, policy banners, delete confirm with impact, unsaved changes warning, quick preview, file attachments, and data-level scoping.
-   **Integration Infrastructure**: Government integration infrastructure (Muqeem, TAM, Absher Business) and a robust cron scheduler for alerts, escalations, reporting, and automation.
-   **Notification Engine**: Enterprise-grade multi-channel notification system with DB-driven routing rules, per-user preferences, editable templates, fallback/escalation chains, outbound webhooks, and unified delivery tracking.
-   **Document Management System (DMS)**: Full DMS with object storage, workflow, and multi-versioning.

# External Dependencies

-   **Database**: PostgreSQL
-   **Authentication**: `bcryptjs`, `jsonwebtoken`
-   **Validation**: `zod`, `drizzle-zod`
-   **API Codegen**: Orval
-   **Frontend Frameworks**: React, Vite
-   **UI Library**: TailwindCSS, shadcn/ui
-   **Maps**: Leaflet, react-leaflet
-   **Object Storage**: Replit Object Storage (GCS-backed) via `@google-cloud/storage`

# Error Prevention System

**Health Check Script:** `bash scripts/health-check.sh`

Run before every deployment or after merging branches. Checks:
1. **Broken imports** — all imports from `api.ts` are actually exported
2. **Missing routes** — page files exist but not registered in route files
3. **Dangling routes** — route files reference non-existent page files
4. **DB column mismatches** — code references columns/tables that don't exist
5. **API endpoints** — all endpoints respond (401 = auth required = OK)
6. **Service health** — all 4 services are running

**Common Bugs & Prevention Rules:**

| Bug Pattern | Root Cause | Prevention |
|------------|-----------|------------|
| Import not found | Branch adds function but doesn't export it in shared file | Always add `export` in `api.ts` when creating new utility functions |
| Route 404 | Page file created but not registered in `*Routes.tsx` | Every new `.tsx` page MUST have a matching route entry |
| DB column error | Code queries column that doesn't exist | Check `information_schema.columns` before using new column names |
| CRON crash | CRON job assumes table/column exists | Wrap CRON queries in try-catch; use `ensureXxxTable()` pattern |

**Critical Schema Facts (do NOT violate):**
- `employees` has NO `companyId`, NO `deletedAt` — company link is via `employee_assignments`
- `invoices` has NO `updatedAt` — use `skipUpdatedAt: true` in lifecycleEngine
- `official_letters` has NO `branchId` — never query it
- `company_settings` does NOT exist — wrap in try-catch with empty fallback
- `obligations` created dynamically via `ensureObligationsTable()` — not in base schema
- `purchase_requests` uses `expectedDelivery` (not `expectedDate`); items use `name` (not `itemName`), `totalPrice` (not `lineTotal`)
- `property_buildings` has NO `branchId`, `floors`, `description`

**Deck Screenshots (ghayth-erp-deck):**

The deck (`artifacts/ghayth-erp-deck`) embeds platform screenshots from `public/screenshots/*.png`. Scripts in `artifacts/ghayth-erp-deck/scripts/`:

- `pnpm --filter @workspace/ghayth-erp-deck run refresh-shots` — re-capture all module screenshots from the live ERP (requires `REPLIT_DEV_DOMAIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`).
- `pnpm --filter @workspace/ghayth-erp-deck run export-pdf` — build deck and export PDF using existing screenshots.
- `pnpm --filter @workspace/ghayth-erp-deck run export-pdf-fresh` — refresh screenshots first, then export PDF. **Use this before any presentation or share with the GM** to guarantee shots match the current UI.
- `pnpm --filter @workspace/ghayth-erp-deck run check-shots-age` — warn if any screenshot is older than 14 days (override with `SHOTS_MAX_AGE_DAYS=N`; set `FAIL_ON_STALE=1` to exit non-zero).

When to refresh screenshots: after any visible change to dashboard, HR, finance, operations, fleet, properties, legal, projects, support, or CRM modules; and always before exporting a deliverable PDF for the GM.

**JSX Rule:** NEVER use `<DataTable<any>` — Babel JSX parser fails on generic type params. Use `(DataTable as any)` or remove generic.