import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDocumentPersistencePlan } from "../../src/lib/financeDocumentJournal.js";

/**
 * البند ٤ ج-٤ — وقود آجل على مورّد المحطة: ساق الدائن = ذمة المورّد
 * (`purchase_vendor_ap` → 2111) بدل مصدر النقد (`fleet_cash_source` → 1111)، موسومةً
 * بـ`vendorId` فيُربط الالتزام بالمورّد (ويستبدلها enricher الأبعاد لاحقًا بالحساب
 * الفرعي للمورّد — الحساب الخاص لكل كيان).
 *
 * اختبار assertion على سطور القيد (الدستور قاعدة ٣: لا تغيير قيد بلا assertion). نقيٌّ
 * عبر `buildDocumentPersistencePlan` (المسار الفعلي الذي يستدعيه `postFinancialDocument`)
 * — لا قاعدة بيانات. شكل البنود يطابق ما يمرّره مسار `POST /fleet/vehicles/:id/fuel-event`.
 */
describe("البند ٤ ج-٤ — وقود آجل: CR ذمة المورّد بدل النقد", () => {
  const sumDebit = (legs: { debit: number }[]) => legs.reduce((s, l) => s + l.debit, 0);
  const sumCredit = (legs: { credit: number }[]) => legs.reduce((s, l) => s + l.credit, 0);

  // بند وقود واحد بشكل مسار fuel-event (مركبة 100% — المتحمِّل شركة افتراضًا).
  const fuelLine = (costBearer = "company") => ({
    lineNo: 1,
    quantity: 100, // لتر
    unitPrice: 2, // ريال/لتر → صافي 200
    taxRatePercent: 0,
    counterAccountCode: "5510", // fleet_fuel_expense (postable fallback)
    itemName: "وقود",
    allocations: [
      { entityType: "vehicle", entityId: 3, allocationType: "percent" as const, percent: 100, costBearer },
    ],
  });

  it("آجل: ساق الدائن = ذمة المورّد (2111) موسومةً بـvendorId، والقيد متوازن", () => {
    const { journalLegs: legs } = buildDocumentPersistencePlan(
      { direction: "payment", cashAccountCode: "2111", cashAccountDims: { vendorId: 7 } },
      [fuelLine()],
    );
    // مدين وقود المركبة + دائن ذمة المورّد (لا ساق نقد).
    const fuelLeg = legs.find((l) => l.accountCode === "5510")!;
    expect(fuelLeg.debit).toBeCloseTo(200, 2);
    expect(fuelLeg.entityRef).toEqual({ entityType: "vehicle", entityId: 3 });

    const apLeg = legs.find((l) => l.accountCode === "2111")!;
    expect(apLeg.credit).toBeCloseTo(200, 2);
    expect(apLeg.debit).toBe(0);
    expect(apLeg.dims?.vendorId).toBe(7); // الالتزام مربوط بالمورّد

    // لا ساق على مصدر نقد الأسطول إطلاقًا (لم يخرج نقد).
    expect(legs.find((l) => l.accountCode === "1111")).toBeUndefined();
    expect(sumDebit(legs)).toBeCloseTo(sumCredit(legs), 2);
  });

  it("نقدًا (الافتراض): ساق الدائن = مصدر النقد (1111) بلا بُعد مورّد — السلوك السابق محفوظ", () => {
    const { journalLegs: legs } = buildDocumentPersistencePlan(
      { direction: "payment", cashAccountCode: "1111" },
      [fuelLine()],
    );
    const cashLeg = legs.find((l) => l.accountCode === "1111")!;
    expect(cashLeg.credit).toBeCloseTo(200, 2);
    expect(cashLeg.dims).toBeUndefined(); // لا vendorId
    expect(legs.find((l) => l.accountCode === "2111")).toBeUndefined();
    expect(sumDebit(legs)).toBeCloseTo(sumCredit(legs), 2);
  });

  it("آجل بضريبة مدخلات: الدائن ذمة المورّد بالإجمالي شامل الضريبة (230)", () => {
    const line = { ...fuelLine(), taxRatePercent: 15 }; // صافي 200 + ضريبة 30
    const { journalLegs: legs } = buildDocumentPersistencePlan(
      { direction: "payment", cashAccountCode: "2111", vatAccountCode: "1180", cashAccountDims: { vendorId: 7 } },
      [line],
    );
    const apLeg = legs.find((l) => l.accountCode === "2111")!;
    expect(apLeg.credit).toBeCloseTo(230, 2); // الإجمالي شامل الضريبة
    expect(apLeg.dims?.vendorId).toBe(7);
    expect(legs.find((l) => l.accountCode === "1180")!.debit).toBeCloseTo(30, 2); // ضريبة مدخلات مدينة
    expect(sumDebit(legs)).toBeCloseTo(sumCredit(legs), 2);
  });

  it("آجل + متحمِّل سائق: المدين يتحوّل لذمة السائق (override م٥)، والدائن يبقى ذمة المورّد — تعامدٌ تام", () => {
    // costBearer يوجّه المدين (override) و paymentMethod يوجّه الدائن — مستقلّان.
    const line = {
      ...fuelLine("driver"),
      allocations: [
        { entityType: "vehicle", entityId: 3, allocationType: "percent" as const, percent: 100, costBearer: "driver", overrideAccountCode: "1143" },
      ],
    };
    const { journalLegs: legs } = buildDocumentPersistencePlan(
      { direction: "payment", cashAccountCode: "2111", cashAccountDims: { vendorId: 7 } },
      [line],
    );
    // المدين ذمة السائق (1143) لا مصروف الوقود (5510)؛ الدائن ذمة المورّد (2111).
    expect(legs.find((l) => l.accountCode === "5510")).toBeUndefined();
    expect(legs.find((l) => l.accountCode === "1143")!.debit).toBeCloseTo(200, 2);
    const apLeg = legs.find((l) => l.accountCode === "2111")!;
    expect(apLeg.credit).toBeCloseTo(200, 2);
    expect(apLeg.dims?.vendorId).toBe(7);
    expect(sumDebit(legs)).toBeCloseTo(sumCredit(legs), 2);
  });
});

/**
 * حارس توصيل المسار (ثابت): مسار fuel-event يحلّ ذمة المورّد عند الآجل، يختِم vendorId،
 * ويرفض الآجل بلا مورّد. يقرأ المصدر نصًّا (لا تشغيل خادم).
 */
describe("البند ٤ ج-٤ — توصيل مسار fuel-event", () => {
  const FLEET = readFileSync(join(import.meta.dirname!, "../../src/routes/fleet.ts"), "utf8");

  it("يحلّ purchase_vendor_ap (2111) كساق دائن عند الشراء الآجل", () => {
    expect(FLEET).toMatch(/paymentMethod === "credit"[\s\S]*?resolveAccountCode\([^)]*"purchase_vendor_ap", "credit", "2111"/);
  });

  it("يختِم vendorId على ساق الذمة عبر cashAccountDims", () => {
    expect(FLEET).toMatch(/cashAccountDims: \{ vendorId: supplierId \}/);
  });

  it("يرفض الشراء الآجل بلا مورّد", () => {
    expect(FLEET).toMatch(/paymentMethod === "credit" && !supplierId/);
    expect(FLEET).toMatch(/الشراء الآجل يستلزم تحديد مورّد الوقود/);
  });
});
