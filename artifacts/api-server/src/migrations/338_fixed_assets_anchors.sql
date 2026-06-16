-- ===========================================================================
-- 337_fixed_assets_anchors.sql
-- ---------------------------------------------------------------------------
-- WHAT:  شريحة 5-أ من #2140 — مرتكزات الأصول الثابتة المحاسبية والبنيوية
--        قبل واجهات دورة الحياة (نقل / استبعاد / هبوط القيمة / إعادة التقييم).
--
-- WHY:   تقرير الفحص التمهيدي (2026-06-13) كشف:
--        G1: fixed_assets بلا departmentId / costCenterId → نقل القسم/المركز
--            يمر عبر أبعاد GL فقط ولا يُحفظ في سجل الأصل.
--        G2: هبوط القيمة يضاف إلى accumulatedDepreciation مما يخلط بين
--            مجمع الإهلاك ومجمع الهبوط في عمود واحد.
--        G3: 1291 (مجمع هبوط القيمة) غير موجود في القالب القانوني.
--        G4: 5850 (خسارة هبوط القيمة) غير موجود في القالب.
--        G5: 5860 (خسارة إعادة التقييم) غير موجود في القالب.
--        G6: 3600 (فائض إعادة التقييم) غير موجود — القالب يضع 3300 للأرباح
--            المحتجزة، وهو تصنيف مختلف تمامًا.
--        G7: 7 intents لدورة حياة الأصول غير مُلقَّحة في accounting_mappings.
--        G8: fallbacks الكود الخلفي (4999/5999/3300/1591/5995/5996) لا تطابق
--            القالب القانوني وبعضها غير موجود أصلًا.
--
-- SCOPE: additive فقط. لا حذف لأعمدة أو حسابات قائمة. لا تغيير عقود API.
--        لا رواتب. لا عمرة. لا نقل بين شركات.
--        الحسابات الجديدة في companyBootstrap.ts موثقة في هذا الملف لكن تُضاف
--        هناك عبر تعديل الكود (راجع companyBootstrap.ts).
--
-- @rollback:
--   ALTER TABLE fixed_assets
--     DROP COLUMN IF EXISTS "departmentId",
--     DROP COLUMN IF EXISTS "costCenterId",
--     DROP COLUMN IF EXISTS "accumulatedImpairment";
--   DELETE FROM accounting_mappings WHERE "operationLabel" = '#2140-5a asset anchors';
-- ===========================================================================

-- ─── 1. أعمدة بنيوية جديدة في fixed_assets ────────────────────────────────

-- 1-أ: نقل القسم ومركز التكلفة — يُحفظ في سجل الأصل (لا يكتفى بأبعاد GL)
ALTER TABLE fixed_assets
  ADD COLUMN IF NOT EXISTS "departmentId" INTEGER,
  ADD COLUMN IF NOT EXISTS "costCenterId" INTEGER;

-- 1-ب: مجمع هبوط القيمة المستقل — فصل IAS 36 عن مجمع الإهلاك IAS 16.
--      العمليات التاريخية (accumulatedDepreciation) لا تتأثر لأن العمود يبدأ بصفر.
ALTER TABLE fixed_assets
  ADD COLUMN IF NOT EXISTS "accumulatedImpairment" NUMERIC(15,2) NOT NULL DEFAULT 0;

-- فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_fixed_assets_department
  ON fixed_assets("departmentId") WHERE "departmentId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_cost_center
  ON fixed_assets("costCenterId") WHERE "costCenterId" IS NOT NULL;

-- ─── 2. زرع intents دورة حياة الأصول في accounting_mappings ────────────────
-- الحسابات الاحتياطية المعتمدة (بعد تصحيح الأخطاء في الكود الخلفي):
--   asset_disposal_cash          → 1100  (النقدية/البنك)     موجود في القالب
--   asset_disposal_gain          → 4920  (أرباح بيع أصول)   موجود في القالب — وليس 4999
--   asset_disposal_loss          → 5810  (خسائر بيع أصول)   موجود في القالب — وليس 5999
--   asset_impairment_loss        → 5850  (خسارة هبوط قيمة)  جديد في companyBootstrap
--   asset_accumulated_impairment → 1291  (مجمع هبوط قيمة)   جديد في companyBootstrap — وليس 1591
--   asset_revaluation_surplus    → 3600  (فائض إعادة تقييم) جديد في companyBootstrap — وليس 3300
--   asset_revaluation_loss       → 5860  (خسارة إعادة تقييم)جديد في companyBootstrap — وليس 5996

WITH intent(op, typ, fallback, kws) AS (VALUES
  ('asset_disposal_cash',          'asset',   '1100', ARRAY['النقدية','البنك','نقدية وما يعادلها','cash','bank']),
  ('asset_disposal_gain',          'revenue', '4920', ARRAY['أرباح بيع أصول','بيع أصول ثابتة','gain on sale','gain on disposal']),
  ('asset_disposal_loss',          'expense', '5810', ARRAY['خسائر بيع أصول','بيع أصول ثابتة','loss on sale','loss on disposal']),
  ('asset_impairment_loss',        'expense', '5850', ARRAY['انخفاض قيمة أصول','خسارة انخفاض','impairment loss']),
  ('asset_accumulated_impairment', 'asset',   '1291', ARRAY['مجمع انخفاض قيمة','انخفاض قيمة مجمع','accumulated impairment']),
  ('asset_revaluation_surplus',    'equity',  '3600', ARRAY['فائض إعادة تقييم','إعادة تقييم','revaluation surplus']),
  ('asset_revaluation_loss',       'expense', '5860', ARRAY['خسارة إعادة تقييم','إعادة تقييم خسارة','revaluation loss'])
),
resolved AS (
  SELECT
    c.id AS company_id,
    i.op,
    COALESCE(
      -- step 1: الحساب الاحتياطي إن وجد وكان postable
      (SELECT fb.code FROM chart_of_accounts fb
        WHERE fb."companyId" = c.id AND fb.code = i.fallback
          AND fb."allowPosting" = true AND fb."deletedAt" IS NULL
        LIMIT 1),
      -- step 2: أقصر حساب postable من النوع الصحيح يطابق كلمة مفتاحية
      (SELECT k.code FROM chart_of_accounts k
        WHERE k."companyId" = c.id AND k.type = i.typ
          AND k."allowPosting" = true AND k."deletedAt" IS NULL
          AND EXISTS (SELECT 1 FROM unnest(i.kws) kw
                      WHERE LOWER(k.name) LIKE '%' || LOWER(kw) || '%')
        ORDER BY length(k.code) ASC, k.code ASC
        LIMIT 1)
    ) AS resolved_code
  FROM companies c
  CROSS JOIN intent i
)
INSERT INTO accounting_mappings
  ("companyId", "operationType", "operationLabel",
   "debitAccountCode", "creditAccountCode", "isActive", "createdAt", "updatedAt")
SELECT company_id, op, '#2140-5a asset anchors',
       resolved_code, resolved_code, true, now(), now()
FROM resolved
WHERE resolved_code IS NOT NULL
ON CONFLICT ("companyId", "operationType") DO NOTHING;
