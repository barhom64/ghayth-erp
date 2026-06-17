import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins §5 of #1870 — operator directive «العمولة (مسوّق/راتب+عمولة)
 * تُرحَّل عبر HR».
 *
 * The commission accrual now unifies with the HR payroll obligation
 * pool by default: the CR leg routes to salary_payable (the same
 * account HR's payroll JE credits), so the marketer's "salary owed"
 * + "commission owed" surface as ONE payable to clear at payroll
 * time instead of two separate liabilities.
 *
 * Configurable via system_settings.commission_via_hr:
 *   'true'  (default) — credit salary_payable      ← unified-HR mode
 *   'false'           — credit commission_payable  ← legacy split mode
 *
 * Strict regression safety: the legacy code path is still present
 * and exercised when the flag is false, so tenants who explicitly
 * separated commission_payable from salary_payable on their CoA
 * aren't forced into the unified mode.
 */
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahCommissionEngine.ts"),
  "utf8",
);

describe("§5 — commission_via_hr setting drives the CR account", () => {
  it("reads commission_via_hr from system_settings (operator-configurable, no hardcoded direction)", () => {
    expect(ENGINE).toMatch(/SELECT value FROM system_settings[\s\S]{0,200}key = 'commission_via_hr'/);
  });

  it("scopes the lookup by companyId (no cross-tenant leak) + branchId IS NULL (company-wide setting)", () => {
    expect(ENGINE).toMatch(/"companyId" = \$1 AND "branchId" IS NULL AND key = 'commission_via_hr'/);
  });

  it("defaults to TRUE (unified HR mode) when the setting is absent", () => {
    // Operator directive — the unified-HR mode is the default for new
    // tenants. The check uses `!== "false"` so the default stays true
    // when the setting is missing or any value other than the literal
    // string "false".
    expect(ENGINE).toMatch(/\?\?\s*"true"\)\s*!==\s*"false"/);
  });
});

describe("§5 — CR account routing branches on viaHr", () => {
  it("viaHr=true credits salary_payable (HR's account, fallback 2120) — joins the payroll obligation pool", () => {
    expect(ENGINE).toMatch(/viaHr\s*\?\s*getAccountCodeFromMapping\(plan\.companyId, "salary_payable",\s*"credit", "2120"\)/);
  });

  it("viaHr=false (legacy) credits commission_payable (fallback 2155) — preserves the split-payable contract", () => {
    expect(ENGINE).toMatch(/getAccountCodeFromMapping\(plan\.companyId, "commission_payable",\s*"credit", "2155"\)/);
  });

  it("DR commission_expense (6200) is unchanged — only the payable side switches per the operator's instruction", () => {
    expect(ENGINE).toMatch(/getAccountCodeFromMapping\(plan\.companyId, "commission_expense", "debit", "6200"\)/);
  });
});

describe("§5 — operator visibility in the JE", () => {
  it("description includes 'عبر HR' tag when unified — audit trail makes the route obvious", () => {
    expect(ENGINE).toMatch(/`استحقاق عمولة \(عبر HR\) — \$\{plan\.planName\}/);
  });

  it("payable line description includes 'عبر HR' too — drill-by-account searches catch it", () => {
    expect(ENGINE).toMatch(/`عمولة مستحقة عبر HR — موظف #\$\{plan\.employeeId\}`/);
  });

  it("legacy descriptions stay byte-identical when viaHr=false (regression safety)", () => {
    expect(ENGINE).toMatch(/`استحقاق عمولة — \$\{plan\.planName\} — \$\{month\}\/\$\{year\} — موظف #\$\{plan\.employeeId\}`/);
    expect(ENGINE).toMatch(/`عمولة مستحقة — موظف #\$\{plan\.employeeId\}`/);
  });
});

describe("§5 — dimensions preserved on every JE line", () => {
  it("DR commission_expense carries employeeId + umrahSeasonId (drill-by-employee/season)", () => {
    expect(ENGINE).toMatch(/accountCode: expenseCode, debit: result\.finalAmount, credit: 0, description: `مصروف عمولة — \$\{plan\.planName\}`, employeeId: plan\.employeeId, umrahSeasonId: plan\.seasonId/);
  });

  it("CR payable line carries employeeId + umrahSeasonId — same drill works on the credit side", () => {
    expect(ENGINE).toMatch(/accountCode: payableCode, debit: 0, credit: result\.finalAmount, description: payableDescription, employeeId: plan\.employeeId, umrahSeasonId: plan\.seasonId/);
  });
});

describe("§5 — idempotency contract preserved", () => {
  it("sourceKey is unchanged: commission:planId:year:month (dedup contract intact)", () => {
    expect(ENGINE).toMatch(/sourceKey: `commission:\$\{planId\}:\$\{year\}:\$\{month\}`/);
  });

  it("posting is still gated on result.finalAmount > 0 (zero-commission months don't post)", () => {
    expect(ENGINE).toMatch(/if \(result\.finalAmount > 0\)/);
  });

  it("type='accrual' unchanged (the entry is still an accrual, just routed differently)", () => {
    expect(ENGINE).toMatch(/type: "accrual"/);
  });
});
