import { describe, it, expect } from "vitest";
import { applyMaintenanceTicketEffect } from "../../src/lib/financeOperationalEffect.js";

// Pure unit test (no DB) — captures the SQL the helper issues against a fake
// transaction client, locking in the #1715 §5 maintenance-ticket behaviour so
// CI protects it (DB integration tests skip in CI; these don't).
function makeClient(opts: { notFound?: boolean } = {}) {
  const calls: { text: string; params: unknown[] }[] = [];
  let seq = 1000;
  const client = {
    query: async (text: string, params?: unknown[]) => {
      calls.push({ text, params: params ?? [] });
      // UPDATE ... RETURNING returns no row when the id/company didn't match.
      if (opts.notFound && /^UPDATE/.test(text.trim())) return { rows: [] };
      return { rows: [{ id: ++seq, vehicleId: 7 }] };
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

  it("vehicle link: updates an existing ticket's linkedExpenseId (action=linked)", async () => {
    const { client, calls } = makeClient();
    const res = await applyMaintenanceTicketEffect(client, {
      companyId: 2, journalId: 991003, target: "vehicle", existingTicketId: 55,
      cost: 400, odometer: 32000, costBearer: "company",
    });
    expect(res.kind).toBe("vehicle_maintenance");
    expect(res.action).toBe("linked");
    expect(res.ticketId).toBeTypeOf("number");
    expect(calls[0].text).toMatch(/UPDATE fleet_maintenance[\s\S]*linkedExpenseId/);
    expect(calls[0].params).toContain(55);     // existingTicketId
    expect(calls[0].params).toContain(991003); // linkedExpenseId
    // odometer still bumps the vehicle (vehicleId resolved from the linked row)
    expect(calls[1].text).toMatch(/UPDATE fleet_vehicles/);
  });

  it("property link: updates an existing maintenance_request (action=linked)", async () => {
    const { client, calls } = makeClient();
    const res = await applyMaintenanceTicketEffect(client, {
      companyId: 2, journalId: 991004, target: "property", existingTicketId: 77, cost: 900,
    });
    expect(res.action).toBe("linked");
    expect(calls[0].text).toMatch(/UPDATE maintenance_requests[\s\S]*linkedExpenseId/);
    expect(calls[0].params).toContain(77);
    expect(calls[0].params).toContain(991004);
  });

  it("link to a non-existent ticket → action=none (caller rejects)", async () => {
    const { client } = makeClient({ notFound: true });
    const veh = await applyMaintenanceTicketEffect(client, {
      companyId: 2, journalId: 1, target: "vehicle", existingTicketId: 999999, cost: 10,
    });
    expect(veh.action).toBe("none");
    expect(veh.kind).toBe("none");
    expect(veh.ticketId).toBeNull();
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

describe("applyAssetCreationEffect (#1715 capital purchase)", () => {
  it("inserts a fixed asset with cost as both purchaseCost and currentBookValue", async () => {
    const calls: { text: string; params: unknown[] }[] = [];
    const client = { query: async (text: string, params?: unknown[]) => { calls.push({ text, params: params ?? [] }); return { rows: [{ id: 5001 }] }; } };
    const { applyAssetCreationEffect } = await import("../../src/lib/financeOperationalEffect.js");
    const res = await applyAssetCreationEffect(client, {
      companyId: 2, journalId: 991010, name: "سيارة تويوتا", cost: 80000, usefulLifeYears: 5, category: "vehicles",
    });
    expect(res.assetId).toBe(5001);
    expect(calls[0].text).toMatch(/INSERT INTO fixed_assets/);
    // cost ($6) is reused for purchaseCost AND currentBookValue (VALUES $6,$6)
    expect(calls[0].text).toMatch(/"purchaseCost", "currentBookValue"[\s\S]*\$6, \$6/);
    expect(calls[0].params).toContain(80000);
    expect(calls[0].params).toContain("سيارة تويوتا");
  });
});
