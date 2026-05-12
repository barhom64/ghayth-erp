import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const FLEET_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/fleet.ts"), "utf8");

// ─── Fleet Golden Path Tests ───────────────────────────────────────────────
// P4.4 — Lock in fleet domain lifecycle contracts: vehicles, trips,
// maintenance, drivers, violations.

describe("Fleet route structure", () => {
  it("vehicle CRUD endpoints exist", () => {
    expect(FLEET_ROUTE).toContain('router.get("/vehicles"');
    expect(FLEET_ROUTE).toContain('router.post("/vehicles"');
    expect(FLEET_ROUTE).toContain('router.patch("/vehicles/:id"');
    expect(FLEET_ROUTE).toContain('router.delete("/vehicles/:id"');
  });

  it("driver CRUD endpoints exist", () => {
    expect(FLEET_ROUTE).toContain('router.get("/drivers"');
    expect(FLEET_ROUTE).toContain('router.post("/drivers"');
    expect(FLEET_ROUTE).toContain('router.patch("/drivers/:id"');
    expect(FLEET_ROUTE).toContain('router.delete("/drivers/:id"');
  });

  it("trip CRUD and lifecycle endpoints exist", () => {
    expect(FLEET_ROUTE).toContain('router.get("/trips"');
    expect(FLEET_ROUTE).toContain('router.post("/trips"');
    expect(FLEET_ROUTE).toContain('router.patch("/trips/:id"');
    expect(FLEET_ROUTE).toContain('router.delete("/trips/:id"');
    expect(FLEET_ROUTE).toContain('"/trips/:id/complete"');
    expect(FLEET_ROUTE).toContain('"/trips/:id/cancel"');
  });

  it("maintenance CRUD and lifecycle endpoints exist", () => {
    expect(FLEET_ROUTE).toContain('router.get("/maintenance"');
    expect(FLEET_ROUTE).toContain('router.post("/maintenance"');
    expect(FLEET_ROUTE).toContain('router.patch("/maintenance/:id"');
    expect(FLEET_ROUTE).toContain('router.delete("/maintenance/:id"');
    expect(FLEET_ROUTE).toContain('"/maintenance/:id/complete"');
    expect(FLEET_ROUTE).toContain('"/maintenance/:id/cancel"');
  });

  it("fuel log endpoints exist", () => {
    expect(FLEET_ROUTE).toContain('router.get("/fuel-logs"');
    expect(FLEET_ROUTE).toContain('router.post("/fuel-logs"');
    expect(FLEET_ROUTE).toContain('router.patch("/fuel-logs/:id"');
  });

  it("insurance endpoints exist", () => {
    expect(FLEET_ROUTE).toContain('router.get("/insurance"');
    expect(FLEET_ROUTE).toContain('router.post("/insurance"');
    expect(FLEET_ROUTE).toContain('router.patch("/insurance/:id"');
  });

  it("traffic violation endpoints exist", () => {
    expect(FLEET_ROUTE).toContain('router.get("/traffic-violations"');
    expect(FLEET_ROUTE).toContain('router.post("/traffic-violations"');
    expect(FLEET_ROUTE).toContain('"/traffic-violations/:id/pay"');
  });

  it("stats and alerts endpoints exist", () => {
    expect(FLEET_ROUTE).toContain('router.get("/stats"');
    expect(FLEET_ROUTE).toContain('router.get("/alerts"');
  });

  it("preventive plans endpoints exist", () => {
    expect(FLEET_ROUTE).toContain('"/preventive-plans"');
  });

  it("vehicle TCO endpoint exists", () => {
    expect(FLEET_ROUTE).toContain('"/vehicles/:id/tco"');
  });

  it("waypoints endpoint exists", () => {
    expect(FLEET_ROUTE).toContain('"/trips/:id/waypoints"');
  });
});

describe("Fleet vehicle state machine", () => {
  it("defines VEHICLE_STATUSES and VEHICLE_TRANSITIONS", () => {
    expect(FLEET_ROUTE).toContain("VEHICLE_STATUSES");
    expect(FLEET_ROUTE).toContain("VEHICLE_TRANSITIONS");
  });

  it("vehicle statuses: available, in_use, maintenance, out_of_service", () => {
    const idx = FLEET_ROUTE.indexOf("VEHICLE_STATUSES");
    const line = FLEET_ROUTE.slice(idx, FLEET_ROUTE.indexOf("\n", idx));
    expect(line).toContain("available");
    expect(line).toContain("in_use");
    expect(line).toContain("maintenance");
    expect(line).toContain("out_of_service");
  });

  it("validates vehicle status transitions", () => {
    expect(FLEET_ROUTE).toMatch(/VEHICLE_TRANSITIONS\[existing\.status/);
  });
});

describe("Fleet trip state machine", () => {
  it("defines TRIP_STATUSES and TRIP_TRANSITIONS", () => {
    expect(FLEET_ROUTE).toContain("TRIP_STATUSES");
    expect(FLEET_ROUTE).toContain("TRIP_TRANSITIONS");
  });

  it("trip statuses: scheduled, planned, in_progress, completed, cancelled", () => {
    const idx = FLEET_ROUTE.indexOf("TRIP_STATUSES");
    const line = FLEET_ROUTE.slice(idx, FLEET_ROUTE.indexOf("\n", idx));
    expect(line).toContain("scheduled");
    expect(line).toContain("planned");
    expect(line).toContain("in_progress");
    expect(line).toContain("completed");
    expect(line).toContain("cancelled");
  });

  it("completed and cancelled are terminal trip states", () => {
    const idx = FLEET_ROUTE.indexOf("TRIP_TRANSITIONS");
    const block = FLEET_ROUTE.slice(idx, idx + 400);
    expect(block).toContain("completed:   []");
    expect(block).toContain("cancelled:   []");
  });
});

describe("Fleet maintenance state machine", () => {
  it("defines MAINTENANCE_STATUSES and MAINTENANCE_TRANSITIONS", () => {
    expect(FLEET_ROUTE).toContain("MAINTENANCE_STATUSES");
    expect(FLEET_ROUTE).toContain("MAINTENANCE_TRANSITIONS");
  });

  it("completed and cancelled are terminal maintenance states", () => {
    const idx = FLEET_ROUTE.indexOf("MAINTENANCE_TRANSITIONS");
    const block = FLEET_ROUTE.slice(idx, idx + 300);
    expect(block).toContain("completed:   []");
    expect(block).toContain("cancelled:   []");
  });
});

describe("Fleet violation state machine", () => {
  it("defines VIOLATION_TRANSITIONS", () => {
    expect(FLEET_ROUTE).toContain("VIOLATION_TRANSITIONS");
  });

  it("paid and cancelled are terminal violation states", () => {
    const idx = FLEET_ROUTE.indexOf("VIOLATION_TRANSITIONS");
    const block = FLEET_ROUTE.slice(idx, idx + 300);
    expect(block).toContain("paid:      []");
    expect(block).toContain("cancelled: []");
  });
});

describe("Fleet driver state machine", () => {
  it("defines DRIVER_STATUSES and DRIVER_TRANSITIONS", () => {
    expect(FLEET_ROUTE).toContain("DRIVER_STATUSES");
    expect(FLEET_ROUTE).toContain("DRIVER_TRANSITIONS");
  });

  it("driver statuses: available, on_trip, off_duty, suspended", () => {
    const idx = FLEET_ROUTE.indexOf("DRIVER_STATUSES");
    const line = FLEET_ROUTE.slice(idx, FLEET_ROUTE.indexOf("\n", idx));
    expect(line).toContain("available");
    expect(line).toContain("on_trip");
    expect(line).toContain("off_duty");
    expect(line).toContain("suspended");
  });
});

describe("Fleet lifecycle integration", () => {
  it("imports applyTransition from lifecycleEngine", () => {
    expect(FLEET_ROUTE).toContain("applyTransition");
    expect(FLEET_ROUTE).toContain("lifecycleEngine");
  });

  it("trip cancel uses applyTransition", () => {
    const idx = FLEET_ROUTE.indexOf('"/trips/:id/cancel"');
    const endIdx = FLEET_ROUTE.indexOf("router.", idx + 10);
    const section = FLEET_ROUTE.slice(idx, endIdx);
    expect(section).toContain("applyTransition");
    expect(section).toContain("cancelled");
  });

  it("trip cancel releases vehicle and driver resources", () => {
    const idx = FLEET_ROUTE.indexOf('"/trips/:id/cancel"');
    const endIdx = FLEET_ROUTE.indexOf("router.", idx + 10);
    const section = FLEET_ROUTE.slice(idx, endIdx);
    expect(section).toContain("fleet_vehicles");
    expect(section).toContain("fleet_drivers");
    expect(section).toContain("available");
  });

  it("trip cancel requires reason", () => {
    const idx = FLEET_ROUTE.indexOf('"/trips/:id/cancel"');
    const section = FLEET_ROUTE.slice(idx, idx + 500);
    expect(section).toContain("سبب الإلغاء مطلوب");
  });
});

describe("Fleet event emission contract", () => {
  it("emits fleet events on vehicle operations", () => {
    expect(FLEET_ROUTE).toContain("emitEvent");
    expect(FLEET_ROUTE).toContain('"fleet_vehicles"');
  });

  it("emits events on trip operations", () => {
    expect(FLEET_ROUTE).toContain('"fleet_trips"');
  });

  it("emits events on driver operations", () => {
    expect(FLEET_ROUTE).toContain('"fleet_drivers"');
  });

  it("creates audit logs systematically", () => {
    const auditCalls = FLEET_ROUTE.match(/createAuditLog\(/g);
    expect(auditCalls!.length).toBeGreaterThanOrEqual(15);
  });
});

describe("Fleet security contracts", () => {
  it("vehicle list filters deletedAt IS NULL", () => {
    const idx = FLEET_ROUTE.indexOf('router.get("/vehicles"');
    const endIdx = FLEET_ROUTE.indexOf("router.", idx + 10);
    const section = FLEET_ROUTE.slice(idx, endIdx);
    expect(section).toContain('"deletedAt" IS NULL');
  });

  it("soft delete uses deletedAt on vehicles", () => {
    const idx = FLEET_ROUTE.indexOf('router.delete("/vehicles/:id"');
    const endIdx = FLEET_ROUTE.indexOf("router.", idx + 10);
    const section = FLEET_ROUTE.slice(idx, endIdx);
    expect(section).toContain('"deletedAt"');
  });

  it("validates vehicle input with zod on create", () => {
    expect(FLEET_ROUTE).toContain("createVehicleSchema.safeParse");
  });

  it("validates driver input with zod on create", () => {
    expect(FLEET_ROUTE).toContain("createDriverSchema.safeParse");
  });

  it("validates maintenance input with zod on create", () => {
    expect(FLEET_ROUTE).toContain("createMaintenanceSchema.safeParse");
  });

  it("validates fuel log input with zod on create", () => {
    expect(FLEET_ROUTE).toContain("createFuelLogSchema.safeParse");
  });

  it("checks duplicate plate number on vehicle create", () => {
    const idx = FLEET_ROUTE.indexOf('router.post("/vehicles"');
    const endIdx = FLEET_ROUTE.indexOf("router.", idx + 10);
    const section = FLEET_ROUTE.slice(idx, endIdx);
    expect(section).toContain("رقم اللوحة مسجل مسبقاً");
  });

  it("checks duplicate license number on driver create", () => {
    const idx = FLEET_ROUTE.indexOf('router.post("/drivers"');
    const endIdx = FLEET_ROUTE.indexOf("router.", idx + 10);
    const section = FLEET_ROUTE.slice(idx, endIdx);
    expect(section).toContain("رقم الرخصة مسجل مسبقاً");
  });
});

describe("Fleet subsidiary accounts", () => {
  it("creates subsidiary accounts for new vehicles", () => {
    const idx = FLEET_ROUTE.indexOf('router.post("/vehicles"');
    const endIdx = FLEET_ROUTE.indexOf("router.", idx + 10);
    const section = FLEET_ROUTE.slice(idx, endIdx);
    expect(section).toContain("createSubsidiaryAccountsForEntity");
  });

  it("creates subsidiary accounts for new drivers", () => {
    const idx = FLEET_ROUTE.indexOf('router.post("/drivers"');
    const endIdx = FLEET_ROUTE.indexOf("router.", idx + 10);
    const section = FLEET_ROUTE.slice(idx, endIdx);
    expect(section).toContain("createSubsidiaryAccountsForEntity");
  });
});

describe("Fleet obligation management", () => {
  it("imports obligation engine functions", () => {
    expect(FLEET_ROUTE).toContain("registerObligation");
    expect(FLEET_ROUTE).toContain("markObligationMet");
    expect(FLEET_ROUTE).toContain("cancelObligation");
  });
});
