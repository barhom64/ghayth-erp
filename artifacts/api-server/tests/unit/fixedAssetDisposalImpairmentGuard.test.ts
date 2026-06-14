// #2140 شريحة 5-و — حارس R4: التحقق من أن dispose route
// تستخدم currentBookValue وتعكس accumulatedImpairment في القيد المحاسبي.
//
// اختبار ساكن — لا يحتاج قاعدة بيانات.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROUTE_FILE = resolve(__dirname, "../../src/routes/finance-algorithms.ts");
const src = readFileSync(ROUTE_FILE, "utf-8");

// استخرج كتلة dispose route
const disposeBlock = src.match(/\/fixed-assets\/:id\/dispose[\s\S]*?^}\);/m)?.[0] ?? "";

describe("#2140 شريحة 5-و — R4: dispose route يحسب bookValue بشكل صحيح", () => {

  it("dispose: يقرأ accumulatedImpairment من asset", () => {
    expect(disposeBlock, "dispose route must read asset.accumulatedImpairment").toMatch(/accumulatedImpairment/);
  });

  it("dispose: bookValue يستخدم currentBookValue وليس cost - accDep فقط", () => {
    const usesCurrentBookValue = /bookValue\s*=\s*roundTo2\(Number\(asset\.currentBookValue/.test(disposeBlock);
    expect(usesCurrentBookValue, "dispose bookValue must use asset.currentBookValue as primary source").toBe(true);
  });

  it("dispose: لا يوجد bookValue = roundTo2(cost - accDep) بدون accumulatedImpairment", () => {
    const oldPattern = /bookValue\s*=\s*roundTo2\(\s*cost\s*-\s*accDep\s*\)/.test(disposeBlock);
    expect(oldPattern, "old bookValue = cost - accDep pattern must not exist in dispose route").toBe(false);
  });

  it("dispose: القيد المحاسبي يعكس accumulatedImpairment (يُدين مجمع هبوط القيمة)", () => {
    const reversesImpairment = /accImpairment\s*>\s*0[\s\S]{0,200}accImpairmentCode/.test(disposeBlock);
    expect(reversesImpairment, "dispose JE must debit accumulated impairment account when accImpairment > 0").toBe(true);
  });

  it("dispose: يحل accImpairmentCode عبر intent asset_accumulated_impairment", () => {
    expect(disposeBlock, "must resolve asset_accumulated_impairment intent for disposal").toMatch(/asset_accumulated_impairment/);
  });

  it("gainLoss يحسب من bookValue الصحيح (بعد طرح الاستهلاك والهبوط)", () => {
    // gainLoss = proceeds - bookValue حيث bookValue = currentBookValue (يطرح الاثنين)
    const gainLossOk = /gainLoss\s*=\s*roundTo2\(proceeds\s*-\s*bookValue\)/.test(disposeBlock);
    expect(gainLossOk, "gainLoss must equal proceeds - bookValue (where bookValue includes impairment)").toBe(true);
  });
});
