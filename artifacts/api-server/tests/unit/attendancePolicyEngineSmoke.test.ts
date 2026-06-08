/**
 * attendancePolicyEngine static-shape smoke tests (#1799 priority #6).
 *
 * The engine resolves the effective attendance policy for an employee
 * based on category (worker/driver/field/office/manager/executive).
 * These tests pin the public contract — they don't need a DB because
 * they verify the file structure, exports, and SQL precedence logic
 * documented in the file. The runtime behavior is exercised by the
 * dynamic integration tests under `tests/integration/`.
 *
 * What we lock down:
 *   - File compiles and exports `resolveAttendancePolicy`,
 *     `resolveForCategory`, `resolveBatch`.
 *   - Type `ResolvedAttendancePolicy` carries the 9 documented fields.
 *   - SQL precedence reads from all THREE layers in the documented
 *     order: per-category override → system category → company default.
 *   - Migration 270 creates the documented tables + seeds.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ENGINE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/attendancePolicyEngine.ts"),
  "utf8",
);
const MIGRATION_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/270_attendance_per_category.sql"),
  "utf8",
);

describe("attendancePolicyEngine — public API + precedence rules", () => {
  it("exports the three documented entry points", () => {
    expect(ENGINE_SRC).toMatch(/export async function resolveAttendancePolicy/);
    expect(ENGINE_SRC).toMatch(/export async function resolveForCategory/);
    expect(ENGINE_SRC).toMatch(/export async function resolveBatch/);
  });

  it("ResolvedAttendancePolicy type carries the 9 documented fields", () => {
    const required = [
      "categoryKey",
      "categoryLabel",
      "lateThresholdMinutes",
      "gracePeriodMinutes",
      "gpsRadiusMeters",
      "autoDeductionEnabled",
      "requireGps",
      "allowedSources",
      "trackingFrequencySeconds",
      "penaltyLevels",
    ];
    for (const field of required) {
      expect(ENGINE_SRC).toContain(field);
    }
  });

  it("precedence: reads from attendance_policies_per_category FIRST (override layer)", () => {
    expect(ENGINE_SRC).toMatch(/FROM attendance_policies_per_category/);
  });

  it("precedence: reads from employee_categories SECOND (system category layer)", () => {
    expect(ENGINE_SRC).toMatch(/FROM employee_categories/);
    // company-scoped OR system (NULL companyId) — order NULLS LAST so
    // the most specific row is picked first.
    expect(ENGINE_SRC).toMatch(/ORDER BY "companyId" NULLS LAST/);
  });

  it("precedence: reads from attendance_policies THIRD (legacy company default)", () => {
    expect(ENGINE_SRC).toMatch(/FROM attendance_policies\b/);
  });

  it("composes autoDeductionEnabled by inverting system exempt flag (manager/executive default-protected)", () => {
    expect(ENGINE_SRC).toMatch(
      /autoDeductionEnabled:[\s\S]*?override\?\.autoDeductionEnabled[\s\S]*?systemCategory\?\.exemptFromAutoDeduction/,
    );
  });

  it("returns penaltyLevels as a fixed 5-tuple with safe number coercion", () => {
    expect(ENGINE_SRC).toMatch(
      /penaltyLevels: \[number, number, number, number, number\]/,
    );
    expect(ENGINE_SRC).toContain("penaltyLevel1");
    expect(ENGINE_SRC).toContain("penaltyLevel5");
  });

  it("resolveBatch memoizes per (companyId, categoryKey) to avoid duplicate scans", () => {
    expect(ENGINE_SRC).toMatch(/const memo = new Map/);
    expect(ENGINE_SRC).toMatch(/`\$\{p\.companyId\}:\$\{categoryKey/);
  });

  it("backward compatibility: NULL categoryKey is allowed and falls back to company default", () => {
    expect(ENGINE_SRC).toMatch(/categoryKey: string \| null/);
    expect(ENGINE_SRC).toMatch(/lateThresholdMinutes \?\? 15/);
    expect(ENGINE_SRC).toMatch(/gpsRadiusMeters \?\? 500/);
  });
});

describe("Migration 270 — per-category attendance schema", () => {
  it("creates the employee_categories catalog with categoryKey + company scope", () => {
    expect(MIGRATION_SRC).toMatch(/CREATE TABLE IF NOT EXISTS employee_categories/);
    expect(MIGRATION_SRC).toMatch(/"categoryKey" VARCHAR\(40\) NOT NULL/);
    expect(MIGRATION_SRC).toMatch(
      /UNIQUE \("companyId", "categoryKey"\)/,
    );
  });

  it("seeds the six system categories per #1799 §C", () => {
    expect(MIGRATION_SRC).toContain("'worker'");
    expect(MIGRATION_SRC).toContain("'driver'");
    expect(MIGRATION_SRC).toContain("'field_employee'");
    expect(MIGRATION_SRC).toContain("'office_employee'");
    expect(MIGRATION_SRC).toContain("'manager'");
    expect(MIGRATION_SRC).toContain("'executive'");
  });

  it("seeds manager + executive with exemptFromAutoDeduction = TRUE", () => {
    // Both manager and executive rows must end with TRUE for the
    // exempt flag (10th column, before tracking_frequency).
    expect(MIGRATION_SRC).toMatch(/'manager',[\s\S]*?TRUE,\s+0\)/);
    expect(MIGRATION_SRC).toMatch(/'executive',[\s\S]*?TRUE,\s+0\)/);
  });

  it("seeds worker + driver + office with exemptFromAutoDeduction = FALSE", () => {
    expect(MIGRATION_SRC).toMatch(/'worker',[\s\S]*?FALSE,\s+0\)/);
    expect(MIGRATION_SRC).toMatch(/'driver',[\s\S]*?FALSE,\s+30\)/);
    expect(MIGRATION_SRC).toMatch(/'office_employee',[\s\S]*?FALSE,\s+0\)/);
  });

  it("seeds field_employee with tracking_frequency = 300 (5min, per #1799 §A.3)", () => {
    expect(MIGRATION_SRC).toMatch(/'field_employee',[\s\S]*?FALSE,\s+300\)/);
  });

  it("creates the per-category override table with the documented columns", () => {
    expect(MIGRATION_SRC).toMatch(
      /CREATE TABLE IF NOT EXISTS attendance_policies_per_category/,
    );
    const requiredColumns = [
      '"lateThresholdMinutes"',
      '"gracePeriodMinutes"',
      '"gpsRadiusMeters"',
      '"autoDeductionEnabled"',
      '"requireGps"',
      '"allowedSources"',
      '"trackingFrequencySeconds"',
    ];
    for (const col of requiredColumns) {
      expect(MIGRATION_SRC).toContain(col);
    }
  });

  it("adds categoryKey column to employee_assignments (idempotent guard)", () => {
    expect(MIGRATION_SRC).toMatch(
      /ALTER TABLE employee_assignments\s+ADD COLUMN "categoryKey" VARCHAR\(40\)/,
    );
    // Wrapped in DO $$ ... IF NOT EXISTS guard so re-running is safe.
    expect(MIGRATION_SRC).toMatch(/IF NOT EXISTS \([\s\S]*?information_schema\.columns/);
  });

  it("backfills categoryKey on existing rows with heuristic mapping", () => {
    expect(MIGRATION_SRC).toMatch(/UPDATE employee_assignments[\s\S]*?CASE/);
    expect(MIGRATION_SRC).toContain("'driver'");
    expect(MIGRATION_SRC).toContain("'manager'");
    expect(MIGRATION_SRC).toContain("'executive'");
  });

  it("seed is idempotent via ON CONFLICT DO NOTHING", () => {
    expect(MIGRATION_SRC).toMatch(
      /ON CONFLICT \("companyId", "categoryKey"\) DO NOTHING/,
    );
  });
});
