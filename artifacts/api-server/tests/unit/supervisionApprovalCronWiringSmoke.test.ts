/**
 * Supervision + Approval Authorities + Scoring Cron wiring smoke.
 *
 * Three pieces shipping together (#1799 §B + #1799 priority #10
 * cron):
 *   1. Migration 275 adds supervision_lines + approval_authorities.
 *   2. cronScheduler imports the scoring + signals engines.
 *   3. Two new cron entries (weekly + monthly) write to
 *      employee_scores + employee_signals using the engines from
 *      #1831/#1833.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIGRATION_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/275_supervision_approval_authorities.sql"),
  "utf8",
);
const CRON_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/cronScheduler.ts"),
  "utf8",
);

describe("Migration 275 — supervision_lines (matrix reporting)", () => {
  it("creates the supervision_lines table", () => {
    expect(MIGRATION_SRC).toMatch(/CREATE TABLE IF NOT EXISTS supervision_lines/);
  });

  it("supervisor + supervisee are assignment IDs (not employees)", () => {
    expect(MIGRATION_SRC).toMatch(
      /"supervisorAssignmentId" INTEGER NOT NULL REFERENCES employee_assignments/,
    );
    expect(MIGRATION_SRC).toMatch(
      /"superviseeAssignmentId" INTEGER NOT NULL REFERENCES employee_assignments/,
    );
  });

  it("lineType enum covers administrative/project/functional/dotted", () => {
    expect(MIGRATION_SRC).toMatch(
      /"lineType" IN \('administrative', 'project', 'functional', 'dotted'\)/,
    );
  });

  it("rejects self-supervision at the DB layer", () => {
    expect(MIGRATION_SRC).toMatch(
      /CHECK \("supervisorAssignmentId" <> "superviseeAssignmentId"\)/,
    );
  });

  it("UNIQUE allows multiple scopes for the same supervisor-supervisee pair", () => {
    expect(MIGRATION_SRC).toMatch(
      /UNIQUE \("supervisorAssignmentId", "superviseeAssignmentId", "lineType", "scopeType", "scopeId"\)/,
    );
  });

  it("partial indexes scope to ACTIVE supervision (endDate IS NULL)", () => {
    expect(MIGRATION_SRC).toMatch(
      /idx_supervision_lines_supervisee[\s\S]*?WHERE "endDate" IS NULL/,
    );
    expect(MIGRATION_SRC).toMatch(
      /idx_supervision_lines_supervisor[\s\S]*?WHERE "endDate" IS NULL/,
    );
  });
});

describe("Migration 275 — approval_authorities (per-person limits)", () => {
  it("creates approval_authorities scoped to assignment + feature + action", () => {
    expect(MIGRATION_SRC).toMatch(/CREATE TABLE IF NOT EXISTS approval_authorities/);
    expect(MIGRATION_SRC).toMatch(/"assignmentId" INTEGER NOT NULL REFERENCES employee_assignments/);
    expect(MIGRATION_SRC).toMatch(/"featureKey" VARCHAR\(80\) NOT NULL/);
    expect(MIGRATION_SRC).toMatch(/action VARCHAR\(40\) NOT NULL/);
  });

  it("maxAmount nullable (NULL = unlimited)", () => {
    expect(MIGRATION_SRC).toMatch(/"maxAmount" NUMERIC\(14,2\)/);
    expect(MIGRATION_SRC).toMatch(/NULL = unlimited/);
  });

  it("requires reason text (auditable override)", () => {
    expect(MIGRATION_SRC).toMatch(/reason TEXT NOT NULL/);
  });

  it("dual-control flag for high-value approvals", () => {
    expect(MIGRATION_SRC).toMatch(/"requiresDualControl" BOOLEAN NOT NULL DEFAULT FALSE/);
  });

  it("UNIQUE (assignment, feature, action, currency)", () => {
    expect(MIGRATION_SRC).toMatch(
      /UNIQUE \("assignmentId", "featureKey", action, currency\)/,
    );
  });

  it("partial index filters expired grants", () => {
    expect(MIGRATION_SRC).toMatch(
      /idx_approval_authorities_assignment[\s\S]*?WHERE "expiresAt" IS NULL OR "expiresAt" > now/,
    );
  });

  it("@rollback annotation present", () => {
    expect(MIGRATION_SRC).toMatch(/@rollback:/);
  });
});

describe("cronScheduler × Employee Scoring wiring (HR-009)", () => {
  it("imports scoreEmployee + currentPeriodKey from the scoring engine", () => {
    expect(CRON_SRC).toMatch(
      /import \{ scoreEmployee, currentPeriodKey \} from "\.\/employeeScoringEngine\.js"/,
    );
  });

  it("imports detectSignals + persistSignals from the signals engine", () => {
    expect(CRON_SRC).toMatch(
      /import \{ detectSignals, persistSignals \} from "\.\/employeeSignalsEngine\.js"/,
    );
  });

  it("declares a generic runEmployeeScoringPeriod handler for any scope", () => {
    expect(CRON_SRC).toMatch(
      /async function runEmployeeScoringPeriod\(scope: "weekly" \| "monthly" \| "quarterly"\)/,
    );
  });

  it("iterates only ACTIVE assignments", () => {
    expect(CRON_SRC).toMatch(/WHERE status = 'active'/);
  });

  it("scores then runs signals + persists when signals fire", () => {
    expect(CRON_SRC).toMatch(/await scoreEmployee\(\{/);
    expect(CRON_SRC).toMatch(/const signals = await detectSignals\(\{/);
    expect(CRON_SRC).toMatch(/if \(signals\.length > 0\) \{[\s\S]*?await persistSignals\(\{/);
  });

  it("per-row try/catch so a single failure doesn't abort the run", () => {
    const handler = CRON_SRC.slice(CRON_SRC.indexOf("async function runEmployeeScoringPeriod"));
    expect(handler).toMatch(/try \{[\s\S]*?await scoreEmployee[\s\S]*?\} catch \(e\) \{[\s\S]*?logger\.error\(e/);
  });

  it("returns a summary string (scored count + flagged count)", () => {
    expect(CRON_SRC).toMatch(/return `Employee scoring \(\$\{scope\} \$\{periodKey\}\): \$\{scored\} scored, \$\{withSignals\} flagged`/);
  });

  it("registers weekly_employee_scoring (Monday 03:00)", () => {
    expect(CRON_SRC).toMatch(
      /name: "weekly_employee_scoring"[\s\S]*?schedule: "0 3 \* \* 1"[\s\S]*?handler: weeklyEmployeeScoring/,
    );
  });

  it("registers monthly_employee_scoring (1st @ 04:00)", () => {
    expect(CRON_SRC).toMatch(
      /name: "monthly_employee_scoring"[\s\S]*?schedule: "0 4 1 \* \*"[\s\S]*?handler: monthlyEmployeeScoring/,
    );
  });
});
