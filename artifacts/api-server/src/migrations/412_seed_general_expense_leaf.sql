-- 412_seed_general_expense_leaf.sql
-- ورقة «مصروفات عمومية أخرى» (5399) — حساب مصروف عام قابل للترحيل لكل شركة.
--
-- WHY:
--   مسار المصروف «بدون ربط» كان يرجع لحسابات افتراضية غير قابلة للترحيل:
--   5000 «المصروفات» (رأس level-1، allowPosting=false) و1100 «الأصول المتداولة»
--   (رأس). فالقيد يفشل («الحساب غير موجود أو غير قابل للترحيل — لا يمكن إنشاء
--   القيد») ويُحجب المستخدم. لم تكن هناك ورقة «مصروف عام» قابلة للترحيل أصلًا
--   (6900 غير مبذور). هذه الهجرة تُلحق الورقة القانونية 5399 تحت 5300 (الإدارية
--   والعمومية) لكل شركة لديها 5300، لتكون البديل الصحيح القابل للترحيل.
--
-- DESIGN: additive + idempotent (ON CONFLICT DO NOTHING). تُنشأ فقط للشركات
--   التي تملك الرأس 5300 ولا تملك 5399. لا تعديل لأي حساب قائم، لا مساس بقيود.
--
-- @rollback:
--   DELETE FROM chart_of_accounts WHERE code='5399' AND "parentCode"='5300';

BEGIN;

INSERT INTO chart_of_accounts
  ("companyId", code, name, "nameEn", type, "parentId", "parentCode", level, "allowPosting", "isActive", status)
SELECT p."companyId", '5399', 'مصروفات عمومية أخرى', 'Other G&A Expenses', 'expense',
       p.id, '5300', 3, true, true, 'active'
  FROM chart_of_accounts p
 WHERE p.code = '5300' AND p."deletedAt" IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM chart_of_accounts c
      WHERE c."companyId" = p."companyId" AND c.code = '5399'
   )
ON CONFLICT ("companyId", code) DO NOTHING;

COMMIT;
