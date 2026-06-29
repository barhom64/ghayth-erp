-- ===========================================================================
-- 422_seed_cost_bearer_receivable_mappings.sql  (م٥ — تفريع costBearer)
-- ---------------------------------------------------------------------------
-- ضرورة (موافقة المالك ٢٦‑٠٦، الخيار «خريطة دقيقة لكل طرف + seed للناقص»):
-- حين يكون المتحمِّل (costBearer) ≠ الشركة، يجب أن يُمدِّن القيد **ذمة الطرف** بدل
-- المصروف (docs/25 §١٠). هذا الـseed يربط كل نوع متحمِّل بحساب ذمته القابل للترحيل
-- عبر accounting_mappings، ويضيف الحسابين الناقصين (تأمين/طرف ثالث).
--
-- الخريطة (المتحمِّل → حساب الذمة المدين، كلها قابلة للترحيل):
--   driver/employee  → 1143  قروض/ذمم موظفين            (قائم)
--   tenant           → 1131  ذمم إيجارات مدينة          (قائم)
--   customer         → 1131  ذمم عملاء مدينة            (قائم — 1200 «أب» غير قابل للترحيل، فلا يُستعمل)
--   supplier         → 1190  ذمم/دفعات الموردين         (قائم)
--   insurance        → 1191  مطالبات التأمين المدينة     (جديد هنا)
--   third_party      → 1192  ذمم أطراف ثالثة مدينة       (جديد هنا)
--
-- SAFETY: idempotent. إدراج الحسابات ON CONFLICT DO NOTHING. ربط accounting_mappings
--   يُقيَّد بالحسابات الموجودة القابلة للترحيل لكل شركة (شركة تنقص الكود تُتخطّى، لا
--   تُربط بكود سيّئ)، ويملأ الصفوف الفارغة فقط ولا يطمس تخصيصًا يدويًا. لا مساس
--   بأي قيد قائم (seed بيانات فقط؛ تحويل القيد نفسه في الكود مع اختبار assertion).
--
-- @rollback
--   DELETE FROM accounting_mappings WHERE "operationLabel" = 'م٥ cost-bearer receivable';
--   DELETE FROM chart_of_accounts WHERE code IN ('1191','1192')
--     AND id NOT IN (SELECT DISTINCT "accountId" FROM journal_lines WHERE "accountId" IS NOT NULL);
-- ===========================================================================

-- (1) الحسابان الناقصان على كل شركة (تحت 1100، قابلان للترحيل).
INSERT INTO chart_of_accounts
  ("companyId", code, name, "nameEn", type, "parentId", "parentCode", level, "allowPosting", "isActive", status)
SELECT
  c.id, v.code, v.name, v.name_en, 'asset',
  (SELECT p.id FROM chart_of_accounts p
     WHERE p."companyId" = c.id AND p.code = '1100' AND p."deletedAt" IS NULL LIMIT 1),
  '1100', 3, true, true, 'active'
FROM companies c
CROSS JOIN (VALUES
  ('1191', 'مطالبات التأمين المدينة', 'Insurance Claims Receivable'),
  ('1192', 'ذمم أطراف ثالثة مدينة',   'Third-Party Receivable')
) AS v(code, name, name_en)
ON CONFLICT ("companyId", code) DO NOTHING;

-- (2) ربط نوايا تفريع المتحمِّل بحساب الذمة المدين القابل للترحيل لكل شركة.
WITH intent(op, code) AS (VALUES
  ('cost_bearer_receivable_driver',      '1143'),
  ('cost_bearer_receivable_employee',    '1143'),
  ('cost_bearer_receivable_tenant',      '1131'),
  ('cost_bearer_receivable_customer',    '1131'),
  ('cost_bearer_receivable_supplier',    '1190'),
  ('cost_bearer_receivable_insurance',   '1191'),
  ('cost_bearer_receivable_third_party', '1192')
),
resolved AS (
  -- فقط حيث الحساب موجود وقابل للترحيل على شجرة تلك الشركة.
  SELECT c.id AS company_id, i.op, a.code AS resolved_code
  FROM companies c
  CROSS JOIN intent i
  JOIN chart_of_accounts a
    ON a."companyId" = c.id AND a.code = i.code
   AND a."allowPosting" = true AND a."deletedAt" IS NULL
)
INSERT INTO accounting_mappings
  ("companyId", "operationType", "operationLabel", "debitAccountCode", "creditAccountCode", "isActive", "createdAt", "updatedAt")
SELECT company_id, op, 'م٥ cost-bearer receivable', resolved_code, resolved_code, true, now(), now()
FROM resolved
ON CONFLICT ("companyId", "operationType") DO UPDATE SET
  "debitAccountCode"  = EXCLUDED."debitAccountCode",
  "creditAccountCode" = EXCLUDED."creditAccountCode",
  "operationLabel"    = EXCLUDED."operationLabel",
  "updatedAt"         = now()
WHERE accounting_mappings."debitAccountCode" IS NULL
  AND accounting_mappings."creditAccountCode" IS NULL
  AND accounting_mappings."debitAccountId" IS NULL;
