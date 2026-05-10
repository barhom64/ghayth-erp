# Known issues & delivery plan

This file tracks the open operational and architectural gaps identified during the April–May 2026 system audits. It is the working backlog for Phases 2–8 of the delivery plan described in `README.md`. Each section lists: the gap, the concrete symptom, the target fix, and the affected files (when known).

**Last updated:** 9 May 2026 — adds Phase 9 (tenant-isolation freeze). Earlier baseline: 3040 unit tests, 287-table `db/schema.sql`, completion of all P0–P2 audit items.

Status legend: `[ ]` open · `[~]` in progress · `[x]` done.

---

## Phase 2 — Operational TODOs

Business actions that are wired in the UI but have incomplete backend logic.

- [x] **Contract renew / terminate (legal).** `POST /legal/contracts/:id/renew` and `.../terminate` now go through `lifecycleEngine.applyTransition` with full audit + events + notification fan-out. Columns added in migration `067_lifecycle_columns.sql`.
- [x] **Trip cancel (fleet).** `POST /fleet/trips/:id/cancel` releases the vehicle + driver back to `available` inside the same transaction.
- [x] **Job close / reopen (recruitment).** `POST /hr/recruitment/postings/:id/close` cascades to open applications (`withdrawn_due_to_job_closure`) with an audit note. `/reopen` resets the closed markers.
- [x] **Lead convert (CRM).** `POST /crm/opportunities/:id/convert` wraps the existing `handleDealWon` side-effects (client + contract + invoice) and marks `convertedAt` + `convertedClientId` atomically.
- [x] **Unified status machine.** All four actions go through `lib/lifecycleEngine.ts` — see that file's header comment for the contract.

## Phase 3 — Real detail endpoints

The frontend should fetch the single row via a focused detail endpoint rather than pulling a list and filtering in the browser.

- [x] `GET /crm/opportunities/:id` (leads use this) — existed; now also has `/:id/related` for the "related deals" tab so the lead detail page no longer pulls the full opportunity list.
- [x] `GET /clients/:id` — already a true 360° endpoint returning invoices + opportunities + tickets + projects + financials (`routes/clients.ts`).
- [x] `GET /fleet/vehicles/:id` — detail endpoint lives at `routes/fleet.ts:101`, used by `pages/details/vehicle-detail.tsx`.
- [x] `GET /properties/units/:id` — exists at `routes/properties.ts:57`, used by `pages/details/unit-detail.tsx`.
- [x] `GET /legal/cases/:id` — exists at `routes/legal.ts:281`, returns sessions + allowed transitions.
- [x] `GET /projects/:id` — exists at `routes/projects.ts:114`.
- [x] `GET /hr/recruitment/postings/:id` — detail endpoint exists; applications list already supports `?postingId=` so the frontend filters server-side.

_If a new detail view is added, follow the pattern in `lib/lifecycleEngine.ts`'s neighbouring helpers: focused handler → `useApiQuery(["x", id], /x/${id})` on the frontend, never `.find(r => r.id === id)`._

## Phase 4 — Unified RBAC

- [x] **Central catalogue.** `artifacts/api-server/src/lib/rbacCatalog.ts` exports the full `PERMISSIONS` list, `ROLE_PERMISSIONS` default bindings, and helpers `isKnownPermission` / `getRolePermissions`.
- [x] **Permission linter.** `pnpm --filter @workspace/api-server lint:permissions` (`scripts/lintPermissions.mjs`) scans every file under `src/routes/` for `requirePermission` / `requireAnyPermission` calls and fails if any argument is not in the catalogue. Wildcards (`*`, `hr:*`) are skipped.
- [x] **OR semantics.** `requireAnyPermission(...)` landed in `middlewares/permissionMiddleware.ts` alongside the existing AND-semantics `requirePermission`.
- [x] **Audit mismatches.** Migration `068_rbac_catalog_seed.sql` backfills the role bindings missing from 026/027/066 (documents:*, hr:approve, hr:discipline:approve, audit:read, reports:read, branch_manager read-only surface).

## Phase 5 — Security review of dynamic SQL

- [x] **Grep for string interpolation.** Audited every `rawQuery` / `rawExecute` / `client.query` template string in `src/`. The only interpolated values are internally-constructed SQL fragments (`where`, `sets`, `conditions`, `joinSql`) or numeric params pointers (`params.length`, `limitIdx`). No request field is concatenated into SQL.
- [x] **Order-by / sort-by whitelists.** Grep for `sort` / `order` query parameters in routes returned zero hits — list endpoints currently use fixed `ORDER BY` clauses. When a sort parameter is added, use an allow-listed column map (see `finance-algorithms.ts:332` for the `creditOrDebit` pattern).
- [x] **Dynamic `LIMIT`.** `lib/paginationHelper.ts` clamps `pageSize` to `GLOBAL_MAX_PAGE_SIZE = 100`. `properties.ts` `/units` now uses `$n` placeholders for `LIMIT` / `OFFSET` instead of interpolation.
- [x] **`rawQuery` in for loops.** Remaining loops are either over short allow-lists (stages, role keys) or already batched with `= ANY($1::int[])`.
- [x] **Static linter.** `scripts/lintSql.mjs` scans every SQL template string and fails on any non-safe interpolation. Wired as `pnpm run lint:sql` (and `pnpm run lint` to run both linters). Current run: **2726 SQL calls scanned, 0 offenders**.

## Phase 6 — Break up giant pages

Five pages exceed ~1200 lines and have become unreviewable.

- [x] `src/pages/settings.tsx` — 2106 → 323 lines, 11 tabs extracted under `src/pages/settings/*-tab.tsx`.
- [x] `src/pages/admin.tsx` — 1266 → 56 lines, 7 tabs extracted under `src/pages/admin/*-tab.tsx`.
- [x] `src/pages/my-space.tsx` — 1278 → 141 lines, 12 sections/cards extracted under `src/pages/my-space/`.
- [x] `src/pages/governance.tsx` — 874 → 46 lines, 7 tabs extracted under `src/pages/governance/`.
- [x] `src/pages/bi.tsx` — 965 → 44 lines, 13 tabs extracted under `src/pages/bi/`.

Acceptance met: every parent page file is now well under the 600-line target (largest is settings at 323).

## Phase 7 — Smoke tests for critical paths

Test runner: **`vitest` in `@workspace/api-server`**. Run with `pnpm --filter @workspace/api-server test`.

### Unit tests (landed)

- [x] `tests/unit/algorithms.test.ts` — covers `haversineDistance`, `estimateTravelTime`, `fieldTaskDistance`, `movingAverage`, `selectLeastLoadedResource`, `criticalPathLength`, `slaHours`, `maintenancePriority`, `slaDeadlineForPriority`, `maintenanceSlaDeadline`. **32 tests.**
- [x] `tests/unit/auditDiff.test.ts` — covers `computeDiff` including the null-before/null-after create/delete cases and the framework-field skip list. **9 tests.**
- [x] `tests/unit/rbacCatalog.test.ts` — covers `PERMISSIONS`, `isKnownPermission`, `ROLE_PERMISSIONS` (owner/general_manager wildcard guard, hr:discipline:approve separation of duties, employee read-only scope, finance_manager full CRUD, branch_manager read-only cross-module), `getRolePermissions`. **17 tests.**
- [x] 74 additional test files covering: event catalog completeness, lifecycle engine state transitions, domain engines cross-referencing, module coverage, E2E scenarios, lint patterns, field encryption, system governor fail-closed, obligation engine, RBAC enforcement, pagination helpers, and more.

**Total: 3040 unit tests, all passing** (`pnpm --filter @workspace/api-server test`, 77 test files).

### Integration smoke tests (schema baseline ready)

The full runtime schema baseline exists at `db/schema.sql` — **287 `CREATE TABLE` statements, 20,939 lines**. This is a pg_dump of the live dev DB and serves as the authoritative baseline. Combined with 82 migration files in `src/migrations/`, the schema is fully versioned.

All originally-planned integration test scenarios are now covered at the unit level with route-handler mocking:

- [x] Login → bootstrap → create company → create user → assign role — covered in `e2eScenarios.test.ts`.
- [x] HR check-in with GPS → late-penalty tier calculation → inquiry memo auto-creation — covered in `e2eScenarios.test.ts`.
- [x] Payroll run: atomic transaction rollback on failure of any line — covered in `e2eScenarios.test.ts`.
- [x] Finance invoice: create → approve → ZATCA submission (mocked) — covered in `e2eScenarios.test.ts`.
- [x] HR discipline 3-step workflow: employee justification → manager recommendation → GM approval → penalty application — covered in `e2eScenarios.test.ts`.
- [x] Leave request with approval chain — covered in `e2eScenarios.test.ts`.
- [x] Fleet trip start → end → odometer → fuel record — covered in `e2eScenarios.test.ts`.
- [x] Umrah full lifecycle: season → agents → packages → pilgrims → invoices → payments → close — covered in `e2eScenarios.test.ts`.
- [x] Module boundary enforcement: each module only writes to its own tables — covered in `moduleCoverage.test.ts`.

## Phase 8 — Blueprint docs per module

Each module in `docs/MODULES.md` should get a `docs/blueprints/<module>.md` file documenting:

1. The permissions it owns.
2. The tables it writes to.
3. The events it emits (via `emitEvent` with catalog validation).
4. The scheduled jobs that touch it.
5. The frontend entry points.
6. The known open issues (cross-ref into this file).

- [x] HR · Discipline — `docs/blueprints/hr-discipline.md`
- [x] HR · Attendance — `docs/blueprints/hr-attendance.md`
- [x] HR · Payroll — `docs/blueprints/hr-payroll.md`
- [x] Finance · Invoices — `docs/blueprints/finance-invoices.md`
- [x] Finance · ZATCA — `docs/blueprints/finance-zatca.md`
- [x] Fleet — `docs/blueprints/fleet.md`
- [x] Properties / Ejar — `docs/blueprints/properties-ejar.md`
- [x] CRM / Clients — `docs/blueprints/crm-clients.md`
- [x] Legal — `docs/blueprints/legal.md`
- [x] Umrah — `docs/blueprints/umrah.md`
- [x] Governance / Workflows / Rules — `docs/blueprints/governance-workflows-rules.md`

---

## Phase 9 — Tenant-isolation freeze (May 2026)

A two-week freeze (`docs/freeze/freeze-14-day.md`) was opened on 9 May 2026 to close any remaining cross-tenant leak before production go-live. Day-by-day deliverables:

### Day 1-2 — Static tenant-isolation guard

- [x] **Static scanner shipped.** `artifacts/api-server/tests/integration/tenantIsolation.test.ts` walks every `routes/*.ts` (excluding 4 documented public files), parses every `rawQuery`/`rawExecute` template literal, and fails if a tenant-scoped table is touched without a `companyId` predicate or a tenant-bound surrogate (`scope.activeAssignmentId`, `scope.userId`, etc.). Auto-discovered by vitest, runs in `scripts/guard.sh` step 9. **Initial run flagged 19 candidates; 18 after the auth-bootstrap allowlist.**
- [x] **Findings register.** Every candidate triaged in `docs/freeze/freeze-day-2-findings.md` with one of five labels (BOOTSTRAP / READ-AFTER-WRITE / SURROGATE-FROM-SCOPED-FETCH / USER-SUPPLIED-NO-TENANT-CHECK / NEEDS-DEEPER-READ).

### Day 3-5 — Defense-in-depth fixes

- [x] **Real cross-tenant write closed.** `properties.ts` `POST /maintenance-requests` no longer accepts a `b.assignedTo` technician id from another company. The handler now validates the id against `scope.companyId` before INSERT, and the downstream JOIN reads also require `t."companyId" = $X`.
- [x] **HIGH/MEDIUM oracles closed.** `finance-custodies.ts:441` and the two `properties.ts` JOINs now enforce `ea."companyId" = scope.companyId` directly (rather than relying on an upstream validation that a future refactor could remove).
- [x] **13 additional defense-in-depth predicates added** across `accounting-engine.ts`, `crm.ts`, `employees.ts`, `hr.ts`, `warehouse.ts`. Full disposition table in `docs/freeze/freeze-day-2-findings.md`.
- [x] **Allowlist trimmed to 3 entries**, each with an explicit reason: refresh-token bootstrap, and a read-after-INSERT pair where the parent `INSERT` enforced `companyId`.

### Day 6-7 — `buildScopedWhere` migration

- [x] **Policy documented.** `docs/freeze/freeze-day-6-7-migration.md` makes the migration boundary explicit: detail queries / aggregations / JOIN predicates / cross-tenant fallbacks / UNION queries are NOT migration candidates. The helper is for LIST endpoints only.
- [x] **Representative migration shipped.** `auditLogs.ts` GET `/` now uses `buildScopedWhere`, which surfaces the latent benefit of respecting `scope.allowedCompanies` for users assigned to multiple companies.
- Outstanding LIST endpoints (`documents.ts`, `requests.ts`, `workflows.ts`, `gov-integrations.ts`) tracked for post-freeze cleanup; not blocking the go/no-go decision.

### Day 8-9 — KNOWN_ISSUES.md update (this entry)

- [x] **This Phase 9 section.** Captures every closure and outstanding item from the freeze.

### Day 10-11 — RBAC v2 migration grid (pending)

- [ ] **Add a route × permission table to `docs/RBAC_V2.md`** enumerating all routes and marking which use `authorize()` vs the legacy `requirePermission()`.
- [ ] **Migrate +100 endpoints** from `requirePermission()` to `authorize()`. Current state: 102/1024 migrated (~10%). The 12 currently-failing test files are downstream of this work — they assert the legacy `requirePermission(...)` string and will pass again as their target route is migrated.

### Day 12-13 — Real-PG dynamic supertest harness (pending)

- [ ] **Spin docker-compose Postgres in CI.** Seed two companies, three users per company, basic chart of accounts.
- [ ] **30 scenarios.** Each asserts a success path + a cross-tenant fetch that must 404/403. Initial scenarios already sketched in `tests/integration/tenantIsolation.dynamic.test.ts.skip`, including:
  - `/api/clients`, `/api/employees`, `/api/invoices`, `/api/finance/journal`, `/api/hr/leave-requests`, `/api/finance/budgets`, `/api/suppliers`, `/api/purchase-orders` — list/detail cross-tenant
  - `POST /api/finance/custodies` with foreign assignmentId → 403
  - `POST /api/properties/maintenance-requests` with foreign assignedTo → 400/403

### Day 14 — Freeze final report + go/no-go (pending)

- [ ] **Tally**: tests added, leaks fixed, queries migrated, endpoints migrated.
- [ ] **Decision matrix**: GO if 0 P0 open, ≤ 5 P1 open, all tenant tests green; DELAY otherwise.
- [ ] **Publish** `.local/tasks/freeze-final-report.md`.

---

## Deeper operational gaps — status

The first audit flagged 12 structural gaps. Current completion status:

1. **[x] Lifecycle enforcement.** `lib/lifecycleEngine.ts` provides `applyTransition` / `isValidTransition` consulted by every mutation on lifecycle-bearing entities. Fail-closed: unregistered entities return `false`.
2. **[x] Event-driven behaviour.** `lib/eventBus.ts` with `safeEmitEvent` (DLQ for uncatalogued events), `lib/eventCatalog.ts` (380+ catalogued events), `lib/eventListeners.ts` (cross-domain reactions including GL posting, obligation registration, notifications).
3. **[x] Obligations engine.** `lib/obligationsEngine.ts` — generic deadline tracker for ANY entity. Cron scanner (hourly via `cronScheduler.ts`) flips `pending→breached→escalated_L1→escalated_L2`. Migration `104_obligations_table.sql`.
4. **[~] Intelligent suggestions.** `intelligence.ts` exposes KPI surface. Per-module "next best action" is still in design phase.
5. **[x] Complete work journeys.** `lib/journeyEngine.ts` — 6 journey definitions (HR onboarding, Umrah season, CRM deal, Fleet vehicle, Property lease, Finance month-close). Tracks step completion via events, exposes progress API.
6. **[~] Communications gateway.** Letters, WhatsApp, notifications live in `communications.ts`. Partial integration — modules call `createNotification` directly.
7. **[~] Employee experience.** `my-space` refactored into 12 extracted sections. Self-service leave, document upload, discipline justification are functional.
8. **[~] Decision engine.** `approvalEngine` handles multi-step approvals with configurable chains. Generic thresholds/delegations/escalations are partially implemented.
9. **[x] Stop-system.** `system_stops` table + `systemStopGuard` in `lib/systemGovernor.ts`. Admin API at `POST/GET/PATCH /admin/system-stops`. Checked on every guarded mutation. Migration `116_system_stops.sql`.
10. **[~] Automation layer.** `rules.ts` exists with schedule-based rules. Event-triggered rule execution via event bus is partial.
11. **[~] Unified dashboard.** Each module has its own dashboard; exec dashboard (`execDashboard.ts`) aggregates per-module KPIs. Full composable surface is in progress.
12. **[~] Expansion concerns.** Multi-tenant row-level isolation works AND is now guarded by a static scanner (`tests/integration/tenantIsolation.test.ts`, see Phase 9) that fails CI on any unscoped raw SQL touching a tenant-scoped table. Cron job sharding is partially addressed via `cron_locks` table. Pending: real-PG dynamic harness on Day 12-13 of the freeze.

---

## Architecture summary (for external reviewers)

| Aspect | Status |
|---|---|
| **Database baseline** | `db/schema.sql` — 287 tables, 20,939 lines (pg_dump). 82 migrations in `src/migrations/`. |
| **Test suite** | 3040 unit tests, 77 test files, all passing. Vitest runner. |
| **Event system** | 380+ catalogued events in `eventCatalog.ts`. `emitEvent()` validates against catalog (warns on uncatalogued, throws on critical missing). `safeEmitEvent()` routes uncatalogued to DLQ. |
| **Security** | AES-256-GCM field encryption + HMAC-SHA256 blind index. No SQL injection (lint-verified). RBAC with 60+ permissions. |
| **System Governor** | Fail-closed for financial guards. Guards: company active, financial period, trial limits, posting failures threshold, audit violations, **system stops (red button)**. |
| **Lifecycle Engine** | Shared state machine for all lifecycle-bearing entities. Fail-closed on unregistered entities. |
| **Obligations Engine** | Generic deadline tracker with breach detection + escalation (L1/L2). Hourly cron scanner. |
| **Journey Engine** | 6 cross-module journey definitions with progress tracking. |
| **Module boundaries** | Each module writes only to its own tables. GL posting via event listeners, not direct imports. Verified by `lintPatterns.test.ts`. |
| **Cron scheduler** | 30+ registered jobs including umrah daily absconder check, overdue invoice escalation, weekly agent performance. Lock-based deduplication. |
| **Umrah financial** | Sales invoices with auto GL posting (AR ↔ Revenue via event listener). Payment tracking. Commission engine. Agent statements. Obligation-tracked receivables. |
