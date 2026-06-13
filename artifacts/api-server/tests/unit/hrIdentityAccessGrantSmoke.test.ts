/**
 * PR-8a (#2077) — identity de-duplication smoke.
 *
 * The operational incident: the test admin appeared SEVEN times in
 * /employees (one row per Al-Diyaa branch) because the access-grant
 * script created an owner employee_assignment per branch. Every
 * engine that iterates «active assignments» multiplied the person:
 * 7 payroll lines, 7 absence rows/day, 8 composite scores.
 *
 * The fix separates the three concepts the product owner mandated:
 *   الانتساب الوظيفي — ONE employment row (isAccessGrant=FALSE).
 *   نطاق الصلاحية    — authMiddleware expands branch access for
 *                       owner/GM from a single assignment; the
 *                       per-branch rows are isAccessGrant=TRUE.
 *   السياق النشط     — company/branch/role switcher (unchanged).
 *
 * Pins: migration shape + the four operational exclusions + the
 * grant script marking its rows.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIGRATION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/289_access_grant_assignments.sql"), "utf8");
const EMPLOYEES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/employees.ts"), "utf8");
const HR = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"), "utf8");
const CRON = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/cronScheduler.ts"), "utf8");
const GRANT_SCRIPT = readFileSync(
  join(REPO_ROOT, "db/grant-admin-aldiyaa-access.sql"), "utf8");

describe("PR-8a (#2077) — migration 289 adds isAccessGrant + backfills duplicates", () => {
  it("adds the column with FALSE default", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN "isAccessGrant" BOOLEAN DEFAULT FALSE/);
  });
  it("backfill keeps MIN(id) per (employee, company) and marks the rest — owner/GM only", () => {
    expect(MIGRATION).toMatch(/SET "isAccessGrant" = TRUE[\s\S]{0,300}role IN \('owner', 'general_manager'\)/);
    expect(MIGRATION).toMatch(/SELECT MIN\(ea2\.id\) FROM employee_assignments ea2/);
  });
  it("cleans synthetic absent rows + scores computed on access-grant assignments", () => {
    expect(MIGRATION).toMatch(/DELETE FROM attendance a[\s\S]{0,300}"isAccessGrant" = TRUE[\s\S]{0,200}status = 'absent'/);
    expect(MIGRATION).toMatch(/DELETE FROM employee_scores s[\s\S]{0,200}"isAccessGrant" = TRUE/);
  });
});

describe("PR-8a (#2077) — the four operational exclusions", () => {
  it("1. GET /employees list excludes access grants (admin no longer 7×)", () => {
    expect(EMPLOYEES).toMatch(/JOIN employee_assignments ea ON ea\."employeeId" = e\.id\s*AND ea\."isAccessGrant" = FALSE[\s\S]{0,300}LEFT JOIN branches b/);
  });
  it("2. GET /employees count excludes access grants (pagination consistent)", () => {
    expect(EMPLOYEES).toMatch(/SELECT COUNT\(\*\) AS total\s*FROM employees e\s*JOIN employee_assignments ea ON ea\."employeeId" = e\.id\s*AND ea\."isAccessGrant" = FALSE/);
  });
  it("3. payroll run generation + completeness pre-check exclude access grants (no 7× salary)", () => {
    expect(HR).toMatch(/COUNT\(\*\) AS cnt FROM employee_assignments WHERE "companyId" = \$1 AND status = 'active' AND "isAccessGrant" = FALSE/);
    expect(HR).toMatch(/WHERE ea\."companyId" = \$1 AND ea\.status = 'active' AND ea\."isAccessGrant" = FALSE/);
  });
  it("4a. daily absent-marking cron excludes access grants (no absence per branch)", () => {
    expect(CRON).toMatch(/'absent', NOW\(\)[\s\S]{0,400}AND ea\."isAccessGrant" = FALSE/);
  });
  it("4b. scoring cron excludes access grants (one person = one score)", () => {
    expect(CRON).toMatch(/FROM employee_assignments\s*WHERE status = 'active'[\s\S]{0,300}AND "isAccessGrant" = FALSE/);
  });
});

describe("PR-8a (#2077) — the grant script marks its rows as access grants", () => {
  it("INSERT carries isAccessGrant TRUE", () => {
    expect(GRANT_SCRIPT).toMatch(/"isPrimary", status, "isAccessGrant"[\s\S]{0,200}'active', TRUE/);
  });
});

describe("PR-8a (#2077) — authMiddleware still expands access (the separation holds)", () => {
  it("owner/GM branch expansion is untouched (access ≠ employment)", () => {
    const AUTH = readFileSync(
      join(REPO_ROOT, "artifacts/api-server/src/middlewares/authMiddleware.ts"), "utf8");
    // The expansion block reads ALL owner/GM assignments — including
    // access grants — so branch switching keeps working with ONE
    // employment row. Pin its presence.
    expect(AUTH).toMatch(/SELECT id FROM branches WHERE "companyId" = ANY\(\$1\)/);
    // And it must NOT have been "fixed" to exclude access grants —
    // access grants exist precisely to feed this path.
    const expansionBlock = AUTH.match(/ownerAssignments[\s\S]{0,800}companyBranches/)?.[0] || "";
    expect(expansionBlock).not.toMatch(/isAccessGrant/);
  });
});
