-- 236_journal_lines_branch_id.sql
--
-- @rollback: ALTER TABLE journal_lines DROP COLUMN IF EXISTS "branchId";
--            DROP INDEX IF EXISTS idx_journal_lines_branch;
--
-- The journal_entries header carries branchId, but per-line branchId
-- was missing. PR #1304 was supposed to add it but never landed. Every
-- per-branch GL drilldown (per-branch profitability, per-branch trial
-- balance, per-branch payroll cost) had to JOIN journal_lines back to
-- the header — but for split entries where one logical operation lands
-- across multiple branches (the user's new requirement: "auto-post
-- transaction across multiple branches if they're under the same
-- company"), the header-only model can't represent it at all.
--
-- All NULLABLE so legacy callers continue to work; the journal_lines
-- INSERT in lib/businessHelpers.ts and lib/gl/posting.ts skips
-- undefined fields, so this column doesn't break existing flows.

ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS "branchId" integer;

-- Per-branch GL drilldown hot path. Without an index here, every
-- per-branch report does a full journal_lines scan.
CREATE INDEX IF NOT EXISTS idx_journal_lines_branch
  ON public.journal_lines ("branchId")
  WHERE "branchId" IS NOT NULL;

-- Backfill from the header so existing entries have a branchId on
-- every line. The header is the authoritative source until callers
-- start passing per-line branchId for split posting (next sprint).
UPDATE public.journal_lines jl
   SET "branchId" = je."branchId"
  FROM public.journal_entries je
 WHERE jl."journalId" = je.id
   AND jl."branchId" IS NULL
   AND je."branchId" IS NOT NULL;
