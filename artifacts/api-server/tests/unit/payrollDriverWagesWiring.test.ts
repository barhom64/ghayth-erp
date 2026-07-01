import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * أجر السائق بالساعة (الدفعة 3) — تحقّق ساكن للتوصيل:
 *   • القيد: بند الساعات على payroll_lines + سطر مدين 5220 عبر محرّك HR.
 *   • GOSI يخضع للسائق الساعي (قرار إبراهيم) — مضاف لوعاء GOSI، مُحاط (صفر لغيره).
 *   • قفل الحدود: ختم صفوف ساعات الأسطول عبر مكتبة الأسطول (markDriverHoursConsumed)
 *     لا بكتابة مباشرة في راوت HR. الحساب 5220 يُحلّ فقط حين > 0.
 * توازن القيد + 5220 يُغطّى سلوكيًا في payrollDriverWagesGL.test.ts (assertion).
 */
const apiSrc = join(import.meta.dirname!, "../../src");
const read = (p: string) => readFileSync(join(apiSrc, p), "utf8");

const MIG_440 = "migrations/442_payroll_lines_driver_hours.sql";
const MIG_441 = "migrations/443_seed_driver_wages_gl.sql";
const HR_ROUTE = read("routes/hr.ts");
const HR_ENGINE = read("lib/engines/hrEngine.ts");
const FLEET_LIB = read("lib/fleet/driverHours.ts");
const RATES_LIB = read("lib/hr/driverPayRates.ts");

describe("الدفعة 3 — الهجرات", () => {
  it("442 يضيف أعمدة الساعات على payroll_lines توسعيًا", () => {
    expect(existsSync(join(apiSrc, MIG_440))).toBe(true);
    const m = read(MIG_440);
    expect(m).toContain("@rollback");
    for (const c of ['"drivingHours"', '"drivingHoursAmount"', '"stopHours"', '"stopHoursAmount"']) {
      expect(m, `column ${c}`).toContain(`ADD COLUMN IF NOT EXISTS ${c}`);
    }
  });
  it("443 يُنشئ حساب 5220 قابلًا للترحيل + يربط العملية (idempotent)", () => {
    expect(existsSync(join(apiSrc, MIG_441))).toBe(true);
    const m = read(MIG_441);
    expect(m).toContain("@rollback");
    expect(m).toMatch(/INSERT INTO chart_of_accounts[\s\S]*?'5220'[\s\S]*?"allowPosting"/);
    expect(m).toMatch(/FROM companies c[\s\S]*?ON CONFLICT DO NOTHING/);
    expect(m).toMatch(/accounting_mappings[\s\S]*?'payroll_driver_wages_expense'[\s\S]*?ON CONFLICT/);
  });
});

describe("مسيّر الرواتب — routes/hr.ts", () => {
  it("يقرأ الساعات المعتمدة (الأسطول) + محلِّل المعدّل (HR) دفعةً واحدة", () => {
    expect(HR_ROUTE).toContain("getApprovedDriverHoursForPeriod(scope.companyId, targetPeriod)");
    expect(HR_ROUTE).toContain("buildDriverRateResolver(scope.companyId)");
    expect(HR_ROUTE).toMatch(/dRate\.payType === "hourly"/);
  });
  it("GOSI يخضع للسائق الساعي (مضاف لوعاء GOSI، مُحاط بـpayType=hourly)", () => {
    expect(HR_ROUTE).toMatch(/gosiContributionWage\s*=\s*\n?\s*\(GOSI_INCLUDE_HOUSING \? basic \+ housingAllowance : basic\) \+ driverHoursAmount/);
  });
  it("الصافي يضمّ أجر الساعات، والإدراج يحفظ الأعمدة + يُعيد assignmentId", () => {
    expect(HR_ROUTE).toMatch(/gross \+ overtime \+ commission \+ driverHoursAmount \+ bonusAmount - totalDeductions/);
    expect(HR_ROUTE).toContain('"drivingHours","drivingHoursAmount","stopHours","stopHoursAmount"');
    expect(HR_ROUTE).toContain('RETURNING id, "employeeId", "assignmentId"');
    expect(HR_ROUTE).toContain("totalDriverWages");
    expect(HR_ROUTE).toContain("driverWages: roundTo2(l.drivingHoursAmount + l.stopHoursAmount)");
  });
  it("قفل الحدود: ختم ساعات الأسطول عبر مكتبة الأسطول لا بكتابة مباشرة في راوت HR", () => {
    expect(HR_ROUTE).toContain("markDriverHoursConsumed(scope.companyId, l.driverRowIds, lineId)");
    expect(HR_ROUTE).not.toContain("UPDATE fleet_driver_work_hours");
  });
});

describe("محرّك القيد — hrEngine.postPayrollRunGL", () => {
  it("يحلّ 5220 فقط حين totalDriverWages > 0 (صفر مخاطرة على غير المستخدِمين)", () => {
    expect(HR_ENGINE).toMatch(/if \(totalDriverWages > 0\)\s*\{[\s\S]*?"payroll_driver_wages_expense", "debit", "5220"/);
  });
  it("يطرح أجر السائق من الراتب المُشتقّ (نفس منطق العمولة) + سطر مدين dimensional", () => {
    expect(HR_ENGINE).toMatch(/- totalCommission - totalDriverWages/);
    expect(HR_ENGINE).toMatch(/driverWagesExpenseCode && driverWagesRounded > 0/);
    expect(HR_ENGINE).toContain("driverWagesDiff < 0.5"); // ضمن تحقّق breakdown
  });
});

describe("قفل الحدود — عقود المكتبة", () => {
  it("جلب/ختم ساعات الأسطول يعيشان في مكتبة الأسطول، والمحلِّل في مكتبة HR", () => {
    expect(FLEET_LIB).toContain("export async function getApprovedDriverHoursForPeriod");
    expect(FLEET_LIB).toContain("export async function markDriverHoursConsumed");
    expect(FLEET_LIB).toContain("UPDATE fleet_driver_work_hours"); // الكتابة هنا لا في HR
    expect(RATES_LIB).toContain("export async function buildDriverRateResolver");
    // المحلِّل لا يقرأ جداول الأسطول
    expect(RATES_LIB).not.toContain("fleet_driver_work_hours");
  });
});
