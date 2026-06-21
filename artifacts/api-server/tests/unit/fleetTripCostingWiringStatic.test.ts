import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Trip-completion costing is now actor-agnostic: the fleet.trip.completed
 * consumer posts the trip GL via fleetEngine.computeAndPostTripGL, so a
 * driver-completed trip is costed too (the manager route's direct post makes
 * the consumer a no-op via the sourceKey guard). Balanced-lines proof lives in
 * fleetDriverTripCostingGl.dynamic.test.ts. Static wiring lock here.
 */
const root = join(import.meta.dirname!, "../../../..");
const ENGINE = readFileSync(join(root, "artifacts/api-server/src/lib/engines/fleetEngine.ts"), "utf8");
const LISTENERS = readFileSync(join(root, "artifacts/api-server/src/lib/eventListeners.ts"), "utf8");

describe("fleetEngine.computeAndPostTripGL", () => {
  const m = ENGINE.match(/async computeAndPostTripGL\([\s\S]+?\n  \}/);
  it("exists and posts via the idempotent postTripCompletionGL", () => {
    expect(m, "computeAndPostTripGL not found").toBeTruthy();
    expect(m![0]).toMatch(/postTripCompletionGL/);
  });
  it("excludes tagged-fuel-log cost to avoid double-count", () => {
    expect(m![0]).toMatch(/actualFuelFromLogs > 0 \? 0 :/);
    expect(m![0]).toMatch(/fleet_fuel_logs[\s\S]+?"tripId"=\$2/);
  });
  it("derives fare + depreciation from distance × per-company rates", () => {
    expect(m![0]).toMatch(/driverFare = distance \* s\.driverFarePerKm/);
    expect(m![0]).toMatch(/depreciation = distance \* s\.depreciationPerKm/);
  });
});

describe("fleet.trip.completed consumer wires the costing", () => {
  it("the completed listener invokes computeAndPostTripGL", () => {
    const block = LISTENERS.match(/eventBus\.on\("fleet\.trip\.completed"[\s\S]+?\n  \}\);/);
    expect(block, "fleet.trip.completed listener not found").toBeTruthy();
    expect(block![0]).toMatch(/computeAndPostTripGL/);
  });
});
