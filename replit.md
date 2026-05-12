# Ghayth ERP

A comprehensive, full-stack Arabic enterprise resource planning system centralizing operations and enhancing efficiency for Al Door Group.

## Run & Operate

-   **Install dependencies**: `pnpm install`
-   **Build**: `pnpm build`
-   **Typecheck**: `pnpm typecheck`
-   **API Codegen**: `pnpm --filter @ghayth-erp/api-spec run generate` (from OpenAPI spec)
-   **Ghost-row check**: `pnpm run check:ghost-rows` — connects to `$DATABASE_URL`, lists every table that has a `deletedAt` column, then walks `artifacts/api-server/src/routes/**` and flags any `rawQuery` SELECT statement that reads from one of those tables without a `"deletedAt" IS NULL` predicate (the bug class Task #161 fixed). Statements containing `${…}` interpolation are skipped because helpers like `buildScopedWhere(…, { softDeleteColumn })` may inject the predicate. **Also scans Drizzle typed-builder calls** of the form `db.select().from(<tableVar>).leftJoin(...).where(...)` and asserts the chained predicates (or the join's ON arg) include `isNull(<tableVar>.deletedAt)` or `eq(<tableVar>.deletedAt, null)` — the equivalent guard for the typed builder, mirroring what `check:schema-drift` already does for `.insert().values()` / `.update().set()` (Task #168). Both guards share `scripts/src/lib/drizzle-schema.mjs::loadDrizzleSchema()` to resolve `tableVar → SQL table name`. Intentional exceptions (audit reports, restore-from-trash flows) live in `scripts/ghost-row-allowlist.txt` as `routes/<file>.ts[:tableName]` lines and apply to both raw SQL and Drizzle findings. Wired in as step 6 of `pnpm run guard` (and the `guard` GitHub Action) gated on `$DATABASE_URL`.
-   **Schema-drift check**: `pnpm run check:schema-drift` — connects to `$DATABASE_URL` and asserts that every quoted/INSERT/UPDATE identifier in `artifacts/api-server/src/routes/**` exists in `information_schema`. Catches the class of bug where a route references a column the live DB does not have (e.g. `suppliers.category`, `invoices.costCenter`, `umrah_packages.updatedAt`, `employees.attachments`, `financial_posting_failures` table) before it surfaces as a runtime 500. Identifiers declared by `CREATE TABLE IF NOT EXISTS` inside a `rawQuery()` are treated as locally defined so route-managed auxiliary tables don't false-positive. **Fires automatically** as step 5 of `pnpm run guard` (and the `guard` GitHub Action on every push/PR), gated on `$DATABASE_URL` being set; a failed check blocks the merge with the same readable diff users see locally.
-   **Runtime-audit guard (CI)**: `pnpm run audit:runtime:guard` (script: `scripts/src/audit-runtime-guard.mjs`) reads the JSON at `${AUDIT_JSON:-${OUT_DIR:-/tmp/runtime-audit}/all.json}` — i.e. by default the freshly-written `/tmp/runtime-audit/all.json` produced by `pnpm run audit:runtime` (the producer writes `${OUT_DIR}/all.json` when `ALL=1`) — and exits non-zero if any route reports a hard FAIL on the **gating axes A1 (render), A2 (data fetch), or A4 (navigation)**. A3 (primary CTA) and A5 (runtime smoke) are warn-only until the smarter form-field probe (Task #186) lands. Wired into `.github/workflows/audit-runtime.yml` (Task #188), a separate workflow from `guard.yml` because it needs a live DB + api-server + ghayth-erp running and the full 373-route walk takes 30–40 min (vs guard.yml's pure-static 5-min budget). The workflow boots Postgres as a service, builds + starts api-server, builds + previews the ghayth-erp frontend, runs them behind a tiny Node http-proxy on `:80` to mimic the Replit shared proxy, runs the audit with `OUT_DIR=/tmp/runtime-audit`, asserts the JSON exists and is fresher than 120 min (no stale-file gating), then runs the guard against that exact file. **Both `/tmp/runtime-audit/all.json` and `audit/screenshots/` are uploaded as build artifacts on every run (success or failure)** so a red build is inspectable without re-running locally. The repo-committed `audit/runtime-audit-results.json` is a reference snapshot only and is never read by CI. Reminder: `.github/workflows/*` cannot be pushed via `scripts/_push2.mjs` — the file is committed in this repo for review but must be applied to GitHub directly (see "Gotchas").
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
-   **Frontend Runtime Audit (2026-05-07, Task #187 — supersedes #185 v2)**: Real headless-Chromium walk of every frontend route via `scripts/src/runtime-audit.cjs` with **periodic re-login every 25 routes**, then aggregated by `scripts/src/aggregate-runtime-audit.cjs` (reads `/tmp/runtime-audit/all.json`, writes `audit/runtime-audit-results.json` + `FRONTEND_RUNTIME_AUDIT.md`). Run via `pnpm run audit:runtime` — the long-running browser walk should be registered as a Replit workflow (the runbook in `audit/RUNTIME_AUDIT_README.md` shows the `configureWorkflow` invocation) because plain bash sessions get SIGKILL'd before the ~50-minute walk completes. **Per-route disposition: 1 PASS (`/dashboard` only) / 363 FAIL / 9 SKIP across 373 routes.** Per-axis (PASS/FAIL/SKIP): A1 render 364/0/9, A2 data fetch 293/0/80, A3 primary CTA 71/0/302, A4 navigation 1/363/9, A5 runtime smoke 291/0/82. With re-login in place every axis except A4 returns 0 FAIL — the **single failure mode in this run is A4**: 363/373 routes (97%) bounce to `/dashboard` on direct `page.goto` because the SPA's wouter router does not honor deep links. (Task #185 reported 291 A4 FAILs because 72 `:id` routes were skipped before they could be tested; #187's resolver fix surfaces them.) **Task #187 SKIP-reduction headline**: rewrote `ID_RESOLVERS` so each entry can declare a `fallbackId`, `idField`, and corrected list endpoint — 91/91 param routes now resolve to a real URL (verified separately with the resolver-only check). Unresolved-id SKIPs dropped from 81 → 9 (target was <10) ✅; the residual 9 are mid-run 401s on a handful of list endpoints that recover under the standalone resolver. Full table + per-FAIL screenshots in `FRONTEND_RUNTIME_AUDIT.md` and `audit/screenshots/`.
-   **Create/Edit Re-Audit Reliability (2026-05-07, Task #191 — extends #186)**: Fixed the audit harness so the 56 "stuck" create pages from Task #186 now load. The stalls were never per-page bugs — they were a Puppeteer detached-frame cascade triggered by `/correspondence/create` plus an unrecoverable Vite/Chromium request-queue wedge after a single `page.goto` timeout. `scripts/src/runtime-audit.cjs` now: (a) calls a `recreatePage(reason)` helper that closes the puppeteer page and opens a fresh one with re-login, (b) detects fatal page errors via `isFatalPageError()` (detached Frame / Target closed / Session closed / Protocol error / browser disconnect) and recycles automatically, (c) wraps every probe in `probeWithRetry()` that on a `Navigation timeout` recreates the page and re-runs once (the fresh context plus Vite's warmed transform cache always clears the second attempt). Re-running `CREATE_ONLY=1 node scripts/src/runtime-audit.cjs`: **A1 = 68 PASS / 0 FAIL / 2 SKIP** (2 SKIPs are unrelated 401 on `/api/properties/owners` for `:id/edit` resolution). All 56 originally-failing routes now load. Result JSON: `audit/runtime-audit-create-edit.json`. Bug class N3 in `FRONTEND_BUGS.md` marked Fixed in #191.
-   **Create/Edit Re-Audit (2026-05-07, Task #186 — extends #185)**: Re-walked the 70 `/create`/`/edit` routes with a smarter A5 probe that counts Radix custom widgets (`[role=combobox]`, `[role=textbox]`, `button[aria-haspopup]`, contenteditable) on top of native fields, focuses each candidate to trigger lazy hydration, sequentially clicks combobox triggers and picks the first option (Phase 2), and excludes the heartbeat noise pattern `intelligence/activity|notifications/seen|telemetry|audit/log|behavioral` from write detection. Adds **SPA-fallback** (`history.pushState + popstate`) so A5 still probes when direct `page.goto` bounces. Run with `CREATE_ONLY=1 node scripts/src/runtime-audit.cjs`; new env knob `ROUTES_INCLUDE=r1,r2,...` runs an arbitrary subset; goto timeout raised 25s → 60s. **Headline:** 11 routes deliver an honest A5 PASS (real `POST/PATCH/PUT` to entity endpoints, e.g. `POST /api/clients → 422`, `POST /api/correspondence → 201`, `PATCH /api/finance/accounts/2 → 2xx`); 3 routes A5 FAIL (`/employees/create`, `/finance/expenses/create`, `/finance/invoices/create` — fill+click produces no write within 6s, filed as N2.1–N2.3); 56 routes A1 FAIL on 60s `goto` timeout (`/finance/journal*`, `/fleet/*`, `/hr/*`, `/governance/*`, `/properties/*`, …; filed as bug class N3 — chronic per-route page-load stall under audit load). A4 still 68/70 FAIL — same SPA deep-link bug as #185, out of scope here. Read-only `/finance/intercompany/consolidation/create` was renamed to `/finance/intercompany/consolidation` (it is a report viewer with no save action). Result JSON: `audit/runtime-audit-create-edit.json`. Per-route table + totals: `FRONTEND_RUNTIME_AUDIT.md` "Task #186" section. Bug rows: `FRONTEND_BUGS.md` "Task #186" section.
-   **⚠️ Retracted: Frontend Test Matrix (2026-05-07, "1510/1510 (100%)")**: The previous claim in `FRONTEND_TEST_MATRIX.md` was source-review-only — no browser ever loaded those routes. Replaced by the runtime audit above. The matrix file carries a retraction banner; do not quote the old number.
-   **Deep CRUD Round-Trip (2026-05-07, Task #144 — extends #139)**: 124/137 applicable PASS (90.5%), 13 FAIL, 115 SKIP across 21 high-traffic entities × **12 axes** (252 checks) covering HR, Finance, Properties, Fleet, Umrah. Axes added in #144: **uE/uD** = real edit/delete via the row's "تعديل" pencil and "حذف" trash buttons (click pencil → tweak input → click "حفظ التعديلات" → assert PATCH 2xx; click trash → wait for "تأكيد الحذف" → assert DELETE 2xx + row vanishes after 3 cache-busting refreshes). Generic DOM walker finds the row's actions on both `<table>` rows and Card grids (hr/shifts). uE/uD PASS on hr/shifts, fleet/vehicles, fleet/drivers; SKIP (no row affordance) on finance/vendors, properties/buildings; surfaced **2 new High-severity bugs (C11/C12)** — see `FRONTEND_BUGS.md`: (C11) `DELETE /api/finance/accounts/:id` soft-delete leaks (row stays visible after delete + 3 refreshes); (C12) `/properties/owners/:id/edit` route is unrouted (Pencil button → blank). Browser-crash recovery added to harness (`recreatePage`) so a single delete that triggers a full page reload can no longer poison the rest of the run. New `APPEND=1` env merges results from a prior partial run so the canonical 21-entity matrix can be assembled in two halves under bash's 120s ceiling. Harness: `scripts/src/deepCrudTest.cjs`. JSON: `audit/report/deep_crud_results.json`.
-   **Audit Artifacts**: `audit/report/{auth_coverage,boundary_writes,db_tables,db_audit_cols,db_rowcounts,code_tables_not_in_db,db_tables_not_in_code}` and `audit/api-smoke-results.json`, `audit/inventory.json`
-   **Tenant + Umrah integration suite (CI, Task #203)**: Four test files run inside the `guard` GitHub Action against the disposable Postgres provisioned at `127.0.0.1:54329` (see `guard.yml`'s "Load schema into test Postgres" step). The `pnpm -s --filter @workspace/api-server run test` step in `scripts/guard.sh` auto-discovers them via vitest's `tests/**/*.test.ts` glob — no separate workflow is needed:
    1.  `tests/integration/tenantIsolation.dynamic.test.ts` — dynamic two-company harness (boots Express against the real DB, asserts cross-tenant reads/writes are refused). Now also covers the umrah list endpoints (`/api/umrah/attachments`, `/api/umrah/reports/daily-runsheet`, `/api/umrah/reports/reconciliation`) and the four umrah POST contracts (`groups/:id/split`, `groups/merge`, `penalties/waive-bulk`, `attachments`). Auto-skips with a clear "skipped" line when `DATABASE_URL` is absent or the URL doesn't match `_test`/`localhost:54329`/`127.0.0.1:54329` (see `_fixtures/twoCompanies.ts::assertTestDatabase`).
    2.  `tests/unit/umrahReportsSmoke.test.ts` — locks the attachments CRUD, reconciliation report, daily run-sheet (JSON + PDF), and sub-agent statement PDF endpoints from PRs #305/#312 against the CONTRIBUTING.md merge gate (companyId scoping, soft-delete `IS NULL`, `authorize({ feature, action })`, transactional + audit + event emission). Pure source-scan, no DB.
    3.  `tests/unit/umrahRoutesSmoke.test.ts` — same style for group split/merge (#312) and bulk penalty-waive (#318): zod schemas, ConflictError on invoiced sources, `salesInvoiceId` guard, idempotency, audit + event. Pure source-scan, no DB.
    4.  `tests/unit/umrahEnginesSmoke.test.ts` — engine-layer smoke for nusk AP idempotency, GL posting helpers, and umrah commission engine. Pure source-scan, no DB.

    **To extend the suite**: drop a `tests/integration/<name>.test.ts` (needs DB) or `tests/unit/<name>.test.ts` (no DB) under `artifacts/api-server`. Vitest picks it up automatically, and guard CI runs it against the seeded fixture. If your test needs new tenant-scoped seed data, extend `tests/integration/_fixtures/twoCompanies.ts::setupTwoCompanyFixture` (and the `assertTestDatabase` markers if you need a different port). For DB-requiring tests, gate the `describe()` block with the same `dbReady` guard the dynamic harness uses so dev-box runs without Postgres skip cleanly instead of failing.

## Architecture decisions

-   **Monorepo Structure**: pnpm workspaces are used to manage multiple interdependent applications and libraries within a single repository.
-   **Frontend Routing**: Modular route files using `React.lazy()` ensure efficient code-splitting and improved initial load performance.
-   **Create/Edit UI**: Operations use standalone full pages instead of popups/modals to provide a consistent and robust user experience, reserving dialogs for read-only previews or confirmations.
-   **GitHub Integration**: Custom GitHub API sync is used due to limitations with `git` commands in the environment. Pre-Branch-Protection era used `scripts/_push2.mjs` (direct push to `main`); from 2026-05-12 onward, use `scripts/_pr_push.mjs` (PR flow: branch + push + open PR + wait for `guard` CI + squash-merge + delete branch). See "Pushing after Branch Protection" in Gotchas below.
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

-   **GitHub Sync**: `.github/workflows/*` files cannot be pushed via `scripts/_push2.mjs` (or `_pr_push.mjs`) and must be edited directly on GitHub. Local `git` commands are blocked.
-   **Pushing after Branch Protection (2026-05-12+)**: The `main-protection` ruleset (id 16281889, active) on `barhom64/ghayth-erp` requires every change to land via PR with a green `guard` CI check, blocks force-push, blocks deletion, requires linear history, and `current_user_can_bypass: never` (no admin bypass). **`scripts/_push2.mjs` will be rejected by GitHub** against this ruleset (typically a non-2xx on the `PUT /contents` call — exact code/message depends on which rule fires first). Use `scripts/_pr_push.mjs` instead:
    ```bash
    node -e 'require("fs").writeFileSync("/tmp/_pr_push_state.json", JSON.stringify({
      title: "fix: short description",
      body: "Longer explanation",
      files: ["path/to/changed1.ts", "path/to/changed2.md"]
    }))'
    node scripts/_pr_push.mjs
    ```
    The script is **idempotent and resumable** — state is persisted to `/tmp/_pr_push_state.json` after every phase transition (`init → main-resolved → branch-created → files-uploaded → pr-opened → guard-passed → merged → done`), so a SIGKILL'd run can be re-started and a `done` state short-circuits to a no-op. Reuses both open AND closed PRs on the same head branch (re-opens a closed-but-unmerged PR rather than 422-ing on duplicate-head). Polls `guard` every 30s for up to 25 minutes against BOTH the check-runs API (Actions) and the legacy commit-statuses API; aborts the merge if `guard` fails or never reports. Merge call sends the head SHA as an optimistic lock so a concurrent push surfaces as 409 instead of merging the wrong commit. Squash-merges to satisfy the linear-history rule.
-   **GitHub OAuth dependency**: All push/pull scripts use the Replit GitHub Connector (`@replit/connectors-sdk`). If `listConnections('github')` returns 0, the connector needs to be re-installed/re-authorized: install the Replit GitHub App at `github.com/apps/replit` (select `barhom64/ghayth-erp`), then connect the integration in Replit Workspace → Tools → Integrations → GitHub. Symptoms of a broken connection: Auto-Pull workflow logs show `403 Forbidden` on `/repos/barhom64/ghayth-erp/commits/main`.
-   **API path canonicals (verified by smoke 2026-05-12, 60/60 PASS)** — the following paths are the *only* ones that exist on the live server. Common wrong guesses (left) → correct path (right):
    -   `/api/hr/employees` ❌ → `/api/hr/employees-status` ✅ (list endpoint)
    -   `/api/hr/leaves` ❌ → `/api/hr/leave-requests` ✅
    -   `/api/hr/training` ❌ → `/api/hr/training/programs` ✅
    -   `/api/hr/recruitment` ❌ → `/api/hr/recruitment/postings` (jobs) + `/api/hr/recruitment/applications` (applicants) ✅
    -   `/api/fleet/fuel` ❌ → `/api/fleet/fuel-logs` ✅
    -   `/api/properties` ❌ → `/api/properties/units` ✅
    -   `/api/support` ❌ → `/api/support/tickets` ✅
    -   `/api/marketing` ❌ → `/api/marketing/campaigns` ✅
    Rule of thumb: when in doubt, `grep -E "router\.(get\|post)\(['\"]/" artifacts/api-server/src/routes/<module>.ts` to see the actual mounted paths.
-   **Auth uses HttpOnly cookies, not Bearer tokens.** `POST /api/auth/login` returns `Set-Cookie: erp_access=<jwt>; Path=/api; HttpOnly` (and `erp_refresh` on `/api/auth`). For curl/scripts use `-c jar.txt` on login then `-b jar.txt` on subsequent requests. The login JSON response body contains `assignments` + `userRoles` only — no `accessToken` field.
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