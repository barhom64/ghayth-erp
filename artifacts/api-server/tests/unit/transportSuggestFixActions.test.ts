import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TA-T18-UX-AUDIT-01 · UX-01 — تعريب رسائل الإسناد + إزالة المفاتيح التقنية +
// أزرار إصلاح مباشرة في نافذة الاقتراح. اختبار ثابت (regex على المصدر) وفق
// قاعدة محلية الحزمة: لا استيراد runtime للـSPA داخل اختبار api-server.
//
// يثبّت أربع نتائج للمراجعة (الملف docs/transport-audit/22):
//   1. لا تسريب أرقام مركبة/سائق خام (vehicleId/driverId) في رسائل/بطاقات الإسناد.
//   2. لا تسريب enum ناتج التخطيط الجماعي (outcome) للمستخدم — قاموس عربي بدلًا منه.
//   3. كل حالة فشل/فراغ تحمل زر إجراء (قائمة مركبات / سائقين / إعادة).
//   4. لم تُكسر أنماط بطاقة التشخيص المثبّتة سابقًا (#1812 gap #5).

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const DIALOG = readFileSync(
  join(spaSrc, "components/shared/assignment-suggest-dialog.tsx"),
  "utf8",
);

describe("UX-01 — لا مفاتيح تقنية في رسائل/بطاقات الإسناد", () => {
  it("رسالة إسناد المرحلة تستخدم اللوحة/الاسم لا vehicleId/driverId", () => {
    expect(DIALOG).toMatch(/تم إسناد المرحلة[\s\S]{0,80}c\.vehiclePlate/);
    expect(DIALOG).toMatch(/تم إسناد المرحلة[\s\S]{0,80}c\.driverName/);
    expect(DIALOG).not.toMatch(/المركبة #\$\{c\.vehicleId\}/);
    expect(DIALOG).not.toMatch(/السائق #\$\{c\.driverId\}/);
  });

  it("بطاقة المرشّح لا تعرض رقم مركبة/سائق خام كاحتياط", () => {
    expect(DIALOG).not.toMatch(/#\$\{c\.vehicleId\}/);
    expect(DIALOG).not.toMatch(/سائق #\$\{c\.driverId\}/);
    expect(DIALOG).toContain("بدون لوحة");
    expect(DIALOG).toContain("سائق بلا اسم");
  });

  it("ناتج التخطيط الجماعي يُعرَّب عبر OUTCOME_LABEL لا enum خام", () => {
    expect(DIALOG).toMatch(/const OUTCOME_LABEL: Record<string, string>/);
    expect(DIALOG).toMatch(/OUTCOME_LABEL\[r\?\.outcome \?\? ""\]/);
    expect(DIALOG).not.toMatch(/الناتج: \$\{r\?\.outcome/);
  });
});

describe("UX-01 — أزرار إصلاح مباشرة (لا رسالة بلا إجراء)", () => {
  it("يستورد useLocation ويعرّف goFix يغلق الحوار وينتقل", () => {
    expect(DIALOG).toMatch(/import \{ useLocation \} from "wouter"/);
    expect(DIALOG).toMatch(/const goFix = \(path: string\) =>[\s\S]{0,80}navigate\(path\)/);
  });

  it("حالة صفر ترشيح (التشخيصية والاحتياطية) تعرض أزرار المركبات/السائقين", () => {
    expect(DIALOG).toMatch(/goFix\("\/fleet"\)/);
    expect(DIALOG).toMatch(/goFix\("\/fleet\/drivers"\)/);
    // الزرّان يظهران في المسارين معًا — مرّتان على الأقل لكلٍّ.
    expect((DIALOG.match(/قائمة المركبات/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((DIALOG.match(/قائمة السائقين/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("بطاقة الخطأ تحمل زر إعادة محاولة، وحالة الفراغ زر إعادة حساب", () => {
    expect(DIALOG).toContain("إعادة المحاولة");
    expect(DIALOG).toContain("إعادة الحساب");
  });
});

describe("UX-01 — أنماط التشخيص المثبّتة سابقًا باقية (#1812 gap #5)", () => {
  it("بطاقة التشخيص وحقولها وحالة diagnostics لم تُمسّ", () => {
    expect(DIALOG).toMatch(/خطوات الإصلاح المقترحة/);
    expect(DIALOG).toMatch(/لم يجد المحرك أي تركيبة قابلة للإسناد/);
    expect(DIALOG).toMatch(/const \[diagnostics, setDiagnostics\] = useState</);
  });
});

describe("UX-02 — جدولة يدوية من نافذة الاقتراح (P0-2/P0-3)", () => {
  it("يحفظ نافذة الرحلة على الحجز عبر PATCH (pickupWindowStart/End) ثم يعيد الحساب", () => {
    expect(DIALOG).toMatch(/const saveWindowAndRerun = async/);
    expect(DIALOG).toMatch(/method: "PATCH"/);
    expect(DIALOG).toMatch(/\/transport\/bookings\/\$\{effectiveSource\.bookingId\}/);
    expect(DIALOG).toMatch(/pickupWindowStart: manualStart/);
    expect(DIALOG).toMatch(/pickupWindowEnd: manualEnd/);
    expect(DIALOG).toMatch(/await run\(\)/);
  });

  it("لوحة الموعد لمصدر الحجز فقط وتحمل حقلَي وقت وزر حفظ بعربية", () => {
    expect(DIALOG).toMatch(/const schedulePanel = effectiveSource\.kind === "booking"/);
    expect(DIALOG).toContain("تحديد موعد الرحلة");
    expect(DIALOG).toContain("حفظ الموعد وإعادة الحساب");
    expect((DIALOG.match(/type="datetime-local"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("عناوين اللوحة عربية (من/إلى) لا مفاتيح تقنية", () => {
    expect(DIALOG).toContain("<span>من</span>");
    expect(DIALOG).toContain("<span>إلى</span>");
  });
});
