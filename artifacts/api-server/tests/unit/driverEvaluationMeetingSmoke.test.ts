/**
 * Spec ملف 04 §تنبيهات الأسطول السبعة:
 *   «تقييم سائق أقل من 3 = اجتماع تقييم أداء»
 *
 * Slice 6 of 9. Scope: when a driver's reputation score drops below the
 * threshold, fire a single internal email to the branch manager / HR
 * manager (with company-level fallback) asking them to schedule an
 * evaluation meeting. Idempotent per (driverId, month) via a dedicated
 * table.
 *
 * KEY POLICY DECISION (documented in the migration too):
 *   The spec uses a 1–5 scale ("<3") but the system stores
 *   `fleet_drivers.reputationScore` on 0–100 (computed over a 90-day
 *   window by `driverReputation.ts` as a blend of on-time/completion/
 *   start rates). Mapping: 3/5 = 60/100. Threshold is therefore
 *   `< 60`, which captures "below-average performance" drivers
 *   who need intervention, not just the worst.
 *
 * This test pins:
 *   1. Migration 431 seeds `fleet.driver.evaluation_meeting` (ar+en
 *      email) as a GLOBAL default (companyId IS NULL).
 *   2. The template explains the < 60 threshold to the reader so the
 *      policy is visible (per ghayth-constitution transparency rule).
 *   3. Migration 432 creates `fleet_driver_evaluation_alerts` with the
 *      right PK (driverId, alertMonth) and the < 60 score check.
 *   4. The cron filters fleet_drivers on `reputationScore < 60` AND
 *      requires `reputationComputedAt IS NOT NULL` (so we don't alarm
 *      on the seeded NULL-score default for fresh hires).
 *   5. The dispatch uses channels=["email"] only — NO in_app fan-out.
 *   6. The dispatch routes to a specific assignmentId via
 *      getManagerAssignmentId(branchId) with company-level fallback.
 *   7. The idempotency check fires BEFORE dispatch; the row is INSERTED
 *      AFTER, so a failed dispatch can be retried the next day.
 *   8. The job is registered in the cron job list and runs daily.
 *   9. The vehicle-replacement cron (slice 5) and other prior crons
 *      are still in place — slice 6 is purely additive.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "lib", "cronScheduler.ts"),
  "utf8",
);
const TMPL_MIG = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "migrations", "431_seed_driver_evaluation_meeting_template.sql"),
  "utf8",
);
const TBL_MIG = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "migrations", "432_driver_evaluation_alerts_table.sql"),
  "utf8",
);

function section(marker: string, len = 8000): string {
  const idx = SRC.indexOf(marker);
  return idx === -1 ? "" : SRC.slice(idx, idx + len);
}

describe("Driver evaluation-meeting alert (reputation < 60) — spec ملف 04", () => {
  const cron = section("async function dailyDriverEvaluationCheck");

  it("migration 431 seeds the template as ar+en email, GLOBAL default", () => {
    const key = "'fleet.driver.evaluation_meeting'";
    const count = TMPL_MIG.split(key).length - 1;
    expect(count, "template should appear ≥2× (ar+en) in 431").toBeGreaterThanOrEqual(2);
    expect(TMPL_MIG).toContain("WHERE NOT EXISTS");
    expect(TMPL_MIG).toMatch(/SELECT\s+NULL::int,\s+t\."templateKey"/);
    expect(TMPL_MIG).toContain('nt."companyId" IS NULL');
  });

  it("migration 431 has the 7 placeholders the cron sends", () => {
    for (const ph of ["managerName", "driverName", "reputationScore", "tripsConsidered", "onTimeRate", "completionRate", "period"]) {
      expect(TMPL_MIG, `template missing placeholder {{${ph}}}`).toContain(`{{${ph}}}`);
    }
  });

  it("migration 431 documents the < 60 (= 3/5) threshold transparently", () => {
    // ghayth-constitution: business decisions must be documented at the
    // decision site. The < 60 mapping must surface in the body so anyone
    // reading the alert understands WHY the driver was flagged.
    expect(TMPL_MIG).toMatch(/أقل من 60|below 60/);
  });

  it("migration 431 ONLY uses email channel (no in_app / sms / whatsapp for managers)", () => {
    // Slice-1 Codex lesson: internal-manager templates must be email-only.
    expect(TMPL_MIG).not.toMatch(/'fleet\.driver\.evaluation_meeting',\s*'in_app'/);
    expect(TMPL_MIG).not.toMatch(/'fleet\.driver\.evaluation_meeting',\s*'sms'/);
    expect(TMPL_MIG).not.toMatch(/'fleet\.driver\.evaluation_meeting',\s*'whatsapp'/);
    expect(TMPL_MIG).toMatch(/'fleet\.driver\.evaluation_meeting',\s*'email',\s*'ar'/);
    expect(TMPL_MIG).toMatch(/'fleet\.driver\.evaluation_meeting',\s*'email',\s*'en'/);
  });

  it("migration 432 creates fleet_driver_evaluation_alerts with the right PK + score check", () => {
    expect(TBL_MIG).toMatch(/CREATE TABLE IF NOT EXISTS fleet_driver_evaluation_alerts/);
    expect(TBL_MIG).toMatch(/PRIMARY KEY\s*\(\s*"driverId",\s*"alertMonth"\s*\)/);
    // Score check enforces the 0..<60 invariant so a buggy cron can't
    // insert a row for a high-rep driver.
    expect(TBL_MIG).toMatch(/"reputationScoreAtAlert"\s*>=\s*0/);
    expect(TBL_MIG).toMatch(/"reputationScoreAtAlert"\s*<\s*60/);
    // Month first-of-month invariant (same pattern as slice 5).
    expect(TBL_MIG).toMatch(/date_trunc\('month',\s*"alertMonth"\)/);
    // Tenant-isolated.
    expect(TBL_MIG).toContain('"companyId"');
    expect(TBL_MIG).toContain('REFERENCES companies(id)');
    // FK to fleet_drivers so deleting a driver cascades the alerts.
    expect(TBL_MIG).toContain('REFERENCES fleet_drivers(id) ON DELETE CASCADE');
  });

  it("the cron filters by reputationScore < 60 AND requires reputationComputedAt IS NOT NULL", () => {
    // < 60 = the 3/5 threshold mapped to 0..100.
    expect(cron).toMatch(/fd\."reputationScore"\s*<\s*60/);
    // Fresh hires have reputationScore = NULL — they must NOT be alerted
    // before the first reputation compute (driverReputation.ts treats
    // NULL as neutral). This is the equivalent of slice 5's "exclude
    // soft-deleted breakdowns" guard — fence the data plane against
    // false positives.
    expect(cron).toContain('fd."reputationComputedAt" IS NOT NULL');
    expect(cron).toContain('fd."reputationScore" IS NOT NULL');
    // Soft-deleted drivers must also be excluded.
    expect(cron).toContain('fd."deletedAt" IS NULL');
  });

  it("idempotency: the cron checks fleet_driver_evaluation_alerts BEFORE dispatching", () => {
    const guardIdx = cron.indexOf('SELECT 1 FROM fleet_driver_evaluation_alerts');
    const dispatchIdx = cron.indexOf('templateKey: "fleet.driver.evaluation_meeting"');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(guardIdx);
  });

  it("dispatch routes to a specific assignmentId with email-only channels (no in_app fan-out)", () => {
    expect(cron).toContain('templateKey: "fleet.driver.evaluation_meeting"');
    expect(cron).toContain('eventCategory: "fleet.driver.evaluation_meeting"');
    const block = cron.slice(cron.indexOf('eventCategory: "fleet.driver.evaluation_meeting"'));
    expect(block.slice(0, 3000)).toContain('channels: ["email" as const]');
    expect(block.slice(0, 3000)).toMatch(/assignmentId: managerAssignment/);
  });

  it("dispatch resolves the manager via getManagerAssignmentId with hr→gm→owner company fallback", () => {
    // getManagerAssignmentId returns the first of branch_manager →
    // hr_manager → general_manager → owner at the branch level. The
    // company-level fallback (when no branch director exists) goes
    // hr_manager → general_manager → owner.
    expect(cron).toContain('getManagerAssignmentId(');
    expect(cron).toMatch(/role IN \('hr_manager','general_manager','owner'\)/);
  });

  it("the alert row is INSERTed AFTER the dispatch (so a failed dispatch can retry tomorrow)", () => {
    const dispatchIdx = cron.indexOf('templateKey: "fleet.driver.evaluation_meeting"');
    const insertIdx = cron.indexOf('INSERT INTO fleet_driver_evaluation_alerts');
    expect(insertIdx).toBeGreaterThan(dispatchIdx);
    expect(cron).toMatch(/ON CONFLICT\s*\(\s*"driverId",\s*"alertMonth"\s*\)\s*DO NOTHING/);
  });

  it("templateVars match the seeded placeholders EXACTLY (interpolateTemplate is strict)", () => {
    const dispatch = cron.slice(cron.indexOf('eventCategory: "fleet.driver.evaluation_meeting"'));
    for (const v of ["managerName", "driverName", "reputationScore", "tripsConsidered", "onTimeRate", "completionRate", "period"]) {
      expect(dispatch.slice(0, 3000), `templateVars missing ${v}`).toContain(`${v}:`);
    }
  });

  it("the cron is registered in the job list (daily, with the right handler)", () => {
    expect(SRC).toContain('"daily_driver_evaluation_check"');
    expect(SRC).toContain('handler: dailyDriverEvaluationCheck');
    expect(SRC).toMatch(/"daily_driver_evaluation_check"[\s\S]{0,200}schedule:\s*"\d+\s+\d+\s+\*\s+\*\s+\*"/);
  });

  it("slice 6 is ADDITIVE — slice 5 (vehicle_replacement) and earlier crons still wired", () => {
    expect(SRC).toContain('"daily_vehicle_replacement_check"');
    expect(SRC).toContain('handler: dailyVehicleReplacementCheck');
    // Other notable crons that earlier slices touched should not disappear.
    expect(SRC).toContain('"monthly_rent_penalties"');
    expect(SRC).toContain('"daily_property_check"');
  });
});
