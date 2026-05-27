-- 224_journal_lines_branch_id.sql
--
-- @rollback:
--   ALTER TABLE public.journal_lines DROP COLUMN "branchId";
--   DROP INDEX IF EXISTS idx_journal_lines_branchid_period;
--   Safe at any time — the column is NULLABLE and no FK references it
--   in either direction.
--
-- Finance Line-Level Allocation — Phase 5 P3 (Payroll dimension parity).
--
-- The dimensional reporting story for payroll required `branchId` on
-- each posted journal_line so cost-allocation reports can roll up by
-- branch without joining back to journal_entries. Until now the
-- branchId lived only on the journal_entries header, which is fine
-- when every line shares the entry's branch — but breaks for payroll
-- runs that span multiple branches in one run (e.g. company-wide
-- monthly batch). Each per-employee debit line should carry its OWN
-- branch so the line itself is self-contained for the BI layer.

ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS "branchId" integer;

-- Period+branch slicing is the dominant query shape (e.g. "show me
-- salary expense by branch for May 2026"), so a (branchId, createdAt)
-- composite index matches the access pattern. The partial WHERE clause
-- keeps the index small — lines without branchId don't need to be in it.
CREATE INDEX IF NOT EXISTS idx_journal_lines_branchid
  ON public.journal_lines ("branchId")
  WHERE "branchId" IS NOT NULL;

COMMENT ON COLUMN public.journal_lines."branchId" IS
  'Per-line branch attribution. NULL means "inherit from journal_entries.branchId" (legacy / cohort-level postings); a value here pins the line to a specific branch for cross-branch entries like company-wide payroll batches.';
