import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * §7 of #1870 — Umrah ↔ Transport Service Contract.
 *
 * Pins:
 *   1. The contract module exists + exports the two helpers the
 *      Charter specifies.
 *   2. `createTransportRequestFromUmrah` returns the §7 spec shape
 *      (transportRequestId, tripId, vehicleId, driverId, status,
 *      estimatedCost, actualCost) — with nulls where fulfilment
 *      hasn't happened yet, so the FE can't claim a request is a
 *      confirmed trip.
 *   3. The helper INSERTs into `transport_bookings` (the unified
 *      service-request layer) — NOT into `umrah_transport`. The
 *      whole point: umrah owns the request, fleet owns the trip.
 *   4. It emits `umrah.transport.requested` (catalogued in #1894)
 *      so the fleet engine + operations dashboard can listen.
 *   5. The two HTTP routes wrap the engine without re-implementing
 *      its logic.
 */
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahTransportContract.ts"),
  "utf8",
);
// U-07 Phase 23 — the transport-requests routes carved into umrah-group-transport.ts.
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-group-transport.ts"),
  "utf8",
);

describe("engine — module shape", () => {
  it("exports createTransportRequestFromUmrah", () => {
    expect(ENGINE).toMatch(/export async function createTransportRequestFromUmrah\(/);
  });

  it("exports listTransportRequestsForGroup", () => {
    expect(ENGINE).toMatch(/export async function listTransportRequestsForGroup\(/);
  });

  it("declares the §7 spec return interface (TransportRequestResult)", () => {
    expect(ENGINE).toMatch(/export interface TransportRequestResult \{/);
    // Each spec field must be present.
    for (const f of [
      "transportRequestId: number;",
      "tripId: number \\| null;",
      "vehicleId: number \\| null;",
      "driverId: number \\| null;",
      "status: string;",
      "estimatedCost: number \\| null;",
      "actualCost: number \\| null;",
    ]) {
      expect(ENGINE).toMatch(new RegExp(f));
    }
  });
});

describe("engine — createTransportRequestFromUmrah", () => {
  it("validates group ownership before INSERT (cross-tenant defence)", () => {
    expect(ENGINE).toMatch(/SELECT id, "nuskGroupNumber", "mutamerCount", "seasonId"\s*[\s\S]{0,80}FROM umrah_groups/);
    expect(ENGINE).toMatch(/مجموعة العمرة غير موجودة/);
  });

  it("INSERTs into transport_bookings (NOT umrah_transport)", () => {
    // The whole point of §7 is to NOT duplicate the trip engine.
    // The booking lands in the unified request layer; the fleet
    // engine fulfils it via fleet_trips downstream.
    expect(ENGINE).toMatch(/INSERT INTO transport_bookings/);
    expect(ENGINE).not.toMatch(/INSERT INTO umrah_transport[^_]/);
  });

  it("INSERT carries the umrah lineage tags so fleet listeners can filter", () => {
    expect(ENGINE).toMatch(/'umrah_group'/);
    expect(ENGINE).toMatch(/'passenger_umrah'/);
    expect(ENGINE).toMatch(/"umrahGroupId",/);
  });

  it("wraps INSERT in withTransaction", () => {
    expect(ENGINE).toMatch(/await withTransaction\(async \(client\) =>/);
  });

  it("emits umrah.transport.requested with the group + route context", () => {
    expect(ENGINE).toMatch(/action: "umrah\.transport\.requested"/);
    expect(ENGINE).toMatch(/groupId: input\.groupId,\s*[\r\n]+\s*routeType,/);
  });

  it("emits an audit log for the booking row", () => {
    expect(ENGINE).toMatch(/action: "create", entity: "transport_bookings"/);
  });

  it("returns nulls for fulfilment fields (request is not yet a trip)", () => {
    // The Charter is strict: until the fleet engine assigns a trip,
    // tripId / vehicleId / driverId / estimatedCost / actualCost
    // must NOT be guessed.
    expect(ENGINE).toMatch(/tripId: null,/);
    expect(ENGINE).toMatch(/vehicleId: null,/);
    expect(ENGINE).toMatch(/driverId: null,/);
    expect(ENGINE).toMatch(/estimatedCost: null,/);
    expect(ENGINE).toMatch(/actualCost: null,/);
  });

  it("echoes the emitted-event name in the return for tracer correlation", () => {
    expect(ENGINE).toMatch(/emittedEvent: "umrah\.transport\.requested",/);
  });

  it("validates that fromLocation + toLocation aren't empty", () => {
    expect(ENGINE).toMatch(/نقطة الانطلاق والوجهة مطلوبتان/);
  });

  it("preserves the requiredVehicleType hint inside notes (back-compat with current schema)", () => {
    expect(ENGINE).toMatch(/نوع المركبة: \$\{input\.requiredVehicleType\}/);
  });
});

describe("engine — listTransportRequestsForGroup", () => {
  it("checks group ownership before listing (no leak via guessed groupId)", () => {
    // The whole list helper section must contain a group ownership
    // check — same pattern as createTransportRequestFromUmrah.
    // We slice from the function declaration to the end of file
    // since this is the last exported function in the module.
    const idx = ENGINE.indexOf("export async function listTransportRequestsForGroup");
    expect(idx).toBeGreaterThan(0);
    const body = ENGINE.slice(idx);
    expect(body).toMatch(/SELECT id FROM umrah_groups/);
    expect(body).toMatch(/مجموعة العمرة غير موجودة/);
  });

  it("returns one row per booking in the spec shape", () => {
    expect(ENGINE).toMatch(/return rows\.map\(\(r\) => \(\{\s*[\r\n]+\s*transportRequestId: r\.id,/);
  });

  it("the list helper's row.map projects nulls for fulfilment fields", () => {
    // Pin the actual `rows.map` projection — those are the fields
    // that must stay null until fleet writes back. (The other
    // function ALSO uses the literal null values; this asserts
    // they appear inside the `.map()` block specifically.)
    const map = ENGINE.match(
      /return rows\.map\(\(r\) => \(\{[\s\S]*?\}\)\);/,
    );
    expect(map).not.toBeNull();
    expect(map![0]).toMatch(/tripId: null,/);
    expect(map![0]).toMatch(/vehicleId: null,/);
    expect(map![0]).toMatch(/driverId: null,/);
  });
});

describe("route — HTTP layer is a thin wrapper", () => {
  it("imports both engine helpers", () => {
    expect(ROUTE).toMatch(/createTransportRequestFromUmrah,\s*[\r\n]+\s*listTransportRequestsForGroup,/);
    expect(ROUTE).toMatch(/from "\.\.\/lib\/umrahTransportContract\.js"/);
  });

  it("POST /groups/:id/transport-requests calls the engine", () => {
    expect(ROUTE).toMatch(/router\.post\("\/groups\/:id\/transport-requests"/);
    expect(ROUTE).toMatch(/await createTransportRequestFromUmrah\(/);
  });

  it("GET /groups/:id/transport-requests calls the engine", () => {
    expect(ROUTE).toMatch(/router\.get\("\/groups\/:id\/transport-requests"/);
    expect(ROUTE).toMatch(/await listTransportRequestsForGroup\(/);
  });

  it("POST schema validates fromLocation + toLocation as non-empty", () => {
    expect(ROUTE).toMatch(/fromLocation: z\.string\(\)\.trim\(\)\.min\(1, "نقطة الانطلاق مطلوبة"\)/);
    expect(ROUTE).toMatch(/toLocation: z\.string\(\)\.trim\(\)\.min\(1, "الوجهة مطلوبة"\)/);
  });

  it("POST schema whitelists the routeType enum", () => {
    // Defence: prevents an operator from sending an arbitrary
    // routeType string that the booking schema's CHECK constraint
    // would reject with a confusing 500.
    expect(ROUTE).toMatch(/routeType: z\.enum\(\[[\s\S]{0,200}"airport_to_makkah"/);
  });
});
