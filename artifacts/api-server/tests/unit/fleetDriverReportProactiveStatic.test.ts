import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Driver field reports → proactive management response (review-gap fixes).
 *
 * Two obvious gaps closed:
 *   A. A driver breakdown report now fires the cataloged `fleet.vehicle.breakdown`
 *      event, activating the (previously emitter-less) proactiveVehicleBreakdown
 *      handler → auto maintenance ticket + urgent fleet-manager task.
 *   B. A driver accident report now drives a new proactiveVehicleAccident
 *      handler → urgent assessment task + notification (escalated on injuries).
 *
 * Static / regex-only.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const FLEET = readFileSync(join(repoRoot, "artifacts/api-server/src/routes/fleet.ts"), "utf8");
const PROACTIVE = readFileSync(join(repoRoot, "artifacts/api-server/src/lib/proactiveEngine.ts"), "utf8");

function handlerBlock(method: string, path: string): string {
  const re = new RegExp(`router\\.${method}\\("${path.replace(/\//g, "\\/")}"[\\s\\S]+?\\n\\}\\);`);
  const m = FLEET.match(re);
  expect(m, `${method.toUpperCase()} ${path} handler not found`).toBeTruthy();
  return m![0];
}

describe("A — breakdown report activates the dormant proactive handler", () => {
  it("emits fleet.vehicle.breakdown with entityId=vehicleId and driver source", () => {
    const b = handlerBlock("post", "/me/breakdowns");
    expect(b).toMatch(/action: "fleet\.vehicle\.breakdown"[\s\S]+?entityId: resolvedVehicleId/);
    expect(b).toMatch(/source: "driver"/);
  });
});

describe("B — accident report drives manager assessment task + notification", () => {
  it("accident emit carries top-level vehicleId/severity/hasInjuries for the handler", () => {
    const b = handlerBlock("post", "/me/accidents");
    expect(b).toMatch(/action: "fleet\.accident\.reported"[\s\S]+?vehicleId: resolvedVehicleId[\s\S]+?hasInjuries/);
  });
  it("proactiveEngine subscribes to fleet.accident.reported", () => {
    expect(PROACTIVE).toMatch(/eventBus\.on\("fleet\.accident\.reported"/);
    expect(PROACTIVE).toMatch(/proactiveVehicleAccident\(/);
  });
  it("proactiveVehicleAccident creates an (escalated) task + notification, deduped", () => {
    expect(PROACTIVE).toMatch(/export async function proactiveVehicleAccident/);
    // dedup keyed on the accident via automation_logs
    expect(PROACTIVE).toMatch(/'vehicle_accident_assessment'[\s\S]+?"entityType" = 'fleet_accident'/);
    // escalation: injuries / severe → urgent priority
    expect(PROACTIVE).toMatch(/const urgent = payload\.hasInjuries \|\| payload\.severity === "severe"/);
    expect(PROACTIVE).toMatch(/title: `تقييم حادث: \$\{payload\.plateNumber\}`/);
    expect(PROACTIVE).toMatch(/refType: "fleet_accident", refId: payload\.accidentId/);
  });
});
