/**
 * حدّ دنيا (≥0) للكميات المتعلّقة بالدفتر — دفعة متابعة لـ#2875 (التشغيلية). حقول
 * عدّ/مدّة/مسافة تغذّي حسابات مالية كانت بلا حدّ أدنى:
 *  - fleet createTripSchema.distance: تُحفظ وتُضرب في أسعار الوقود/السائق/الإهلاك
 *    (السالب ⇒ تكلفة سالبة على رحلة مُرحَّلة).
 *  - hr-discipline createMemoSchema.incidentDurationMinutes/absenceDays: مسار
 *    الحفظ (مذكّرة جزائية) يغذّي خصم الراتب — السالب ⇒ خصم مقلوب (مكافأة).
 *  - penaltyPreviewSchema.durationMinutes/absenceDays: معاينة الخصم — اتّساق.
 * تحقّق إدخال فقط؛ منطق الحساب لم يُمسّ. اختبار ثابت (يقرأ المصدر).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname!, "../../src");
const FLEET = readFileSync(join(API_SRC, "routes/fleet.ts"), "utf8");
const DISC = readFileSync(join(API_SRC, "routes/hr-discipline.ts"), "utf8");

const bounded = (field: string) => new RegExp(`${field}: z\\.coerce\\.number\\(\\)\\.nonnegative\\(`, "g");
const unbounded = (field: string) => new RegExp(`(^|[^a-zA-Z])${field}: z\\.coerce\\.number\\(\\)\\.optional\\(\\),`, "m");

describe("ledger-adjacent quantity bounds — fleet trip distance", () => {
  it("distance is .nonnegative() (drives persisted trip cost)", () => {
    expect((FLEET.match(bounded("distance")) || []).length).toBe(1);
    expect(unbounded("distance").test(FLEET)).toBe(false);
  });
});

describe("ledger-adjacent quantity bounds — hr discipline (memo persist + preview)", () => {
  it("incidentDurationMinutes (memo persist) is .nonnegative()", () => {
    expect((DISC.match(bounded("incidentDurationMinutes")) || []).length).toBe(1);
  });
  it("durationMinutes (preview) is .nonnegative()", () => {
    // matched with a boundary so it does NOT also count incidentDurationMinutes
    expect((DISC.match(/[^a-zA-Z]durationMinutes: z\.coerce\.number\(\)\.nonnegative\(/g) || []).length).toBe(1);
  });
  it("absenceDays is .nonnegative() in both memo + preview schemas", () => {
    expect((DISC.match(bounded("absenceDays")) || []).length).toBe(2);
  });
  it("no unbounded duration/absence fields remain", () => {
    expect(unbounded("incidentDurationMinutes").test(DISC)).toBe(false);
    expect(/[^a-zA-Z]durationMinutes: z\.coerce\.number\(\)\.optional\(\),/.test(DISC)).toBe(false);
    expect(unbounded("absenceDays").test(DISC)).toBe(false);
  });
});
