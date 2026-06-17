/**
 * HR-REV-1 council decision — salary/bank field masking for department-scoped
 * HR readers. Migration 387 seeds rbac_field_policies on hr.employees so
 * hr_specialist / department_manager / tpl_department_manager no longer see raw
 * salary, bankAccount, IBAN (national IDs masked) — matching tpl_hr_clerk
 * (migration 110). Source-only; no database.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const MIG = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/387_hr_rev1_salary_field_masking.sql"),
  "utf8",
);

describe("HR-REV-1 — salary masking migration 387", () => {
  it("seeds into rbac_field_policies on feature hr.employees, idempotently", () => {
    expect(MIG).toMatch(/INSERT INTO rbac_field_policies \(role_id, feature_key, field_name, mode\)/);
    expect(MIG).toMatch(/ON CONFLICT \(role_id, feature_key, field_name\) DO NOTHING/);
    expect(MIG).toMatch(/@rollback:/);
  });

  it("hides salary, bankAccount and iban for each targeted role", () => {
    for (const role of ["hr_specialist", "department_manager", "tpl_department_manager"]) {
      expect(MIG).toMatch(new RegExp(`'${role}',\\s+'hr\\.employees', 'salary',\\s+'hidden'`));
      expect(MIG).toMatch(new RegExp(`'${role}',\\s+'hr\\.employees', 'bankAccount',\\s+'hidden'`));
      expect(MIG).toMatch(new RegExp(`'${role}',\\s+'hr\\.employees', 'iban',\\s+'hidden'`));
    }
  });

  it("masks the national/iqama/passport IDs (not fully hidden)", () => {
    expect(MIG).toMatch(/'hr_specialist',\s+'hr\.employees', 'nationalId',\s+'masked'/);
    expect(MIG).toMatch(/'department_manager',\s+'hr\.employees', 'iqamaNumber',\s+'masked'/);
  });

  it("targets the global template/system roles (companyId IS NULL), like migration 110", () => {
    expect(MIG).toMatch(/WHERE r\."companyId" IS NULL AND r\.role_key = p\.role_key/);
  });

  it("does NOT mask the compensation-mandate roles (owner/gm/hr_manager/payroll_officer/branch_manager)", () => {
    expect(MIG).not.toMatch(/'hr_manager',\s+'hr\.employees', 'salary'/);
    expect(MIG).not.toMatch(/'payroll_officer',\s+'hr\.employees', 'salary'/);
    expect(MIG).not.toMatch(/'branch_manager',\s+'hr\.employees', 'salary'/);
    expect(MIG).not.toMatch(/'general_manager',\s+'hr\.employees', 'salary'/);
  });
});
