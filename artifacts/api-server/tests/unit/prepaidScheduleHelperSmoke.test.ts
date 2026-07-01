import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * البند ٤ ج-٧ — مُساعد مشترك `openPrepaidSchedule` لفتح صفّ الإطفاء (DRY). محرّك
 * الإطفاء (مالك الجدول) يصدّره، ويستدعيه تأمين الأسطول (fleetEngine) والعقاري/الطبي
 * (insuranceEngine) بدل تكرار الـINSERT ذي الـ١٨ عمودًا في مكانين. حارس ثابت.
 */
const src = join(import.meta.dirname!, "../../src");
const ENGINE = readFileSync(join(src, "lib/engines/prepaidAmortizationEngine.ts"), "utf8");
const FLEET = readFileSync(join(src, "lib/engines/fleetEngine.ts"), "utf8");
const INSURANCE = readFileSync(join(src, "lib/engines/insuranceEngine.ts"), "utf8");

describe("البند ٤ ج-٧ — openPrepaidSchedule مُساعد مشترك (DRY)", () => {
  it("محرّك الإطفاء (مالك الجدول) يصدّر openPrepaidSchedule ويملك الـINSERT الوحيد", () => {
    expect(ENGINE).toMatch(/export async function openPrepaidSchedule\(/);
    expect(ENGINE).toMatch(/INSERT INTO\s+prepaid_amortization_schedules/);
  });

  it("تأمين الأسطول يستدعي المُساعد ولا يُدرج مباشرةً", () => {
    expect(FLEET).toMatch(/openPrepaidSchedule\(\{/);
    expect(FLEET).not.toMatch(/INSERT INTO prepaid_amortization_schedules/);
  });

  it("insuranceEngine (عقاري/طبي) يستدعي المُساعد ولا يُدرج مباشرةً", () => {
    expect(INSURANCE).toMatch(/openPrepaidSchedule\(\{/);
    expect(INSURANCE).not.toMatch(/INSERT INTO prepaid_amortization_schedules/);
  });
});
