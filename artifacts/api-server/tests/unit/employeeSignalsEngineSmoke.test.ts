/**
 * employeeSignalsEngine smoke tests (#1799 priority #10 §G).
 *
 * Pins the 3 detection engines (Risk / Promotion / Burnout) on top of
 * the Scoring Engine. Tests verify the rules trigger the right signal
 * types + severities + reasons, and that persistence is idempotent
 * via the UNIQUE constraint on migration 273.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ENGINE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/employeeSignalsEngine.ts"),
  "utf8",
);
const MIGRATION_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/273_employee_signals.sql"),
  "utf8",
);

describe("Migration 273 — employee_signals schema", () => {
  it("creates the employee_signals table", () => {
    expect(MIGRATION_SRC).toMatch(/CREATE TABLE IF NOT EXISTS employee_signals/);
  });

  it("enforces UNIQUE (assignmentId, signalType, scope, periodKey)", () => {
    expect(MIGRATION_SRC).toMatch(
      /UNIQUE \("assignmentId", "signalType", scope, "periodKey"\)/,
    );
  });

  it("CHECK enforces the 4 signal types (risk/promotion/burnout/custom)", () => {
    expect(MIGRATION_SRC).toMatch(/"signalType" IN \('risk', 'promotion', 'burnout', 'custom'\)/);
  });

  it("CHECK enforces 4 severities (low/medium/high/critical)", () => {
    expect(MIGRATION_SRC).toMatch(/severity IN \('low', 'medium', 'high', 'critical'\)/);
  });

  it("reasons stored as JSONB array (default [])", () => {
    expect(MIGRATION_SRC).toMatch(/reasons JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  });

  it("indexes for company dashboard + per-employee history", () => {
    expect(MIGRATION_SRC).toMatch(/idx_employee_signals_company_period/);
    expect(MIGRATION_SRC).toMatch(/idx_employee_signals_assignment/);
  });

  it("@rollback annotation present", () => {
    expect(MIGRATION_SRC).toMatch(/@rollback:/);
  });
});

describe("employeeSignalsEngine — public API", () => {
  it("exports detectSignals + persistSignals", () => {
    expect(ENGINE_SRC).toMatch(/export async function detectSignals/);
    expect(ENGINE_SRC).toMatch(/export async function persistSignals/);
  });

  it("SignalType is the closed risk|promotion|burnout enum", () => {
    expect(ENGINE_SRC).toMatch(/type SignalType = "risk" \| "promotion" \| "burnout"/);
  });

  it("SignalSeverity is the closed low|medium|high|critical enum", () => {
    expect(ENGINE_SRC).toMatch(
      /type SignalSeverity = "low" \| "medium" \| "high" \| "critical"/,
    );
  });
});

describe("Risk Engine — thresholds", () => {
  it("fires on composite < 50", () => {
    expect(ENGINE_SRC).toMatch(/if \(composite < 50\)/);
  });

  it("fires on disciplineScore < 50", () => {
    expect(ENGINE_SRC).toMatch(/if \(discipline < 50\)/);
  });

  it("fires on productivityScore < 40", () => {
    expect(ENGINE_SRC).toMatch(/if \(productivity < 40\)/);
  });

  it("fires on sustained downward trend (current AND previous = -1)", () => {
    expect(ENGINE_SRC).toMatch(/trend === -1 && prevTrend === -1/);
  });

  it("severity scales with the number of reasons (3+ ⇒ critical)", () => {
    expect(ENGINE_SRC).toMatch(/riskReasons\.length >= 3[\s\S]*?"critical"/);
  });

  it("Arabic title for the manager UI", () => {
    expect(ENGINE_SRC).toContain("موظف يحتاج متابعة");
  });
});

describe("Promotion Engine — thresholds", () => {
  it("requires composite >= 85", () => {
    expect(ENGINE_SRC).toMatch(/composite >= 85/);
  });

  it("requires disciplineScore >= 90", () => {
    expect(ENGINE_SRC).toMatch(/discipline >= 90/);
  });

  it("requires productivityScore >= 80", () => {
    expect(ENGINE_SRC).toMatch(/productivity >= 80/);
  });

  it("requires qualityScore >= 80", () => {
    expect(ENGINE_SRC).toMatch(/quality >= 80/);
  });

  it("only fires when at least 3 promotion criteria are met", () => {
    expect(ENGINE_SRC).toMatch(/promoReasons\.length >= 3/);
  });

  it("Arabic title for HR dashboard", () => {
    expect(ENGINE_SRC).toContain("مرشّح للترقية أو المكافأة");
  });
});

describe("Burnout Engine — thresholds", () => {
  it("fires on high productivity + dropping discipline", () => {
    expect(ENGINE_SRC).toMatch(/productivity >= 70 && discipline < 65/);
  });

  it("fires on sudden composite drop ≥ 15 points", () => {
    expect(ENGINE_SRC).toMatch(/prevComposite - composite >= 15/);
  });

  it("fires on high overtime + zero leaves in window", () => {
    expect(ENGINE_SRC).toMatch(/totalOvertime >= 1200 && leaves === 0/);
  });

  it("Arabic title", () => {
    expect(ENGINE_SRC).toContain("احتمال إرهاق وظيفي");
  });
});

describe("persistSignals — idempotency + acknowledgement reset", () => {
  it("UPSERT with ON CONFLICT keeps re-runs idempotent", () => {
    expect(ENGINE_SRC).toMatch(
      /ON CONFLICT \("assignmentId","signalType",scope,"periodKey"\) DO UPDATE/,
    );
  });

  it("acknowledgedAt resets ONLY when severity escalates", () => {
    expect(ENGINE_SRC).toMatch(/"acknowledgedAt" = CASE/);
    expect(ENGINE_SRC).toMatch(/severity = 'low' AND EXCLUDED\.severity != 'low' THEN NULL/);
    expect(ENGINE_SRC).toMatch(/severity = 'high' AND EXCLUDED\.severity = 'critical' THEN NULL/);
  });

  it("severity downgrade preserves acknowledgement", () => {
    expect(ENGINE_SRC).toMatch(/ELSE employee_signals\."acknowledgedAt"/);
  });
});

describe("Per-period boundary helpers", () => {
  it("monthly: YYYY-MM → first..last of month", () => {
    expect(ENGINE_SRC).toMatch(/periodKey\.split\("-"\);/);
    // last-day computation = day 0 of next month
    expect(ENGINE_SRC).toMatch(/Date\.UTC\(Number\(y\), Number\(m\), 0\)/);
  });

  it("quarterly: YYYY-Qn → first..last of quarter", () => {
    expect(ENGINE_SRC).toMatch(/periodKey\.split\("-Q"\)/);
    expect(ENGINE_SRC).toMatch(/Number\(q\) - 1\) \* 3 \+ 1/);
  });

  it("weekly: ISO-week (Jan 4 anchor)", () => {
    expect(ENGINE_SRC).toMatch(/jan4 = new Date\(Date\.UTC\(year, 0, 4\)\)/);
  });
});
