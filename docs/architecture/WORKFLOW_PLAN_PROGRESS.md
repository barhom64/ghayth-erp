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

**P0.2 remaining work (out of scope for the security commit):**
Full migration of 117 callsites across 38 route files to explicit
`enforceBranchScope` or `disableBranchScope`. The runtime warn now fires in
production logs every time the default is used by a scoped user — ops can
grep + ratchet incrementally. Estimated effort: 1-2 days, can be sequenced as
small per-route PRs without breaking anything.

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

| # | Task | Status | Commit |
|---|---|---|---|
| P2.1 | `outboxRelay.ts` daemon | ⬜ TODO | — |
| P2.2 | dedupe key on `event_outbox` | ⬜ TODO | — |
| P2.3 | dead-letter table + dashboard | ⬜ TODO | — |
| P2.4 | `OUTBOX_RELAY_ACTIVE` feature flag | ⬜ TODO | — |
| **P2.5** | **`purgeAgedOutboxEntries` status-aware** | ✅ **Fixed** | (pending) |
| P2.6 | integration tests | ⬜ TODO | — |

**P2.5 is shipped early as a foundation:** the purge now filters
`status IN ('processed', 'dead')` so a future relay can flip on without
the same PR also having to remember to fix the purge. Until the relay lands
the in-process emitter remains the dispatcher and outbox rows are still
written but never marked `processed` — so they accumulate. Increase
`OUTBOX_RETENTION_DAYS` if you don't want to flip the relay on yet.

**P2 estimated remaining effort:** 2-3 weeks for one senior. The relay
itself, dedupe semantics, dead-letter promotion, and rollback testing are
all genuinely net-new work.

---

## P3 — Modularise the central router ⬜ NOT STARTED

Closes finding #4 (`routes/index.ts` is a 529-line monolith with 120
`router.use()` calls).

| # | Task | Status |
|---|---|---|
| P3.1 | Per-domain `{ basePath, router, middlewares?, subscriptionFeature? }` contract | ⬜ TODO |
| P3.2 | Central `routes/index.ts` becomes a thin discoverer | ⬜ TODO |
| P3.3 | smoke tests | ⬜ TODO |

**Estimated effort:** 1-2 weeks. Mostly mechanical — every existing
`router.use(path, mwOpt, router)` line becomes a manifest entry, then the
old file is gutted.

---

## P4 — Per-route subscription gates ⬜ NOT STARTED

Closes finding #5 (subscription gate is company-wide, not "sell each route
independently").

| # | Task | Status |
|---|---|---|
| P4.1 | `subscription_products` + `subscription_features` tables | ⬜ TODO |
| P4.2 | `company_subscription_features` per-feature tracking | ⬜ TODO |
| P4.3 | `featureGate(featureKey)` middleware | ⬜ TODO |
| P4.4 | existing `subscriptionGate` becomes whole-company-only safety net | ⬜ TODO |
| P4.5 | Admin UI for per-feature toggling | ⬜ TODO |

**Estimated effort:** 2-3 weeks. Largest remaining piece — touches DB
schema, every authorize() call site, and a brand-new admin UI surface.
**Hard dependency on P3** (manifest-based router) — without per-route
metadata declared in one place, wiring features to routes is per-file
boilerplate.

---

## Recap

| Phase | Status | Tests added | Senior commits |
|---|---|---|---|
| P0 | ✅ Complete | 16 | 1 |
| P1 | ✅ Complete | 16 | 1 |
| P2 | 🟡 Partial (P2.5 only) | 4 | (with P1) |
| P3 | ⬜ Not started | — | — |
| P4 | ⬜ Not started | — | — |

**Total new tests on the security/architecture surface: 36.**

What's shipped in this branch closes the four highest-risk findings:
1. branch-id silent fallback (✅ P0.1)
2. SQL injection vector via orderBy/extraConditions (✅ P0.3)
3. Worker / API single-point-of-failure (✅ P1)
4. Outbox purge race that would erupt the moment a relay lands (✅ P2.5)

P2 (relay), P3 (router), P4 (per-route subs) remain as named follow-up phases.
Each can ship as an independent PR without conflicting with the others.
