/**
 * Spec ملف 04 §تنبيهات الأسطول السبعة:
 *   «خروج المركبة من السياج الجغرافي → تنبيه»
 *
 * Slice 8 of 9. Scope: replace the disabled
 * `smartAlerts.checkGeofenceViolation` (which looked for
 * `geofenceLat/Lng/Radius` columns on `fleet_trips` — never existed)
 * with a daily cron that uses real GPS positions in
 * `fleet_device_positions` and a configurable policy in the new
 * `geofence_zones` table (circles per vehicle).
 *
 * KEY DESIGN DECISIONS:
 *   1. Circle (centerLat, centerLng, radiusKm) per zone, NOT polygons.
 *      Simpler to test, no PostGIS dependency (not deployed here),
 *      easy to compute Haversine inline in SQL.
 *   2. A vehicle can have multiple zones; "inside" = inside ANY one.
 *      A position is an "exit" only if outside ALL zones for the vehicle.
 *   3. Vehicles WITHOUT any zone rows are skipped entirely — geofencing
 *      is opt-in per vehicle (not the default). Avoids false alarms
 *      for vehicles where geofencing isn't configured.
 *   4. Daily aggregation: one alert per (vehicle, day) — same granularity
 *      as slice 7 (speed violations). Per-position alerts would drown
 *      managers in noise from a single offroad trip.
 *   5. Timezone-aware day window via `getSystemTimezone()` (same fix
 *      pattern as slice 7 Codex P2).
 *
 * This test pins:
 *   1. Migration 438 creates `geofence_zones` with right shape (circle
 *      per vehicle + soft-delete + CHECK on coordinate ranges).
 *   2. Migration 439 seeds `fleet.geofence.exit` as ar+en email, GLOBAL.
 *   3. Migration 440 creates `fleet_geofence_exit_alerts` idempotency
 *      table with PK (vehicleId, exitDate).
 *   4. The cron computes Haversine inline in SQL.
 *   5. The cron treats `marginKm > 0` as "outside the nearest zone"
 *      (margin = min(distance_to_center) - radius).
 *   6. Vehicles with no zones get NO query rows (JOIN excludes them).
 *   7. Timezone-aware bounds via getSystemTimezone() + AT TIME ZONE.
 *   8. Driver lookup constrained to the exit day (slice 7 Codex P2 fix
 *      pattern).
 *   9. Manager email looked up before dispatch (slice 7 Codex P1 fix).
 *   10. channels=["email"] only (no in_app fan-out).
 *   11. Idempotency check BEFORE dispatch, INSERT AFTER.
 *   12. Job registered in the cron job list, daily.
 *   13. Prior slices (5/6/7) still wired (additive).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "lib", "cronScheduler.ts"),
  "utf8",
);
const ZONE_MIG = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "migrations", "438_geofence_zones_table.sql"),
  "utf8",
);
const TMPL_MIG = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "migrations", "439_seed_geofence_exit_template.sql"),
  "utf8",
);
const ALERTS_MIG = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "migrations", "440_geofence_exit_alerts_table.sql"),
  "utf8",
);

function section(marker: string, len = 12000): string {
  const idx = SRC.indexOf(marker);
  return idx === -1 ? "" : SRC.slice(idx, idx + len);
}

describe("Vehicle geofence-exit alert (daily) — spec ملف 04", () => {
  const cron = section("async function dailyGeofenceExitCheck");

  it("migration 438 creates geofence_zones with circle shape + per-vehicle FK", () => {
    expect(ZONE_MIG).toMatch(/CREATE TABLE IF NOT EXISTS geofence_zones/);
    expect(ZONE_MIG).toContain('"companyId"');
    expect(ZONE_MIG).toContain('"vehicleId"');
    expect(ZONE_MIG).toContain('REFERENCES fleet_vehicles(id)');
    // Circle storage: center + radius (not polygon, not bounding box).
    expect(ZONE_MIG).toMatch(/"centerLat"\s+NUMERIC/);
    expect(ZONE_MIG).toMatch(/"centerLng"\s+NUMERIC/);
    expect(ZONE_MIG).toMatch(/"radiusKm"\s+NUMERIC/);
    // CHECK constraints on coordinate ranges (defensive against bad input).
    expect(ZONE_MIG).toMatch(/"centerLat"\s+BETWEEN\s+-90\s+AND\s+90/);
    expect(ZONE_MIG).toMatch(/"centerLng"\s+BETWEEN\s+-180\s+AND\s+180/);
    expect(ZONE_MIG).toMatch(/"radiusKm"\s+>\s+0/);
    // Soft-delete column for historical preservation.
    expect(ZONE_MIG).toContain('"deletedAt"');
  });

  it("migration 439 seeds the template as ar+en email, GLOBAL default", () => {
    const key = "'fleet.geofence.exit'";
    const count = TMPL_MIG.split(key).length - 1;
    expect(count, "template should appear ≥2× (ar+en)").toBeGreaterThanOrEqual(2);
    expect(TMPL_MIG).toContain("WHERE NOT EXISTS");
    expect(TMPL_MIG).toMatch(/SELECT\s+NULL::int,\s+t\."templateKey"/);
    expect(TMPL_MIG).toContain('nt."companyId" IS NULL');
  });

  it("migration 439 has the 8 placeholders the cron sends", () => {
    for (const ph of ["managerName", "driverName", "plateNumber", "vehicleName", "exitCount", "firstExitTime", "maxDistanceKm", "exitDate"]) {
      expect(TMPL_MIG, `template missing {{${ph}}}`).toContain(`{{${ph}}}`);
    }
  });

  it("migration 439 ONLY uses email channel (no in_app / sms / whatsapp)", () => {
    expect(TMPL_MIG).not.toMatch(/'fleet\.geofence\.exit',\s*'in_app'/);
    expect(TMPL_MIG).not.toMatch(/'fleet\.geofence\.exit',\s*'sms'/);
    expect(TMPL_MIG).not.toMatch(/'fleet\.geofence\.exit',\s*'whatsapp'/);
    expect(TMPL_MIG).toMatch(/'fleet\.geofence\.exit',\s*'email',\s*'ar'/);
    expect(TMPL_MIG).toMatch(/'fleet\.geofence\.exit',\s*'email',\s*'en'/);
  });

  it("migration 440 creates fleet_geofence_exit_alerts with PK (vehicleId, exitDate) + count check", () => {
    expect(ALERTS_MIG).toMatch(/CREATE TABLE IF NOT EXISTS fleet_geofence_exit_alerts/);
    expect(ALERTS_MIG).toMatch(/PRIMARY KEY\s*\(\s*"vehicleId",\s*"exitDate"\s*\)/);
    expect(ALERTS_MIG).toMatch(/"exitCount"\s*>=\s*1/);
    expect(ALERTS_MIG).toMatch(/"maxDistanceKm"\s*>=\s*0/);
    expect(ALERTS_MIG).toContain('REFERENCES companies(id)');
    expect(ALERTS_MIG).toContain('REFERENCES fleet_vehicles(id) ON DELETE CASCADE');
  });

  it("the cron computes Haversine INLINE in SQL (no PostGIS dependency)", () => {
    // Haversine formula: 2R · asin(sqrt(sin²(Δφ/2) + cos(φ1)·cos(φ2)·sin²(Δλ/2))).
    // R = 6371 km (Earth's mean radius). The formula appears as
    // `2 * 6371 * asin(sqrt(...))`. If a refactor changes the radius
    // or breaks the trig, all distances misalign silently.
    expect(cron).toMatch(/2\s*\*\s*6371(\.0)?\s*\*\s*asin/);
    expect(cron).toMatch(/sin\(radians/);
    expect(cron).toMatch(/cos\(radians/);
    // Margin = distance_to_center - radius. > 0 ⇒ outside.
    expect(cron).toMatch(/\)\s*-\s*z\."radiusKm"/);
    expect(cron).toMatch(/pd\."marginKm"\s*>\s*0/);
  });

  it("vehicles without zones are EXCLUDED via INNER JOIN on geofence_zones", () => {
    // If a vehicle has no zones, the JOIN drops it — opt-in geofencing.
    // The check: position_distances CTE uses JOIN (not LEFT JOIN) so
    // positions for unzoned vehicles never reach the aggregation.
    expect(cron).toMatch(/JOIN geofence_zones z[\s\S]{0,400}z\."vehicleId"\s*=\s*p\."vehicleId"/);
    expect(cron).not.toMatch(/LEFT JOIN geofence_zones/);
    // And zones must be active (soft-deleted ones excluded).
    expect(cron).toContain('z."deletedAt" IS NULL');
  });

  it("the cron uses tz-aware bounds via getSystemTimezone() — same fix as slice 7", () => {
    expect(cron).toContain('getSystemTimezone()');
    expect(cron).toContain('NOW() AT TIME ZONE $2');
    // The position window uses tz-aware start/end.
    expect(cron).toMatch(/p\."occurredAt"\s*>=\s*db\."startTs"/);
    expect(cron).toMatch(/p\."occurredAt"\s*<\s*db\."endTs"/);
    // Bare CURRENT_DATE must NOT bound the position window — slice 7
    // Codex P2 lesson.
    expect(cron).not.toMatch(/p\."occurredAt"\s*>=\s*\(CURRENT_DATE/);
  });

  it("driver lookup is constrained to the exit day (slice 7 Codex P2 pattern)", () => {
    const lookup = cron.slice(cron.indexOf('FROM fleet_trips ft'));
    expect(lookup.slice(0, 2000)).toMatch(/ft\."startTime"\s*>=\s*\(\$3::date\)::timestamp AT TIME ZONE \$4/);
    expect(lookup.slice(0, 2000)).toMatch(/ft\."startTime"\s*<\s*\(\$3::date \+ 1\)::timestamp AT TIME ZONE \$4/);
    expect(lookup.slice(0, 2000)).toMatch(/ORDER BY ft\."startTime" DESC/);
    expect(lookup.slice(0, 2000)).not.toMatch(/ORDER BY ft\."createdAt"/);
  });

  it("manager email looked up before dispatch (slice 7 Codex P1 pattern)", () => {
    // Without recipientEmail, dispatchNotification silently drops the
    // email branch — same Codex P1 bug fixed in slice 7. Repeat the
    // lookup here.
    expect(cron).toContain('SELECT e.name, e.email FROM employee_assignments');
    const block = cron.slice(cron.indexOf('eventCategory: "fleet.geofence.exit"'));
    expect(block.slice(0, 3000)).toMatch(/recipientEmail: managerEmail/);
    expect(block.slice(0, 3000)).toMatch(/recipientName: managerName/);
  });

  it("dispatch routes to assignmentId with email-only channels (no in_app fan-out)", () => {
    expect(cron).toContain('templateKey: "fleet.geofence.exit"');
    expect(cron).toContain('eventCategory: "fleet.geofence.exit"');
    const block = cron.slice(cron.indexOf('eventCategory: "fleet.geofence.exit"'));
    expect(block.slice(0, 3000)).toContain('channels: ["email" as const]');
    expect(block.slice(0, 3000)).toMatch(/assignmentId: managerAssignment/);
  });

  it("manager resolves via getManagerAssignmentId (operational — branch_manager first)", () => {
    expect(cron).toContain('getManagerAssignmentId(');
    expect(cron).toMatch(/role IN \('branch_manager','hr_manager','general_manager','owner'\)/);
  });

  it("idempotency check fires BEFORE dispatch; INSERT after dispatch", () => {
    const guardIdx = cron.indexOf('SELECT 1 FROM fleet_geofence_exit_alerts');
    const dispatchIdx = cron.indexOf('templateKey: "fleet.geofence.exit"');
    const insertIdx = cron.indexOf('INSERT INTO fleet_geofence_exit_alerts');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(guardIdx);
    expect(insertIdx).toBeGreaterThan(dispatchIdx);
    expect(cron).toMatch(/ON CONFLICT\s*\(\s*"vehicleId",\s*"exitDate"\s*\)\s*DO NOTHING/);
  });

  it("templateVars match the seeded placeholders EXACTLY", () => {
    const dispatch = cron.slice(cron.indexOf('eventCategory: "fleet.geofence.exit"'));
    for (const v of ["managerName", "driverName", "plateNumber", "vehicleName", "exitCount", "firstExitTime", "maxDistanceKm", "exitDate"]) {
      expect(dispatch.slice(0, 3500), `templateVars missing ${v}`).toContain(`${v}:`);
    }
  });

  it("cron is registered in the job list (daily, with the right handler)", () => {
    expect(SRC).toContain('"daily_geofence_exit_check"');
    expect(SRC).toContain('handler: dailyGeofenceExitCheck');
    expect(SRC).toMatch(/"daily_geofence_exit_check"[\s\S]{0,200}schedule:\s*"\d+\s+\d+\s+\*\s+\*\s+\*"/);
  });

  it("slice 8 is ADDITIVE — slices 5+6+7 crons still wired", () => {
    expect(SRC).toContain('"daily_vehicle_replacement_check"');
    expect(SRC).toContain('"daily_driver_evaluation_check"');
    expect(SRC).toContain('"daily_speed_violation_check"');
  });
});
