// تسوية ض.ق.م — assertion على سطور القيد (الدستور م٣): الدالة النقية التي تبني
// سطور قيد التسوية من (مخرجات، مدخلات) الفترة. القيد يجب أن يُصفّر الحسابين
// ويمتصّ الصافي نقدًا، ومتوازنًا دائمًا.
import { describe, it, expect } from "vitest";
import { buildVatSettlementLines } from "../../src/lib/finance/vatSettlement.js";

const OUT = "2131"; // ض.مخرجات (التزام، رصيد دائن)
const IN = "1180"; // ض.مدخلات (أصل، رصيد مدين)
const CASH = "1111";

const sum = (lines: { debit: number; credit: number }[], k: "debit" | "credit") =>
  lines.reduce((s, l) => s + l[k], 0);
const leg = (lines: { accountCode: string; debit: number; credit: number }[], code: string) =>
  lines.find((l) => l.accountCode === code);

describe("buildVatSettlementLines", () => {
  it("صافٍ مستحق (مخرجات > مدخلات): مدين 2131 / دائن 1180 / دائن النقد بالصافي", () => {
    const r = buildVatSettlementLines({ outputVat: 1500, inputVat: 400, outputCode: OUT, inputCode: IN, cashCode: CASH })!;
    expect(r.netDue).toBe(1100);
    expect(leg(r.lines, OUT)).toMatchObject({ debit: 1500, credit: 0 });
    expect(leg(r.lines, IN)).toMatchObject({ debit: 0, credit: 400 });
    expect(leg(r.lines, CASH)).toMatchObject({ debit: 0, credit: 1100 }); // يُدفع لهيئة الزكاة والضريبة
    expect(sum(r.lines, "debit")).toBeCloseTo(sum(r.lines, "credit"), 2);
    expect(sum(r.lines, "debit")).toBe(1500);
  });

  it("صافٍ مستردّ (مدخلات > مخرجات): مدين النقد بالفرق (استرداد)", () => {
    const r = buildVatSettlementLines({ outputVat: 300, inputVat: 900, outputCode: OUT, inputCode: IN, cashCode: CASH })!;
    expect(r.netDue).toBe(-600);
    expect(leg(r.lines, OUT)).toMatchObject({ debit: 300, credit: 0 });
    expect(leg(r.lines, IN)).toMatchObject({ debit: 0, credit: 900 });
    expect(leg(r.lines, CASH)).toMatchObject({ debit: 600, credit: 0 }); // يُستردّ نقدًا
    expect(sum(r.lines, "debit")).toBeCloseTo(sum(r.lines, "credit"), 2);
  });

  it("مخرجات = مدخلات: يُصفَّر الحسابان بلا حركة نقد", () => {
    const r = buildVatSettlementLines({ outputVat: 500, inputVat: 500, outputCode: OUT, inputCode: IN, cashCode: CASH })!;
    expect(r.netDue).toBe(0);
    expect(leg(r.lines, OUT)).toMatchObject({ debit: 500, credit: 0 });
    expect(leg(r.lines, IN)).toMatchObject({ debit: 0, credit: 500 });
    expect(leg(r.lines, CASH)).toBeUndefined();
    expect(sum(r.lines, "debit")).toBe(sum(r.lines, "credit"));
  });

  it("مخرجات فقط (بلا مدخلات): مدين 2131 / دائن النقد", () => {
    const r = buildVatSettlementLines({ outputVat: 750, inputVat: 0, outputCode: OUT, inputCode: IN, cashCode: CASH })!;
    expect(leg(r.lines, OUT)).toMatchObject({ debit: 750, credit: 0 });
    expect(leg(r.lines, IN)).toBeUndefined();
    expect(leg(r.lines, CASH)).toMatchObject({ debit: 0, credit: 750 });
    expect(sum(r.lines, "debit")).toBe(sum(r.lines, "credit"));
  });

  it("مدخلات فقط (بلا مخرجات): دائن 1180 / مدين النقد (استرداد)", () => {
    const r = buildVatSettlementLines({ outputVat: 0, inputVat: 620, outputCode: OUT, inputCode: IN, cashCode: CASH })!;
    expect(leg(r.lines, IN)).toMatchObject({ debit: 0, credit: 620 });
    expect(leg(r.lines, OUT)).toBeUndefined();
    expect(leg(r.lines, CASH)).toMatchObject({ debit: 620, credit: 0 });
    expect(sum(r.lines, "debit")).toBe(sum(r.lines, "credit"));
  });

  it("لا شيء لتسويته (صفر/صفر) → null", () => {
    expect(buildVatSettlementLines({ outputVat: 0, inputVat: 0, outputCode: OUT, inputCode: IN, cashCode: CASH })).toBeNull();
  });

  it("التقريب لخانتين + التوازن على مبالغ كسرية", () => {
    const r = buildVatSettlementLines({ outputVat: 1000.005, inputVat: 333.335, outputCode: OUT, inputCode: IN, cashCode: CASH })!;
    expect(sum(r.lines, "debit")).toBeCloseTo(sum(r.lines, "credit"), 2);
  });
});
