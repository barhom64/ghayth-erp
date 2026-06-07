-- 259_account_usage_classification.sql
--
-- @rollback:
--   ALTER TABLE chart_of_accounts
--     DROP COLUMN IF EXISTS "accountUsage",
--     DROP COLUMN IF EXISTS "childrenUsagePolicy";
--   DROP INDEX IF EXISTS idx_coa_usage;
--
-- Task #1715 — unified finance engine, slice 1 (foundation).
--
-- Adds the second classification dimension to the chart of accounts:
--   • accountUsage         — what the account IS operationally
--                            (cash_box / bank / custody / card / cheque /
--                             receivable / payable / inventory / fixed_asset
--                             / vat_* / revenue / operating_expense / …)
--   • childrenUsagePolicy  — how child accounts inherit usage
--                            (inherit_locked / inherit_default /
--                             mixed_allowed / manual_required)
--
-- Both columns are ADDITIVE and NULLABLE — the existing type/nature
-- columns stay untouched, so nothing breaks. Existing rows are
-- auto-classified by the same Saudi-COA heuristic the runtime classifier
-- uses (financeAccountClassifier.classifyAccountUsage). Rows the
-- heuristic can't classify stay NULL and surface in the usage-gaps report
-- (GET /finance/accounts/usage-gaps) for manual classification.

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS "accountUsage" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "childrenUsagePolicy" VARCHAR(20) DEFAULT 'inherit_default';

CREATE INDEX IF NOT EXISTS idx_coa_usage
  ON public.chart_of_accounts ("companyId", "accountUsage")
  WHERE "deletedAt" IS NULL;

-- ── Auto-classify existing rows (name signal → code prefix → type) ──────
-- Mirrors financeAccountClassifier.classifyAccountUsage. Only fills rows
-- where accountUsage IS NULL so re-runs are idempotent and never clobber
-- a manual classification.

-- Name-based strong signals (Arabic)
UPDATE public.chart_of_accounts SET "accountUsage" = 'cash_box'
  WHERE "accountUsage" IS NULL AND (name LIKE '%صندوق%' OR name LIKE '%نقدية%');
UPDATE public.chart_of_accounts SET "accountUsage" = 'bank'
  WHERE "accountUsage" IS NULL AND (name LIKE '%بنك%' OR name LIKE '%مصرف%' OR name LIKE '%حساب جاري%');
UPDATE public.chart_of_accounts SET "accountUsage" = 'custody'
  WHERE "accountUsage" IS NULL AND name LIKE '%عهد%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'card'
  WHERE "accountUsage" IS NULL AND (name LIKE '%بطاقة%' OR name LIKE '%مدى%' OR name LIKE '%ائتمان%');
UPDATE public.chart_of_accounts SET "accountUsage" = 'cheque'
  WHERE "accountUsage" IS NULL AND name LIKE '%شيكات%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'inventory'
  WHERE "accountUsage" IS NULL AND (name LIKE '%مخزون%' OR name LIKE '%بضاعة%');
UPDATE public.chart_of_accounts SET "accountUsage" = 'accumulated_depreciation'
  WHERE "accountUsage" IS NULL AND name LIKE '%مجمع%إهلاك%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'vat_input'
  WHERE "accountUsage" IS NULL AND name LIKE '%ضريبة%مدخلات%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'vat_output'
  WHERE "accountUsage" IS NULL AND name LIKE '%ضريبة%مخرجات%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'wht_payable'
  WHERE "accountUsage" IS NULL AND name LIKE '%استقطاع%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'receivable'
  WHERE "accountUsage" IS NULL AND (name LIKE '%ذمم مدينة%' OR name LIKE '%عملاء%' OR name LIKE '%مدينون%');
UPDATE public.chart_of_accounts SET "accountUsage" = 'payable'
  WHERE "accountUsage" IS NULL AND (name LIKE '%ذمم دائنة%' OR name LIKE '%موردون%' OR name LIKE '%دائنون%');

-- Code-prefix fallback (Saudi standard COA)
UPDATE public.chart_of_accounts SET "accountUsage" = 'cash_box'   WHERE "accountUsage" IS NULL AND code LIKE '111%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'bank'       WHERE "accountUsage" IS NULL AND code LIKE '112%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'custody'    WHERE "accountUsage" IS NULL AND code LIKE '113%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'receivable' WHERE "accountUsage" IS NULL AND code LIKE '12%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'inventory'  WHERE "accountUsage" IS NULL AND code LIKE '13%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'vat_input'  WHERE "accountUsage" IS NULL AND code LIKE '14%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'fixed_asset' WHERE "accountUsage" IS NULL AND (code LIKE '15%' OR code LIKE '16%');
UPDATE public.chart_of_accounts SET "accountUsage" = 'accumulated_depreciation' WHERE "accountUsage" IS NULL AND code LIKE '17%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'wht_payable' WHERE "accountUsage" IS NULL AND code LIKE '233%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'vat_output' WHERE "accountUsage" IS NULL AND code LIKE '23%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'payable'    WHERE "accountUsage" IS NULL AND code LIKE '21%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'loan'       WHERE "accountUsage" IS NULL AND (code LIKE '25%' OR code LIKE '26%');
UPDATE public.chart_of_accounts SET "accountUsage" = 'equity'     WHERE "accountUsage" IS NULL AND code LIKE '3%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'revenue'    WHERE "accountUsage" IS NULL AND code LIKE '4%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'cogs'       WHERE "accountUsage" IS NULL AND (code LIKE '51%' OR code LIKE '52%');
UPDATE public.chart_of_accounts SET "accountUsage" = 'payroll_expense' WHERE "accountUsage" IS NULL AND code LIKE '53%';
UPDATE public.chart_of_accounts SET "accountUsage" = 'operating_expense' WHERE "accountUsage" IS NULL AND code LIKE '5%';

-- Type-only last resort for rows still NULL
UPDATE public.chart_of_accounts SET "accountUsage" = 'revenue'           WHERE "accountUsage" IS NULL AND type = 'revenue';
UPDATE public.chart_of_accounts SET "accountUsage" = 'operating_expense' WHERE "accountUsage" IS NULL AND type = 'expense';
UPDATE public.chart_of_accounts SET "accountUsage" = 'equity'            WHERE "accountUsage" IS NULL AND type = 'equity';
-- asset/liability rows with no code/name signal stay NULL → usage-gaps report.

-- Seed inherit policy on parent (analytical) accounts so children default
-- to inheriting. Leaf accounts keep the column default.
UPDATE public.chart_of_accounts
   SET "childrenUsagePolicy" = COALESCE("childrenUsagePolicy", 'inherit_default')
 WHERE "childrenUsagePolicy" IS NULL;
