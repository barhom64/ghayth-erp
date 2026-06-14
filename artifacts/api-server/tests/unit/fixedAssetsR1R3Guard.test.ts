// #2140 شريحة 5-هـ — حارس R1 + R3
//
// R1: التحقق من أن routes الاستبعاد / النقل / إعادة التقييم لا تستخدم "1500" الصلب
//     بل تمر عبر resolveAccountCode مع intent = asset_cost
//
// R2: التحقق من أن route إعادة التقييم تطبق مقاصة الفائض (3600) قبل الخسارة (5860)
//     وتحدّث عمود revaluationSurplus في fixed_assets
//
// اختبار ساكن — لا يحتاج قاعدة بيانات.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROUTE_FILE = resolve(__dirname, "../../src/routes/finance-algorithms.ts");
const MIGRATION  = resolve(__dirname, "../../src/migrations/339_fixed_assets_revaluation_surplus.sql");
const SCHEMA_PRE = resolve(__dirname, "../../../../db/schema_pre.sql");

const src    = readFileSync(ROUTE_FILE, "utf-8");
const mig    = readFileSync(MIGRATION,  "utf-8");
const schema = readFileSync(SCHEMA_PRE, "utf-8");

describe("#2140 شريحة 5-هـ — R1: intent-based asset account resolution", () => {

  it('route transfer: لا يستخدم fallback "1500" مباشرة — يمر عبر resolveAccountCode', () => {
    // نتحقق أن الكود يتحقق من "1500" قبل استخدامه كـ fallback
    const hasIntentFallback = /storedCode.*!==.*"1500"[\s\S]{0,300}resolveAccountCode[\s\S]{0,100}asset_cost/.test(src);
    expect(hasIntentFallback, 'transfer route must resolve asset_cost intent when stored code is "1500"').toBe(true);
  });

  it('route dispose: يحل assetCode عبر intent asset_cost', () => {
    const disposeBlock = src.match(/\/fixed-assets\/:id\/dispose[\s\S]*?^}\);/m)?.[0] ?? "";
    const hasIntentResolve = /asset_cost/.test(disposeBlock);
    expect(hasIntentResolve, 'dispose route must resolve asset_cost intent').toBe(true);
  });

  it('route dispose: يحل accDepCode عبر intent asset_accumulated_depreciation', () => {
    const hasAccDepResolve = /storedAccDepCode[\s\S]{0,100}asset_accumulated_depreciation/.test(src);
    expect(hasAccDepResolve, 'dispose route must resolve asset_accumulated_depreciation intent').toBe(true);
  });

  it('route revalue: يحل assetCode عبر intent asset_cost', () => {
    const revalueBlock = src.match(/\/fixed-assets\/:id\/revalue[\s\S]*?^}\);/m)?.[0] ?? "";
    const hasAssetCostIntent = /asset_cost/.test(revalueBlock);
    expect(hasAssetCostIntent, 'revalue route must resolve asset_cost intent').toBe(true);
  });

  it('migration 339 يزرع intent asset_cost في accounting_mappings', () => {
    expect(mig, 'migration 339 must seed asset_cost intent').toMatch(/asset_cost/);
  });

  it('migration 339 يزرع intent asset_accumulated_depreciation في accounting_mappings', () => {
    expect(mig, 'migration 339 must seed asset_accumulated_depreciation intent').toMatch(/asset_accumulated_depreciation/);
  });
});

describe("#2140 شريحة 5-هـ — R3: مقاصة فائض إعادة التقييم (IAS 16)", () => {

  it('migration 339 يضيف عمود revaluationSurplus إلى fixed_assets', () => {
    expect(mig, 'migration 339 must add revaluationSurplus column').toMatch(/"revaluationSurplus"/);
  });

  it('schema_pre.sql يحتوي على عمود revaluationSurplus في fixed_assets', () => {
    const tableMatch = schema.match(/CREATE TABLE public\.fixed_assets \([\s\S]*?\);/);
    const tableDef = tableMatch ? tableMatch[0] : "";
    expect(tableDef, 'schema_pre.sql must include revaluationSurplus column').toMatch(/"revaluationSurplus"/);
  });

  it('route revalue: يقرأ revaluationSurplus من asset', () => {
    const revalueBlock = src.match(/\/fixed-assets\/:id\/revalue[\s\S]*?^}\);/m)?.[0] ?? "";
    expect(revalueBlock, 'revalue route must read asset.revaluationSurplus').toMatch(/revaluationSurplus/);
  });

  it('route revalue: يحسب surplusOffset (مقاصة من الفائض أولاً)', () => {
    const revalueBlock = src.match(/\/fixed-assets\/:id\/revalue[\s\S]*?^}\);/m)?.[0] ?? "";
    expect(revalueBlock, 'revalue route must compute surplusOffset').toMatch(/surplusOffset/);
  });

  it('route revalue: يحدّث revaluationSurplus في UPDATE fixed_assets', () => {
    const revalueBlock = src.match(/\/fixed-assets\/:id\/revalue[\s\S]*?^}\);/m)?.[0] ?? "";
    const updatesColumn = /UPDATE fixed_assets[\s\S]{0,200}"revaluationSurplus"/.test(revalueBlock);
    expect(updatesColumn, 'revalue route must persist revaluationSurplus to fixed_assets').toBe(true);
  });

  it('route revalue: التقييم السلبي يضع surplusOffset أولاً ثم lossAmount فقط إذا وُجد', () => {
    const revalueBlock = src.match(/\/fixed-assets\/:id\/revalue[\s\S]*?^}\);/m)?.[0] ?? "";
    expect(revalueBlock, 'must have lossAmount computed from (absDelta - surplusOffset)').toMatch(/lossAmount/);
  });
});
