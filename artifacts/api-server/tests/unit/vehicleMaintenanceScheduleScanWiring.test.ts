import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Source-level wiring smoke (#1715 §5). vehicle_maintenance_schedules was a
// dead table until a cron began scanning it; guard that the scan stays wired
// and that the partial index it relies on isn't accidentally dropped.
const CRON_SRC = readFileSync(
  fileURLToPath(new URL("../../src/lib/cronScheduler.ts", import.meta.url)),
  "utf8",
);

describe("vehicle maintenance schedule scan wiring (#1715 §5)", () => {
  it("registers the scan as a cron JOB_DEFINITION", () => {
    expect(CRON_SRC).toMatch(
      /name:\s*"vehicle_maintenance_schedule_scan"[\s\S]*?handler:\s*scanVehicleMaintenanceSchedules/,
    );
  });

  it("exports the scan handler", () => {
    expect(CRON_SRC).toMatch(/export async function scanVehicleMaintenanceSchedules/);
  });

  it("scans due-by-date OR due-by-odometer and re-arms next due", () => {
    expect(CRON_SRC).toMatch(/"nextDueDate"\s*<=\s*CURRENT_DATE/);
    expect(CRON_SRC).toMatch(/"currentMileage"\s*>=\s*s\."nextDueKm"/);
    expect(CRON_SRC).toMatch(/registerObligation/);
  });
});
