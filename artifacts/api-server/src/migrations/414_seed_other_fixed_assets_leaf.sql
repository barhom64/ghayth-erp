-- 414_seed_other_fixed_assets_leaf.sql
-- ورقة أصل ثابت عامة قابلة للترحيل لكل شركة:
--   1280 «أصول ثابتة أخرى» (أصل، تحت 1200)
--
-- WHY:
--   رسملة الأعمال تحت التنفيذ (CIP → finance-algorithms) كانت ترجع لكود هدف
--   غير موجود بالشجرة: 1500 (أصل ثابت). فعند غياب فئة الأصل المحدّدة يفشل قيد
--   الرسملة. هذه ورقة حقيقية قابلة للترحيل كسقوط آمن عام (الأصل يحمل فئته
--   الخاصة عادةً 1210/1220/1240…؛ هذه للسقوط الآمن لا للتصنيف الافتراضي).
--
-- DESIGN: additive + idempotent (ON CONFLICT DO NOTHING)؛ تُنشأ للشركات التي
--   تملك الرأس 1200 ولا تملك الورقة. لا تعديل لحساب قائم، لا مساس بقيود.
--
-- @rollback:
--   DELETE FROM chart_of_accounts WHERE code = '1280' AND "parentCode" = '1200';

BEGIN;

INSERT INTO chart_of_accounts
  ("companyId", code, name, "nameEn", type, "parentId", "parentCode", level, "allowPosting", "isActive", status)
SELECT p."companyId", '1280', 'أصول ثابتة أخرى', 'Other Fixed Assets', 'asset',
       p.id, '1200', 3, true, true, 'active'
  FROM chart_of_accounts p
 WHERE p.code = '1200' AND p."deletedAt" IS NULL
   AND NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c."companyId" = p."companyId" AND c.code = '1280')
ON CONFLICT ("companyId", code) DO NOTHING;

COMMIT;
