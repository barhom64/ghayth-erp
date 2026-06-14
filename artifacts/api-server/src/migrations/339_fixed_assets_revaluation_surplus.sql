-- Migration 339: #2140-5هـ
-- @rollback: ALTER TABLE fixed_assets DROP COLUMN IF EXISTS "revaluationSurplus"; DELETE FROM accounting_mappings WHERE intent IN ('asset_cost','asset_accumulated_depreciation');
-- A) يضيف عمود revaluationSurplus إلى fixed_assets لتتبع الفائض المتراكم
--    لكل أصل (IAS 16) — مطلوب للمقاصة الصحيحة عند التقييم السلبي (R3).
-- B) يزرع intent-anchor لـ asset_cost و asset_accumulated_depreciation
--    في accounting_mappings حتى تتمكن الـ routes من الرجوع إلى الـ intent
--    بدلاً من الـ fallback الصلب "1500"/"1590" (R1).

-- ─── A. عمود revaluationSurplus ─────────────────────────────────────────────
ALTER TABLE fixed_assets
  ADD COLUMN IF NOT EXISTS "revaluationSurplus" numeric(15,2) DEFAULT 0 NOT NULL;

-- ─── B. زرع intents في accounting_mappings ──────────────────────────────────
WITH intent(op, typ, fallback, kws) AS (VALUES
  ('asset_cost',
   'asset',
   '1200',
   ARRAY['أصول ثابتة','الأصول الثابتة','fixed assets','property plant equipment','ppe']),
  ('asset_accumulated_depreciation',
   'asset',
   '1290',
   ARRAY['مجمع الإهلاك','الإهلاك المتراكم','accumulated depreciation','accumulated dep'])
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
      -- step 2: أقصر حساب postable من نفس النوع يطابق كلمة مفتاحية
      (SELECT k.code
        FROM chart_of_accounts k
        WHERE k."companyId" = c.id
          AND k."accountType" = i.typ
          AND k."allowPosting" = true
          AND k."deletedAt" IS NULL
          AND EXISTS (
            SELECT 1 FROM unnest(i.kws) kw
            WHERE k.name ILIKE '%' || kw || '%'
          )
        ORDER BY length(k.code), k.code
        LIMIT 1),
      -- step 3: أي حساب postable من النوع الصحيح كـ absolute fallback
      (SELECT f.code
        FROM chart_of_accounts f
        WHERE f."companyId" = c.id
          AND f."accountType" = i.typ
          AND f."allowPosting" = true
          AND f."deletedAt" IS NULL
        ORDER BY length(f.code), f.code
        LIMIT 1)
    ) AS resolved_code
  FROM companies c CROSS JOIN intent i
  WHERE c."deletedAt" IS NULL
)
INSERT INTO accounting_mappings (company_id, intent, account_code, created_at, updated_at)
SELECT company_id, op, resolved_code, NOW(), NOW()
  FROM resolved
  WHERE resolved_code IS NOT NULL
ON CONFLICT (company_id, intent) DO NOTHING;
