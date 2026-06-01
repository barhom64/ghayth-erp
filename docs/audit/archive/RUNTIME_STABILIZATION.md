# Runtime Stabilization Program — Operator Runbook

> This document describes how to execute Phases 2-4 of the Runtime
> Stabilization Program. Phase 1 (instrumentation) shipped as PRs
> #693 → #696 and the harness now captures the data the runbook
> below interprets. The operator is the one who runs the experiments
> and acts on the verdict — the harness only reports.

## TL;DR

```bash
# 1. Establish a clean baseline (no flags, default config)
node scripts/src/runtime-verify.cjs

# 2. Read VERDICT block — three signals decide what to do next:
#      - exit code
#      - summary.instrumentation.firstFailureIdx
#      - summary.instrumentation.memoryDeltaRss / fdDelta /
#        browserPagesPeak vs browserPagesFinal
#      - summary.instrumentation.{health,frontend}LatencyP95Ms

# 3. If DEGRADED or unexpected FAIL → run the triangulation matrix
#      (Phase 2 below). Otherwise → declare BASELINE.

# 4. After any harness fix, re-run step 1 + tarball comparison.
```

## Verdict semantics (`runtime-verify.cjs`)

| Verdict | Meaning | Exit code |
|---|---|---|
| **PASS** | Clean run + no a4 failures in `authz` / `auth` categories | 0 |
| **FAIL** | Real app failures (a4 failures with category in `FAIL_ON`) | 5 |
| **DEGRADED** | Audit script crashed or summary.json missing | 2 |
| _(lock contention)_ | Another audit run holds the pidfile | 3 |
| _(health timeout)_ | `/api/healthz` never came back in `AUDIT_HEALTH_TIMEOUT` sec | 4 |

**Override the fail policy via `FAIL_ON=authz,auth,harness,unknown`** if you want categories other than the default `authz,auth` to fail the run.

## Phase 2 — Triangulation Matrix

The harness now ships four orthogonal knobs. Run the baseline first, then **only run the additional combos if the baseline doesn't pass**. Each combo is a hypothesis test; whichever combo brings the audit back to clean isolates the root cause.

### Knobs (all default OFF)

| Env | Default | What it does |
|---|---|---|
| `BATCH_SIZE` | `50` | Route count per process. Lower = isolates resource exhaustion at scale. |
| `ALL` | unset | `1` = walk all routes in one process (no batching). |
| `REVERSE_ORDER` | unset | `1` = walk routes in reverse. Tests **position vs identity** of failures. |
| `BROWSER_RECYCLE_EVERY` | `0` | `N` = close + re-open puppeteer Page every N routes. Tests **DOM / listener residue**. |
| `SAMPLE_EVERY_N_ROUTES` | `10` | How often `sampleRuntimeMetrics()` polls memory / fd / health / frontend. |

### Matrix

| # | Run | What it isolates |
|---|---|---|
| 1 | `node scripts/src/runtime-verify.cjs` (defaults) | **Baseline.** Required first. |
| 2 | `ALL=1 node scripts/src/runtime-verify.cjs` | Whole-app run. Confirms baseline scales to the full route set. |
| 3 | `REVERSE_ORDER=1 ALL=1 node scripts/src/runtime-verify.cjs` | If reversal moves failures to a different `firstFailureIdx`, cause is **positional** (chromium starvation, late-batch GC), not the route. |
| 4 | `BROWSER_RECYCLE_EVERY=25 ALL=1 node scripts/src/runtime-verify.cjs` | If recycle clears failures, cause is **page-level residue** (DOM listeners, modal popups, accumulated workers). |
| 5 | `BROWSER_RECYCLE_EVERY=50 ALL=1 node scripts/src/runtime-verify.cjs` | Confirms how aggressive the recycle needs to be. |
| 6 | `REVERSE_ORDER=1 BROWSER_RECYCLE_EVERY=25 ALL=1` | Joint hypothesis — should pass if either (3) or (4) does. |
| 7 | `BATCH_SIZE=50` (default, batched) | If only the batched run passes, it's **scale-related resource exhaustion**. |
| 8 | `SAMPLE_EVERY_N_ROUTES=5 ALL=1` | Tighter sampling — for forensic runs where you want more data points. |

### Decision tree

```
baseline VERDICT?
├── PASS                          → done; declare BASELINE.
├── DEGRADED                      → check summary.json exists. If yes,
│                                   read the audit exit code in console
│                                   (line `[verify] audit exited code=`).
│                                   Most common cause: a harness-side
│                                   crash; check stderr for traces and
│                                   the metrics-block region of
│                                   runtime-audit.cjs for a new symbol
│                                   that's used-but-not-declared
│                                   (apiRestartCount pattern).
└── FAIL with real-failure count > 0
    ├── firstFailureRoute consistent across runs (2)..(7)
    │   → REAL APP REGRESSION at that path. Open issue, fix at app
    │     level (Phase 3 type "app route").
    ├── recycle (4) flips FAIL → PASS, baseline FAIL
    │   → PAGE-LEVEL RESIDUE. Apply Phase 3 fix template "Chromium /
    │     Puppeteer cleanup" (close pages reliably, remove listeners
    │     between routes, isolate sessions).
    ├── reverse (3) moves failure cluster
    │   → POSITIONAL / TEMPORAL. Apply Phase 3 fix template "Vite /
    │     HMR" (production preview mode) or "Chromium" (recycle).
    ├── small batch (7) passes, ALL (2) fails
    │   → RESOURCE EXHAUSTION AT SCALE. Look at memoryDeltaRss + fdDelta
    │     in the failing run; growth > 200MB / 50 fd points at a
    │     harness leak (Phase 3 fix template).
    └── healthFailSamples > 0 OR apiServerRestartsDetected > 0
        → API / DB POOL EXHAUSTION. Check api-server logs for OOMs or
          pool-exhausted errors. Phase 3 fix template "API / DB pool".
```

## Phase 3 — Fix templates

Each template here is intentionally small. Apply only one cause per PR (cluster-by-cluster pattern matching #670 / #683).

### A. Chromium / Puppeteer

When: recycle (matrix #4) flips FAIL → PASS, OR `browserPagesPeak >> browserPagesFinal`.

```js
// Before each route:
page.removeAllListeners("response");
page.removeAllListeners("console");
page.removeAllListeners("pageerror");
page.removeAllListeners("framenavigated");

// After each route, dispose any modal/iframe targets:
const targets = await page.target().browser().targets();
for (const t of targets.filter((t) => t.type() === "page" && t !== page.target())) {
  try { await (await t.page())?.close(); } catch { /* gone */ }
}

// Bound the recycle interval (already done — operator env-tunable).
```

### B. Vite / HMR

When: reverse (matrix #3) shifts failure cluster + frontendLatencyP95Ms >> healthLatencyP95Ms.

```bash
# Run audit against a production preview (no HMR):
pnpm --filter @workspace/ghayth-erp build
pnpm --filter @workspace/ghayth-erp serve  &     # vite preview on different port
BASE_URL=http://localhost:4173 node scripts/src/runtime-verify.cjs
```

Or — env-gate HMR-only behaviour in the dev server when audit is detected.

### C. API / DB pool

When: `healthFailSamples > 0` or `apiServerRestartsDetected > 0` or frequent 5xx in `failures.json:api4xx`.

- Add `/api/healthz` deep-check that reports pool stats (`active`, `idle`, `waiting`).
- Audit harness already polls `/healthz` every `SAMPLE_EVERY_N_ROUTES` — if you add fields, they land in `instrumentation.json`.
- Fix at api-server: bump pool size, add connection lifecycle logging, look for unclosed transactions in the failing route's handler.

### D. App route regression

When: `firstFailureRoute` is consistent across matrix rows.

- Open a regular `bug` issue with the route, the `navTraceLastLabel` (from `failures.json`), and the `categoryHistogram` entry.
- Fix at the narrowest scope (route loader, RBAC entry, page mount effect) — no broad refactor.

### E. Harness cleanup

When: DEGRADED with `summary.json` missing or `[verify] audit exited code=`non-zero with no real failures.

- Look for the kind of bug PR #693 fixed: a symbol used in the metrics block but never declared. The metrics block currently runs after the route loop; any ReferenceError there kills the entire pack write.
- `node --check scripts/src/runtime-audit.cjs` catches typos but NOT used-but-undeclared symbols (the parser is happy; only runtime trips).
- Cheap insurance: when adding a new symbol to the metrics block, also add a static reference check to `runtime-audit-instrumentation.test.cjs`.

## Phase 4 — Verify

After **any** harness or app fix:

1. `node scripts/src/runtime-verify.cjs` (baseline).
2. If clean → `ALL=1 node scripts/src/runtime-verify.cjs` (full).
3. Compare `summary.instrumentation` deltas vs the previous tarball:
   - `memoryDeltaRss` should not grow > 10% per run.
   - `browserPagesFinal` should equal `browserPagesPeak` (or be a small fraction).
   - `apiServerRestartsDetected` should be 0.
   - `firstFailureIdx` should be `-1`.
4. Attach the tarball path (`OUT_DIR/<run-id>.tar.gz` or `OUT_DIR/latest.tar.gz`) to the PR / commit / issue you're claiming the fix on.

## Phase 5 — Declaring BASELINE

A run earns the **BASELINE** label only when ALL of the following hold:

- [ ] `runtime-verify.cjs` exit code = 0 (VERDICT = PASS).
- [ ] `summary.json` exists with `counts.fail == 0`.
- [ ] `histogram.json` exists with `categoryHistogram.{authz,auth}` both 0.
- [ ] `failures.json` exists with `count == 0`.
- [ ] `timings.json` exists with `metrics.maxMs < 30000` (no 30s+ outlier).
- [ ] `instrumentation.json` exists with:
  - `memoryDeltaRss < 200_000_000` (no 200MB growth)
  - `fdDelta < 100` (no 100-fd creep)
  - `browserPagesFinal <= browserPagesPeak * 1.5` (recovery works)
  - `apiServerRestartsDetected == 0`
  - `firstFailureIdx == -1`
- [ ] Tarball exists at `OUT_DIR/<run-id>.tar.gz`.

Anything less is a tracked **DEGRADED-improved** state — document the remaining gap in the run notes and link the next-step PR.

## Common pitfalls

- **Don't raise `AUDIT_HEALTH_TIMEOUT`** to dodge a timeout. The whole point is that the health-check should be < 1s; if it isn't, that's the cause.
- **Don't disable checks** in the audit script. Real failures hiding behind disabled checks compound silently.
- **Don't skip the matrix.** A baseline-only run gives one data point; the matrix turns one data point into a diagnosis.
- **Don't apply fixes from multiple templates in one PR.** Cluster-by-cluster (see #670 / #683 for the cadence).

## Why this runbook exists

The Runtime Stabilization mandate (Phase 5):
> "نفّذ التشخيص أولًا، ثم الإصلاح المنهجي المناسب، ثم التحقق."

The harness now captures the data. This document captures **what to do with the data**. Future operators don't need to re-derive the diagnostic flow each time a regression appears.

---

Generated alongside PR #696 (Phase 1 instrumentation completion). Maintained as the source of truth for Phase 2-4 execution; update when new instrumentation knobs or fix templates are added.
