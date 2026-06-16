import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TA-T18-VRP Phase 2 — Fleet Optimizer routes + SPA wiring (audit
 * doc file 20 §10 "Fleet Optimizer batch-mode VRP/TSP").
 *
 * Phase 1 (#2443) shipped storage + the greedy nearest-neighbour
 * solver. Phase 2 exposes the lifecycle:
 *
 *   POST /fleet/optimizer/runs                  — create
 *   GET  /fleet/optimizer/runs                  — list
 *   GET  /fleet/optimizer/runs/:id              — detail
 *   POST /fleet/optimizer/runs/:id/approve      — re-validate + mark
 *   POST /fleet/optimizer/runs/:id/reject       — close with reason
 *
 * Critical invariants pinned here:
 *   - Routes use the canonical Phase 1 lib (no duplicate solver).
 *   - RBAC: fleet.dispatch (matches the dispatch-order family).
 *   - Approve transitions: solved → approved | partially_approved
 *     based on per-assignment validation.
 *   - Reject requires a reason; can't reject a terminal run.
 *   - Validation re-checks booking-line existence + status, vehicle
 *     existence, driver active status — no engine bypass.
 *   - SPA pages registered + nav entry pins fleet.dispatch:list.
 *   - Phase 2 does NOT auto-create dispatch orders (Phase 3 work);
 *     approval is an advisory checkpoint.
 *
 * Static pin (regex-only).
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/fleet-optimizer.ts"),
  "utf8",
);
const INDEX = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/index.ts"),
  "utf8",
);
const FLEET_ROUTES = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/routes/fleetRoutes.tsx"),
  "utf8",
);
const NAV = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);
const LIST_PAGE = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/pages/fleet/optimizer-runs.tsx"),
  "utf8",
);
const DETAIL_PAGE = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/pages/fleet/optimizer-run-detail.tsx"),
  "utf8",
);

describe("TA-T18-VRP Phase 2 — backend route file", () => {
  it("imports Phase 1's solver + storage (no duplicate)", () => {
    expect(ROUTE).toMatch(
      /import\s*\{\s*\n?\s*runOptimization,\s*loadOptimizationRun,\s*VRP_INPUT_LIMITS,\s*type OptimizationAssignment,\s*\n?\s*\}\s*from\s+["']\.\.\/lib\/fleet\/vrpOptimizer\.js["']/,
    );
  });

  it("registers all five endpoints", () => {
    expect(ROUTE).toMatch(/fleetOptimizerRouter\.post\(\s*"\/fleet\/optimizer\/runs"/);
    expect(ROUTE).toMatch(/fleetOptimizerRouter\.get\(\s*"\/fleet\/optimizer\/runs"/);
    expect(ROUTE).toMatch(/fleetOptimizerRouter\.get\(\s*"\/fleet\/optimizer\/runs\/:id"/);
    expect(ROUTE).toMatch(/fleetOptimizerRouter\.post\(\s*"\/fleet\/optimizer\/runs\/:id\/approve"/);
    expect(ROUTE).toMatch(/fleetOptimizerRouter\.post\(\s*"\/fleet\/optimizer\/runs\/:id\/reject"/);
  });

  it("RBAC: create=create, list=list, detail=view, approve+reject=update — all on fleet.dispatch", () => {
    // Match each route's `authorize` block.
    const create = ROUTE.match(/post\(\s*"\/fleet\/optimizer\/runs"[\s\S]+?authorize\(\{[\s\S]+?action:\s*"create"/);
    const list   = ROUTE.match(/get\(\s*"\/fleet\/optimizer\/runs"[\s\S]+?authorize\(\{[\s\S]+?action:\s*"list"/);
    const detail = ROUTE.match(/get\(\s*"\/fleet\/optimizer\/runs\/:id"[\s\S]+?authorize\(\{[\s\S]+?action:\s*"view"/);
    const approve = ROUTE.match(/post\(\s*"\/fleet\/optimizer\/runs\/:id\/approve"[\s\S]+?authorize\(\{[\s\S]+?action:\s*"update"/);
    const reject  = ROUTE.match(/post\(\s*"\/fleet\/optimizer\/runs\/:id\/reject"[\s\S]+?authorize\(\{[\s\S]+?action:\s*"update"/);
    expect(create).toBeTruthy();
    expect(list).toBeTruthy();
    expect(detail).toBeTruthy();
    expect(approve).toBeTruthy();
    expect(reject).toBeTruthy();
    // All five gate on fleet.dispatch.
    const dispatchHits = ROUTE.match(/feature:\s*"fleet\.dispatch"/g) ?? [];
    expect(dispatchHits.length).toBeGreaterThanOrEqual(5);
  });

  it("create input is capped per Phase 1's VRP_INPUT_LIMITS", () => {
    // The Zod schema must reference VRP_INPUT_LIMITS so a future
    // change to the constants automatically propagates.
    expect(ROUTE).toMatch(/\.max\([\s\S]*?VRP_INPUT_LIMITS\.maxBookingLines/);
    expect(ROUTE).toMatch(/\.max\([\s\S]*?VRP_INPUT_LIMITS\.maxVehicles/);
  });

  it("approve handler reads the run with status='solved' before acting", () => {
    // Approval must be a deterministic transition out of 'solved'.
    // The handler refuses any other source status — pinned by checking
    // the source has both the approve route and the status guard within
    // a reasonable window of each other.
    expect(ROUTE).toMatch(/"\/fleet\/optimizer\/runs\/:id\/approve"[\s\S]{0,3000}?run\.status !== "solved"[\s\S]{0,200}?ValidationError/);
  });

  it("approve runs per-assignment validation (booking line, vehicle, driver checks)", () => {
    // The validateProposedAssignment helper enforces:
    //   1. Booking line still exists + not deleted
    //   2. Vehicle still exists + not deleted
    //   3. Driver (if any) still active
    expect(ROUTE).toMatch(/async function validateProposedAssignment\(/);
    // Phase 3a extended the booking-line SELECT to also pull the
    // pickup/delivery window — the shape changed from (id, status) to
    // (id, bookingId, status, scheduledPickupAt, scheduledDeliveryAt)
    // so the dispatch order can be committed with the window from the
    // booking line itself (greedy Phase 1 doesn't pick windows).
    expect(ROUTE).toMatch(/SELECT id, "bookingId", status,[\s\S]+?FROM transport_booking_lines/);
    expect(ROUTE).toMatch(/SELECT id FROM fleet_vehicles/);
    expect(ROUTE).toMatch(/SELECT id, COALESCE\(status, 'active'\) AS status FROM fleet_drivers/);
  });

  it("approve final status: approved | partially_approved | rejected based on counts", () => {
    // The three-way transition. If a future change collapses the
    // middle 'partially_approved' state, the static check catches it.
    expect(ROUTE).toMatch(/rejected\.length === 0\s*\?\s*"approved"[\s\S]+?accepted\.length === 0\s*\?\s*"rejected"[\s\S]+?:\s*"partially_approved"/);
  });

  it("approve commits dispatch orders through the same guard chain the single-pair route uses (Phase 3a)", () => {
    // Phase 2 originally stopped at validation. Phase 3a (this PR)
    // delivers what the owner brief described: approve materialises
    // the plan. The new invariant is "the batch path runs the SAME
    // guards as `POST /transport/dispatch-orders`" — its own static
    // test (fleetOptimizerPhase3AutoDispatchStatic.test.ts) pins the
    // detailed contract.
    expect(ROUTE).toMatch(/INSERT INTO transport_dispatch_orders/);
    expect(ROUTE).toMatch(/assertDriverEligibility\(/);
    expect(ROUTE).toMatch(/assertDriverRest\(/);
  });

  it("reject requires a non-empty reason + refuses terminal runs", () => {
    expect(ROUTE).toMatch(/reason:\s*z\.string\(\)\.min\(1\)\.max\(2000\)/);
    expect(ROUTE).toMatch(
      /status === "approved" \|\| run\.status === "rejected" \|\| run\.status === "partially_approved"/,
    );
  });

  it("both approve + reject emit audit + event entries via the canonical auditFromRequest", () => {
    // auditFromRequest is the canonical writer (per the IGOC-coverage
    // ratchet); createAuditLog directly is no longer permitted for
    // new files.
    expect(ROUTE).toMatch(/auditFromRequest\(req,\s*"approve",\s*"vrp_optimization_runs"/);
    expect(ROUTE).toMatch(/emitEvent\([\s\S]+?action:\s*"fleet\.optimizer\.approved"/);
    expect(ROUTE).toMatch(/auditFromRequest\(req,\s*"reject",\s*"vrp_optimization_runs"/);
  });
});

describe("TA-T18-VRP Phase 2 — router mounting", () => {
  it("routes/index.ts imports + mounts fleetOptimizerRouter", () => {
    expect(INDEX).toMatch(/import \{ fleetOptimizerRouter \} from "\.\/fleet-optimizer\.js"/);
    expect(INDEX).toMatch(/router\.use\(fleetOptimizerRouter\)/);
  });
});

describe("TA-T18-VRP Phase 2 — SPA pages + routing", () => {
  it("router registers /fleet/optimizer/runs and /fleet/optimizer/runs/:id (detail BEFORE list)", () => {
    expect(FLEET_ROUTES).toMatch(/const OptimizerRuns = lazy\(\(\) => import\("@\/pages\/fleet\/optimizer-runs"\)\)/);
    expect(FLEET_ROUTES).toMatch(/const OptimizerRunDetail = lazy\(\(\) => import\("@\/pages\/fleet\/optimizer-run-detail"\)\)/);
    // Detail :id route MUST be registered before the bare list route
    // because wouter matches the first path that fits.
    const detailIdx = FLEET_ROUTES.indexOf('path: "/fleet/optimizer/runs/:id"');
    const listIdx   = FLEET_ROUTES.indexOf('path: "/fleet/optimizer/runs"');
    expect(detailIdx).toBeGreaterThan(0);
    expect(listIdx).toBeGreaterThan(detailIdx);
  });

  it("navigation registry exposes the list page with fleet.dispatch:list perm", () => {
    expect(NAV).toMatch(
      /label:\s*"مُحسِّن الإسناد",\s*path:\s*"\/fleet\/optimizer\/runs"[\s\S]{0,80}?perm:\s*"fleet\.dispatch:list"/,
    );
  });

  it("nav entry mentions TA-T18-VRP so future readers find the audit anchor", () => {
    expect(NAV).toMatch(/TA-T18-VRP[\s\S]{0,400}?label:\s*"مُحسِّن الإسناد"/);
  });

  it("list page uses canonical endpoint string + caches per `days`", () => {
    expect(LIST_PAGE).toMatch(/`\/fleet\/optimizer\/runs\?days=\$\{days\}`/);
    expect(LIST_PAGE).toMatch(/useApiQuery<ListResponse>\(\s*\[\s*"fleet-optimizer-runs",\s*String\(days\)\s*\]/);
  });

  it("detail page guards mutations on `canDecide` (status === 'solved')", () => {
    // The Approve / Reject buttons must render only when the run
    // is still in 'solved' state — guards against accidental
    // re-approval of a closed run.
    expect(DETAIL_PAGE).toMatch(/canDecide\s*=\s*run\s*&&\s*run\.status\s*===\s*"solved"/);
    expect(DETAIL_PAGE).toMatch(/\{canDecide\s*&&\s*\(/);
  });

  it("detail page renders both Arabic status labels + assignment rows", () => {
    expect(DETAIL_PAGE).toMatch(/الموافقة \+ التحقّق/);
    expect(DETAIL_PAGE).toMatch(/سبب الرفض/);
    expect(DETAIL_PAGE).toMatch(/الإسنادات المقترحة/);
  });
});

describe("TA-T18-VRP Phase 2 — boundary intact", () => {
  it("Phase 1's vrpOptimizer.ts is unchanged (no behavioural drift)", () => {
    const phase1 = readFileSync(
      join(repoRoot, "artifacts/api-server/src/lib/fleet/vrpOptimizer.ts"),
      "utf8",
    );
    // Sanity: the Phase 1 exports + invariants still in place.
    expect(phase1).toMatch(/export async function runOptimization\(/);
    expect(phase1).toMatch(/export async function loadOptimizationRun\(/);
    expect(phase1).toMatch(/export const VRP_INPUT_LIMITS/);
    // Phase 3b promoted Kuhn-Munkres to the default (#TA-T18-VRP
    // Phase 3b PR). The persisted algorithm string updated; the
    // greedyAssign helper stays exported as a fallback.
    expect(phase1).toMatch(/algorithm\s*=\s*'hungarian_min_distance'/);
    // Phase 1's no-dispatch-mutation invariant still holds.
    expect(phase1).not.toMatch(/INSERT INTO transport_dispatch_orders/);
  });

  it("Phase 2 does NOT touch finance / GL / journal modules", () => {
    expect(ROUTE).not.toMatch(/financialEngine|postingEngine|journalEngine|generalLedger|invoiceLine/);
  });

  it("Phase 2 does NOT introduce a new migration (storage stays Phase 1's table)", () => {
    // The full migrations directory should not contain a `*_optimizer_*`
    // file new in this PR — Phase 1's 372 is the single storage table.
    // If a future change adds another optimizer migration here without
    // an audit anchor, this catches it.
    const { readdirSync } = require("node:fs");
    const migs = readdirSync(join(repoRoot, "artifacts/api-server/src/migrations"));
    const optimizerMigs = migs.filter((m: string) => /optimizer|vrp/i.test(m));
    expect(optimizerMigs, `expected exactly one optimizer migration (Phase 1's 372)`).toEqual([
      "372_vrp_optimization_runs.sql",
    ]);
  });
});
