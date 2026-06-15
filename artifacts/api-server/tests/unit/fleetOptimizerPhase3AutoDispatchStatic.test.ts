import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TA-T18-VRP Phase 3a — auto-dispatch on approval.
 *
 * Phase 1 (#2443) shipped storage + greedy solver. Phase 2 (#2455)
 * exposed the lifecycle but stopped at validation. Phase 3a (this
 * PR) completes the loop: approve now creates the real
 * `transport_dispatch_orders` rows through the SAME hard-guard chain
 * `POST /transport/dispatch-orders` enforces.
 *
 * Critical invariants pinned here:
 *   1. The batch path calls the canonical guards
 *      (assertDriverEligibility + assertDriverRest + conflict probe)
 *      — no engine bypass.
 *   2. The window comes from `transport_booking_lines.scheduledPickupAt
 *      / scheduledDeliveryAt`, NOT from the solver (the greedy
 *      Phase 1 solver doesn't pick windows).
 *   3. Batch path uses overrideReason=null — batch must clear every
 *      hard guard cleanly. Override-needing assignments go through
 *      the single-pair path where the audit is explicit.
 *   4. Per-assignment failures are CAUGHT and recorded — one bad
 *      row never breaks the batch.
 *   5. Same `fleet.dispatch.created` event the single-pair path
 *      emits, so downstream listeners (notifications, GL,
 *      telematics) see the new orders identically.
 *   6. Three-way outcome (approved | partially_approved | rejected)
 *      reflects DISPATCH success counts, not just validation counts.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/fleet-optimizer.ts"),
  "utf8",
);

describe("TA-T18-VRP Phase 3a — auto-dispatch on approval", () => {
  it("imports the canonical guards (assertDriverEligibility + assertDriverRest)", () => {
    expect(ROUTE).toMatch(
      /import\s*\{\s*assertDriverEligibility\s*\}\s*from\s+["']\.\.\/lib\/fleet\/driverEligibility\.js["']/,
    );
    expect(ROUTE).toMatch(
      /import\s*\{\s*assertDriverRest\s*\}\s*from\s+["']\.\.\/lib\/fleet\/driverRest\.js["']/,
    );
  });

  it("validation reads scheduledPickupAt/DeliveryAt from the booking line (snapshot)", () => {
    // The window MUST come from the booking line, not the solver,
    // because the greedy Phase 1 solver doesn't pick windows.
    expect(ROUTE).toMatch(
      /SELECT id, "bookingId", status,\s*\n\s*"scheduledPickupAt", "scheduledDeliveryAt"/,
    );
  });

  it("validation refuses booking lines without a pickup/delivery window", () => {
    // Without a window, the dispatch order can't be created.
    expect(ROUTE).toMatch(
      /!line\.scheduledPickupAt\s*\|\|\s*!line\.scheduledDeliveryAt[\s\S]{0,200}?reason:\s*"سطر الحجز لا يحمل نافذة pickup\/delivery/,
    );
  });

  it("validation refuses driverId=null assignments (greedy may emit one; dispatch can't)", () => {
    expect(ROUTE).toMatch(
      /args\.assignment\.driverId\s*==\s*null[\s\S]{0,200}?reason:\s*"الإسناد بلا سائق/,
    );
  });

  it("validation returns the AssignmentSnapshot (line + booking + window) on success", () => {
    expect(ROUTE).toMatch(/return\s*\{\s*\n?\s*ok:\s*true,\s*\n?\s*snapshot:\s*\{/);
    expect(ROUTE).toMatch(/lineId:\s*line\.id/);
    expect(ROUTE).toMatch(/bookingId:\s*line\.bookingId/);
    expect(ROUTE).toMatch(/scheduledStartAt:\s*line\.scheduledPickupAt/);
    expect(ROUTE).toMatch(/scheduledEndAt:\s*line\.scheduledDeliveryAt/);
  });

  it("createDispatchOrderFromAssignment exists + runs the three-guard chain", () => {
    expect(ROUTE).toMatch(/async function createDispatchOrderFromAssignment\(/);
    // Same guards as POST /transport/dispatch-orders.
    expect(ROUTE).toMatch(/await assertDriverEligibility\(\{/);
    expect(ROUTE).toMatch(/await assertDriverRest\(\{/);
    // Conflict probe SQL — both driver + vehicle overlap with tstzrange.
    expect(ROUTE).toMatch(/tstzrange\("scheduledStartAt", "scheduledEndAt", '\[\)'\)[\s\S]+?tstzrange\(\$3::timestamptz, \$4::timestamptz, '\[\)'\)/);
  });

  it("createDispatchOrderFromAssignment uses overrideReason=null — batch path must clear every guard", () => {
    // Batch approvals must NEVER carry overrideReason — that's the
    // single-pair path's job where the audit is explicit. The
    // explanatory comment + both literal `overrideReason: null`
    // sites (eligibility + rest) are the proof.
    // Comment + first `overrideReason: null` site appear within a
    // generous proximity (the explanatory comment sits right above
    // the try-block that issues the eligibility call).
    expect(ROUTE).toMatch(
      /Phase 3a does NOT allow overrideReason via the batch path[\s\S]{0,1200}?overrideReason:\s*null/,
    );
    const overrideHits = ROUTE.match(/overrideReason:\s*null/g) ?? [];
    expect(overrideHits.length, "expected ≥ 2 `overrideReason: null` in the batch path (eligibility + rest)").toBeGreaterThanOrEqual(2);
  });

  it("createDispatchOrderFromAssignment catches errors per assignment — one bad row doesn't break the batch", () => {
    // The body wraps in try/catch + returns {ok:false, reason: msg} on err.
    expect(ROUTE).toMatch(/try\s*\{[\s\S]+?await assertDriverEligibility[\s\S]+?\}\s*catch \(err\)\s*\{[\s\S]+?return\s*\{\s*ok:\s*false,\s*reason:\s*msg\s*\}/);
  });

  it("the INSERT carries source='fleet_optimizer_batch_approval' in the event details", () => {
    // Downstream listeners (notifications, GL, telematics) see the
    // batch-path provenance so they can filter/audit if needed.
    expect(ROUTE).toMatch(/source:\s*"fleet_optimizer_batch_approval"/);
  });

  it("approve loop calls validation → createDispatch in order, recording per-row outcomes", () => {
    // The loop structure must be: for each assignment, validate; if
    // valid, try to create; record accepted/rejected per outcome.
    expect(ROUTE).toMatch(/for \(const assignment of assignments\)/);
    expect(ROUTE).toMatch(/await validateProposedAssignment\(/);
    expect(ROUTE).toMatch(/await createDispatchOrderFromAssignment\(/);
    // accepted entries now carry both bookingLineId AND dispatchOrderId.
    expect(ROUTE).toMatch(/bookingLineId:\s*assignment\.bookingLineId,\s*\n?\s*dispatchOrderId:\s*result\.dispatchOrderId/);
  });

  it("approve event + audit carry the created dispatchOrderIds", () => {
    expect(ROUTE).toMatch(/dispatchOrderIds:\s*accepted\.map\(\(a\)\s*=>\s*a\.dispatchOrderId\)/);
  });

  it("approve response shape: { status, accepted, rejected } (FE consumes both arrays)", () => {
    expect(ROUTE).toMatch(/res\.json\(\s*\{\s*data:\s*\{\s*status:\s*finalStatus,\s*accepted,\s*rejected\s*\}\s*\}\s*\)/);
  });

  it("the existing single-pair POST /transport/dispatch-orders route is NOT modified", () => {
    // Defence-in-depth: Phase 3a adds a parallel batch path. The
    // single-pair route remains the authoritative path for individual
    // dispatcher actions. A future refactor can DRY them up.
    const bookings = readFileSync(
      join(repoRoot, "artifacts/api-server/src/routes/transport-bookings.ts"),
      "utf8",
    );
    // Sanity: the single-pair route still has its own guard chain.
    expect(bookings).toMatch(/transportBookingsRouter\.post\(\s*"\/transport\/dispatch-orders"/);
    expect(bookings).toMatch(/await assertDriverEligibility\(\{/);
    expect(bookings).toMatch(/await assertDriverRest\(\{/);
  });
});

describe("TA-T18-VRP Phase 3a — boundary intact", () => {
  it("Phase 1 + Phase 2 surface unchanged", () => {
    // The optimizer lib + the storage migration are NOT touched.
    const phase1 = readFileSync(
      join(repoRoot, "artifacts/api-server/src/lib/fleet/vrpOptimizer.ts"),
      "utf8",
    );
    expect(phase1).toMatch(/export async function runOptimization\(/);
    // Phase 3b promoted Kuhn-Munkres to the default; the persisted
    // algorithm string updated. greedyAssign stays exported as a fallback.
    expect(phase1).toMatch(/algorithm\s*=\s*'hungarian_min_distance'/);
    // Phase 1 still doesn't touch dispatch orders directly.
    expect(phase1).not.toMatch(/INSERT INTO transport_dispatch_orders/);
  });

  it("no new migration in Phase 3a (the storage stays Phase 1's table)", () => {
    const { readdirSync } = require("node:fs");
    const migs = readdirSync(join(repoRoot, "artifacts/api-server/src/migrations"));
    const optimizerMigs = migs.filter((m: string) => /optimizer|vrp/i.test(m));
    expect(optimizerMigs).toEqual(["372_vrp_optimization_runs.sql"]);
  });

  it("no finance / GL / journal touch", () => {
    expect(ROUTE).not.toMatch(/financialEngine|postingEngine|journalEngine|generalLedger|invoiceLine/);
  });
});
