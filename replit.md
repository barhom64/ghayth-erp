# Ghayth ERP

A comprehensive, full-stack Arabic enterprise resource planning system centralizing operations and enhancing efficiency for Al Door Group.

## Run & Operate

-   **Install / Build / Typecheck**: `pnpm install` · `pnpm build` · `pnpm typecheck`
-   **API Codegen**: `pnpm --filter @ghayth-erp/api-spec run generate` (from OpenAPI spec)
-   **Guard suite (`pnpm run guard`)**: 6-step pre-merge gate run by `.github/workflows/guard.yml` on every PR. Blocks merge on failure. Steps:
    1. typecheck (libs + leaves)
    2. build verification
    3. lint
    4. unit + integration tests (vitest auto-discovers `tests/**/*.test.ts` in api-server; guard provisions a disposable Postgres at `127.0.0.1:54329` so DB-requiring tests run; integration tests gate on `dbReady` so dev runs without DB skip cleanly)
    5. **schema-drift**: `pnpm run check:schema-drift` — asserts every quoted/INSERT/UPDATE identifier in `artifacts/api-server/src/routes/**` exists in `information_schema`. Catches `route → missing column` 500s before merge.
    6. **ghost-rows**: `pnpm run check:ghost-rows` — flags any rawQuery SELECT or Drizzle `.from(...).where(...)` reading from a soft-deletable table without a `deletedAt IS NULL` predicate. Allowlist: `scripts/ghost-row-allowlist.txt`.
-   **Runtime audit (separate CI workflow `audit-runtime.yml`)**: `pnpm run audit:runtime` — boots the full stack and walks every frontend route in headless Chromium across 5 axes (render / data fetch / primary CTA / navigation / runtime smoke). 30-40 min run, uploads `audit/screenshots/` and `/tmp/runtime-audit/all.json` as build artifacts. Locally, register as a Replit workflow — bash sessions get SIGKILL'd before it finishes. See `audit/RUNTIME_AUDIT_README.md`.
-   **DB Migrations**: applied automatically by `api-server` on startup. Files in `artifacts/api-server/src/migrations/`. Migration runner detects `CREATE INDEX CONCURRENTLY` and runs that file un-wrapped.
-   **Required env vars**: `REPLIT_DEV_DOMAIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (for screenshot generation), `DATABASE_URL`.
-   **C27 overstay smoke**: `artifacts/api-server/scripts/smoke-umrah-c27-overstay.mjs` (and matching `tests/integration/umrahC27Overstay.dynamic.test.ts` auto-run by guard step 4) seeds an overstayed pilgrim still inside KSA, invokes the bundled `umrah_daily_overstay_scan` cron handler via `triggerJobByName`, and asserts: 1 `umrah_violations` row of type=`overstay` scoped to the test company, a manager notification of type=`umrah` enqueued, and idempotency on a second run. Cleans up its seeded rows on pass and fail.

## Stack

-   **Monorepo**: pnpm workspaces · **Node.js**: 24 · **TypeScript**: 5.9
-   **API**: Express 5 + raw `pg` pool + Drizzle ORM · **DB**: PostgreSQL
-   **Auth**: JWT with refresh tokens (HttpOnly cookies)
-   **Validation**: Zod · **API Codegen**: Orval (from OpenAPI spec)
-   **Frontend**: React + Vite + TailwindCSS + shadcn/ui

## Where things live

-   **API Server**: `artifacts/api-server` · **DB Schema**: `lib/db/schema.ts` · **OpenAPI Spec**: `lib/api-spec`
-   **Main Frontend**: `artifacts/ghayth-erp` · **Client Portal**: `artifacts/client-portal` · **Careers Portal**: `artifacts/careers-portal`
-   **Shared API Client (React Hooks)**: `lib/api-client-react` · **Shared Zod Schemas**: `lib/api-zod`
-   **Frontend Routes**: `artifacts/ghayth-erp/src/routes/` (modular, `React.lazy()`)
-   **Screenshot Generation Scripts**: `artifacts/ghayth-erp-deck/scripts/`
-   **Health Check**: `scripts/health-check.sh`
-   **Verification Reports**: `GHAITH_FULL_SYSTEM_VERIFICATION_REPORT.md` (15 sections, regenerated 2026-05-06) · `SERVICES_INDEX.md` (369 FE pages × 48 modules × 928 endpoints)
-   **Audit reports**: `FRONTEND_RUNTIME_AUDIT.md`, `FRONTEND_BUGS.md`, `audit/runtime-audit-results.json`, `audit/report/*` (auth_coverage, boundary_writes, db_tables, etc.), `audit/api-smoke-results.json`, `audit/inventory.json`. The repo-committed JSONs are reference snapshots only — CI never reads them.

## Architecture decisions

-   **Monorepo**: pnpm workspaces for multiple interdependent apps and libs.
-   **Frontend Routing**: Modular route files using `React.lazy()` for code-splitting.
-   **Create/Edit UI**: Standalone full pages (navigated via `<Link>`), never popups/modals. `QuickPreviewDialog` (read-only) and `AlertDialog` (delete confirm) are the only allowed dialog patterns.
-   **GitHub Integration**: Custom GitHub API sync (`@replit/connectors-sdk`) — local `git` commands are blocked. Branch Protection era (2026-05-12+): all changes land via PR with green `guard` CI. See "Pushing after Branch Protection" in Gotchas.
-   **Multi-tenancy**: 3-level settings engine (system → company → branch) + multi-filter system.
-   **Forms**: Migrating to `FormShell + Zod` pattern (replaces useState + manual toasts) — provides inline Arabic validation, double-submit guards, unified delete dialogs, auto-reset on save.

## Product

Ghayth ERP centralizes operations across 28+ modules (HR, Finance, Fleet, Warehouse, Properties, Legal, Projects, CRM, Support, Governance, BI) for Al Door Group. Features: behavioral intelligence layer, granular RBAC, generic approval-chain engine, operational dashboards, multi-channel notification system, full Document Management.

## User preferences

-   **Frontend Layout**:
    -   **Sidebar**: White light theme, expandable sub-menus for all 20+ modules, RTL (right-side), filtered by selected role.
    -   **Breadcrumbs**: Built into `sidebar-layout.tsx`, auto-generated from nav structure.
    -   **Topbar**: Page title with icon, Role dropdown (الصفة), Notification bell, Branch dropdown (الفرع).
    -   **Routing**: Modular route files in `routes/` directory, all use `React.lazy()` for performance.
    -   **No popups/modals for create/edit**: Standalone full pages only. `QuickPreviewDialog` (read-only) and `AlertDialog` (delete confirm) are the only allowed dialogs.
-   **RTL Arabic layout**: `dir="rtl"`, `lang="ar"`.
-   **Pagination**: All list pages use `?page=X&limit=20` (incl. HR tabs).
-   **Error/Empty States**: Arabic error messages with retry buttons; descriptive empty states with icons.
-   **`lib/formatters.ts`**: `formatDateAr()` (e.g. "١٤ يناير ٢٠٢٦"), `formatNumber()` (Arabic-Indic numerals), `formatCurrency()` (ر.س symbol).
-   **404 Page**: Arabic design with CloudRain icon, Arabic numerals (٤٠٤), navigation buttons.

## Gotchas

-   **Local `git` is blocked.** All push/pull goes through `@replit/connectors-sdk` against the GitHub API.
-   **`.github/workflows/*` cannot be pushed via the scripts** — must be edited directly on GitHub.
-   **GitHub OAuth**: If `listConnections('github')` returns 0, the connector is broken (also: Auto-Pull workflow shows `403 Forbidden`). Re-install the Replit GitHub App at `github.com/apps/replit` (select `barhom64/ghayth-erp`), then re-connect in Replit Workspace → Tools → Integrations → GitHub. NOTE: `listConnections('github')` may return 0 even when the connector works — `sdk.proxy('github', ...)` is the source of truth.
-   **Pushing after Branch Protection (2026-05-12+)**: The `main-protection` ruleset (id 16281889) requires PR + green `guard` + linear history; force-push and deletion blocked; no admin bypass. **Use `scripts/_pr_push.mjs` (NOT `_push2.mjs` — that one is rejected by the ruleset)**:
    ```bash
    node -e 'require("fs").writeFileSync("/tmp/_pr_push_state.json", JSON.stringify({
      title: "fix: short description",
      body: "Longer explanation",
      files: ["path/to/changed1.ts", "path/to/changed2.md"]
    }))'
    node scripts/_pr_push.mjs
    ```
    Idempotent + resumable (state in `/tmp/_pr_push_state.json`). Reuses open AND closed PRs on the same head. Polls `guard` every 30s for up to 25 min via both check-runs and commit-statuses APIs. Squash-merges with optimistic SHA lock. Run as a Replit workflow (e.g. `PR Push`) — bash sessions get SIGHUP'd mid-poll.
-   **Bulk-merging open PR backlog**: `scripts/_merge_all.mjs` orchestrates safe-first merging of all open PRs (update-branch from main → poll guard → squash-merge → delete branch), state at `/tmp/_merge_all_state.json`. Run as workflow `Merge All PRs`. Survives sandbox restart by resuming from state.
-   **API path canonicals (verified by smoke 2026-05-12, 60/60 PASS)** — common wrong guesses (left) → correct path (right):
    -   `/api/hr/employees` ❌ → `/api/hr/employees-status` ✅
    -   `/api/hr/leaves` ❌ → `/api/hr/leave-requests` ✅
    -   `/api/hr/training` ❌ → `/api/hr/training/programs` ✅
    -   `/api/hr/recruitment` ❌ → `/api/hr/recruitment/postings` (jobs) + `/api/hr/recruitment/applications` (applicants) ✅
    -   `/api/fleet/fuel` ❌ → `/api/fleet/fuel-logs` ✅
    -   `/api/properties` ❌ → `/api/properties/units` ✅
    -   `/api/support` ❌ → `/api/support/tickets` ✅
    -   `/api/marketing` ❌ → `/api/marketing/campaigns` ✅
    Rule of thumb: `grep -E "router\.(get|post)\(['\"]/" artifacts/api-server/src/routes/<module>.ts` to see actual mounted paths.
-   **Umrah operational endpoints** (added May 2026, see `lib/api-spec/openapi.yaml` for full schemas):
    -   `POST   /api/umrah/groups/:id/split` (409 if source is invoiced) · `POST /api/umrah/groups/merge`
    -   `POST   /api/umrah/penalties/waive-bulk` (consolidated GL reversal)
    -   `GET|POST|DELETE /api/umrah/attachments` (polymorphic)
    -   `GET    /api/umrah/reports/reconciliation` · `/reports/daily-runsheet[/pdf]` · `/statements/:subAgentId/pdf`
-   **Auth uses HttpOnly cookies, not Bearer tokens.** `POST /api/auth/login` returns `Set-Cookie: erp_access=<jwt>; Path=/api; HttpOnly` (and `erp_refresh` on `/api/auth`). For curl/scripts: `-c jar.txt` on login, `-b jar.txt` after. The login JSON body has `assignments` + `userRoles` only — **no `accessToken` field**.
-   **API Recurring Bugs**: common query discrepancies — `hireDate` vs `startDate`, `entityType` vs `relatedEntity`, missing `fullName` on `users` table.
-   **Migration Overwrites**: upstream pulls often overwrite local fixes; re-apply known patches around column names, `SAVEPOINT`, `rawExecute` vs `pool.query`, and conditional DDL.
-   **DB Schema Inconsistencies**: tables like `employees`, `invoices`, `official_letters`, `company_settings`, `obligations`, `purchase_requests`, `property_buildings` have specific column constraints or dynamic creation — respect them.
-   **JSX Generics**: avoid `<DataTable<any>>` (Babel JSX parser limitation) — use `(DataTable as any)` or drop the generic.
-   **Stale Guards**: remove any stale `if (req.path.includes("/pay")) return;` type guards — they cause infinite hangs.
-   **Screenshot Refresh**: always run `pnpm --filter @workspace/ghayth-erp-deck run export-pdf-fresh` before sharing a PDF with the GM.

## Pointers

-   **OpenAPI**: `lib/api-spec` · **Drizzle ORM**: https://orm.drizzle.team · **Zod**: https://zod.dev · **Orval**: https://orval.dev
-   **TailwindCSS**: https://tailwindcss.com · **shadcn/ui**: https://ui.shadcn.com · **React**: https://react.dev · **Vite**: https://vitejs.dev
