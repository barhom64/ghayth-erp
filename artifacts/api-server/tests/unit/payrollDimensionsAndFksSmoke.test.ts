import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const HR_ENGINE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/engines/hrEngine.ts"), "utf8");
const HR_ROUTE  = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"), "utf8");
const MIGRATION_207 = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/207_dimensional_fks_integrity.sql"),
  "utf8"
);

// ─── Payroll dimensional breakdown (audit #8) ───────────────────────────────

describe("postPayrollRunGL accepts optional breakdown", () => {
  it("signature declares breakdown as optional Array", () => {
    const idx = HR_ENGINE.indexOf("async postPayrollRunGL");
    // Window widened (1800→3200): the totalCommission doc-block (umrah
    // راتب+عمولة wiring) sits between totalWht and breakdown in the
    // signature; the pin's subject is unchanged.
    const sig = HR_ENGINE.slice(idx, idx + 3200);
    expect(sig).toMatch(/breakdown\?:\s*Array<\{/);
  });

  it("each breakdown entry has employeeId + optional departmentId + branchId", () => {
    const idx = HR_ENGINE.indexOf("breakdown?:");
    const block = HR_ENGINE.slice(idx, idx + 600);
    expect(block).toContain("employeeId: number");
    expect(block).toContain("departmentId?: number | null");
    expect(block).toContain("branchId?: number | null");
    expect(block).toContain("basic: number");
    expect(block).toContain("overtime: number");
    expect(block).toContain("gosiEmployer: number");
  });

  it("breakdown is trusted when sums match within 0.5 SAR tolerance", () => {
    expect(HR_ENGINE).toContain("breakdownTrusted = grossDiff < 0.5 && otDiff < 0.5 && gosiDiff < 0.5");
  });

  it("untrusted breakdown falls back to legacy 3-line aggregate", () => {
    expect(HR_ENGINE).toMatch(/if \(breakdownTrusted\) \{[\s\S]+?\} else \{[\s\S]+?Breakdown didn't reconcile/);
  });

  it("per-employee DR lines carry employeeId + departmentId", () => {
    expect(HR_ENGINE).toContain("employeeId: e.employeeId,");
    expect(HR_ENGINE).toMatch(/e\.departmentId != null \? \{ departmentId: e\.departmentId \}/);
  });

  it("rounding remainder lands on the LAST employee row per bucket", () => {
    expect(HR_ENGINE).toMatch(/i === lastIdx[\s\S]{0,200}totalGross - runningBasic/);
  });

  it("credit liabilities stay aggregated (not split per-employee)", () => {
    // The credit lines (salaryPayable, gosiPayable, deductionsPayable)
    // are appended ONCE after debitLines, not inside the breakdown loop.
    expect(HR_ENGINE).toMatch(/accountCode: salaryPayableCode, debit: 0, credit: bankPayout/);
    expect(HR_ENGINE).not.toMatch(/breakdown\.[^.]+forEach[\s\S]{0,500}salaryPayableCode/);
  });

  it("legacy callers (no breakdown) get the aggregate debit lines (salary + OT + GOSI + commission)", () => {
    // Renamed from «Legacy 3-line aggregate» when the umrah commission
    // DR joined the aggregate (now 4 candidate lines; zero-amount lines
    // are filtered out so legacy callers still post exactly 3).
    expect(HR_ENGINE).toMatch(/\/\/ Legacy aggregate lines\.[\s\S]{0,600}debitLines\.push\([\s\S]{0,200}salaryExpenseCode/);
    expect(HR_ENGINE).toMatch(/\/\/ Legacy aggregate lines\.[\s\S]{0,800}commissionExpenseCode/);
  });
});

describe("HR payroll route wires breakdown", () => {
  it("assignments query selects departmentId", () => {
    expect(HR_ROUTE).toMatch(/SELECT ea\.id AS "assignmentId"[\s\S]{0,400}ea\."departmentId"/);
  });

  it("payroll line shape declares departmentId + branchId", () => {
    expect(HR_ROUTE).toMatch(/departmentId: number \| null; branchId: number \| null;/);
  });

  it("line.departmentId stamped from assignment", () => {
    expect(HR_ROUTE).toContain("departmentId: asn.departmentId != null ? Number(asn.departmentId) : null");
  });

  it("postPayrollRunGL call passes breakdown", () => {
    expect(HR_ROUTE).toMatch(/breakdown: lines\.map\(\(l\) => \(\{[\s\S]+?employeeId: l\.employeeId[\s\S]+?departmentId: l\.departmentId/);
  });
});

// ─── Schema FK integrity (migration 207) ───────────────────────────────────

describe("migration 207 — missing FKs added", () => {
  it("journal_lines.costCenterId references cost_centers", () => {
    expect(MIGRATION_207).toContain("journal_lines_costCenterId_fkey");
    expect(MIGRATION_207).toMatch(/journal_lines[\s\S]{0,200}REFERENCES public\.cost_centers\(id\)/);
  });

  for (const tbl of ["invoice_lines", "purchase_order_items", "goods_receipt_items"]) {
    it(`${tbl}.accountId references chart_of_accounts`, () => {
      expect(MIGRATION_207).toContain(`${tbl}_accountId_fkey`);
      expect(MIGRATION_207).toMatch(new RegExp(`${tbl}[\\s\\S]{0,200}REFERENCES public\\.chart_of_accounts\\(id\\)`));
    });
  }

  it("chart_of_accounts.parentId self-references chart_of_accounts", () => {
    expect(MIGRATION_207).toContain("chart_of_accounts_parentId_fkey");
    expect(MIGRATION_207).toMatch(/chart_of_accounts[\s\S]{0,300}REFERENCES public\.chart_of_accounts\(id\)/);
  });

  for (const col of ["accountId", "inputAccountId"]) {
    it(`tax_codes.${col} references chart_of_accounts`, () => {
      expect(MIGRATION_207).toContain(`tax_codes_${col}_fkey`);
    });
  }

  it("all FKs use NOT VALID to skip backfill validation", () => {
    // Every ADD CONSTRAINT line should end with NOT VALID.
    const adds = MIGRATION_207.match(/ADD CONSTRAINT[\s\S]{0,300}NOT VALID/g) || [];
    expect(adds.length).toBeGreaterThanOrEqual(7);
  });

  it("uses pg_constraint guard to be idempotent", () => {
    expect(MIGRATION_207).toContain("FROM pg_constraint WHERE conname");
  });

  it("@policy:breaking acknowledgement present", () => {
    expect(MIGRATION_207).toContain("@policy:breaking");
  });
});
