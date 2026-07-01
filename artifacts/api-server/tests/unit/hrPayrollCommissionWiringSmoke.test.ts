/**
 * HR server-side phase — umrah commission lands in payroll (راتب + عمولة).
 *
 * Pins the wiring that makes approved umrah commissions flow through the
 * payroll run with a real GL trail. Verified end-to-end against a
 * provisioned head-of-main Postgres by
 * scripts/verify-umrah-commission-payroll-journey.sh (16 assertions live);
 * this source-pin keeps the wiring from silently unwinding in review.
 *
 * The invariants:
 *   1. The payroll route consumes ONLY (status='approved' AND
 *      payrollLineId IS NULL) calculations — the exactly-once gate.
 *   2. Consumption happens INSIDE the payroll transaction: lines INSERT
 *      RETURNING ids → calculations stamped paid + payrollLineId. A
 *      rollback releases everything atomically.
 *   3. payroll_lines.commission carries the amount; net includes it.
 *   4. WHT base includes commission (non-resident remuneration rule).
 *   5. The engine emits a DEDICATED commission-expense DR (op
 *      payroll_commission_expense → 5240 fallback) and SUBTRACTS the
 *      commission from the derived salary-expense figure so salary
 *      expense stays pure and the entry balances.
 *   6. Migration 288 seeds the mapping idempotently (ON CONFLICT DO
 *      NOTHING, only where 5240 exists & posts).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const HR_ROUTE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"), "utf8");
const HR_ENGINE = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/lib/engines/hrEngine.ts"), "utf8");
const MIG_288 = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/migrations/288_seed_payroll_commission_mapping.sql"), "utf8");
const JOURNEY = join(REPO_ROOT, "scripts/verify-umrah-commission-payroll-journey.sh");

describe("payroll route — commission consumption (exactly-once)", () => {
  it("selects ONLY approved + unconsumed + undeleted + positive calculations", () => {
    expect(HR_ROUTE).toMatch(/FROM employee_commission_calculations cc[\s\S]{0,400}status = 'approved' AND cc\."payrollLineId" IS NULL/);
    expect(HR_ROUTE).toMatch(/cc\."deletedAt" IS NULL AND cc\."finalAmount" > 0/);
  });

  it("commission map keyed by EMPLOYEE id (calculations are person-level)", () => {
    expect(HR_ROUTE).toMatch(/const commissionMap = new Map<number, number>\(\)/);
    expect(HR_ROUTE).toMatch(/const commissionIdsByEmployee = new Map<number, number\[\]>\(\)/);
  });

  it("net pay includes the commission earning", () => {
    // الدفعة ب: انضمّت مكافأة الحركة للصافي كذلك (bonusAmount=0 لغير المُكافَئين
    // ⇒ العمولة وأجر الساعات لا يزالان ضمن الصافي بلا تغيير سلوكي).
    expect(HR_ROUTE).toMatch(/roundTo2\(gross \+ overtime \+ commission \+ driverHoursAmount \+ bonusAmount - totalDeductions\)/);
  });

  it("WHT base includes commission (non-resident remuneration)", () => {
    // الدفعة ب: انضمّت المكافأة لوعاء WHT أيضًا (أجرٌ كالعمولة) — العمولة باقية.
    expect(HR_ROUTE).toMatch(/\(gross \+ overtime \+ commission \+ driverHoursAmount \+ bonusAmount\) \* whtRate/);
  });

  it("payroll_lines INSERT carries the commission column (23 cols) + RETURNING for stamping", () => {
    // الدفعة ب وسّعت الإدراج بعمود bonusAmount (22→23)؛ عمود العمولة باقٍ.
    expect(HR_ROUTE).toMatch(/const COLS_PER_ROW = 23;/);
    expect(HR_ROUTE).toMatch(/"stopHours","stopHoursAmount","bonusAmount"\)/);
    expect(HR_ROUTE).toMatch(/RETURNING id, "employeeId"/);
  });

  it("consumption stamps paid + payrollLineId INSIDE the transaction, re-guarded by the same gate", () => {
    expect(HR_ROUTE).toMatch(/SET status = 'paid', "payrollLineId" = \$1[\s\S]{0,200}status = 'approved' AND "payrollLineId" IS NULL/);
  });

  it("totalCommission flows to the engine alongside the per-line breakdown commission", () => {
    expect(HR_ROUTE).toMatch(/const totalCommission = roundTo2\(lines\.reduce\(\(s, l\) => s \+ l\.commission, 0\)\)/);
    expect(HR_ROUTE).toMatch(/totalCommission,\s*\n/);
    expect(HR_ROUTE).toMatch(/commission: l\.commission,/);
  });
});

describe("hrEngine — dedicated commission-expense GL line", () => {
  it("resolves op payroll_commission_expense with 5240 fallback (matches migration 288 seed)", () => {
    expect(HR_ENGINE).toMatch(/resolveAccountCode\(ctx\.companyId, "payroll_commission_expense", "debit", "5240"\)/);
  });

  it("subtracts commission from the derived salary-expense figure (keeps salary expense pure + entry balanced)", () => {
    expect(HR_ENGINE).toMatch(/bankPayout \+ gosiPayable \+ otherDeductions \+ totalWht - totalOvertime - gosiEmployer - totalCommission/);
  });

  it("per-employee breakdown emits a commission DR with the rounding remainder on the last row", () => {
    expect(HR_ENGINE).toMatch(/commissionRounded = i === lastIdx[\s\S]{0,120}totalCommission - runningCommission/);
    expect(HR_ENGINE).toMatch(/accountCode: commissionExpenseCode, debit: commissionRounded/);
  });

  it("breakdown trust check includes the commission bucket", () => {
    expect(HR_ENGINE).toMatch(/commissionDiff = Math\.abs\(roundTo2\(sumCommission\) - totalCommission\)/);
    expect(HR_ENGINE).toMatch(/breakdownTrusted = grossDiff < 0\.5 && otDiff < 0\.5 && gosiDiff < 0\.5 && commissionDiff < 0\.5/);
  });
});

describe("migration 288 — mapping seed", () => {
  it("seeds payroll_commission_expense → 5240 idempotently, only where the leaf posts", () => {
    expect(MIG_288).toMatch(/'payroll_commission_expense'/);
    expect(MIG_288).toMatch(/coa\.code = '5240' AND coa\."allowPosting" = true/);
    expect(MIG_288).toMatch(/ON CONFLICT \("companyId","operationType"\) DO NOTHING/);
  });

  it("documents rollback", () => {
    expect(MIG_288).toMatch(/@rollback:/);
  });
});

describe("journey script — live verification harness exists + executable", () => {
  it("verify-umrah-commission-payroll-journey.sh is committed and executable", () => {
    const st = statSync(JOURNEY);
    expect(st.isFile()).toBe(true);
    // eslint-disable-next-line no-bitwise
    expect(st.mode & 0o111).toBeGreaterThan(0);
  });

  it("asserts the 4 financial invariants live (line amount, 5240 DR, balanced JE, exactly-once)", () => {
    const src = readFileSync(JOURNEY, "utf8");
    expect(src).toMatch(/payroll_lines\.commission = 1500/);
    expect(src).toMatch(/accountCode."?='5240'/);
    expect(src).toMatch(/sum\(jl\.debit\)=sum\(jl\.credit\)/);
    expect(src).toMatch(/unapproved control row NOT consumed/);
  });
});
