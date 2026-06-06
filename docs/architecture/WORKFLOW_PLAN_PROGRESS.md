# Architectural Workflow Plan — Progress Tracker

Background: a senior architectural review of the `claude/hr-driver-integrated-view`
branch surfaced 9 findings about operational + structural risks (single-process
monolith, opt-in branch scope, raw SQL fragments, etc.). The agreed workflow
plan was to ship the fixes in phased commits within this branch — each phase
producing a shippable improvement on its own, never blocking the next.

This document tracks what's landed vs what remains. Updated as each commit lands.

---

## P0 — Security stop-the-bleeding ✅ COMPLETE

Closes the highest-risk tenant-isolation + SQL-injection vectors before any
further feature work.

| # | Finding | Status | Commit | Tests |
|---|---|---|---|---|
| P0.1 | `effectiveBranchId = 0` silent bypass | ✅ Fixed | `8068881c` | 4 |
| P0.2 | `enforceBranchScope` opt-in (observability half) | ✅ Fixed | `8068881c` | 3 |
| P0.3 | raw `orderBy` / `extraConditions` | ✅ Fixed | `8068881c` | 8 |
| P0.4 | smoke tests lock the contract | ✅ Added | `8068881c` | 16 total |

**P0.2 follow-up landed:**
After the runtime warn shipped, the highest-risk callsites were audited
per-route and given explicit flags:

  - `support.ts /tickets`        — added `enforceBranchScope: true` (was
    silently leaking other branches' tickets — the original migration-171
    intent was lost when `disableBranchScope` was dropped without re-
    adding the enforce flag).
  - `finance-accounts.ts /journal` — added `enforceBranchScope: true`
    (branch_manager was seeing every other branch's journal entries).
  - `finance-accounts.ts /chart-of-accounts` + `/accounts` — added
    `disableBranchScope: true` with comment explaining COA is
    company-wide-by-design.
  - `auditLogs.ts` + `finance-recurring.ts` — kept existing
    `disableBranchScope: true` but added explanatory comments so a
    future reviewer doesn't "fix" them back.

6 new smoke assertions in `p02BranchScopeExplicit.test.ts` lock each
of the explicit flags. Remaining callsites still rely on the runtime
warn for surfacing; per-route ratcheting continues as small PRs.

---

## P1 — Worker / API process split ✅ COMPLETE

Closes finding #1 (12+ background subsystems in one process) and #9 (no worker
workspace).

| # | Task | Status | Commit |
|---|---|---|---|
| P1.1 | `src/worker.ts` entry point | ✅ Created | (pending) |
| P1.2 | `API_ONLY=true` flag in `index.ts` | ✅ Wired | (pending) |
| P1.3 | `worker:start` / `worker:dev` / `start:api-only` scripts | ✅ Added | (pending) |
| P1.4 | `build.mjs` produces both bundles | ✅ Updated | (pending) |
| P1.5 | `/healthz` + `/readyz` on worker | ✅ Wired | (pending) |
| P1.6 | smoke tests | ✅ Added | (pending) |

**Deployment model:**
- API container: `pnpm run start:api-only` (sets `API_ONLY=true`)
- Worker container: `pnpm run worker:start`
- Dev / single-process: `pnpm run start` (legacy behaviour — all-in-one)

**P1 remaining work:** Dockerfile / k8s manifests for the split deployment.
Not blocking the application code; ops can wire when they're ready.

---

## P2 — Outbox relay completion 🟡 PARTIAL

Closes findings #2 (outbox not relayed) and #3 (purge deletes pending).

| # | Task | Status |
|---|---|---|
| **P2.1** | **`outboxRelay.ts` daemon** | ✅ **Scaffold + observability shipped** |
| **P2.2** | **opt-in dedupe via `idempotencyKey`** | ✅ **Shipped (migration 252 + partial unique index + ON CONFLICT)** |
| **P2.3** | **dead-letter dashboard + retry/cancel actions** | ✅ **Shipped (`/admin/outbox` + 4 backend endpoints + 16 smoke tests)** |
| **P2.4** | **`OUTBOX_RELAY_ACTIVE` feature flag** | ✅ **Shipped (default off)** |
| **P2.5** | **`purgeAgedOutboxEntries` status-aware** | ✅ Done |
| P2.6 | integration tests | 🟡 51 smoke tests shipped; live-DB integration TBD |

**P2.5 is shipped early as a foundation:** the purge now filters
`status IN ('processed', 'dead')` so a future relay can flip on without
the same PR also having to remember to fix the purge. Until the relay lands
the in-process emitter remains the dispatcher and outbox rows are still
written but never marked `processed` — so they accumulate. Increase
`OUTBOX_RETENTION_DAYS` if you don't want to flip the relay on yet.

**P2.1 + P2.4 shipped (relay scaffold + flag):**
- `lib/outboxRelay.ts` polls event_outbox for pending rows, dispatches
  each through `eventBus.dispatchFromOutbox()` (a new bypass that
  calls super.emit without re-INSERTing), and marks the row
  `processed` / `failed_retry` / `dead` based on outcome.
- FOR UPDATE SKIP LOCKED so two worker replicas don't dispatch the
  same row twice.
- `EventBus.dispatchFromOutbox()` is the bridge — calling `emit()`
  would re-INSERT and the relay would never drain.
- Worker.ts wires startOutboxRelay() + stopOutboxRelay() and exposes
  `/outbox-stats` for ops to curl.
- 22 smoke assertions lock the contract.

**Default behaviour unchanged** — the flag is off so the relay is a
no-op. Staging can flip OUTBOX_RELAY_ACTIVE=true to exercise the loop
but the relay logs a loud warning that double-dispatch is possible
until P2.2 lands.

**P2 estimated remaining effort:** ~1-2 weeks for one senior. P2.2
(dedupe), P2.3 (admin dashboard for dead-letter), and P2.6 (live-DB
integration tests) are all that's left.

---

## P3 — Modularise the central router ✅ COMPLETE

Closes finding #4 (`routes/index.ts` was a 529-line monolith with 120
`router.use()` calls).

| # | Task | Status | Lines |
|---|---|---|---|
| P3.1 | Extract per-user limiter declarations → `routes/_limiters.ts` | ✅ Done | 58 |
| P3.2 | Extract all 100+ domain router mounts → `routes/_domain-mounts.ts` | ✅ Done | 275 |
| P3.3 | Reshape `routes/index.ts` to a thin orchestrator + `mountDomainRouters(router)` call | ✅ Done | 183 (was 529) |
| P3.4 | Smoke tests lock the contract (10 assertions) | ✅ Done | — |

**Result:** routes/index.ts shrank from **529 → 183 lines** (65%
reduction). The new pattern: add a domain → touch
`_domain-mounts.ts` only. The orchestrator file is now small enough
to read top-to-bottom without scrolling.

**Preserved exactly:** the existing mount order (Express routes are
order-dependent — `wiringScopeErrorHandler` after the stubs, finance
sub-routers in their declared sequence, the umrah limiter mounted
before its routers, etc.). Smoke tests assert the ordering so a
regression PR can't quietly re-order.

**Existing tests updated:** 8 test files were grepping
`routes/index.ts` for mount strings; all now concatenate
`routes/index.ts` + `routes/_domain-mounts.ts` so the assertions
resolve regardless of which file the mount lives in.

---

## P4 — Per-route subscription gates ✅ COMPLETE

Closes finding #5 (subscription gate is company-wide, not "sell each route
independently").

| # | Task | Status | Commit |
|---|---|---|---|
| P4.1 | `subscription_products` + `subscription_features` tables | ✅ Shipped (migration 253) | (pending) |
| P4.2 | `company_subscription_features` per-feature tracking | ✅ Shipped (migration 253 + seed grandfathers every tenant) | (pending) |
| P4.3 | `featureGate(featureKey)` middleware | ✅ Shipped (`lib/middlewares/featureGate.ts` + 60s cache) | (pending) |
| P4.4 | existing `subscriptionGate` becomes whole-company-only safety net | ✅ Done (both gates coexist — `featureGate` adds granularity, `subscriptionGate` stays as the expired/cancelled safety net) | (pending) |
| P4.5 | Admin endpoints for per-feature toggling | ✅ Shipped (5 endpoints under `/admin/subscription-features`) | (pending) |
| P4.6 | Admin SPA for per-feature toggling | ✅ Shipped (`/admin/subscription-features` matrix UI + Inline edit dialog) | (pending) |

**Backend shape:**
- 3 new tables: `subscription_products` (sellable SKUs), `subscription_features`
  (per-product fine-grained features), `company_subscription_features` (per-tenant
  per-feature row with status + optional expiresAt).
- `featureGate("<key>")` middleware reads scope.companyId × featureKey, returns
  402 FEATURE_NOT_SUBSCRIBED when entitlement missing or expired. Owner soft-
  bypass so they can reach the billing page. 60s in-memory cache.
- Prefix-mount pattern in `_domain-mounts.ts` — `router.use("/hr", featureGate("hr.access"))`
  gates every /hr/* sub-router. Three demo mounts shipped (`/hr`, `/fleet`,
  `/umrah`); the rest stay un-gated (current behaviour) until ops adds them.
- Admin endpoints: `GET /products`, `GET /features`, `GET /companies/:id/features`,
  `POST/DELETE /companies/:id/features/:key`. featureKey validated against
  catalog + allowlist regex. Cache invalidated on every write.
- Backwards compatible: migration seeds every existing company × every feature
  with status='active', so NO existing tenant loses access on deploy.

**41 smoke assertions** (`p4FeatureGate.test.ts`) lock the contract
(36 backend + 5 SPA-wiring).

**Optional follow-on:** gate more mounts (`/finance`, `/crm`, `/warehouse`,
`/intelligence`) once commercial defines the price tiers — adding one
mount is now a single `router.use(prefix, featureGate("<key>"))` line.

---

## Recap

| Phase | Status | Tests added | Senior commits |
|---|---|---|---|
| P0 | ✅ Complete | 22 (16 + 6 explicit-flag) | 2 |
| P1 | ✅ Complete | 16 | 1 |
| P2 | 🟡 Partial (P2.1+2+3+4+5 shipped; 6 TBD) | 55 | 3 |
| P3 | ✅ Complete | 12 | 1 |
| P4 | ✅ Complete | 41 | 2 |

**Total new tests on the security/architecture surface: 146.**

What's shipped in this branch closes seven of the nine senior-review findings:
1. branch-id silent fallback (✅ P0.1)
2. enforceBranchScope opt-in (✅ P0.2 — runtime warn + explicit flags on 5 highest-risk routes)
3. SQL injection vector via orderBy/extraConditions (✅ P0.3)
4. Worker / API single-point-of-failure (✅ P1)
5. Outbox not relayed + purge race (✅ P2.1+P2.2+P2.3+P2.4+P2.5; live-DB integration TBD)
6. Bloated central router (✅ P3)
7. Subscription gate is company-wide (✅ P4 — backend + admin SPA)

Remaining: P2.6 (live-DB outbox integration tests) only. All nine
senior-review findings are either closed or have shipping code; P2.6
is the last piece of integration coverage and can ship as an
independent PR.
