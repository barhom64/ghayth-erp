import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TA-T18-UX-AUDIT-01 · UX-03 — اختيار مركبة/سائق يدوي + تحقق الحراس الصلبة.
//  (أ) نموذج الإنشاء يستبدل إدخال رقم القاعدة الخام بمنتقي حقيقي
//      (VehicleSelect/DriverSelect) لحقلَي requiredExactVehicleId/DriverId.
//  (ب) §11-ب — POST /transport/dispatch-orders يمرّر الزوج (مركبة/سائق) عبر
//      المحرك (مصدر الحراس الوحيد)، فلا يتجاوز الاختيار اليدوي VCM/السعة/
//      الإجازة/حدود القيادة. اختبار ثابت (regex على المصدر).

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const BOOKINGS = readFileSync(join(apiSrc, "routes/transport-bookings.ts"), "utf8");
const CREATE = readFileSync(join(spaSrc, "pages/fleet/transport-booking-create.tsx"), "utf8");

describe("UX-03 (أ) — منتقي مركبة/سائق حقيقي بدل الرقم الخام", () => {
  it("نموذج الإنشاء يستورد VehicleSelect و DriverSelect", () => {
    expect(CREATE).toMatch(
      /import \{[^}]*VehicleSelect[^}]*\} from "@\/components\/shared\/entity-selects"/,
    );
    expect(CREATE).toMatch(/DriverSelect/);
  });

  it("requiredExactVehicleId/DriverId عبر المنتقي لا عبر Input رقمي خام", () => {
    expect(CREATE).toMatch(/<VehicleSelect[\s\S]{0,160}value=\{requiredExactVehicleId\}/);
    expect(CREATE).toMatch(/<DriverSelect[\s\S]{0,160}value=\{requiredExactDriverId\}/);
    // لم يعد إدخالًا رقميًا خامًا ولا عنوانًا يحمل كلمة id.
    expect(CREATE).not.toMatch(/<Input[^>]*value=\{requiredExactVehicleId\}/);
    expect(CREATE).not.toMatch(/المركبة المحددة \(id/);
  });
});

describe("UX-03 (ب) §11-ب — التثبيت يعيد فحص كل الحراس عبر المحرك", () => {
  it("POST /dispatch-orders يستورد ويستدعي suggestAssignments للزوج المطلوب", () => {
    expect(BOOKINGS).toMatch(
      /import \{ suggestAssignments \} from "\.\.\/lib\/fleet\/assignmentSuggestionEngine\.js"/,
    );
    expect(BOOKINGS).toMatch(/await suggestAssignments\(\{/);
    expect(BOOKINGS).toMatch(
      /\.find\(\s*\(c\) => c\.vehicleId === b\.vehicleId && c\.driverId === b\.driverId/,
    );
  });

  it("يحجب غير المؤهّل والمحجوب بعوائق صلبة، ويسمح باستثناء موثَّق (override-able)", () => {
    expect(BOOKINGS).toMatch(/غير مؤهّل لهذا الحجز/);
    // عدم الأهلية (الغياب عن نتائج المحرك) محكوم بـ overrideReason — لا يكسر
    // إسناد مركبة لم يكتمل ملفها الفني، بل يتطلّب استثناءً موثَّقًا.
    expect(BOOKINGS).toMatch(/if \(!guardPair\)[\s\S]{0,500}!b\.overrideReason/);
    // العوائق الصلبة (تعارض/راحة/سعة/اتفاق) محكومة بـ overrideReason كذلك.
    expect(BOOKINGS).toMatch(/guardPair\.blockers\.length > 0 && !b\.overrideReason/);
  });

  it("يحافظ على فحوص الأهلية/الراحة/التعارض القائمة (دفاع متعدّد الطبقات)", () => {
    expect(BOOKINGS).toContain("assertDriverEligibility");
    expect(BOOKINGS).toContain("assertDriverRest");
    expect(BOOKINGS).toMatch(/conflicts\.length > 0 && !b\.overrideReason/);
  });
});
