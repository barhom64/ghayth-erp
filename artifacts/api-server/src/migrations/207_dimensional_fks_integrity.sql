-- 207_dimensional_fks_integrity.sql
--
-- @policy:breaking
--   Adds NOT VALID foreign keys on dimensional columns. NOT VALID
--   skips backfill validation so existing rows with bad references
--   don't block the migration; new INSERTs / UPDATEs are validated.
--   Old rolling-deploy app versions tolerate the FKs since they
--   were already supposed to keep these columns clean.
--
-- @rollback:
--   ALTER TABLE drop each added constraint. Safe at any time.
--
-- Audit P2 #18 — several dimensional columns landed without a
-- foreign-key constraint, allowing orphan ids to enter the
-- system silently. Reports that joined on these ids returned
-- NULL rows (LEFT JOIN) or worse, mismatched data when an id
-- happened to match an unrelated row.
--
-- This migration adds the missing FKs as NOT VALID so we don't
-- have to verify existing data first. Tenants can validate at
-- their leisure via `ALTER TABLE ... VALIDATE CONSTRAINT ...`
-- once they've cleaned up.

-- ── journal_lines dimensional FKs ─────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_costCenterId_fkey') THEN
    ALTER TABLE public.journal_lines
      ADD CONSTRAINT "journal_lines_costCenterId_fkey"
      FOREIGN KEY ("costCenterId") REFERENCES public.cost_centers(id) NOT VALID;
  END IF;
END $$;

-- ── invoice_lines.accountId ──────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_lines_accountId_fkey') THEN
    ALTER TABLE public.invoice_lines
      ADD CONSTRAINT "invoice_lines_accountId_fkey"
      FOREIGN KEY ("accountId") REFERENCES public.chart_of_accounts(id) NOT VALID;
  END IF;
END $$;

-- ── purchase_order_items.accountId ───────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_accountId_fkey') THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT "purchase_order_items_accountId_fkey"
      FOREIGN KEY ("accountId") REFERENCES public.chart_of_accounts(id) NOT VALID;
  END IF;
END $$;

-- ── goods_receipt_items.accountId ────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipt_items_accountId_fkey') THEN
    ALTER TABLE public.goods_receipt_items
      ADD CONSTRAINT "goods_receipt_items_accountId_fkey"
      FOREIGN KEY ("accountId") REFERENCES public.chart_of_accounts(id) NOT VALID;
  END IF;
END $$;

-- ── chart_of_accounts self-referencing FK (parentId) ─────────────────────
-- The CoA tree is hierarchical; parentId points at another row in
-- the same table. No FK today → orphan parents are silently allowed.
-- The recursive ancestry CTE in assertValidAccountParent enforces
-- cycle-freeness at the route layer; this FK is the data-layer
-- safety net.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chart_of_accounts_parentId_fkey') THEN
    ALTER TABLE public.chart_of_accounts
      ADD CONSTRAINT "chart_of_accounts_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES public.chart_of_accounts(id) NOT VALID;
  END IF;
END $$;

-- ── tax_codes account FKs (migration 205 didn't add these) ───────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_codes_accountId_fkey') THEN
    ALTER TABLE public.tax_codes
      ADD CONSTRAINT "tax_codes_accountId_fkey"
      FOREIGN KEY ("accountId") REFERENCES public.chart_of_accounts(id) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tax_codes_inputAccountId_fkey') THEN
    ALTER TABLE public.tax_codes
      ADD CONSTRAINT "tax_codes_inputAccountId_fkey"
      FOREIGN KEY ("inputAccountId") REFERENCES public.chart_of_accounts(id) NOT VALID;
  END IF;
END $$;
