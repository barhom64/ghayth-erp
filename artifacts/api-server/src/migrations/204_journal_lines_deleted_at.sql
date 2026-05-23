-- 204_journal_lines_deleted_at.sql
--
-- @rollback: ALTER TABLE public.journal_lines DROP COLUMN "deletedAt";
--            DROP INDEX idx_journal_lines_active.
--            Safe at any time — the column is NULLABLE so no existing
--            data is affected.
--
-- E2E verification on a real Postgres surfaced a long-standing schema
-- drift: 10+ queries in finance-reports.ts filter by `jl."deletedAt"
-- IS NULL` but journal_lines has no such column. Every such query
-- silently failed with "column does not exist" in any environment
-- that actually had a DB connection — CI never noticed because the
-- check:schema-drift step is skipped when DATABASE_URL is unset
-- (see scripts/guard.sh line 64).
--
-- Two equally-defensible fixes were considered:
--   1. Add the column (matches every existing query)
--   2. Strip the filter from every query (column truly never existed)
--
-- We picked (1) because the query contract is clearly defensive —
-- the routes have been written assuming soft-delete on journal lines
-- exists — and adding a NULLABLE column with no migration of
-- existing data is the smaller, safer change. journal_lines rows are
-- still typically not soft-deleted individually (a JE is reversed via
-- the standard reversal flow); this column just unblocks the existing
-- safety filter from raising a runtime error.

ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone;

-- Hot path: every report joins journal_lines and adds
-- `jl."deletedAt" IS NULL`. Partial index covers the active rows
-- so the existing per-dimension indexes don't have to scan deleted
-- rows in the rare future cleanup case.
CREATE INDEX IF NOT EXISTS idx_journal_lines_active
  ON public.journal_lines (id)
  WHERE "deletedAt" IS NULL;
