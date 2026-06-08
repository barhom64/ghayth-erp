/**
 * employeeScoringEngine static-shape smoke tests (#1799 priority #10).
 *
 * The engine computes a 0-100 composite score from 6 weighted
 * dimensions, persisting to `employee_scores` (migration 272). These
 * tests pin the public contract — exports, period math, the
 * dimension queries, the composite formula, the upsert SQL — without
 * a live DB. Runtime behavior is exercised by the dynamic integration
 * tests once they get wired.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ENGINE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/employeeScoringEngine.ts"),
  "utf8",
);
const MIGRATION_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/272_employee_scores.sql"),
  "utf8",
);

describe("Migration 272 — employee_scores schema", () => {
  it("creates the employee_scores table", () => {
    expect(MIGRATION_SRC).toMatch(/CREATE TABLE IF NOT EXISTS employee_scores/);
  });

  it("scopes per (assignment × scope × periodKey) — UNIQUE constraint", () => {
    expect(MIGRATION_SRC).toMatch(/UNIQUE \("assignmentId", scope, "periodKey"\)/);
  });

  it("declares the 6 dimension columns", () => {
    for (const col of [
      '"disciplineScore"',
      '"activityScore"',
      '"productivityScore"',
      '"qualityScore"',
      '"managerScore"',
      '"developmentScore"',
    ]) {
      expect(MIGRATION_SRC).toContain(col);
    }
  });

  it("declares scope CHECK enum (weekly/monthly/quarterly)", () => {
    expect(MIGRATION_SRC).toMatch(
      /scope IN \('weekly', 'monthly', 'quarterly'\)/,
    );
  });

  it("trend column is bounded -1..+1", () => {
    expect(MIGRATION_SRC).toMatch(/trend BETWEEN -1 AND 1/);
  });

  it("stores rationale + weightsUsed + rawCounters as JSONB", () => {
    expect(MIGRATION_SRC).toMatch(/rationale JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    expect(MIGRATION_SRC).toMatch(/"weightsUsed" JSONB/);
    expect(MIGRATION_SRC).toMatch(/"rawCounters" JSONB/);
  });

  it("indexes for both per-employee history and company-wide ranking", () => {
    expect(MIGRATION_SRC).toMatch(/idx_employee_scores_assignment_period/);
    expect(MIGRATION_SRC).toMatch(/idx_employee_scores_company_period/);
  });

  it("@rollback annotation present", () => {
    expect(MIGRATION_SRC).toMatch(/@rollback:/);
  });
});

describe("employeeScoringEngine — public API", () => {
  it("exports the documented entry points", () => {
    expect(ENGINE_SRC).toMatch(/export async function scoreEmployee/);
    expect(ENGINE_SRC).toMatch(/export function periodRange/);
    expect(ENGINE_SRC).toMatch(/export function currentPeriodKey/);
    expect(ENGINE_SRC).toMatch(/export const DEFAULT_WEIGHTS/);
  });

  it("DEFAULT_WEIGHTS match #1799 §F.10 (20/15/35/15/10/5)", () => {
    expect(ENGINE_SRC).toMatch(/discipline:\s*0\.20/);
    expect(ENGINE_SRC).toMatch(/activity:\s*0\.15/);
    expect(ENGINE_SRC).toMatch(/productivity:\s*0\.35/);
    expect(ENGINE_SRC).toMatch(/quality:\s*0\.15/);
    expect(ENGINE_SRC).toMatch(/manager:\s*0\.10/);
    expect(ENGINE_SRC).toMatch(/development:\s*0\.05/);
  });

  it("ScoreScope is the closed weekly|monthly|quarterly enum", () => {
    expect(ENGINE_SRC).toMatch(
      /type ScoreScope = "weekly" \| "monthly" \| "quarterly"/,
    );
  });

  it("ScoreBreakdown carries the 6 dimensions + composite + rationale + rawCounters", () => {
    for (const f of ["composite", "discipline", "activity", "productivity", "quality", "manager", "development", "rationale", "rawCounters"]) {
      expect(ENGINE_SRC).toContain(f);
    }
  });
});

describe("employeeScoringEngine — dimension queries (every counter comes from existing tables)", () => {
  it("Discipline: counts employee_violations + lateMinutes attendance", () => {
    expect(ENGINE_SRC).toMatch(/FROM employee_violations/);
    expect(ENGINE_SRC).toMatch(/FROM attendance[\s\S]*?"lateMinutes" > 0/);
  });

  it("Activity: counts audit_logs joined to users by employeeId", () => {
    expect(ENGINE_SRC).toMatch(/FROM audit_logs al\s+JOIN users u ON u\.id = al\."userId"/);
  });

  it("Productivity: counts project_tasks with status='done' in the period", () => {
    expect(ENGINE_SRC).toMatch(
      /FROM project_tasks[\s\S]*?status = 'done'[\s\S]*?"completedAt"::date BETWEEN/,
    );
  });

  it("Quality: counts reject/reopen/returned audit actions", () => {
    expect(ENGINE_SRC).toMatch(/al\.action IN \('reject', 'reopen', 'returned'\)/);
  });

  it("Manager: averages performance_reviews.overallScore (canonical schema name)", () => {
    expect(ENGINE_SRC).toMatch(/FROM performance_reviews/);
    expect(ENGINE_SRC).toMatch(/AVG\(COALESCE\("overallScore", 0\)\)/);
  });

  it("Development: counts training_enrollments with status='completed'", () => {
    expect(ENGINE_SRC).toMatch(/FROM training_enrollments[\s\S]*?status = 'completed'/);
  });
});

describe("employeeScoringEngine — composite + persistence", () => {
  it("composite uses the weighted-sum formula across all 6 dimensions", () => {
    expect(ENGINE_SRC).toMatch(/discipline \* weights\.discipline/);
    expect(ENGINE_SRC).toMatch(/activity \* weights\.activity/);
    expect(ENGINE_SRC).toMatch(/productivity \* weights\.productivity/);
    expect(ENGINE_SRC).toMatch(/quality \* weights\.quality/);
    expect(ENGINE_SRC).toMatch(/manager \* weights\.manager/);
    expect(ENGINE_SRC).toMatch(/development \* weights\.development/);
  });

  it("clamps every dimension to 0..100 (clamp helper used)", () => {
    expect(ENGINE_SRC).toMatch(/const clamp = \(n: number\): number =>/);
    expect(ENGINE_SRC).toMatch(/Math\.max\(0, Math\.min\(100, n\)\)/);
  });

  it("computes trend vs previous period of same scope", () => {
    expect(ENGINE_SRC).toMatch(
      /SELECT "compositeScore" AS score[\s\S]*?FROM employee_scores[\s\S]*?"periodKey" < \$/,
    );
    expect(ENGINE_SRC).toMatch(/trend = prev == null \? 0 : composite > prev \+ 1 \? 1 : composite < prev - 1 \? -1 : 0/);
  });

  it("UPSERT by (assignmentId, scope, periodKey) for idempotent re-runs", () => {
    expect(ENGINE_SRC).toMatch(
      /ON CONFLICT \("assignmentId", scope, "periodKey"\) DO UPDATE/,
    );
  });

  it("Rationale is Arabic per-dimension so HR can answer «لماذا 65؟»", () => {
    expect(ENGINE_SRC).toMatch(/مخالفة × 10/);
    expect(ENGINE_SRC).toMatch(/مهمة منجزة/);
    expect(ENGINE_SRC).toMatch(/متوسط تقييم المدير/);
  });

  it("Manager dimension defaults to 60 (neutral) when no review in window", () => {
    // Per #1799 — absence shouldn't crater the score.
    // overallScore is NUMERIC(3,1) on 0..10 → multiply by 10 to scale to 0..100.
    expect(ENGINE_SRC).toMatch(/ratingAvg > 0 \? clamp\(ratingAvg \* 10\) : 60/);
  });
});

describe("employeeScoringEngine — period math", () => {
  it("monthly periodKey shape: YYYY-MM", () => {
    expect(ENGINE_SRC).toMatch(/getUTCMonth\(\) \+ 1/);
    expect(ENGINE_SRC).toMatch(/padStart\(2, "0"\)/);
  });

  it("quarterly periodKey shape: YYYY-Qn", () => {
    expect(ENGINE_SRC).toMatch(/Math\.floor\(now\.getUTCMonth\(\) \/ 3\) \+ 1/);
    expect(ENGINE_SRC).toMatch(/-Q\$\{q\}/);
  });

  it("weekly periodRange uses ISO week (Jan 4 anchor)", () => {
    expect(ENGINE_SRC).toMatch(/jan4/);
    expect(ENGINE_SRC).toMatch(/week 1 is the week containing Jan 4th/);
  });
});
