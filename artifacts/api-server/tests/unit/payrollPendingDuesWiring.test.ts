import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * معاينة مستحقّات السائق قيد الترحيل (تشغيلية بلا دفتر) — قراءة فقط:
 *   • صيغة أجر الساعة من **مصدر واحد** (computeHourlyDriverPay) تطابق المسيّر.
 *   • قفل الحدود: HR يقرأ ساعات/مكافآت الأسطول عبر عقود القراءة، بلا كتابة.
 *   • RBAC مُعاد استخدامه (hr.payroll.runs:view) — لا صلاحية جديدة.
 *   • المسار مُسجَّل قبل /payroll/:id كي لا يلتقطه مسار المعرّف.
 *
 * أُكِّدت الصيغة سلوكيًا في الاختبار النقي أدناه (assertion على الدالة النقية)؛
 * والتثبيت المصدري يبقيها متّسقة مع حساب المسيّر إن تغيّر.
 */
import { computeHourlyDriverPay } from "../../src/lib/hr/driverPayRates.js";

const apiSrc = join(import.meta.dirname!, "../../src");
const repoRoot = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(apiSrc, p), "utf8");
const readSpa = (p: string) => readFileSync(join(repoRoot, "artifacts/ghayth-erp/src", p), "utf8");

const RATES_LIB = read("lib/hr/driverPayRates.ts");
const PREVIEW_LIB = read("lib/hr/payrollDuesPreview.ts");
const HR_ROUTE = read("routes/hr.ts");
const PAGE = readSpa("pages/hr/payroll-pending-dues.tsx");
const HR_ROUTES = readSpa("routes/hrRoutes.tsx");
const NAV = readSpa("components/layout/navigation.registry.ts");

describe("computeHourlyDriverPay — assertion على الصيغة النقية (مصدر واحد)", () => {
  it("الساعي: قيادة×معدّل + توقف×معدّل، مُقرّبًا للهللة", () => {
    const r = computeHourlyDriverPay(
      { payType: "hourly", drivingHourlyRate: 20, stopHourlyRate: 5 }, 3.5, 2,
    );
    expect(r.drivingHoursAmount).toBe(70);
    expect(r.stopHoursAmount).toBe(10);
    expect(r.total).toBe(80);
  });
  it("معدّل ناقص ⇒ يُعامَل صفرًا (لا NaN)", () => {
    const r = computeHourlyDriverPay({ payType: "hourly", drivingHourlyRate: null, stopHourlyRate: 8 }, 4, 1.25);
    expect(r.drivingHoursAmount).toBe(0);
    expect(r.stopHoursAmount).toBe(10);
    expect(r.total).toBe(10);
  });
  it("غير الساعي (monthly/بلا معدّل) ⇒ صفر مطلق", () => {
    expect(computeHourlyDriverPay({ payType: "monthly", drivingHourlyRate: 20, stopHourlyRate: 5 }, 10, 10).total).toBe(0);
    expect(computeHourlyDriverPay(null, 10, 10).total).toBe(0);
  });
  it("التقريب للهللة لا للأعلى عشوائيًا", () => {
    const r = computeHourlyDriverPay({ payType: "hourly", drivingHourlyRate: 33.333, stopHourlyRate: 0 }, 1, 0);
    expect(r.drivingHoursAmount).toBe(33.33);
  });
});

describe("المصدر الواحد — المسيّر يطابق الدالة", () => {
  it("المكتبة تُصدّر الدالة، والمسيّر يستخدم نفس الصيغة (تثبيت مصدري)", () => {
    expect(RATES_LIB).toContain("export function computeHourlyDriverPay");
    // المسيّر (routes/hr.ts) ما زال يحسب بنفس الصيغة — إن تغيّر، حدّث الدالة.
    expect(HR_ROUTE).toMatch(/drivingHours \* \(dRate\.drivingHourlyRate \?\? 0\)/);
    expect(HR_ROUTE).toMatch(/stopHours \* \(dRate\.stopHourlyRate \?\? 0\)/);
  });
});

describe("مكتبة المعاينة — قراءة فقط عبر عقود الأسطول", () => {
  it("تقرأ ساعات/مكافآت الأسطول عبر عقود القراءة + معدّل HR، بلا كتابة ولا دفتر", () => {
    expect(PREVIEW_LIB).toContain("export async function getPendingDriverDues");
    expect(PREVIEW_LIB).toContain("getApprovedDriverHoursForPeriod");
    expect(PREVIEW_LIB).toContain("getApprovedMovementBonusesForCompany");
    expect(PREVIEW_LIB).toContain("computeHourlyDriverPay");
    // لا كتابة، لا قيد، لا استهلاك.
    expect(PREVIEW_LIB).not.toMatch(/INSERT INTO|UPDATE |DELETE FROM/);
    expect(PREVIEW_LIB).not.toContain("postJournalEntry");
    expect(PREVIEW_LIB).not.toContain("markDriverHoursConsumed");
    expect(PREVIEW_LIB).not.toContain("markMovementBonusesConsumed");
  });
  it("عزل إيجاري: استعلام الأسماء بفلتر companyId", () => {
    expect(PREVIEW_LIB).toMatch(/employee_assignments ea[\s\S]*?ea\."companyId" = \$1/);
  });
});

describe("المسار — RBAC مُعاد + ترتيب التوجيه", () => {
  it("pending-dues مُسجَّل قبل /payroll/:id بصلاحية hr.payroll.runs:view المُعاد استخدامها", () => {
    const duesIdx = HR_ROUTE.indexOf('"/payroll/pending-dues"');
    const idIdx = HR_ROUTE.indexOf('"/payroll/:id"');
    expect(duesIdx).toBeGreaterThan(0);
    expect(idIdx).toBeGreaterThan(0);
    expect(duesIdx).toBeLessThan(idIdx); // قبل مسار المعرّف
    expect(HR_ROUTE).toMatch(/"\/payroll\/pending-dues"[\s\S]{0,120}feature: "hr\.payroll\.runs", action: "view"/);
    expect(HR_ROUTE).toContain("getPendingDriverDues(scope.companyId, period)");
    expect(HR_ROUTE).toMatch(/\^\\d\{4\}-\\d\{2\}\$/); // تحقّق صيغة الفترة
  });
});

describe("الواجهة — شاشة قراءة فقط مُسجّلة", () => {
  it("صفحة معاينة بلا أزرار إجراء + مُسجّلة في المسارات والقائمة", () => {
    expect(PAGE).toContain("/hr/payroll/pending-dues?period=");
    expect(PAGE).toContain("مستحقّات السائق قيد الترحيل");
    // قراءة فقط: لا منح/اعتماد/حذف.
    expect(PAGE).not.toMatch(/method:\s*["'](POST|PATCH|DELETE)["']/);
    expect(HR_ROUTES).toContain('path: "/hr/payroll/pending-dues"');
    expect(NAV).toMatch(/path:\s*"\/hr\/payroll\/pending-dues"[\s\S]{0,80}perm:\s*"hr\.payroll\.runs:view"/);
  });
});
