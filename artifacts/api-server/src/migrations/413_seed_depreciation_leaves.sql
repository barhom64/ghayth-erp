-- 413_seed_depreciation_leaves.sql
-- ورقتا إهلاك عامتان قابلتان للترحيل لكل شركة:
--   5790 «إهلاك وإطفاء أخرى»      (مصروف، تحت 5700)
--   1290 «مجمع إهلاك أصول أخرى»   (أصل مقابل، تحت 1200)
--
-- WHY:
--   مسار الأصول الثابتة/الإهلاك (finance-algorithms + cron الإهلاك) كان يرجع
--   لأكواد غير موجودة بالشجرة: 6100 (مصروف إهلاك) و1590 (مجمع إهلاك). فالقيد
--   يفشل عند غياب حساب الأصل الخاص. هذه أوراق حقيقية قابلة للترحيل كافتراضي
--   عام (الأصل يحمل حسابه الخاص عادةً؛ هذا للسقوط الآمن).
--
-- DESIGN: additive + idempotent (ON CONFLICT DO NOTHING)؛ تُنشأ للشركات التي
--   تملك الرأس المناسب ولا تملك الورقة. لا تعديل لحساب قائم، لا مساس بقيود.
--
-- @rollback:
--   DELETE FROM chart_of_accounts WHERE code IN ('5790','1290') AND "parentCode" IN ('5700','1200');

BEGIN;

INSERT INTO chart_of_accounts
  ("companyId", code, name, "nameEn", type, "parentId", "parentCode", level, "allowPosting", "isActive", status)
SELECT p."companyId", '5790', 'إهلاك وإطفاء أخرى', 'Other Depreciation & Amortization', 'expense',
       p.id, '5700', 3, true, true, 'active'
  FROM chart_of_accounts p
 WHERE p.code = '5700' AND p."deletedAt" IS NULL
   AND NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c."companyId" = p."companyId" AND c.code = '5790')
ON CONFLICT ("companyId", code) DO NOTHING;

INSERT INTO chart_of_accounts
  ("companyId", code, name, "nameEn", type, "parentId", "parentCode", level, "allowPosting", "isActive", status)
SELECT p."companyId", '1290', 'مجمع إهلاك أصول أخرى', 'Accum. Depr. – Other', 'asset',
       p.id, '1200', 3, true, true, 'active'
  FROM chart_of_accounts p
 WHERE p.code = '1200' AND p."deletedAt" IS NULL
   AND NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c."companyId" = p."companyId" AND c.code = '1290')
ON CONFLICT ("companyId", code) DO NOTHING;

COMMIT;
