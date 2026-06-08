import { describe, it, expect } from "vitest";
import { applyMaintenanceTicketEffect } from "../../src/lib/financeOperationalEffect.js";

// Pure unit test (no DB) — captures the SQL the helper issues against a fake
// transaction client, locking in the #1715 §5 maintenance-ticket behaviour so
// CI protects it (DB integration tests skip in CI; these don't).
function makeClient() {
  const calls: { text: string; params: unknown[] }[] = [];
  let seq = 1000;
  const client = {
    query: async (text: string, params?: unknown[]) => {
      calls.push({ text, params: params ?? [] });
      return { rows: [{ id: ++seq }] };
    },
  };
  return { client, calls };
}

describe("applyMaintenanceTicketEffect (#1715 §5)", () => {
  it("vehicle: inserts fleet_maintenance linked to the JE + bumps odometer", async () => {
    const { client, calls } = makeClient();
    const res = await applyMaintenanceTicketEffect(client, {
      companyId: 2, journalId: 991001, target: "vehicle", vehicleId: 7,
      cost: 750, maintenanceType: "oil_change", odometer: 31000, costBearer: "driver",
    });
    expect(res.kind).toBe("vehicle_maintenance");
    expect(res.ticketId).toBeTypeOf("number");
    expect(calls).toHaveLength(2); // insert + odometer update
    expect(calls[0].text).toMatch(/INSERT INTO fleet_maintenance/);
    expect(calls[0].params).toContain(991001);   // linkedExpenseId
    expect(calls[0].params).toContain("driver"); // whitelisted liabilityParty
    expect(calls[0].params).toContain(31000);    // mileageAtService
    expect(calls[1].text).toMatch(/UPDATE fleet_vehicles[\s\S]*currentMileage/);
    expect(calls[1].params).toContain(31000);
  });

  it("vehicle: rejects a non-whitelisted liabilityParty (maps to null)", async () => {
    const { client, calls } = makeClient();
    await applyMaintenanceTicketEffect(client, {
      companyId: 2, journalId: 1, target: "vehicle", vehicleId: 7, cost: 10, costBearer: "owner",
    });
    // "owner" is not in the vehicle liability whitelist → null, not "owner".
    expect(calls[0].params).not.toContain("owner");
    expect(calls[0].params).toContain(null);
  });

  it("vehicle: no odometer → no fleet_vehicles update", async () => {
    const { client, calls } = makeClient();
    await applyMaintenanceTicketEffect(client, {
      companyId: 2, journalId: 1, target: "vehicle", vehicleId: 7, cost: 10,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toMatch(/INSERT INTO fleet_maintenance/);
  });

  it("property: inserts maintenance_requests linked to the JE", async () => {
    const { client, calls } = makeClient();
    const res = await applyMaintenanceTicketEffect(client, {
      companyId: 2, journalId: 991002, target: "property", unitId: 3, contractId: 9,
      cost: 1200, maintenanceType: "plumbing", costBearer: "tenant",
    });
    expect(res.kind).toBe("property_maintenance");
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toMatch(/INSERT INTO maintenance_requests/);
    expect(calls[0].params).toContain(991002); // linkedExpenseId
    expect(calls[0].params).toContain("plumbing");
    expect(calls[0].params).toContain("tenant"); // costResponsibility is free-text
  });

  it("no-op when the target's key dimension is missing", async () => {
    const { client, calls } = makeClient();
    const veh = await applyMaintenanceTicketEffect(client, { companyId: 2, journalId: 1, target: "vehicle", cost: 10 });
    const prop = await applyMaintenanceTicketEffect(client, { companyId: 2, journalId: 1, target: "property", cost: 10 });
    expect(veh.kind).toBe("none");
    expect(prop.kind).toBe("none");
    expect(veh.ticketId).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
