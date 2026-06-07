-- 258_chart_of_accounts_branch_id_column.sql
--
-- @rollback:
--   ALTER TABLE chart_of_accounts DROP COLUMN IF EXISTS "branchId";
--   DROP INDEX IF EXISTS idx_coa_branch;
--
-- PR #1686 introduced the hybrid per-branch chart of accounts model:
-- company-level shared codes + branch-specific sub-accounts. The route
-- handlers (finance-accounts.ts) were updated to read and write
-- chart_of_accounts."branchId" but no schema migration was shipped.
-- In production every /chart-of-accounts, /accounts, and POST /accounts
-- call fails with "column branchId does not exist".
--
-- This migration adds the column (additive, nullable, no default) so
-- the hybrid model works as the route code already expects. Existing
-- rows get branchId=NULL → they're shared company accounts (the
-- documented semantics).
--
-- Index on (companyId, branchId) supports the buildCoaScope filter
-- which appends `c."branchId" IS NULL OR c."branchId" = ANY($2)`
-- when the operator picks specific branches.

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS "branchId" INTEGER;

CREATE INDEX IF NOT EXISTS idx_coa_branch
  ON public.chart_of_accounts ("companyId", "branchId")
  WHERE "deletedAt" IS NULL;
