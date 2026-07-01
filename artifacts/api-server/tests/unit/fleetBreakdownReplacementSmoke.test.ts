/**
 * Spec ملف 04 §تنبيهات الأسطول السبعة:
 *   «إذا تكررت أعطال مركبة (3 فأكثر/شهر) → تنبيه: هل تُستبدل المركبة؟»
 *
 * Slice 5 of 9. Scope: when a vehicle accumulates 3+ breakdowns in the
 * CURRENT calendar month, fire a single email to the branch director (or
 * company GM/owner) asking the replacement question. Idempotent per
 * (vehicleId, month) via a new dedicated table.
 *
 * The existing smartAlerts.checkVehicleRepeatedBreakdowns uses a 90-day
 * window and only sets the vehicle status to under_review — it doesn't
 * send a targeted email asking the replacement question (and 90 days
 * isn't a calendar month). This slice closes that gap.
 *
 * This test pins:
 *   1. Migration 425 seeds `fleet.breakdown.replacement_candidate`
 *      (ar+en email) as a GLOBAL default (companyId IS NULL).
 *   2. Migration 426 creates `fleet_replacement_alerts` with a PK on
 *      (vehicleId, alertMonth) and the >=3 count check constraint.
 *   3. The cron query groups breakdowns by vehicle for the CURRENT
 *      calendar month (date_trunc('month', CURRENT_DATE)), not a
 *      rolling 90-day window.
 *   4. Cancelled breakdowns are EXCLUDED from the count (status != 'cancelled').
 *   5. The dispatch uses channels=["email"] only — NO in_app fan-out
 *      (the slice-1 Codex P2 lesson).
 *   6. The dispatch routes to a specific assignmentId (not a broadcast).
 *   7. The cron records into fleet_replacement_alerts AFTER dispatch
 *      succeeds (so retries are correct).
 *   8. The job is registered in the cron job list with the correct name.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "lib", "cronScheduler.ts"),
  "utf8",
);
const TMPL_MIG = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "migrations", "425_seed_fleet_breakdown_replacement_template.sql"),
  "utf8",
);
const TBL_MIG = readFileSync(
  join(import.meta.dirname!, "..", "..", "src", "migrations", "426_fleet_replacement_alerts_table.sql"),
  "utf8",
);

function section(marker: string, len = 8000): string {
  const idx = SRC.indexOf(marker);
  return idx === -1 ? "" : SRC.slice(idx, idx + len);
}

describe("Vehicle replacement-candidate alert (3+ breakdowns/month) — spec ملف 04", () => {
  const cron = section("async function dailyVehicleReplacementCheck");

  it("migration 425 seeds the template as ar+en email, GLOBAL default", () => {
    const key = "'fleet.breakdown.replacement_candidate'";
    const count = TMPL_MIG.split(key).length - 1;
    // Once per language (2 rows) + once in the @rollback comment.
    expect(count, "template should appear ≥2× (ar+en) in 425").toBeGreaterThanOrEqual(2);
    expect(TMPL_MIG).toContain("WHERE NOT EXISTS"); // idempotent
    // Codex P2 lesson from slice 3 — seed as GLOBAL so bootstrapCompany
    // inherits it for new companies too.
    expect(TMPL_MIG).toMatch(/SELECT\s+NULL::int,\s+t\."templateKey"/);
    expect(TMPL_MIG).toContain('nt."companyId" IS NULL');
  });

  it("migration 425 has the 6 placeholders the cron sends", () => {
    for (const ph of ["managerName", "plateNumber", "vehicleName", "breakdownCount", "month", "categories"]) {
      expect(TMPL_MIG, `template missing placeholder {{${ph}}}`).toContain(`{{${ph}}}`);
    }
  });

  it("migration 425 ONLY uses email channel (no in_app / sms / whatsapp for managers)", () => {
    // Slice-1 Codex lesson: internal-manager templates must be email-only.
    expect(TMPL_MIG).not.toMatch(/'fleet\.breakdown\.replacement_candidate',\s*'in_app'/);
    expect(TMPL_MIG).not.toMatch(/'fleet\.breakdown\.replacement_candidate',\s*'sms'/);
    expect(TMPL_MIG).not.toMatch(/'fleet\.breakdown\.replacement_candidate',\s*'whatsapp'/);
    // Affirmatively: email tuples present.
    expect(TMPL_MIG).toMatch(/'fleet\.breakdown\.replacement_candidate',\s*'email',\s*'ar'/);
    expect(TMPL_MIG).toMatch(/'fleet\.breakdown\.replacement_candidate',\s*'email',\s*'en'/);
  });

  it("migration 426 creates fleet_replacement_alerts with the right PK + count check", () => {
    expect(TBL_MIG).toMatch(/CREATE TABLE IF NOT EXISTS fleet_replacement_alerts/);
    // PK on (vehicleId, alertMonth) for natural idempotency.
    expect(TBL_MIG).toMatch(/PRIMARY KEY\s*\(\s*"vehicleId",\s*"alertMonth"\s*\)/);
    // Count check: only the 3+ case is allowed in.
    expect(TBL_MIG).toMatch(/"breakdownCount"\s*>=\s*3/);
    // Month is normalised to first-of-month.
    expect(TBL_MIG).toMatch(/date_trunc\('month',\s*"alertMonth"\)/);
    // tenant-isolated.
    expect(TBL_MIG).toContain('"companyId"');
    expect(TBL_MIG).toContain('REFERENCES companies(id)');
  });

  it("the cron groups breakdowns by vehicle for the CURRENT calendar month (not 90-day rolling)", () => {
    // The spec is explicit: 3+ per MONTH (calendar). Not 90 days like
    // smartAlerts.checkVehicleRepeatedBreakdowns. This is what makes
    // slice 5 distinct from the existing smart-alert path.
    expect(cron).toMatch(/date_trunc\('month',\s*CURRENT_DATE\)/);
    expect(cron).toMatch(/HAVING COUNT\(b\.id\)\s*>=\s*3/);
    // And the SELECT is GROUPed by vehicle (so we get one row per candidate).
    expect(cron).toMatch(/GROUP BY fv\.id/);
  });

  it("the cron EXCLUDES cancelled breakdowns from the count", () => {
    // A cancelled breakdown is one that turned out to be a false report
    // or a duplicate — it should not push the vehicle into replacement
    // candidacy.
    expect(cron).toMatch(/b\.status\s*<>\s*'cancelled'/);
    // Soft-deleted records must also be excluded.
    expect(cron).toContain('b."deletedAt" IS NULL');
  });

  it("idempotency: the cron checks fleet_replacement_alerts BEFORE dispatching", () => {
    // The pattern mirrors slice-3's late_rent_actions guard. The check
    // must come before the dispatchNotification call so we don't re-fire
    // when the cron runs a second time the same day.
    const guardIdx = cron.indexOf('SELECT 1 FROM fleet_replacement_alerts');
    const dispatchIdx = cron.indexOf('templateKey: "fleet.breakdown.replacement_candidate"');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeGreaterThan(guardIdx);
  });

  it("dispatch routes to a specific assignmentId with email-only channels (no in_app fan-out)", () => {
    expect(cron).toContain('templateKey: "fleet.breakdown.replacement_candidate"');
    expect(cron).toContain('eventCategory: "fleet.breakdown.replacement_candidate"');
    // Anchor at eventCategory so the slice covers BOTH `channels:` (which
    // syntactically precedes templateKey in dispatchNotification args)
    // AND `assignmentId:` (which follows templateVars).
    const block = cron.slice(cron.indexOf('eventCategory: "fleet.breakdown.replacement_candidate"'));
    expect(block.slice(0, 3000)).toContain('channels: ["email" as const]');
    // And routes via assignmentId, NOT recipientEmail (which would be
    // for tenant-facing notifications — the manager has no tenant role).
    expect(block.slice(0, 3000)).toMatch(/assignmentId: managerAssignment/);
  });

  it("dispatch resolves the manager via branch director → company GM/owner fallback", () => {
    // For the alert to reach someone even when the branch has no GM,
    // the cron falls back to the company-level owner/GM.
    expect(cron).toContain('getDirectorAssignmentId(');
    // Fallback query when no branch director is found.
    expect(cron).toMatch(/role IN \('general_manager','owner'\)/);
  });

  it("the alert row is INSERTed AFTER the dispatch (so a failed dispatch can retry tomorrow)", () => {
    // If we recorded BEFORE dispatching, a failed dispatch would suppress
    // tomorrow's retry — silent loss of the alert. Order matters.
    const dispatchIdx = cron.indexOf('templateKey: "fleet.breakdown.replacement_candidate"');
    const insertIdx = cron.indexOf('INSERT INTO fleet_replacement_alerts');
    expect(insertIdx).toBeGreaterThan(dispatchIdx);
    // The INSERT uses ON CONFLICT DO NOTHING — defensive against
    // race conditions in the rare double-run.
    expect(cron).toMatch(/ON CONFLICT\s*\(\s*"vehicleId",\s*"alertMonth"\s*\)\s*DO NOTHING/);
  });

  it("templateVars match the seeded placeholders EXACTLY (interpolateTemplate is strict)", () => {
    const dispatch = cron.slice(cron.indexOf('templateKey: "fleet.breakdown.replacement_candidate"'));
    for (const v of ["managerName", "plateNumber", "vehicleName", "breakdownCount", "month", "categories"]) {
      expect(dispatch, `templateVars missing ${v}`).toContain(`${v}:`);
    }
  });

  it("the cron is registered in the job list with the right name + schedule + handler", () => {
    expect(SRC).toContain('"daily_vehicle_replacement_check"');
    expect(SRC).toContain('handler: dailyVehicleReplacementCheck');
    // Daily morning — must catch the day the 3rd breakdown happens.
    expect(SRC).toMatch(/"daily_vehicle_replacement_check"[\s\S]{0,200}schedule:\s*"\d+\s+\d+\s+\*\s+\*\s+\*"/);
  });

  it("the message asks the replacement question explicitly (per spec)", () => {
    // Spec literally says «هل تُستبدل المركبة؟» — the seed body must
    // surface that question to the manager, not just dump stats.
    expect(TMPL_MIG).toMatch(/استبدال|تُستبدل|replacement/i);
  });
});
