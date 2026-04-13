# Architecture — Ghayth ERP

> **Scope.** This document describes the runtime architecture as it actually exists in the repository. It is deliberately pragmatic: it reflects the code under `artifacts/api-server`, `artifacts/ghayth-erp`, and `lib/`, not an aspirational diagram.

---

## 1. High-level topology

```
 ┌──────────────────────┐        ┌──────────────────────┐
 │  artifacts/ghayth-erp │ HTTPS  │  artifacts/api-server │
 │  (React + Vite SPA)   │──────▶│  (Express 5 + TS)     │
 └──────────────────────┘        └──────────┬───────────┘
                                            │
                                            ▼
                                   ┌────────────────┐
                                   │  PostgreSQL     │
                                   │  (raw SQL via   │
                                   │   pg.Pool)      │
                                   └────────────────┘

 ┌──────────────────────┐        ┌──────────────────────┐
 │  artifacts/client-    │──────▶│  same api-server      │
 │  portal               │        │  (separate auth:     │
 │  artifacts/careers-   │        │   clientPortal.ts,   │
 │  portal               │        │   careersPortal.ts)  │
 └──────────────────────┘        └──────────────────────┘
```

A single API-server process serves all frontends. JWT-based authentication is used throughout; the client and careers portals share the same `JWT_SECRET` but use dedicated sign/verify flows with different claim shapes.

---

## 2. API server layering

File paths are relative to `artifacts/api-server/src/`.

### 2.1 Bootstrap

- `index.ts` — starts the HTTP server, runs pending migrations via `lib/migrate.ts`, optionally seeds demo data via `lib/seedDemoData.ts`, and launches the cron scheduler via `lib/cronScheduler.ts`.
- `app.ts` — builds the Express application: Helmet, CORS allow-list, rate limiting, cookie parser, JSON body parser, `routes/index.ts` mounting, and a centralised error middleware.

### 2.2 Routing

- `routes/index.ts` — the router graph. Mounts ~70 sub-routers under prefixes like `/hr`, `/hr/discipline`, `/finance`, `/finance/invoices`, `/bi`, etc. **Order matters:** sub-routers (`/hr/discipline`, `/hr/attendance`) are mounted *before* the monolithic `/hr` router so their specific paths take precedence.
- Each route file is a focused Express `Router`. See `docs/MODULES.md` for the module-to-router map.

### 2.3 Middleware chain

A typical authenticated route runs through:

```
 helmet
 → cors (whitelist)
 → rateLimit
 → cookieParser
 → express.json
 → authenticate (JWT → req.user)
 → resolveScope (companyId, branchId, activeAssignmentId → req.scope)
 → requirePermission("module:action"[, ...])
 → requireFeature("feature-flag")   // optional
 → handler
 → centralErrorMiddleware
```

- `lib/auth.ts` — JWT verify, token rotation, `requireAuth` middleware.
- `lib/scope.ts` / `lib/scopedQuery.ts` — resolves the active company, branch, and assignment and injects them into SQL via helpers like `scopedQuery` so tenants can never read each other's rows.
- `lib/permissions.ts` — `requirePermission(...perms)` with **AND** semantics between permissions. Role-to-permission mapping is seeded in migrations.
- `lib/rawdb.ts` — the shared `pg.Pool`. Low-level helpers `rawQuery`, `rawExecute`, `withTransaction` are defined here and re-exported from `lib/db.ts`.

### 2.4 Domain helpers

- `lib/businessHelpers.ts` — generic helpers: `createNotification`, `createAuditLog`, `getManagerAssignmentId`, approvals glue, etc.
- `lib/eventBus.ts` — in-process `EventEmitter` with a Dead Letter Queue (`pushToDLQ`, `safeEmitEvent`, `flushDLQ`). Used for cross-module fan-out (audit → notifications → rule engine).
- `lib/approvalEngine.ts` — state-machine enforcement for generic approval chains.
- `lib/disciplineEngine.ts` — HR discipline article resolution, penalty parsing, idempotent memo creation.
- `lib/accountingEngine.ts` — journal entry generation, CoA lookups.
- `lib/notificationEngine.ts` — routing rules, template rendering, fallback chains, webhook delivery.
- `lib/cronScheduler.ts` — 40+ scheduled jobs (expiry alerts, absence detection, daily close, deduction batches, …) guarded by PostgreSQL advisory locks.

### 2.5 Database access

- **Raw SQL first.** Most handlers build SQL directly using `rawQuery`/`rawExecute`. `rawExecute` automatically injects `RETURNING id` and yields `{ insertId, affectedRows }`.
- **Drizzle schema second.** `lib/db/src/schema/index.ts` defines 22+ tables for typing, `drizzle-zod` for validation, and the occasional typed query. Runtime writes are still raw SQL so the migration history and schema inference stay in sync through `src/migrations/*.sql`.
- **Migrations.** `src/migrations/NNN_*.sql` files are idempotent and run on every boot via `lib/migrate.ts`. `build.mjs` copies them into `dist/migrations` so the production bundle carries them.

---

## 3. Frontend architecture

Paths are relative to `artifacts/ghayth-erp/src/`.

- **Routing:** `wouter` with code-split lazy routes organised under `routes/*.tsx` (one file per business module).
- **Data fetching:** `useApiQuery(key, path, options?)` and `apiFetch(path, init?)` in `lib/api.ts` (thin wrappers over `@tanstack/react-query` + `fetch`). Error messages are normalised via `getErrorMessage`.
- **UI kit:** shadcn/ui primitives under `components/ui/*`, composed into `components/shared/*` building blocks (data tables, filter bars, export buttons, entity timelines, document panels).
- **State / context:**
  - `contexts/app-context.tsx` — active company/branch/role, module visibility, role colours.
  - `contexts/settings-context.tsx` — the 3-level settings engine (system → company → branch) resolved via API.
  - `lib/auth.ts` — login, refresh, logout helpers; exposes `useAuth()`.
- **Sidebar + breadcrumbs:** `components/layout/sidebar-layout.tsx` is the single source of truth for the menu tree, role-based visibility, and child navigation.
- **Conventions (from `replit.md`):**
  - No modals for create/edit — full pages navigated via `<Link>`. `QuickPreviewDialog` (read) and `AlertDialog` (delete) are the only allowed dialog patterns.
  - Lists always use `?page=X&limit=20` query params.
  - RTL (`dir="rtl"`, `lang="ar"`) + Arabic-Indic numerals via `lib/formatters.ts`.
  - Error/empty states must include a retry button and an icon.

---

## 4. Multi-tenant / data-scoping model

1. **Company** — top-level tenant. Every business table carries `companyId`.
2. **Branch** — sub-tenant within a company. Most transactional tables also carry `branchId`.
3. **Assignment** — the user's working identity. Users can have multiple `employee_assignments`; the active one (`scope.activeAssignmentId`) determines what they can see and do.
4. **Role + permissions** — roles are company-scoped and mapped to granular permissions like `hr:discipline:approve`, `finance:invoices:create`. The same user can hold different roles in different companies.

`lib/scopedQuery.ts` auto-injects `companyId` (and `branchId` when applicable) into SQL `WHERE` clauses so handlers can never accidentally leak data across tenants.

---

## 5. Cross-cutting engines

| Engine / subsystem       | File(s)                                              | Purpose |
| ------------------------ | ---------------------------------------------------- | ------- |
| Auth / JWT rotation      | `lib/auth.ts`                                        | Access + refresh token flow, password hashing. |
| Scoped query helper      | `lib/scope.ts`, `lib/scopedQuery.ts`                 | Injects `companyId`/`branchId` into SQL. |
| Permissions              | `lib/permissions.ts`                                 | `requirePermission` middleware with AND semantics. |
| Event bus + DLQ          | `lib/eventBus.ts`                                    | Cross-module fan-out; failed events parked in DLQ. |
| Notification engine      | `lib/notificationEngine.ts`, `routes/notification-engine.ts` | Template rendering, routing rules, webhooks. |
| Approval engine          | `lib/approvalEngine.ts`                              | Generic state-machine chains. |
| Audit logging            | `lib/auditLog.ts`                                    | Before/after snapshots, evidence-grade. |
| Cron scheduler           | `lib/cronScheduler.ts`                               | 40+ jobs, advisory-lock protected. |
| Discipline engine        | `lib/disciplineEngine.ts`                            | Article resolution + idempotent inquiry memos. |
| Accounting engine        | `lib/accountingEngine.ts`                            | CoA, automatic journal generation. |
| Pagination helper        | `lib/paginationHelper.ts`                            | `parsePagination()` with max 100 per page. |
| ZATCA / e-invoicing      | `routes/finance-zatca.ts`                            | TLV QR encoder, UBL 2.1 XML, submission log. |
| Object storage           | `lib/objectStorage.ts`                               | GCS-backed storage abstraction for DMS. |

---

## 6. Request lifecycle example — "create inquiry memo"

To ground the model, here is the exact flow for `POST /hr/discipline/memos`:

1. Express matches the route in `routes/hr-discipline.ts` (mounted under `/hr/discipline` in `routes/index.ts`, ahead of the monolithic `/hr` router).
2. Middleware chain: `authenticate` → `resolveScope` → `requirePermission("hr:discipline:create")`.
3. Handler calls `disciplineEngine.ensureInquiryMemoForViolation({ assignmentId, incidentType, ... })`. This helper is idempotent: if a memo already exists for that `(assignmentId, violationId)` tuple it is returned unchanged.
4. `disciplineEngine.resolveArticle()` walks the cached regulation for the company (49 seeded articles under section `work_time`/`work_organization`/`conduct`) and returns the matching `regulationId`, `occurrenceCount`, and parsed penalty tokens.
5. `withTransaction` wraps the memo insert, the event log insert, and `createNotification` for the employee so either everything commits or nothing does.
6. `safeEmitEvent("hr.memo.created", { memoId, employeeId })` fans the event out to the notification engine and BI activity log; failures land in the DLQ instead of aborting the request.
7. The handler returns the memo id. The frontend at `/hr/discipline/memos` invalidates its React Query keys and refetches.

---

## 7. Known architectural decisions

- **Raw SQL over ORM at runtime.** Chosen for predictable performance and to make the migration history the single source of truth. Drizzle is kept for typing and shared schema only.
- **Single API process, no queues.** Cross-module fan-out uses an in-process `EventEmitter` with a DLQ. This is acceptable at the current scale but will need a real queue (e.g. pg-boss, BullMQ) if the app is horizontally scaled.
- **Monolithic front-end.** One SPA carries the whole ERP. Code-splitting happens per route via `React.lazy`; sidebar visibility is filtered by role at render time.
- **Migrations auto-run on boot.** Convenient for dev and single-instance deployments; for multi-instance deploys, gate migrations behind a leader-election lock (the scheduler already uses PostgreSQL advisory locks and can serve as a template).
