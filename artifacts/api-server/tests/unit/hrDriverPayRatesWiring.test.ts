import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * معدّلات أجر السائق (الدفعة 2) — تحقّق ساكن للتوصيل:
 *   • HR قائد في سياسة الأجر: معدّل قيادة/توقف + نوع الدفع، افتراضي شركة
 *     يُتجاوَز لكل تعيين. عقد resolveDriverPayRate للدفعة 3.
 *   • قفل الحدود: لا قيد ولا قراءة لجداول الأسطول هنا (الأسطول يوفّر الساعات
 *     في الدفعة 1؛ الربط في الدفعة 3). إعداد بحت — لا assertion قيد بعد.
 */
const apiSrc = join(import.meta.dirname!, "../../src");
const repoRoot = join(import.meta.dirname!, "../../../..");
const spaSrc = join(repoRoot, "artifacts/ghayth-erp/src");
const read = (p: string) => readFileSync(p, "utf8");

const MIGRATION_PATH = join(apiSrc, "migrations/439_hr_driver_pay_rates.sql");
const MIGRATION = read(MIGRATION_PATH);
const LIB = read(join(apiSrc, "lib/hr/driverPayRates.ts"));
const ROUTE = read(join(apiSrc, "routes/hr-driver-pay.ts"));
const INDEX = read(join(apiSrc, "routes/index.ts"));
const CATALOG = read(join(apiSrc, "lib/rbac/featureCatalog.ts"));
const PAGE = read(join(spaSrc, "pages/hr/driver-pay-rates.tsx"));
const HR_ROUTES = read(join(spaSrc, "routes/hrRoutes.tsx"));
const NAV = read(join(spaSrc, "components/layout/navigation.registry.ts"));

describe("الدفعة 2 — هجرة hr_driver_pay_rates", () => {
  it("الملف موجود ويلتزم نمط الهجرات + جدول معزول إيجاريًا", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    expect(MIGRATION).toContain("BEGIN;");
    expect(MIGRATION).toContain("@rollback");
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS hr_driver_pay_rates");
    expect(MIGRATION).toMatch(/"companyId"\s+INTEGER NOT NULL REFERENCES companies\(id\)/);
  });

  it("نوع الدفع مقيّد + معدّلان + تأريخ سريان + لا قيم سالبة", () => {
    for (const v of ["monthly", "hourly"]) expect(MIGRATION).toContain(`'${v}'`);
    for (const c of ['"drivingHourlyRate"', '"stopHourlyRate"', '"payType"', '"effectiveDate"', '"assignmentId"']) {
      expect(MIGRATION, `column ${c} missing`).toContain(c);
    }
    expect(MIGRATION).toContain("hr_driver_pay_rates_nonneg");
  });

  it("فهارس فريدة جزئية: افتراضي واحد للشركة + تجاوز واحد لكل تعيين", () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX[\s\S]*?\("companyId"\)\s*\n?\s*WHERE "assignmentId" IS NULL/);
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX[\s\S]*?\("companyId", "assignmentId"\)\s*\n?\s*WHERE "assignmentId" IS NOT NULL/);
  });
});

describe("المنطق — lib/hr/driverPayRates", () => {
  it("يُصدّر الحلّ/القائمة/الضبط/الحذف + المخطّط", () => {
    for (const fn of [
      "export async function resolveDriverPayRate",
      "export async function listDriverPayRates",
      "export async function upsertDriverPayRate",
      "export async function removeDriverPayRate",
      "export const driverPayRateSchema",
    ]) {
      expect(LIB, `missing ${fn}`).toContain(fn);
    }
  });

  it("الحلّ: تجاوز التعيين ← افتراضي الشركة (ORDER BY assignmentId NULLS LAST)", () => {
    expect(LIB).toMatch(/\("assignmentId" = \$2 OR "assignmentId" IS NULL\)/);
    expect(LIB).toMatch(/ORDER BY "assignmentId" NULLS LAST/);
  });

  it("الضبط upsert بفرعين (افتراضي/تجاوز) عبر ON CONFLICT الجزئي + يدقّق التعيين", () => {
    expect(LIB).toMatch(/"assignmentId" IS NULL AND "deletedAt" IS NULL/);
    expect(LIB).toMatch(/"assignmentId" IS NOT NULL AND "deletedAt" IS NULL/);
    expect(LIB).toContain("INSERT INTO hr_driver_pay_rates");
    expect(LIB).toContain("التعيين غير موجود في الشركة"); // عزل إيجاري
    expect(LIB).toContain('action: "driver_pay_rate_set"');
  });

  it("payType monthly لا يلزمه معدّل؛ hourly يلزمه أحدهما", () => {
    expect(LIB).toMatch(/payType === "monthly" \|\| .*drivingHourlyRate != null \|\| .*stopHourlyRate != null/);
  });
});

describe("قفل الحدود — HR يملك المعدّل، لا دفتر ولا قراءة أسطول", () => {
  it("لا قيد ولا جداول مالية في كود معدّلات HR", () => {
    for (const src of [LIB, ROUTE]) {
      expect(src).not.toContain("postJournalEntry");
      expect(src).not.toContain("credit_memos");
      expect(src).not.toMatch(/INSERT INTO journal/i);
    }
  });
  it("الإعداد لا يقرأ جداول الأسطول (الربط بالساعات في الدفعة 3 لا هنا)", () => {
    expect(LIB).not.toContain("fleet_driver_work_hours");
    expect(LIB).not.toContain("driver_navigation_sessions");
    expect(LIB).not.toContain("fleet_drivers");
  });
});

describe("المسار — routes/hr-driver-pay", () => {
  it("GET/POST/DELETE على hr.driver_pay (list/update/delete) ومُركَّب تحت /hr", () => {
    expect(ROUTE).toMatch(/"\/driver-pay-rates"[\s\S]{0,120}hr\.driver_pay[\s\S]{0,30}"list"/);
    expect(ROUTE).toMatch(/"\/driver-pay-rates"[\s\S]{0,120}hr\.driver_pay[\s\S]{0,30}"update"/);
    expect(ROUTE).toMatch(/"\/driver-pay-rates\/:id"[\s\S]{0,120}hr\.driver_pay[\s\S]{0,30}"delete"/);
    expect(ROUTE).toContain("export default router");
    expect(INDEX).toContain('from "./hr-driver-pay.js"');
    expect(INDEX).toMatch(/router\.use\("\/hr", requireModule\("hr"\), driverPayRouter\)/);
  });
});

describe("RBAC — ميزة hr.driver_pay", () => {
  it("مُسجّلة تحت hr.payroll بحقول حسّاسة", () => {
    expect(CATALOG).toMatch(/key:\s*"hr\.driver_pay"[\s\S]{0,200}parentKey:\s*"hr\.payroll"/);
    expect(CATALOG).toMatch(/hr\.driver_pay"[\s\S]{0,260}sensitiveFields:\s*\["drivingHourlyRate", "stopHourlyRate"\]/);
  });
});

describe("الواجهة — شاشة معدّلات أجر السائق (كل شيء قابل للتعديل)", () => {
  it("تحرّر افتراضي الشركة + تجاوز لكل سائق + نوع الدفع، بصلاحية hr.driver_pay", () => {
    expect(PAGE).toContain("افتراضي الشركة");
    expect(PAGE).toContain("تجاوز لسائق محدّد");
    expect(PAGE).toMatch(/perm="hr\.driver_pay:update"/);
    expect(PAGE).toMatch(/perm="hr\.driver_pay:delete"/);
    expect(PAGE).toContain("/hr/driver-pay-rates");
    // نوع الدفع شهري/بالساعة قابل للتبديل
    expect(PAGE).toContain('value="monthly"');
    expect(PAGE).toContain('value="hourly"');
  });
  it("مُسجّلة في مسارات HR والقائمة تحت الرواتب", () => {
    expect(HR_ROUTES).toContain('path: "/hr/driver-pay-rates"');
    expect(NAV).toContain('path: "/hr/driver-pay-rates"');
    expect(NAV).toContain('perm: "hr.driver_pay:list"');
  });
});
