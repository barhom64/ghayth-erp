-- 225_allocation_results_proposed_vs_pinned.sql
--
-- @rollback:
--   ALTER TABLE public.accounting_allocation_results
--     DROP COLUMN "proposedAccountId",
--     DROP COLUMN "proposedAccountCode",
--     DROP COLUMN "proposedCostCenterId",
--     DROP COLUMN "proposedDimensionsJson";
--   Safe at any time — the columns are NULLABLE and no other table
--   FKs them.
--
-- Finance Line-Level Allocation — Phase 5 P4 (Manual Overrides "before/after").
--
-- Audit gap #7 — the user's requirement:
--
--   "تقرير Manual Overrides: جدول يعرض كل تعديل يدوي على الحساب/مركز
--    التكلفة مع actor, reason, before/after."
--
-- accounting_allocation_results already captures the final outcome
-- (resolvedAccountCode + costCenterId + dimensionsJson + status +
-- manualOverrideReason). What it doesn't capture is WHAT THE RESOLVER
-- WOULD HAVE PICKED IF NO MANUAL OVERRIDE HAD BEEN APPLIED — i.e. the
-- "before" half of the diff.
--
-- These columns store the resolver's *rule-driven proposal* alongside
-- the operator's pin. When status='manual_override' the UI can render:
--
--   Proposed (الـresolver اقترح):  proposedAccountCode / proposedCostCenterId
--   Final (المستخدم اختار):        resolvedAccountCode / costCenterId
--
-- For status='resolved' the proposed* columns equal the resolved*
-- columns (no override happened, but populating them both keeps the
-- query shape consistent for the report).

ALTER TABLE public.accounting_allocation_results
  ADD COLUMN IF NOT EXISTS "proposedAccountId" integer,
  ADD COLUMN IF NOT EXISTS "proposedAccountCode" varchar(20),
  ADD COLUMN IF NOT EXISTS "proposedCostCenterId" integer,
  ADD COLUMN IF NOT EXISTS "proposedDimensionsJson" jsonb;

-- The before/after report filters by status='manual_override' AND the
-- proposed account != resolved account. An index on the status alone
-- already exists; this composite partial helps the "show only true
-- overrides" filter (where the pin differs from the proposal).
CREATE INDEX IF NOT EXISTS idx_allocation_results_override_diff
  ON public.accounting_allocation_results ("companyId", "resolutionStatus", "resolvedAt" DESC)
  WHERE "resolutionStatus" = 'manual_override';

COMMENT ON COLUMN public.accounting_allocation_results."proposedAccountCode" IS
  'What the resolver WOULD have picked if no manual override had been applied. NULL for legacy rows written before migration 225.';

COMMENT ON COLUMN public.accounting_allocation_results."proposedCostCenterId" IS
  'The cost-centre the resolver would have picked. NULL means the rule strategy would have returned no cost-centre.';
