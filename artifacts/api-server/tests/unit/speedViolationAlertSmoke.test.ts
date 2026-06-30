/**
 * Spec ملف 04 §تنبيهات الأسطول السبعة:
 *   «تجاوز السرعة → تنبيه»
 *
 * Slice 7 of 9. Scope: replace the disabled smartAlerts.checkSpeedViolation
 * (which looked for `currentSpeed` on `fleet_trips` — column never existed)
 * with a working daily cron that uses the real GPS speed feed in
 * `fleet_device_positions.speed` and a configurable policy in the new
 * `vehicle_speed_limits` table.
 *
 * KEY DESIGN DECISIONS:
 *   1. Aggregate daily (one alert per vehicle per calendar day), not
 *      per-violation — speeding events can fire many positions per second
 *      from a single highway stretch. Per-event alerts would drown the
 *      manager's inbox.
 *   2. Effective limit = COALESCE(per-vehicle override, per-company
 *      default, 120 km/h hard fallback). Lets companies set per-truck
 *      vs per-sedan limits without forcing a row per vehicle.
 *   3. Add a tolerance (default 10 km/h) so noisy GPS readings don't
 *      flag legitimate driving as a violation.
 *
 * This test pins:
 *   1. Migration 433 creates `vehicle_speed_limits` with the right
 *      shape (per-vehicle + per-company default via NULL vehicleId).
 *   2. Migration 434 seeds `fleet.speed.violation` as ar+en email,
 *      global default.
 *   3. Migration 435 creates `fleet_speed_violation_alerts` idempotency
 *      table with PK (vehicleId, violationDate).
 *   4. The cron WITH-clause computes effective_limits via the COALESCE
 *      chain.
 *   5. The cron filters on `speed > limit + tolerance` (not just > limit).
 *   6. The cron scans the PREVIOUS calendar day (occurredAt window).
 *   7. The cron aggregates with MAX(speed) + COUNT(*) per vehicle.
 *   8. The dispatch uses channels=["email"] only — NO in_app fan-out.
 *   9. The dispatch routes via getManagerAssignmentId (operational alert,
 *      branch_manager preferred).
 *   10. Idempotency check fires BEFORE dispatch; INSERT after dispatch.
 *   11. The job is registered as a daily cron.
 *   12. Prior slices' crons (5+6) are still wired.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "lib", "cronScheduler.ts"),
  "utf8",
);
const LIMIT_MIG = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "migrations", "435_vehicle_speed_limits_table.sql"),
  "utf8",
);
const TMPL_MIG = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "migrations", "436_seed_speed_violation_template.sql"),
  "utf8",
);
const ALERTS_MIG = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "migrations", "437_speed_violation_alerts_table.sql"),
  "utf8",
);

function section(marker: string, len = 10000): string {
  const idx = SRC.indexOf(marker);
  return idx === -1 ? "" : SRC.slice(idx, idx + len);
}

describe("Vehicle speed-violation alert (daily) — spec ملف 04", () => {
  const cron = section("async function dailySpeedViolationCheck");

  it("migration 435 creates vehicle_speed_limits with company default + per-vehicle override slots", () => {
    expect(LIMIT_MIG).toMatch(/CREATE TABLE IF NOT EXISTS vehicle_speed_limits/);
    expect(LIMIT_MIG).toContain('"companyId"');
    // vehicleId is NULLABLE — NULL = company default.
    expect(LIMIT_MIG).toMatch(/"vehicleId"\s+INTEGER REFERENCES fleet_vehicles\(id\)/);
    expect(LIMIT_MIG).not.toMatch(/"vehicleId"\s+INTEGER NOT NULL/);
    // Partial unique indexes: one default per company, one override per vehicle.
    expect(LIMIT_MIG).toMatch(/CREATE UNIQUE INDEX[^;]+vehicle_speed_limits[^;]+\("companyId"\)\s+WHERE "vehicleId" IS NULL/s);
    expect(LIMIT_MIG).toMatch(/CREATE UNIQUE INDEX[^;]+vehicle_speed_limits[^;]+\("companyId",\s*"vehicleId"\)\s+WHERE "vehicleId" IS NOT NULL/s);
    // CHECK constraints on sensible ranges.
    expect(LIMIT_MIG).toMatch(/"speedLimitKph"\s+BETWEEN\s+30\s+AND\s+250/);
    expect(LIMIT_MIG).toMatch(/"toleranceKph"\s+BETWEEN\s+0\s+AND\s+30/);
  });

  it("migration 436 seeds the template as ar+en email, GLOBAL default", () => {
    const key = "'fleet.speed.violation'";
    const count = TMPL_MIG.split(key).length - 1;
    expect(count, "template should appear ≥2× (ar+en)").toBeGreaterThanOrEqual(2);
    expect(TMPL_MIG).toContain("WHERE NOT EXISTS");
    expect(TMPL_MIG).toMatch(/SELECT\s+NULL::int,\s+t\."templateKey"/);
    expect(TMPL_MIG).toContain('nt."companyId" IS NULL');
  });

  it("migration 436 has the 9 placeholders the cron sends", () => {
    for (const ph of ["managerName", "driverName", "plateNumber", "vehicleName", "maxSpeedKph", "limitKph", "toleranceKph", "violationCount", "violationDate"]) {
      expect(TMPL_MIG, `template missing {{${ph}}}`).toContain(`{{${ph}}}`);
    }
  });

  it("migration 436 ONLY uses email channel (no in_app / sms / whatsapp)", () => {
    expect(TMPL_MIG).not.toMatch(/'fleet\.speed\.violation',\s*'in_app'/);
    expect(TMPL_MIG).not.toMatch(/'fleet\.speed\.violation',\s*'sms'/);
    expect(TMPL_MIG).not.toMatch(/'fleet\.speed\.violation',\s*'whatsapp'/);
    expect(TMPL_MIG).toMatch(/'fleet\.speed\.violation',\s*'email',\s*'ar'/);
    expect(TMPL_MIG).toMatch(/'fleet\.speed\.violation',\s*'email',\s*'en'/);
  });

  it("migration 437 creates fleet_speed_violation_alerts with PK (vehicleId, violationDate) + count check", () => {
    expect(ALERTS_MIG).toMatch(/CREATE TABLE IF NOT EXISTS fleet_speed_violation_alerts/);
    expect(ALERTS_MIG).toMatch(/PRIMARY KEY\s*\(\s*"vehicleId",\s*"violationDate"\s*\)/);
    expect(ALERTS_MIG).toMatch(/"violationCount"\s*>=\s*1/);
    // The recorded max must be at or above the limit — defensive against
    // a buggy cron inserting alerts for non-violations.
    expect(ALERTS_MIG).toMatch(/"maxSpeedKphAtAlert"\s*>=\s*"limitKphAtAlert"/);
    expect(ALERTS_MIG).toContain('REFERENCES companies(id)');
    expect(ALERTS_MIG).toContain('REFERENCES fleet_vehicles(id) ON DELETE CASCADE');
  });

  it("the cron resolves effective limit via COALESCE(per-vehicle, per-company default, 120)", () => {
    // The COALESCE chain is the core policy mechanic. If a future
    // refactor breaks this fallback, vehicles with no row would default
    // to NULL → never trigger → silent loss of all alerts.
    expect(cron).toMatch(/COALESCE\(vsl_v\."speedLimitKph",\s*vsl_d\."speedLimitKph",\s*120\)/);
    expect(cron).toMatch(/COALESCE\(vsl_v\."toleranceKph",\s*vsl_d\."toleranceKph",\s*10\)/);
    // Per-vehicle override joins on vehicleId; per-company default joins on NULL.
    expect(cron).toMatch(/LEFT JOIN vehicle_speed_limits vsl_v[^]*vsl_v\."vehicleId"\s*=\s*fv\.id/);
    expect(cron).toMatch(/LEFT JOIN vehicle_speed_limits vsl_d[^]*vsl_d\."vehicleId"\s+IS NULL/);
  });

  it("the cron filters on speed > limit + tolerance (not just > limit)", () => {
    expect(cron).toMatch(/fdp\.speed\s*>\s*\(el\."limitKph"\s*\+\s*el\."toleranceKph"\)/);
  });

  it("the cron scans the PREVIOUS calendar day window (timezone-aware bounds)", () => {
    // Daily granularity: yesterday's full window only. After the Codex
    // P2 fix the bounds are computed in the scheduler timezone via
    // day_bounds CTE — see the dedicated tz test for the parameterized
    // tz form. Here we just confirm the window is "yesterday" and
    // explicitly named.
    expect(cron).toMatch(/AS "violationDate"/);
    expect(cron).toMatch(/INTERVAL '1 day'/);
    // The position bounds come from db.startTs/endTs after the fix.
    expect(cron).toMatch(/fdp\."occurredAt"\s*>=\s*db\."startTs"/);
    expect(cron).toMatch(/fdp\."occurredAt"\s*<\s*db\."endTs"/);
  });

  it("the cron aggregates with MAX(speed) + COUNT per vehicle", () => {
    expect(cron).toMatch(/MAX\(fdp\.speed\) AS "maxSpeedKph"/);
    expect(cron).toMatch(/COUNT\(\*\)::int AS "violationCount"/);
    expect(cron).toMatch(/GROUP BY fdp\."vehicleId"/);
  });

  it("idempotency: checks fleet_speed_violation_alerts BEFORE dispatch", () => {
    const guardIdx = cron.indexOf('SELECT 1 FROM fleet_speed_violation_alerts');
    const dispatchIdx = cron.indexOf('templateKey: "fleet.speed.violation"');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(guardIdx);
  });

  it("dispatch routes to a specific assignmentId with email-only channels (no in_app fan-out)", () => {
    expect(cron).toContain('templateKey: "fleet.speed.violation"');
    expect(cron).toContain('eventCategory: "fleet.speed.violation"');
    const block = cron.slice(cron.indexOf('eventCategory: "fleet.speed.violation"'));
    expect(block.slice(0, 3000)).toContain('channels: ["email" as const]');
    expect(block.slice(0, 3000)).toMatch(/assignmentId: managerAssignment/);
  });

  it("dispatch resolves manager via getManagerAssignmentId — operational (branch_manager preferred)", () => {
    // Speed is an OPERATIONAL daily alert — branch_manager makes more
    // sense than GM/legal/CFO. Same pattern as slice 6 (driver eval).
    expect(cron).toContain('getManagerAssignmentId(');
    // Company-level fallback order keeps branch_manager first.
    expect(cron).toMatch(/role IN \('branch_manager','hr_manager','general_manager','owner'\)/);
  });

  it("the alert row is INSERTed AFTER dispatch (so failed dispatch can retry tomorrow)", () => {
    const dispatchIdx = cron.indexOf('templateKey: "fleet.speed.violation"');
    const insertIdx = cron.indexOf('INSERT INTO fleet_speed_violation_alerts');
    expect(insertIdx).toBeGreaterThan(dispatchIdx);
    expect(cron).toMatch(/ON CONFLICT\s*\(\s*"vehicleId",\s*"violationDate"\s*\)\s*DO NOTHING/);
  });

  it("templateVars match the seeded placeholders EXACTLY (interpolateTemplate is strict)", () => {
    const dispatch = cron.slice(cron.indexOf('eventCategory: "fleet.speed.violation"'));
    for (const v of ["managerName", "driverName", "plateNumber", "vehicleName", "maxSpeedKph", "limitKph", "toleranceKph", "violationCount", "violationDate"]) {
      expect(dispatch.slice(0, 3500), `templateVars missing ${v}`).toContain(`${v}:`);
    }
  });

  it("the cron is registered in the job list (daily)", () => {
    expect(SRC).toContain('"daily_speed_violation_check"');
    expect(SRC).toContain('handler: dailySpeedViolationCheck');
    expect(SRC).toMatch(/"daily_speed_violation_check"[\s\S]{0,200}schedule:\s*"\d+\s+\d+\s+\*\s+\*\s+\*"/);
  });

  it("slice 7 is ADDITIVE — slices 5+6 crons still wired", () => {
    expect(SRC).toContain('"daily_vehicle_replacement_check"');
    expect(SRC).toContain('"daily_driver_evaluation_check"');
  });

  // ── Codex review fixes ──────────────────────────────────────────────────
  it("Codex P1 — dispatch passes recipientEmail (looked up from assignmentId)", () => {
    // dispatchNotification only sends email when payload.recipientEmail
    // is set; assignmentId alone is in-app routing/preferences. Without
    // recipientEmail every speeding alert silently produced no email
    // and then the idempotency row suppressed retries forever.
    expect(cron).toContain('SELECT e.name, e.email FROM employee_assignments');
    const block = cron.slice(cron.indexOf('eventCategory: "fleet.speed.violation"'));
    expect(block.slice(0, 3000)).toMatch(/recipientEmail: managerEmail/);
    expect(block.slice(0, 3000)).toMatch(/recipientName: managerName/);
  });

  it("Codex P2 — daily window uses the scheduler timezone (not bare CURRENT_DATE)", () => {
    // The cron schedules in getSystemTimezone() (default Asia/Riyadh)
    // but the DB session may be UTC. Bare CURRENT_DATE measured the
    // wrong calendar day. The fix passes tz as a parameter and
    // converts occurredAt via AT TIME ZONE before comparing.
    expect(cron).toContain('getSystemTimezone()');
    expect(cron).toContain('NOW() AT TIME ZONE $2');
    expect(cron).toMatch(/fdp\."occurredAt"\s*>=\s*db\."startTs"/);
    expect(cron).toMatch(/fdp\."occurredAt"\s*<\s*db\."endTs"/);
    // Bare CURRENT_DATE bounds must be gone in the position window —
    // they would re-introduce the timezone bug.
    expect(cron).not.toMatch(/fdp\."occurredAt"\s*>=\s*\(CURRENT_DATE - INTERVAL/);
  });

  it("Codex P2 — driver lookup is constrained to the violation day (not 'latest trip')", () => {
    // A latest-by-createdAt lookup names whoever was assigned LAST,
    // even if that's a trip created the morning the cron runs for a
    // different driver. We filter trips to startTime inside the
    // violation-day window in the scheduler timezone.
    const lookup = cron.slice(cron.indexOf('FROM fleet_trips ft'));
    expect(lookup.slice(0, 2000)).toMatch(/ft\."startTime"\s*>=\s*\(\$3::date\)::timestamp AT TIME ZONE \$4/);
    expect(lookup.slice(0, 2000)).toMatch(/ft\."startTime"\s*<\s*\(\$3::date \+ 1\)::timestamp AT TIME ZONE \$4/);
    // Ordering must NOT be by createdAt (the bug) — we want the latest
    // trip THAT DAY, broken by startTime so we pick the most recent
    // actual drive on that calendar date.
    expect(lookup.slice(0, 2000)).toMatch(/ORDER BY ft\."startTime" DESC/);
    expect(lookup.slice(0, 2000)).not.toMatch(/ORDER BY ft\."createdAt"/);
  });

  it("Codex P1 (cross-slice) — slices 5 and 6 also now pass recipientEmail", () => {
    // Same dispatchNotification bug was present in slices 5 and 6
    // (vehicle replacement, driver evaluation). Fix them in the same
    // PR so they actually deliver email in production.
    const slice5 = SRC.slice(SRC.indexOf('eventCategory: "fleet.breakdown.replacement_candidate"'));
    expect(slice5.slice(0, 3000)).toMatch(/recipientEmail: managerEmail/);
    const slice6 = SRC.slice(SRC.indexOf('eventCategory: "fleet.driver.evaluation_meeting"'));
    expect(slice6.slice(0, 3000)).toMatch(/recipientEmail: managerEmail/);
  });
});
