import { describe, it, expect } from "vitest";
import type { TransportServiceType } from "../../src/lib/transportEnums.js";
import { resolveTransportRevenueAccount } from "../../src/lib/transportRevenueAccounts.js";

// Step 1 of transport customer-invoicing — locks the service-type → revenue
// account mapping (the owner's model: a distinct revenue account per service
// type). Pure + DB-free; the leaves 4151/4152/4153 are seeded by migration 387.
describe("resolveTransportRevenueAccount", () => {
  it("routes umrah passenger transport to 4151", () => {
    const r = resolveTransportRevenueAccount("passenger_umrah");
    expect(r.purpose).toBe("umrah_transport_revenue");
    expect(r.defaultCode).toBe("4151");
  });

  it("routes general passenger transport to 4152", () => {
    const r = resolveTransportRevenueAccount("passenger_general");
    expect(r.purpose).toBe("passenger_transport_revenue");
    expect(r.defaultCode).toBe("4152");
  });

  it("routes cargo/freight to 4153", () => {
    const r = resolveTransportRevenueAccount("cargo_load");
    expect(r.purpose).toBe("freight_revenue");
    expect(r.defaultCode).toBe("4153");
  });

  it("defaults the residual service types to the 4150 parent (pending Step 2)", () => {
    expect(resolveTransportRevenueAccount("equipment_rental").defaultCode).toBe("4150");
    expect(resolveTransportRevenueAccount("internal_transfer").defaultCode).toBe("4150");
    expect(resolveTransportRevenueAccount("other").defaultCode).toBe("4150");
  });

  it("every service type carries a non-empty Arabic label + purpose + 4xxx code", () => {
    const all: TransportServiceType[] = [
      "passenger_umrah", "passenger_general", "cargo_load",
      "equipment_rental", "internal_transfer", "other",
    ];
    for (const t of all) {
      const r = resolveTransportRevenueAccount(t);
      expect(r.purpose.length).toBeGreaterThan(0);
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.defaultCode).toMatch(/^4\d{3}$/);
    }
  });

  it("falls back to the `other` bucket for an unrecognized value", () => {
    expect(
      resolveTransportRevenueAccount("bogus" as TransportServiceType).defaultCode,
    ).toBe("4150");
  });
});
