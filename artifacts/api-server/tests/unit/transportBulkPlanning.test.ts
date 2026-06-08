import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 follow-up — bulk planning. Closes the "from source to
// execution" loop: after materializing bookings from an umrah group
// (PR #1821), the operator can press one button to run
// AssignmentSuggestionEngine on each booking and create dispatch
// orders for the top non-blocked candidates.

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const ROUTER = readApi("routes/transport-integration.ts");
const SPA_PAGE = readSpa("pages/fleet/transport-integration.tsx");

describe("#1812 — bulk planning endpoint", () => {
  it("exposes POST /transport/integration/plan-bookings", () => {
    expect(ROUTER).toMatch(/\.post\(\s*"\/transport\/integration\/plan-bookings"/);
  });

  it("uses the AssignmentSuggestionEngine + creates dispatch orders", () => {
    expect(ROUTER).toContain('from "../lib/fleet/assignmentSuggestionEngine.js"');
    expect(ROUTER).toContain("suggestAssignments");
    expect(ROUTER).toMatch(/INSERT INTO transport_dispatch_orders/);
  });

  it("skips bookings that already have a dispatch order", () => {
    expect(ROUTER).toContain("existingDispatchOrders");
    expect(ROUTER).toMatch(/يوجد أمر توزيع مرتبط/);
  });

  it("creates a synthetic booking_line when missing (createMissingLines default true)", () => {
    expect(ROUTER).toContain("createMissingLines");
    expect(ROUTER).toMatch(/INSERT INTO transport_booking_lines/);
  });

  it("classifies each result into 5 outcomes (planned/needs_attention/no_candidate/no_line/skipped)", () => {
    for (const o of ["planned", "needs_attention", "no_candidate", "no_line", "skipped"]) {
      expect(ROUTER, `outcome ${o} missing`).toContain(`"${o}"`);
    }
  });

  it("rejects candidates with HARD blockers + below minScore threshold (default 60)", () => {
    expect(ROUTER).toMatch(/c\.blockers\.length > 0\)\s*continue/);
    expect(ROUTER).toMatch(/c\.score < minScore\)\s*continue/);
    expect(ROUTER).toMatch(/b\.minScore \?\? 60/);
  });

  it("cross-batch dedup: skips claimed (vehicle | driver) windows from earlier bookings in same batch", () => {
    expect(ROUTER).toContain("claimedVehicleWindows");
    expect(ROUTER).toContain("claimedDriverWindows");
    expect(ROUTER).toMatch(/vehicleClaimed|overlaps\(/);
    // After a successful pick, the claim is recorded for subsequent
    // bookings in the same batch.
    expect(ROUTER).toMatch(/claimedVehicleWindows\.push/);
    expect(ROUTER).toMatch(/claimedDriverWindows\.push/);
  });

  it("requests 10 candidates to have alternates when the top is already claimed", () => {
    expect(ROUTER).toMatch(/limit: 10/);
  });

  it("surfaces a distinct reason when all candidates are batch-claimed", () => {
    expect(ROUTER).toMatch(/كل المرشحين المؤهلين محجوزون لحجز آخر في نفس الدفعة/);
  });

  it("flips the booking_line status to dispatched on success", () => {
    expect(ROUTER).toMatch(/UPDATE transport_booking_lines[\s\S]{0,200}status = 'dispatched'/);
  });

  it("emits fleet.dispatch.created event with autoPlanned: true", () => {
    expect(ROUTER).toContain("fleet.dispatch.created");
    expect(ROUTER).toMatch(/autoPlanned: true/);
  });

  it("returns a summary object with all 6 counters", () => {
    for (const k of ["total", "planned", "needsAttention", "noCandidate", "noLine", "skipped"]) {
      expect(ROUTER, `summary.${k} missing`).toContain(`${k}:`);
    }
  });

  it("body schema enforces 1..50 bookingIds", () => {
    expect(ROUTER).toContain("planBookingsSchema");
    expect(ROUTER).toMatch(/z\.array[\s\S]{0,80}\.min\(1\)\.max\(50\)/);
  });
});

describe("#1812 — bulk planning SPA wiring", () => {
  it("integration page calls /plan-bookings after materialization", () => {
    expect(SPA_PAGE).toContain("/transport/integration/plan-bookings");
    expect(SPA_PAGE).toContain("runBulkPlanning");
  });

  it("auto-triggers planning after umrah materialization (with confirm)", () => {
    expect(SPA_PAGE).toMatch(/createdIds\.length > 0[\s\S]{0,200}runBulkPlanning/);
    expect(SPA_PAGE).toMatch(/التخطيط الفوري/);
  });

  it("shows planning summary in toast (planned / needsAttention / total)", () => {
    expect(SPA_PAGE).toMatch(/تم تخطيط/);
    expect(SPA_PAGE).toMatch(/needsAttention/);
    expect(SPA_PAGE).toMatch(/يحتاج تدخلاً يدوياً/);
  });
});
