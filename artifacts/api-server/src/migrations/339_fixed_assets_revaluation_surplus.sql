-- Migration 339: #2140-5هـ
-- @rollback: ALTER TABLE fixed_assets DROP COLUMN IF EXISTS "revaluationSurplus"; DELETE FROM accounting_mappings WHERE "operationType" IN ('asset_cost','asset_accumulated_depreciation');
-- A) يضيف عمود revaluationSurplus إلى fixed_assets لتتبع الفائض المتراكم
--    لكل أصل (IAS 16) — مطلوب للمقاصة الصحيحة عند التقييم السلبي (R3).
-- B) يزرع intent-anchor لـ asset_cost و asset_accumulated_depreciation
--    في accounting_mappings حتى تتمكن الـ routes من الرجوع إلى الـ intent
--    بدلاً من الـ fallback الصلب "1500"/"1590" (R1).
--
-- ─── Fix 2026-06-15 ───────────────────────────────────────────────────────
-- العمود في chart_of_accounts اسمه `type` (varchar(50))، ليس
-- `accountType`. الإصدار الأصلي من هذه الـmigration استخدم
-- `k."accountType"` و `f."accountType"` فأفشلت كل تشغيل لـ
-- `provision-agent-db.sh` على DB طازج بـerror «column k.accountType
-- does not exist». الـCI لم يكتشف الـbug لأن schema dump يحمل أثر
-- الـmigration أصلاً، وكل migrations تُختَم applied قبل تشغيل
-- الـtests (انظر .github/workflows/guard.yml). الإصلاح هنا:
-- استخدام `type` (الاسم الفعلي للعمود) في كل من step 2 وstep 3.
-- آمن إعادة التشغيل لأن `ON CONFLICT (company_id, intent) DO
-- NOTHING` يحمي الصفوف الموجودة سلفًا في prod.

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
          AND k."type" = i.typ
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
          AND f."type" = i.typ
          AND f."allowPosting" = true
          AND f."deletedAt" IS NULL
        ORDER BY length(f.code), f.code
        LIMIT 1)
    ) AS resolved_code
  FROM companies c CROSS JOIN intent i
  -- companies has no deletedAt column (verified vs schema dump 2026-06-15);
  -- enumerate all rows — the ON CONFLICT below handles re-runs.
)
-- Fix 2026-06-15: `accounting_mappings` schema is keyed on
-- ("companyId", "operationType") with separate debit/credit columns
-- (see sibling 338 + 336). The original here invented column names
-- (`company_id`, `intent`, `account_code`) that never existed. Anchor
-- intents use the same code for both legs (no real posting — just a
-- pointer for the route layer to resolve a fallback account).
INSERT INTO accounting_mappings
  ("companyId", "operationType", "operationLabel",
   "debitAccountCode", "creditAccountCode", "isActive", "createdAt", "updatedAt")
SELECT company_id, op, '#2140-5هـ asset cost/accumdep anchors',
       resolved_code, resolved_code, true, NOW(), NOW()
  FROM resolved
  WHERE resolved_code IS NOT NULL
ON CONFLICT ("companyId", "operationType") DO NOTHING;
