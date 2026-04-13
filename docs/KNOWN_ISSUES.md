# Known issues & delivery plan

This file tracks the open operational and architectural gaps identified during the April 2026 system audit. It is the working backlog for Phases 2–8 of the delivery plan described in `README.md`. Each section lists: the gap, the concrete symptom, the target fix, and the affected files (when known).

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

- [ ] **Grep for string interpolation in SQL** across `routes/**/*.ts` and `lib/**/*.ts`. Replace any `` `SELECT ... ${userInput}` `` with parameterised `$n` placeholders.
- [ ] **Order-by / sort-by whitelists.** Several list endpoints accept `sort` query parameters and concatenate them into `ORDER BY`. Replace with allow-listed column maps.
- [ ] **Dynamic `LIMIT`.** Ensure the pagination helper clamps `limit` to 100 before it reaches the SQL.
- [ ] **Audit `rawQuery` usages inside `for` loops.** These are candidates for either a single JOIN or a batched `= ANY($1::int[])` query.

## Phase 6 — Break up giant pages

Five pages exceed ~1200 lines and have become unreviewable.

- [ ] `src/pages/settings.tsx`
- [ ] `src/pages/admin/*` (users + roles + logs overlap)
- [ ] `src/pages/my-space.tsx`
- [ ] `src/pages/governance.tsx`
- [ ] `src/pages/bi.tsx`

Target: extract each tab into its own file under `src/pages/<module>/` and keep the parent as a thin tabs shell. Acceptance: no single page file > 600 lines.

## Phase 7 — Smoke tests for critical paths

No automated tests exist yet. Before adding a full suite, cover the handful of flows a failure of which would block the business.

- [ ] Login → bootstrap → create company → create user → assign role.
- [ ] HR check-in with GPS → late-penalty tier calculation → inquiry memo auto-creation.
- [ ] Payroll run: atomic transaction rollback on failure of any line.
- [ ] Finance invoice: create → approve → ZATCA submission (mocked).
- [ ] HR discipline 3-step workflow: employee justification → manager recommendation → GM approval → penalty application.
- [ ] Leave request with approval chain.
- [ ] Fleet trip start → end → odometer → fuel record.

Target test runner: `vitest` running in the `api-server` package against an ephemeral PostgreSQL (testcontainers or a dedicated `ghayth_erp_test` db). Smoke tests only — unit test coverage can come later.

## Phase 8 — Blueprint docs per module

Each module in `docs/MODULES.md` should get a `docs/blueprints/<module>.md` file documenting:

1. The permissions it owns.
2. The tables it writes to.
3. The events it emits (via `safeEmitEvent`).
4. The scheduled jobs that touch it.
5. The frontend entry points.
6. The known open issues (cross-ref into this file).

- [ ] HR · Discipline (closest to complete already — use as the template).
- [ ] HR · Attendance
- [ ] HR · Payroll
- [ ] Finance · Invoices
- [ ] Finance · ZATCA
- [ ] Fleet
- [ ] Properties / Ejar
- [ ] CRM / Clients
- [ ] Legal
- [ ] Umrah
- [ ] Governance / Workflows / Rules

---

## Deeper operational gaps (tracked separately)

The audit also flagged 12 structural gaps that will each need their own design note before implementation. They are captured here so nothing is lost.

1. **No lifecycle enforcement.** Objects can be edited past their "final" state because lifecycle rules are checked per-route, not in a shared state machine. Target: a single `lifecycleEngine` consulted by every mutation on lifecycle-bearing entities.
2. **No event-driven behaviour beyond notifications.** `eventBus` exists but few modules subscribe to events other than the notification engine. Target: document which events each module should react to and wire subscribers in `lib/subscribers/*`.
3. **No obligations engine.** Deadlines (contract expiry, visa renewal, lease expiry) are scattered across 40+ cron jobs. Target: single obligations table + scheduler that owns all deadline-driven behaviour.
4. **No intelligent suggestions.** `intelligence.ts` exists but only exposes a KPI surface; it does not suggest actions. Target: per-module "next best action" using the behavioural intelligence layer.
5. **No complete work journeys.** Journeys (onboard employee, open property, close month) are implicit across 3–5 modules each. Target: define journey definitions + progress tracking under `lib/journeyEngine.ts`.
6. **Outgoing/incoming communications not integrated with modules.** Letters, WhatsApp, notifications live in `communications.ts` but the modules that trigger them do it ad-hoc. Target: a single `communicationsGateway` the business modules call, with templates owned by the notification engine.
7. **Employee experience weak.** `my-space` is read-mostly. Target: make it a full self-service surface for leave, timesheet correction, document upload, discipline justification, and training enrolment.
8. **No decision engine.** Multi-step approvals are hand-rolled per module. Target: extend `approvalEngine` to a generic decision engine with policies (thresholds, delegations, escalations).
9. **No stop-system.** There is no global "red button" to pause payroll, invoicing, or contract creation during an audit. Target: a `systemStops` table checked by every guarded mutation.
10. **No automation layer beyond cron.** `rules.ts` exists but rules are run on a schedule, not on events. Target: event-triggered rule execution via the event bus.
11. **No unified dashboard.** Each module has its own dashboard; there is no company-wide operational view. Target: a composable dashboard surface in `dashboard.ts` that aggregates per-module KPIs through a uniform contract.
12. **Expansion concerns.** Multi-tenant works at the row level but several cron jobs and background helpers iterate `company_id IN (...)` blindly and will not scale past ~100 companies. Target: audit and shard the helpers that need it.
