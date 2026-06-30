import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * مكافآت حركات النقل (الدفعة ب) — تحقّق ساكن للتوصيل:
 *   • القيد: بند المكافأة على payroll_lines + سطر مدين 5245 عبر محرّك HR.
 *   • المكافأة حافز — **لا تخضع لـGOSI** (قرار إبراهيم)؛ مضافة للصافي وWHT.
 *   • قفل الحدود: ختم مكافآت الأسطول عبر مكتبة الأسطول (markMovementBonusesConsumed)
 *     لا بكتابة مباشرة في راوت HR. التوازن مُغطّى في payrollBonusesGL (assertion).
 */
const apiSrc = join(import.meta.dirname!, "../../src");
const read = (p: string) => readFileSync(join(apiSrc, p), "utf8");

const HR_ROUTE = read("routes/hr.ts");
const HR_ENGINE = read("lib/engines/hrEngine.ts");
const BONUS_LIB = read("lib/fleet/movementBonuses.ts");

describe("الدفعة ب — الهجرات", () => {
  it("446 يضيف عمود bonusAmount على payroll_lines توسعيًا", () => {
    const p = "migrations/446_payroll_lines_bonus.sql";
    expect(existsSync(join(apiSrc, p))).toBe(true);
    const m = read(p);
    expect(m).toContain("@rollback");
    expect(m).toContain('ADD COLUMN IF NOT EXISTS "bonusAmount"');
  });
  it("447 يُنشئ حساب 5245 قابلًا للترحيل + يربط العملية (idempotent)", () => {
    const p = "migrations/447_seed_driver_bonus_gl.sql";
    expect(existsSync(join(apiSrc, p))).toBe(true);
    const m = read(p);
    expect(m).toContain("@rollback");
    expect(m).toMatch(/INSERT INTO chart_of_accounts[\s\S]*?'5245'[\s\S]*?"allowPosting"/);
    expect(m).toMatch(/accounting_mappings[\s\S]*?'payroll_driver_bonus_expense'[\s\S]*?ON CONFLICT/);
  });
});

describe("مسيّر الرواتب — routes/hr.ts", () => {
  it("يقرأ المكافآت المعتمدة دفعةً، ويضمّها الصافي، ولا يُدخلها وعاء GOSI", () => {
    expect(HR_ROUTE).toContain("getApprovedMovementBonusesForCompany(scope.companyId)");
    expect(HR_ROUTE).toMatch(/\+ driverHoursAmount \+ bonusAmount - totalDeductions/);
    // GOSI لا يشمل المكافأة: الوعاء يضيف driverHoursAmount فقط (لا bonusAmount).
    expect(HR_ROUTE).toMatch(/gosiContributionWage\s*=\s*\n?\s*\(GOSI_INCLUDE_HOUSING \? basic \+ housingAllowance : basic\) \+ driverHoursAmount;/);
    expect(HR_ROUTE).not.toMatch(/basic\) \+ driverHoursAmount \+ bonusAmount;/);
  });
  it("الإدراج يحفظ bonusAmount + يختم المكافآت عبر مكتبة الأسطول", () => {
    expect(HR_ROUTE).toContain('"stopHours","stopHoursAmount","bonusAmount"');
    expect(HR_ROUTE).toContain("markMovementBonusesConsumed(scope.companyId, l.bonusRowIds, lineId)");
    expect(HR_ROUTE).not.toContain("UPDATE transport_movement_bonuses");
    expect(HR_ROUTE).toContain("totalBonuses");
    expect(HR_ROUTE).toContain("bonus: l.bonusAmount");
  });
});

describe("محرّك القيد — hrEngine.postPayrollRunGL", () => {
  it("يحلّ 5245 فقط حين totalBonuses > 0 + يطرحه من الراتب المُشتقّ + سطر dimensional", () => {
    expect(HR_ENGINE).toMatch(/if \(totalBonuses > 0\)\s*\{[\s\S]*?"payroll_driver_bonus_expense", "debit", "5245"/);
    expect(HR_ENGINE).toMatch(/- totalDriverWages - totalBonuses/);
    expect(HR_ENGINE).toMatch(/bonusExpenseCode && bonusRounded > 0/);
    expect(HR_ENGINE).toContain("bonusDiff < 0.5");
  });
});

describe("قفل الحدود — عقد المكتبة", () => {
  it("جلب/ختم المكافآت يعيشان في مكتبة الأسطول، بلا دفتر", () => {
    expect(BONUS_LIB).toContain("export async function getApprovedMovementBonusesForCompany");
    expect(BONUS_LIB).toContain("export async function markMovementBonusesConsumed");
    expect(BONUS_LIB).not.toContain("postJournalEntry");
  });
});
