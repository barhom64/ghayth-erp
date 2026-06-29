// Equivalence proof for the createBillingCandidate consolidation (#TA-T18):
// the six create*Candidate methods now delegate to ONE shared writer. This spies
// on that writer and asserts each mapper passes the EXACT params its old inline
// INSERT used — so the consolidation cannot silently drift a field — and that the
// per-source skip conditions still short-circuit BEFORE any candidate is written.
// Static guard (mocked rawdb, no DB).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/rawdb.js", () => ({ rawQuery: vi.fn(), rawExecute: vi.fn() }));
vi.mock("../../src/lib/eventBus.js", () => ({ eventBus: { emit: vi.fn() } }));
vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: { resolveAccountCode: vi.fn(), postJournalEntry: vi.fn() },
}));

const CTX = { companyId: 1, branchId: 2, createdBy: 7 };

describe("#TA-T18 — billing-candidate consolidation: each mapper → the shared writer", () => {
  let fleetEngine: any;
  let spy: any;

  beforeEach(async () => {
    vi.resetModules();
    ({ fleetEngine } = await import("../../src/lib/engines/fleetEngine.js"));
    spy = vi.spyOn(fleetEngine, "createBillingCandidate").mockResolvedValue({ id: 99, created: true });
  });

  it("cargo → cargo_manifest / freight / delivered, kg, revenue + cost", async () => {
    await fleetEngine.createCargoBillingCandidate(CTX, {
      id: 10, manifestNumber: "BL-10", freightRevenue: 500, freightCost: 200,
      customerId: 9, vehicleId: 3, driverId: 4, fromLocation: "A", toLocation: "B",
      totalWeight: 1500, deliveryDate: "2026-06-07", notes: "n",
    });
    expect(spy).toHaveBeenCalledWith(CTX, expect.objectContaining({
      sourceType: "cargo_manifest", sourceId: 10, sourceRef: "BL-10",
      serviceType: "freight", serviceDate: "2026-06-07", operationalStatus: "delivered",
      quantity: 1500, unitOfMeasure: "kg", customerId: 9, routeFrom: "A", routeTo: "B",
      vehicleId: 3, driverId: 4, suggestedRevenue: 500, suggestedCost: 200, notes: "n",
    }));
  });

  it("maintenance → maintenance / completed, 1 service, cost only (no revenue)", async () => {
    await fleetEngine.createMaintenanceExpenseCandidate(CTX, { id: 11, vehicleId: 3, cost: 1200, description: "oil" });
    const args = spy.mock.calls[0][1];
    expect(args).toMatchObject({
      sourceType: "maintenance", sourceId: 11, serviceType: "maintenance",
      operationalStatus: "completed", quantity: 1, unitOfMeasure: "service",
      vehicleId: 3, suggestedCost: 1200, notes: "oil",
    });
    expect(args.suggestedRevenue).toBeUndefined();
  });

  it("fuel → fuel/service, insurance → insurance/policy (cost only)", async () => {
    await fleetEngine.createFuelExpenseCandidate(CTX, { id: 12, vehicleId: 3, cost: 300 });
    expect(spy.mock.calls[0][1]).toMatchObject({
      sourceType: "fuel", sourceRef: "FUEL-12", serviceType: "fuel", unitOfMeasure: "service", suggestedCost: 300,
    });
    spy.mockClear();
    await fleetEngine.createInsuranceExpenseCandidate(CTX, { id: 13, vehicleId: 3, cost: 800 });
    expect(spy.mock.calls[0][1]).toMatchObject({
      sourceType: "insurance", sourceRef: "INS-13", serviceType: "insurance", unitOfMeasure: "policy", suggestedCost: 800,
    });
  });

  it("rental → fleet_rental_contract / returned, days, revenue = total + overage", async () => {
    await fleetEngine.createRentalBillingCandidate(CTX, {
      id: 14, ref: "RENT-14", clientId: 5, vehicleId: 3, driverId: 4,
      startDate: "2026-06-01", actualEndDate: "2026-06-05", totalAmount: 1000, overageAmount: 200,
    });
    expect(spy.mock.calls[0][1]).toMatchObject({
      sourceType: "fleet_rental_contract", sourceId: 14, sourceRef: "RENT-14",
      serviceType: "rental", serviceDate: "2026-06-05", operationalStatus: "returned",
      quantity: 5, unitOfMeasure: "day", customerId: 5, vehicleId: 3, driverId: 4, suggestedRevenue: 1200,
    });
  });

  it("passenger → transport_booking_passenger / completed, pax, no revenue", async () => {
    await fleetEngine.createPassengerBillingCandidate(CTX, {
      id: 15, bookingNumber: "BK-15", tripFamily: "passenger", customerId: 6, passengerCount: 12,
      fromLocationText: "X", toLocationText: "Y", vehicleId: 3, driverId: 4,
    });
    const args = spy.mock.calls[0][1];
    expect(args).toMatchObject({
      sourceType: "transport_booking_passenger", sourceId: 15, sourceRef: "BK-15",
      serviceType: "passenger", operationalStatus: "completed",
      quantity: 12, unitOfMeasure: "pax", customerId: 6, routeFrom: "X", routeTo: "Y",
      vehicleId: 3, driverId: 4,
    });
    expect(args.suggestedRevenue).toBeUndefined();
  });

  it("skip conditions still short-circuit BEFORE the writer (no candidate written)", async () => {
    expect(await fleetEngine.createCargoBillingCandidate(CTX, { id: 1, manifestNumber: "z", freightRevenue: 0, freightCost: 0 })).toBeNull();
    expect(await fleetEngine.createMaintenanceExpenseCandidate(CTX, { id: 1, vehicleId: 1, cost: 0 })).toBeNull();
    expect(await fleetEngine.createRentalBillingCandidate(CTX, { id: 1, clientId: 1, vehicleId: 1, startDate: "2026-06-01", actualEndDate: "2026-06-02", totalAmount: 0, overageAmount: 0 })).toBeNull();
    expect(await fleetEngine.createPassengerBillingCandidate(CTX, { id: 1, bookingNumber: "z", tripFamily: "cargo", customerId: 1, passengerCount: 5, fromLocationText: null, toLocationText: null })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
