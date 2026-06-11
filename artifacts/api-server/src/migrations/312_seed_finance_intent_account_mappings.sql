-- ===========================================================================
-- 312_seed_finance_intent_account_mappings.sql
-- ---------------------------------------------------------------------------
-- WHAT:    seed accounting_mappings, per company, for the finance-posting
--          operation keys that today resolve only through the in-code intent
--          search (businessHelpers MAPPING_INTENT) — freezing the CURRENT
--          resolved account as configurable data.
-- WHY:     #2099 / FIN-SUB-08 — getAccountCodeFromMapping checks
--          accounting_mappings first, then falls back to resolveByIntent
--          (type + Arabic-name keywords) and finally to a literal code. The
--          invoice / customer-payment / bank / GRN operation keys introduced
--          by #1945 / #2022 / #2109 have NO mapping rows, so every company's
--          GL routing for them lives in code, not in the controllable
--          accounting_mappings layer — un-tunable per tenant without a
--          code-and-deploy. This seeds them so the mapping becomes the source
--          and the intent search stays only as a safety net for brand-new
--          keys / charts.
--
--          FAITHFUL FREEZE (must not change what resolves today): the SELECT
--          below replicates resolveByIntent EXACTLY —
--            1. the literal fallback code IF it exists & accepts posting, else
--            2. the shortest-code postable account of the right type whose name
--               matches any intent keyword (ORDER BY length(code), code),
--          per company. ON CONFLICT DO NOTHING preserves the rows that already
--          exist (and any manual edits). Both account sides are set to the one
--          resolved account (each key is a single-account purpose), so
--          getAccountCodeFromMapping returns the same account for either side —
--          exactly the value the intent search returns. A live test
--          (financeIntentMappingSeed.dynamic.test.ts) proves before == after
--          for every company × key.
--
--          The legacy keys (vat_* / store_* / umrah_* / fx_* / custody_account
--          / withholding_tax) are intentionally OUT OF SCOPE here — they
--          predate this work and several already carry mappings; they can be
--          frozen by a later focused migration with the same mechanism.
-- SAFETY:  additive, idempotent, non-destructive. Seeds only where a real
--          postable account resolves; never overwrites an existing mapping;
--          changes no posting code; the in-code fallback is untouched.
-- @rollback:
--   DELETE FROM accounting_mappings WHERE "operationType" IN (
--     'invoice_revenue','invoice_ar','invoice_vat_payable','invoice_payment_cash',
--     'invoice_payment_ar','customer_advance_liability','bank_fee_expense',
--     'bank_interest_income','inventory_receipt','employee_custody',
--     'supplier_prepayment','fixed_asset_purchase','general_expense',
--     'service_expense','vehicle_expense','property_maintenance_expense','project_cost')
--   AND "operationLabel" = 'FIN-SUB-08 intent freeze';
--   (safe only if these mappings were not manually customised afterwards.)
-- ===========================================================================

WITH intent(op, typ, fallback, kws) AS (VALUES
  ('invoice_revenue',              'revenue',   '4000', ARRAY['إيرادات المبيعات','مبيعات','إيرادات','sales']),
  ('invoice_ar',                   'asset',     '1200', ARRAY['ذمم','مدينون','عملاء','receivable']),
  ('invoice_vat_payable',          'liability', '2300', ARRAY['ضريبة القيمة المضافة المستحقة','ضريبة المخرجات','vat output','output vat']),
  ('invoice_payment_cash',         'asset',     '1110', ARRAY['النقدية','صندوق','نقد','cash']),
  ('invoice_payment_ar',           'asset',     '1200', ARRAY['ذمم','مدينون','عملاء','receivable']),
  ('customer_advance_liability',   'liability', '2400', ARRAY['دفعات مقدمة','مقبوضة مقدم','عملاء','advance','unearned']),
  ('bank_fee_expense',             'expense',   '5390', ARRAY['عمولات بنكية','رسوم بنكية','مصروفات بنكية','bank fee','bank charge']),
  ('bank_interest_income',         'revenue',   '4910', ARRAY['فوائد','مرابحات','عوائد بنكية','interest']),
  ('inventory_receipt',            'asset',     '1150', ARRAY['مخزون البضائع','المخزون','مخزون']),
  ('employee_custody',             'asset',     '1142', ARRAY['عهد مالية للموظف','عهد']),
  ('supplier_prepayment',          'asset',     '1170', ARRAY['مصروفات مدفوعة مقدم','مدفوعة مقدم','دفعات مقدمة']),
  ('fixed_asset_purchase',         'asset',     '1500', ARRAY['أعمال تحت التنفيذ','الأصول غير الملموسة','أصول']),
  ('general_expense',              'expense',   '6900', ARRAY['مصروفات عمومية','مصروفات إدارية','قرطاسية','مصروف']),
  ('service_expense',              'expense',   '6920', ARRAY['تكلفة الخدمات','أتعاب مهنية','خدمات']),
  ('vehicle_expense',              'expense',   '6500', ARRAY['صيانة وإصلاح المركبات','الوقود','مركبات']),
  ('property_maintenance_expense', 'expense',   '6600', ARRAY['صيانة المباني والوحدات','صيانة المباني','صيانة']),
  ('project_cost',                 'expense',   '6800', ARRAY['تكلفة المشاريع والمقاولات','تكلفة المشاريع','مشاريع'])
),
resolved AS (
  SELECT
    c.id AS company_id,
    i.op,
    COALESCE(
      -- step 1: the literal fallback if it exists and accepts posting
      (SELECT fb.code FROM chart_of_accounts fb
        WHERE fb."companyId" = c.id AND fb.code = i.fallback
          AND fb."allowPosting" = true AND fb."deletedAt" IS NULL
        LIMIT 1),
      -- step 2: shortest-code postable account of the right type matching a keyword
      (SELECT k.code FROM chart_of_accounts k
        WHERE k."companyId" = c.id AND k.type = i.typ
          AND k."allowPosting" = true AND k."deletedAt" IS NULL
          AND EXISTS (SELECT 1 FROM unnest(i.kws) kw WHERE LOWER(k.name) LIKE '%' || LOWER(kw) || '%')
        ORDER BY length(k.code) ASC, k.code ASC
        LIMIT 1)
    ) AS resolved_code
  FROM companies c
  CROSS JOIN intent i
)
INSERT INTO accounting_mappings
  ("companyId", "operationType", "operationLabel", "debitAccountCode", "creditAccountCode", "isActive", "createdAt", "updatedAt")
SELECT company_id, op, 'FIN-SUB-08 intent freeze', resolved_code, resolved_code, true, now(), now()
FROM resolved
WHERE resolved_code IS NOT NULL
ON CONFLICT ("companyId", "operationType") DO NOTHING;
