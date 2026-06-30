import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * أجر السائق بالساعة — الدفعة 1 (تشغيلية بلا دفتر) — تحقّق ساكن للتوصيل:
 *   • الأسطول يملك ساعات القيادة/التوقف كواقعة: مشتقّة من التتبع + يدوية،
 *     باعتماد بشري قبل أي ترحيل (القرار 3ج).
 *   • قفل الحدود: لا معدّل أجر ولا قيد محاسبي هنا — المعدّل والأجر في HR.
 *   • فصل الإدخال عن الاعتماد (fleet.driver_hours: update مقابل approve).
 * عملياتي بحت — لا مساس بالدفتر، فلا يلزم assertion على سطور القيد بعد.
 */
const apiSrc = join(import.meta.dirname!, "../../src");
const repoRoot = join(import.meta.dirname!, "../../../..");
const spaSrc = join(repoRoot, "artifacts/ghayth-erp/src");
const read = (p: string) => readFileSync(p, "utf8");

const MIGRATION_438_PATH = join(apiSrc, "migrations/438_fleet_driver_work_hours.sql");
const MIGRATION_438 = read(MIGRATION_438_PATH);
const LIB = read(join(apiSrc, "lib/fleet/driverHours.ts"));
const ROUTES = read(join(apiSrc, "routes/fleet-driver-hours.ts"));
const INDEX = read(join(apiSrc, "routes/index.ts"));
const CATALOG = read(join(apiSrc, "lib/rbac/featureCatalog.ts"));
const PLANNING = read(join(apiSrc, "routes/transport-planning.ts"));
const CRON = read(join(apiSrc, "lib/cronScheduler.ts"));
const PAGE = read(join(spaSrc, "pages/fleet/driver-work-hours.tsx"));
const FLEET_ROUTES = read(join(spaSrc, "routes/fleetRoutes.tsx"));
const NAV = read(join(spaSrc, "components/layout/navigation.registry.ts"));

describe("الدفعة 1 — هجرة fleet_driver_work_hours", () => {
  it("الملف موجود ويلتزم نمط الهجرات + جدول معزول إيجاريًا", () => {
    expect(existsSync(MIGRATION_438_PATH)).toBe(true);
    expect(MIGRATION_438).toContain("BEGIN;");
    expect(MIGRATION_438).toContain("@rollback");
    expect(MIGRATION_438).toContain("CREATE TABLE IF NOT EXISTS fleet_driver_work_hours");
    expect(MIGRATION_438).toMatch(/"companyId"\s+INTEGER NOT NULL REFERENCES companies\(id\)/);
    expect(MIGRATION_438).toMatch(/"driverId"\s+INTEGER NOT NULL REFERENCES fleet_drivers\(id\)/);
  });

  it("يحمل الرقمين معًا (تتبع + يدوي) + المعتمد + بوابة الحالة", () => {
    for (const col of [
      '"derivedDrivingHours"', '"derivedStopHours"', '"derivedSource"',
      '"manualDrivingHours"', '"manualStopHours"',
      '"approvedDrivingHours"', '"approvedStopHours"',
      '"approvedByAssignmentId"', '"assignmentId"', '"payrollLineId"',
    ]) {
      expect(MIGRATION_438, `column ${col} missing`).toContain(col);
    }
    for (const s of ["pending", "approved", "void"]) {
      expect(MIGRATION_438, `status ${s} missing`).toContain(`'${s}'`);
    }
  });

  it("صفّ واحد لكل سائق/يوم (فهرس فريد) + لا قيم سالبة", () => {
    expect(MIGRATION_438).toMatch(/CREATE UNIQUE INDEX[\s\S]*?\("driverId", "workDate"\)/);
    expect(MIGRATION_438).toContain("fleet_driver_work_hours_nonneg");
  });
});

describe("المنطق — lib/fleet/driverHours", () => {
  it("يُصدّر دوال الاشتقاق/القائمة/اليدوي/الاعتماد + عقد قراءة HR", () => {
    for (const fn of [
      "export async function deriveDriverHoursForDay",
      "export async function upsertDerivedDriverHours",
      "export async function listDriverWorkHours",
      "export async function setManualDriverHours",
      "export async function approveDriverWorkHours",
      "export async function getApprovedDriverHours",
      "export const manualHoursSchema",
      "export const approveHoursSchema",
    ]) {
      expect(LIB, `missing ${fn}`).toContain(fn);
    }
  });

  it("يشتقّ القيادة (ساقا التنقل) والتوقف (ساقا الانتظار) من توقيتات الجلسة", () => {
    // القيادة = (وصول التحميل − الانطلاق) + (وصول التفريغ − التحميل)
    expect(LIB).toMatch(/"arrivedPickupAt"\s*-\s*"startedAt"/);
    expect(LIB).toMatch(/"arrivedDropoffAt"\s*-\s*"loadedAt"/);
    // التوقف = (التحميل − وصول التحميل) + (التسليم − وصول التفريغ)
    expect(LIB).toMatch(/"loadedAt"\s*-\s*"arrivedPickupAt"/);
    expect(LIB).toMatch(/"deliveredAt"\s*-\s*"arrivedDropoffAt"/);
    expect(LIB).toContain("GREATEST(0,"); // يتجاهل التوقيتات المقلوبة/المفقودة
    expect(LIB).toContain("/ 3600.0"); // ثوانٍ → ساعات
  });

  it("الاشتقاق لا يحدّث صفًّا معتمدًا (الاعتماد مُجمّد)", () => {
    expect(LIB).toMatch(/ON CONFLICT \("driverId", "workDate"\) WHERE "deletedAt" IS NULL/);
    expect(LIB).toMatch(/DO UPDATE[\s\S]*?WHERE fleet_driver_work_hours\.status = 'pending'/);
  });

  it("بوابة الاعتماد: pending فقط، وتختم الحالة approved + المعتمِد", () => {
    expect(LIB).toMatch(/UPDATE fleet_driver_work_hours[\s\S]*?status\s*=\s*'approved'/);
    expect(LIB).toMatch(/WHERE id = \$5 AND "companyId" = \$6 AND status = 'pending'/);
    expect(LIB).toContain('action: "driver_work_hours_approved"');
    // اليدوي لا يُعدَّل بعد الاعتماد
    expect(LIB).toContain("الصفّ معتمد — لا تُعدَّل ساعاته");
  });

  it("عقد القراءة لـ HR: المعتمد وغير المُستهلَك فقط (status=approved + payrollLineId IS NULL)", () => {
    expect(LIB).toMatch(/getApprovedDriverHours[\s\S]*?status = 'approved' AND "payrollLineId" IS NULL/);
  });
});

describe("قفل الحدود — الأسطول لا يحسب أجرًا ولا يلمس الدفتر", () => {
  it("لا قيد ولا جداول مالية ولا معدّل أجر في كود الأسطول", () => {
    for (const src of [LIB, ROUTES]) {
      expect(src).not.toContain("postJournalEntry");
      expect(src).not.toContain("credit_memos");
      expect(src).not.toMatch(/INSERT INTO payroll/i);
      expect(src).not.toMatch(/UPDATE payroll/i);
      // المعدّل (سياسة الأجر) يملكه HR — لا يظهر في الأسطول
      expect(src).not.toContain("HourlyRate");
      expect(src).not.toContain("createCreditMemo");
    }
  });
});

describe("المسارات — routes/fleet-driver-hours", () => {
  it("القائمة/الاشتقاق/اليدوي على fleet.driver_hours، والاعتماد بصلاحية منفصلة", () => {
    expect(ROUTES).toMatch(/"\/fleet\/driver-work-hours"[\s\S]{0,160}fleet\.driver_hours[\s\S]{0,40}"list"/);
    expect(ROUTES).toMatch(/"\/fleet\/driver-work-hours\/derive"[\s\S]{0,160}"update"/);
    expect(ROUTES).toMatch(/"\/fleet\/driver-work-hours\/:id"[\s\S]{0,160}"update"/);
    expect(ROUTES).toMatch(/"\/fleet\/driver-work-hours\/:id\/approve"[\s\S]{0,160}"approve"/);
  });
  it("السائق يرى ساعاته فقط — يُحلّ من scope.employeeId عبر مساعد المكتبة", () => {
    expect(ROUTES).toContain('"/fleet/driver/me/work-hours"');
    expect(ROUTES).toContain("resolveOwnDriverId(scope, employeeId)");
    // الاستعلام المعزول إيجاريًا يعيش في المكتبة لا في الراوت (حارس scope-helper)
    expect(LIB).toMatch(/resolveOwnDriverId[\s\S]*?"employeeId" = \$1 AND "companyId" = \$2/);
  });
  it("الراوتر مُسجّل في index", () => {
    expect(INDEX).toContain('from "./fleet-driver-hours.js"');
    expect(INDEX).toContain("router.use(fleetDriverHoursRouter)");
  });
});

describe("RBAC — ميزة fleet.driver_hours", () => {
  it("مُسجّلة بفصل الاعتماد عن الإدخال + نطاق self للسائق", () => {
    expect(CATALOG).toMatch(/key:\s*"fleet\.driver_hours"/);
    expect(CATALOG).toMatch(/fleet\.driver_hours"[\s\S]{0,220}approvableActions:\s*\["approve"\]/);
    expect(CATALOG).toMatch(/fleet\.driver_hours"[\s\S]{0,220}"self"/);
  });
});

describe("الاشتقاق التلقائي — خطّاف الجلسة + Cron الليلي", () => {
  it("إنهاء الجلسة يشتقّ ساعات اليوم (best-effort)", () => {
    expect(PLANNING).toContain("upsertDerivedDriverHours");
    expect(PLANNING).toMatch(/to_char\("startedAt", 'YYYY-MM-DD'\)/);
  });
  it("Cron تسوية ليلية مُسجّل", () => {
    expect(CRON).toContain("reconcileDriverWorkHours");
    expect(CRON).toContain("fleet_driver_hours_reconcile");
  });
});

describe("الواجهة — شاشة ساعات السائق (كل شيء قابل للتعديل)", () => {
  it("تعرض التتبع|اليدوي|المعتمد جنبًا لجنب + بوابة اعتماد بصلاحية منفصلة", () => {
    expect(PAGE).toContain("التتبع (قيادة/توقف)");
    expect(PAGE).toContain("اليدوي (قيادة/توقف)");
    expect(PAGE).toContain("المعتمد (قيادة/توقف)");
    expect(PAGE).toMatch(/perm="fleet\.driver_hours:update"/);
    expect(PAGE).toMatch(/perm="fleet\.driver_hours:approve"/);
    expect(PAGE).toContain("/fleet/driver-work-hours/${row.id}/approve");
  });
  it("تدعم الإدخال اليدوي ليوم بلا تتبع (اشتقاق/إضافة يوم → /derive)", () => {
    expect(PAGE).toContain("اشتقاق/إضافة يوم");
    expect(PAGE).toContain("/fleet/driver-work-hours/derive");
    expect(PAGE).toContain("deriveDay");
  });
  it("مُسجّلة في المسارات (قبل /fleet/:id) والقائمة", () => {
    expect(FLEET_ROUTES).toContain('path: "/fleet/driver-work-hours"');
    expect(FLEET_ROUTES).toMatch(/driver-work-hours"[\s\S]*?\/fleet\/:id/);
    expect(NAV).toContain('path: "/fleet/driver-work-hours"');
    expect(NAV).toContain('perm: "fleet.driver_hours:list"');
  });
});
