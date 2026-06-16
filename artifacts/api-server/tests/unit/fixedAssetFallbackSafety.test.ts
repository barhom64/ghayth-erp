// #2140 شريحة 5-أ — تحقق من عدم وجود fallbacks خاطئة في كود الأصول الثابتة.
//
// يثبت أن:
// - لا يوجد fallback إلى 3300 (الأرباح المحتجزة) في عمليات إعادة التقييم.
// - لا يوجد fallback إلى 4999 أو 5999 (أكواد غير موجودة في القالب القانوني).
// - لا يوجد fallback إلى 1591 أو 5995 أو 5996 (أكواد لم تُضف للقالب القانوني).
// - الكود الخلفي يستخدم accumulatedImpairment وليس accumulatedDepreciation في هبوط القيمة.
//
// اختبار ساكن — لا يحتاج قاعدة بيانات.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROUTE_FILE = resolve(
  __dirname,
  "../../src/routes/finance-algorithms.ts"
);

const src = readFileSync(ROUTE_FILE, "utf-8");

describe("#2140 شريحة 5-أ — سلامة fallbacks الأصول الثابتة", () => {

  // ── fallbacks المحظورة تمامًا ────────────────────────────────────────────

  it('لا يوجد fallback إلى "3300" في عمليات إعادة التقييم', () => {
    // نبحث عن استخدام 3300 كفالباك في resolveAccountCode
    const forbidden = /"3300"/.test(src) &&
      /asset_revaluation_surplus[\s\S]{0,200}"3300"/.test(src);
    expect(forbidden, 'fallback "3300" for asset_revaluation_surplus must not appear — use "3600"').toBe(false);
  });

  it('لا يوجد fallback إلى "4999" في عمليات الاستبعاد', () => {
    // 4999 لا يوجد في القالب القانوني — الصحيح 4920
    const hasBadFallback = /asset_disposal_gain[\s\S]{0,200}"4999"/.test(src);
    expect(hasBadFallback, 'fallback "4999" must not appear — use "4920"').toBe(false);
  });

  it('لا يوجد fallback إلى "5999" في عمليات الاستبعاد', () => {
    // 5999 لا يوجد في القالب القانوني — الصحيح 5810
    const hasBadFallback = /asset_disposal_loss[\s\S]{0,200}"5999"/.test(src);
    expect(hasBadFallback, 'fallback "5999" must not appear — use "5810"').toBe(false);
  });

  it('لا يوجد fallback إلى "1591" في عمليات هبوط القيمة', () => {
    // 1591 لا يوجد في القالب — الصحيح 1291
    const hasBadFallback = /asset_accumulated_impairment[\s\S]{0,200}"1591"/.test(src);
    expect(hasBadFallback, 'fallback "1591" must not appear — use "1291"').toBe(false);
  });

  it('لا يوجد fallback إلى "5995" في عمليات هبوط القيمة', () => {
    // 5995 لا يوجد في القالب — الصحيح 5850
    const hasBadFallback = /asset_impairment_loss[\s\S]{0,200}"5995"/.test(src);
    expect(hasBadFallback, 'fallback "5995" must not appear — use "5850"').toBe(false);
  });

  it('لا يوجد fallback إلى "5996" في عمليات إعادة التقييم', () => {
    // 5996 لا يوجد في القالب — الصحيح 5860
    const hasBadFallback = /asset_revaluation_loss[\s\S]{0,200}"5996"/.test(src);
    expect(hasBadFallback, 'fallback "5996" must not appear — use "5860"').toBe(false);
  });

  // ── فصل هبوط القيمة عن الإهلاك ─────────────────────────────────────────

  it('هبوط القيمة يحدّث accumulatedImpairment وليس accumulatedDepreciation', () => {
    // نتحقق أن منطق impair لا يمس accumulatedDepreciation بالجمع
    // نبحث في المنطق الحالي أن UPDATE يستخدم accumulatedImpairment
    const hasCorrectUpdate = /"accumulatedImpairment"/.test(src);
    expect(hasCorrectUpdate, 'impairment route must update "accumulatedImpairment" column').toBe(true);
  });

  it('هبوط القيمة لا يضيف إلى accumulatedDepreciation مباشرة', () => {
    // نتحقق أن السطر القديم (accumulatedDepreciation += impairmentAmount) غير موجود
    // نبحث عن النمط القديم في كتلة impair
    const oldPattern = /impairAmount[\s\S]{0,50}accumulatedDepreciation|newAccumulated[\s\S]{0,200}SET.*accumulatedDepreciation.*impair/s;
    // ملاحظة: النمط يكون إشكاليًا فقط إذا كان في كتلة الـ impair route
    // نتحقق بطريقة أبسط: أن UPDATE في impair لا يذكر accumulatedDepreciation
    const impairBlock = src.match(/\/\/ POST.*impair[\s\S]*?^}\);/m)?.[0] ?? "";
    const touchesAccumDep = /SET.*accumulatedDepreciation/.test(impairBlock) ||
      /accumulatedDepreciation.*\+.*impairment/i.test(impairBlock);
    expect(touchesAccumDep, 'impair route must NOT modify accumulatedDepreciation — use accumulatedImpairment').toBe(false);
  });

  // ── UPDATE نقل الأصل يحفظ القسم ومركز التكلفة ─────────────────────────

  it('UPDATE نقل الأصل يحفظ departmentId و costCenterId في جدول fixed_assets', () => {
    // نبحث عن UPDATE fixed_assets يتضمن departmentId
    const hasDepUpdate = /UPDATE fixed_assets[\s\S]{0,300}departmentId/.test(src);
    expect(hasDepUpdate, 'transfer UPDATE must persist departmentId to fixed_assets').toBe(true);
  });

  it('UPDATE نقل الأصل يحفظ costCenterId في جدول fixed_assets', () => {
    const hasCCUpdate = /UPDATE fixed_assets[\s\S]{0,300}costCenterId/.test(src);
    expect(hasCCUpdate, 'transfer UPDATE must persist costCenterId to fixed_assets').toBe(true);
  });

  // ── الفالباكات الصحيحة موجودة ────────────────────────────────────────────

  it('fallback إعادة التقييم الصحيح هو "3600" (فائض إعادة التقييم)', () => {
    const hasCorrect = /asset_revaluation_surplus[\s\S]{0,200}"3600"/.test(src);
    expect(hasCorrect, 'asset_revaluation_surplus fallback must be "3600"').toBe(true);
  });

  it('fallback خسارة إعادة التقييم الصحيح هو "5860"', () => {
    const hasCorrect = /asset_revaluation_loss[\s\S]{0,200}"5860"/.test(src);
    expect(hasCorrect, 'asset_revaluation_loss fallback must be "5860"').toBe(true);
  });

  it('fallback ربح الاستبعاد الصحيح هو "4920"', () => {
    const hasCorrect = /asset_disposal_gain[\s\S]{0,200}"4920"/.test(src);
    expect(hasCorrect, 'asset_disposal_gain fallback must be "4920"').toBe(true);
  });

  it('fallback خسارة الاستبعاد الصحيح هو "5810"', () => {
    const hasCorrect = /asset_disposal_loss[\s\S]{0,200}"5810"/.test(src);
    expect(hasCorrect, 'asset_disposal_loss fallback must be "5810"').toBe(true);
  });

  it('fallback مجمع الهبوط الصحيح هو "1291"', () => {
    const hasCorrect = /asset_accumulated_impairment[\s\S]{0,200}"1291"/.test(src);
    expect(hasCorrect, 'asset_accumulated_impairment fallback must be "1291"').toBe(true);
  });

  it('fallback خسارة الهبوط الصحيح هو "5850"', () => {
    const hasCorrect = /asset_impairment_loss[\s\S]{0,200}"5850"/.test(src);
    expect(hasCorrect, 'asset_impairment_loss fallback must be "5850"').toBe(true);
  });

  it('fallback نقدية الاستبعاد الصحيح هو "1111" (postable leaf — أُصلح في main #2192)', () => {
    const hasCorrect = /asset_disposal_cash[\s\S]{0,200}"1111"/.test(src);
    expect(hasCorrect, 'asset_disposal_cash fallback must be "1111" (postable cash leaf)').toBe(true);
  });
});

// ── حارس انجراف schema_pre.sql ─────────────────────────────────────────────
// يتحقق من أن db/schema_pre.sql يحتوي على الأعمدة التي أضافتها migration 338.
// إذا أُضيف عمود جديد لجدول fixed_assets عبر migration مستقبلي، يجب تحديث
// هذا الاختبار وschema_pre.sql معًا.

const SCHEMA_PRE = resolve(__dirname, "../../../../db/schema_pre.sql");

describe("#2140 شريحة 5-أ — حارس انجراف schema_pre.sql", () => {
  const schema = readFileSync(SCHEMA_PRE, "utf-8");

  // استخرج تعريف جدول fixed_assets فقط (من CREATE TABLE حتى نهايته)
  const tableMatch = schema.match(
    /CREATE TABLE public\.fixed_assets \([\s\S]*?\);/
  );
  const tableDef = tableMatch ? tableMatch[0] : "";

  it("schema_pre.sql يحتوي على عمود departmentId في fixed_assets", () => {
    expect(tableDef, "migration 338: departmentId missing from schema_pre.sql").toMatch(
      /"departmentId"/
    );
  });

  it("schema_pre.sql يحتوي على عمود costCenterId في fixed_assets", () => {
    expect(tableDef, "migration 338: costCenterId missing from schema_pre.sql").toMatch(
      /"costCenterId"/
    );
  });

  it("schema_pre.sql يحتوي على عمود accumulatedImpairment في fixed_assets", () => {
    expect(tableDef, "migration 338: accumulatedImpairment missing from schema_pre.sql").toMatch(
      /"accumulatedImpairment"/
    );
  });
});
