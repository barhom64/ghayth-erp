/**
 * Organizational Enterprise Model — schema smoke (#1799 §B).
 *
 * Pins migration 274's contract for the org-model backbone:
 *   - legal_entities (multi-CR per company)
 *   - positions (admin role, distinct from job_titles)
 *   - teams + employee_team_memberships
 *   - committees + employee_committee_memberships (cross-dept)
 *   - employee_project_assignments (with allocationPercent for cost split)
 *   - branches.legalEntityId + employee_assignments.{positionId,legalEntityId}
 *
 * These are the foundational schemas that let the system answer
 * §B.4's 6 pivotal questions:
 *   من يتبع من؟ / يعتمد من؟ / يرى من؟ / يتحمل التكلفة؟ / يرتبط بـ؟ / SoD؟
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/274_org_model_foundation.sql"),
  "utf8",
);

describe("Migration 274 — legal_entities", () => {
  it("creates the table with multi-CR/VAT columns", () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS legal_entities/);
    for (const col of ['"crNumber"', '"vatNumber"', '"taxNumber"', '"nameAr"']) {
      expect(SRC).toContain(col);
    }
  });
  it("adds legalEntityId to branches (additive, nullable)", () => {
    expect(SRC).toMatch(
      /ALTER TABLE branches ADD COLUMN "legalEntityId" INTEGER REFERENCES legal_entities/,
    );
  });
  it("guards branches column with IF NOT EXISTS", () => {
    expect(SRC).toMatch(/information_schema\.columns[\s\S]*?legalEntityId/);
  });
});

describe("Migration 274 — positions catalog (distinct from job_titles)", () => {
  it("creates the positions catalog table", () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS positions/);
    expect(SRC).toMatch(/"positionKey" VARCHAR\(50\) NOT NULL/);
    expect(SRC).toMatch(/UNIQUE \("companyId", "positionKey"\)/);
  });
  it("seeds the 9 system positions (companyId NULL = template)", () => {
    for (const key of [
      "'staff'", "'specialist'", "'senior'",
      "'team_lead'", "'supervisor'", "'assistant_manager'",
      "'manager'", "'general_manager'", "'executive'",
    ]) {
      expect(SRC).toContain(key);
    }
  });
  it("seed is idempotent (ON CONFLICT DO NOTHING)", () => {
    expect(SRC).toMatch(/ON CONFLICT \("companyId", "positionKey"\) DO NOTHING/);
  });
  it("adds positionId + legalEntityId to employee_assignments", () => {
    expect(SRC).toMatch(/ADD COLUMN "positionId" INTEGER REFERENCES positions/);
    expect(SRC).toMatch(/ADD COLUMN "legalEntityId" INTEGER REFERENCES legal_entities/);
  });
});

describe("Migration 274 — teams + memberships", () => {
  it("creates the teams table linked to departments", () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS teams/);
    expect(SRC).toMatch(/"departmentId" INTEGER REFERENCES departments\(id\)/);
    expect(SRC).toMatch(/"leaderAssignmentId" INTEGER REFERENCES employee_assignments/);
  });
  it("creates employee_team_memberships with UNIQUE (assignmentId, teamId)", () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS employee_team_memberships/);
    expect(SRC).toMatch(/UNIQUE \("assignmentId", "teamId"\)/);
    expect(SRC).toMatch(/role VARCHAR\(40\) DEFAULT 'member'/);
  });
});

describe("Migration 274 — committees + memberships (cross-department)", () => {
  it("creates committees with chair + time bounds", () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS committees/);
    expect(SRC).toMatch(/"chairAssignmentId" INTEGER REFERENCES employee_assignments/);
    expect(SRC).toMatch(/"startDate" DATE/);
    expect(SRC).toMatch(/"endDate" DATE/);
    expect(SRC).toMatch(/type VARCHAR\(40\) NOT NULL/);
  });
  it("creates employee_committee_memberships with isVoting flag", () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS employee_committee_memberships/);
    expect(SRC).toMatch(/"isVoting" BOOLEAN NOT NULL DEFAULT TRUE/);
    expect(SRC).toMatch(/UNIQUE \("assignmentId", "committeeId"\)/);
  });
});

describe("Migration 274 — employee_project_assignments (cost-split bridge)", () => {
  it("creates with allocationPercent in 0-100 range", () => {
    expect(SRC).toMatch(/CREATE TABLE IF NOT EXISTS employee_project_assignments/);
    expect(SRC).toMatch(
      /"allocationPercent" NUMERIC\(5,2\) NOT NULL DEFAULT 100\.00 CHECK \("allocationPercent" > 0 AND "allocationPercent" <= 100\)/,
    );
  });
  it("links to projects + optional costCenter override", () => {
    expect(SRC).toMatch(/"projectId" INTEGER NOT NULL REFERENCES projects/);
    expect(SRC).toMatch(/"costCenterId" INTEGER REFERENCES cost_centers/);
  });
  it("supports time-bounded membership (startDate/endDate)", () => {
    expect(SRC).toMatch(/"startDate" DATE NOT NULL DEFAULT CURRENT_DATE/);
    expect(SRC).toMatch(/"endDate" DATE/);
  });
  it("UNIQUE on (assignment, project, startDate) so re-assignment after gap is allowed", () => {
    expect(SRC).toMatch(/UNIQUE \("assignmentId", "projectId", "startDate"\)/);
  });
  it("partial index on active assignments (endDate IS NULL) for fast cost rollups", () => {
    expect(SRC).toMatch(
      /idx_emp_project_assignments_active[\s\S]*?WHERE "endDate" IS NULL/,
    );
  });
});

describe("Migration 274 — backward compatibility (all additive)", () => {
  it("@rollback annotation lists all DROPs in correct dependency order", () => {
    expect(SRC).toMatch(/@rollback:/);
    // Bridges drop before parent tables.
    const rollbackBlock = SRC.slice(0, SRC.indexOf("CREATE TABLE"));
    const memberships = rollbackBlock.indexOf("DROP TABLE IF EXISTS employee_committee_memberships");
    const teams = rollbackBlock.indexOf("DROP TABLE IF EXISTS teams");
    const positions = rollbackBlock.indexOf("DROP TABLE IF EXISTS positions");
    const legalEntities = rollbackBlock.indexOf("DROP TABLE IF EXISTS legal_entities");
    expect(memberships).toBeLessThan(teams);
    expect(teams).toBeLessThan(positions);
    expect(positions).toBeLessThan(legalEntities);
  });
  it("all column additions use the IF NOT EXISTS DO $$ guard pattern", () => {
    const addCols = SRC.match(/IF NOT EXISTS \(\s*SELECT 1 FROM information_schema\.columns/g) ?? [];
    expect(addCols.length).toBeGreaterThanOrEqual(2); // branches.legalEntityId + employee_assignments cols
  });
});
