import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 TA-T18-07 — driver rest stamping on dispatch + navigation
 * completion. Closes TA-GAP-07 from `docs/transport-audit/18` and
 * pins the existing implementation so the rest-guard upstream
 * (PE-03 driverReadiness) reads a fresh `lastDutyEndedAt` regardless
 * of which path the driver took to end their trip.
 *
 * Two stamping sites must coexist and never regress:
 *
 *   1. Navigation/complete endpoint
 *      POST /transport/dispatch-orders/:id/navigation/complete
 *      (routes/transport-planning.ts) — fires when the driver ends
 *      their navigation session from the SPA cab UI.
 *
 *   2. Dispatch PATCH lifecycle (target = 'completed' | 'closed')
 *      PATCH /transport/dispatch-orders/:id
 *      (routes/transport-bookings.ts) — fires when the dispatcher
 *      flips the order to completed directly OR when the cascade
 *      lands there from the navigation flow.
 *
 * Both stamp the same column to NOW(); the double-write is harmless
 * (a later NOW() shortens apparent rest only, the safer direction)
 * and intentional — never trim either site to deduplicate.
 */

const apiSrc = join(import.meta.dirname!, "../../src");
const PLANNING = readFileSync(join(apiSrc, "routes/transport-planning.ts"), "utf8");
const BOOKINGS = readFileSync(join(apiSrc, "routes/transport-bookings.ts"), "utf8");

/* ── Navigation/complete stamping (path 1) ──────────────────── */

describe("#2079 TA-T18-07 — navigation/complete stamps lastDutyEndedAt", () => {
  it("transport-planning.ts has a navigation/complete handler", () => {
    expect(PLANNING).toMatch(/\/transport\/dispatch-orders\/:id\/navigation\/complete/);
  });

  it("the handler stamps fleet_drivers.lastDutyEndedAt = NOW()", () => {
    expect(PLANNING).toMatch(
      /UPDATE fleet_drivers[\s\S]{0,200}SET "lastDutyEndedAt" = NOW\(\)/,
    );
  });

  it("the stamp is keyed off the dispatch order's driverId (not the caller)", () => {
    expect(PLANNING).toMatch(/FROM transport_dispatch_orders d/);
    expect(PLANNING).toMatch(/fleet_drivers\.id = d\."driverId"/);
  });

  it("the comment makes the link to the rest-constraint engine explicit", () => {
    expect(PLANNING).toMatch(/rest-constraint engine|drives the rest/);
  });
});

/* ── Dispatch PATCH completed stamping (path 2) ─────────────── */

describe("#2079 TA-T18-07 — dispatch PATCH completed stamps lastDutyEndedAt", () => {
  it("transport-bookings.ts dispatch PATCH covers completed/closed/cancelled", () => {
    expect(BOOKINGS).toMatch(
      /target === "completed" \|\| target === "closed" \|\| target === "cancelled"/,
    );
  });

  it("on completed/closed the handler stamps fleet_drivers.lastDutyEndedAt = NOW()", () => {
    // The stamp lives inside the (completed || closed) inner branch
    // — cancelled deliberately does NOT stamp (a cancelled trip
    // never started, the driver hasn't been on duty).
    const block = BOOKINGS.slice(BOOKINGS.indexOf('target === "completed" || target === "closed" || target === "cancelled"'));
    expect(block.slice(0, 1200)).toMatch(/if \(target === "completed" \|\| target === "closed"\) \{/);
    expect(block.slice(0, 1200)).toMatch(/UPDATE fleet_drivers[\s\S]{0,200}SET "lastDutyEndedAt" = NOW\(\)/);
  });

  it("the stamp targets the dispatch order's driverId, scoped by company", () => {
    const block = BOOKINGS.slice(BOOKINGS.indexOf('target === "completed" || target === "closed" || target === "cancelled"'));
    expect(block.slice(0, 1500)).toMatch(/order\.driverId/);
    expect(block.slice(0, 1500)).toMatch(/scope\.companyId/);
  });

  it("the dispatch stamp runs inside the same withTransaction tx as the status update (atomic)", () => {
    // Both writes (status + stamp) live under the same `tx.query(...)`
    // — if either fails the dispatch transition rolls back.
    const block = BOOKINGS.slice(BOOKINGS.indexOf('target === "completed" || target === "closed" || target === "cancelled"'));
    expect(block.slice(0, 1500)).toMatch(/await tx\.query\(\s*`\s*UPDATE fleet_drivers/);
  });
});

/* ── Coexistence / regression boundary ──────────────────────── */

describe("#2079 TA-T18-07 — both paths coexist (no deduplication regression)", () => {
  it("neither file deletes the other's stamp", () => {
    // Each file must keep its own stamp. A future refactor that
    // routes everything through navigation/complete would silently
    // miss the dispatcher-driven completion path; this test refuses
    // that consolidation.
    const planningStamps = (PLANNING.match(/UPDATE fleet_drivers[\s\S]{0,200}lastDutyEndedAt/g) ?? []).length;
    const bookingsStamps = (BOOKINGS.match(/UPDATE fleet_drivers[\s\S]{0,200}lastDutyEndedAt/g) ?? []).length;
    expect(planningStamps).toBeGreaterThanOrEqual(1);
    expect(bookingsStamps).toBeGreaterThanOrEqual(1);
  });

  it("PE-03 driver readiness reads the column the two paths stamp", () => {
    const engine = readFileSync(
      join(apiSrc, "lib/fleet/assignmentSuggestionEngine.ts"),
      "utf8",
    );
    expect(engine).toMatch(/d\."lastDutyEndedAt"/);
  });
});

/* ── Boundary pins (no scope creep) ─────────────────────────── */

describe("#2079 TA-T18-07 — boundary intact (this PR is regression-pin only)", () => {
  it("the two route files modified by TA-T18-07 stay finance-blackout", () => {
    expect(PLANNING).not.toMatch(/financeJournalEngine|postingEngine|financialEngine/);
    expect(BOOKINGS).not.toMatch(/financeJournalEngine|postingEngine|financialEngine/);
  });
});
