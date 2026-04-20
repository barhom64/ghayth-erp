-- ============================================================================
-- 089_hr_discipline_appeal_fields.sql
-- Adds appeal workflow + close lifecycle columns to hr_inquiry_memos.
-- The application code (hr-discipline.ts /appeal, /appeal-decision, /close)
-- writes to these columns and statuses; without this migration the routes
-- crash with SQL errors at runtime.
-- ============================================================================

-- 1) New appeal/close columns
ALTER TABLE hr_inquiry_memos
  ADD COLUMN IF NOT EXISTS "appealReason"     TEXT,
  ADD COLUMN IF NOT EXISTS "appealDate"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "appealDecision"   TEXT,
  ADD COLUMN IF NOT EXISTS "appealComment"    TEXT,
  ADD COLUMN IF NOT EXISTS "appealDecidedAt"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "closedAt"         TIMESTAMPTZ;

-- 2) Replace the status CHECK constraint to include appeal_pending,
--    appeal_accepted, and closed (the new lifecycle states).
ALTER TABLE hr_inquiry_memos DROP CONSTRAINT IF EXISTS hr_memo_status_chk;
ALTER TABLE hr_inquiry_memos ADD CONSTRAINT hr_memo_status_chk CHECK (status IN (
  'draft','pending_employee','pending_manager','pending_gm',
  'approved','rejected','cancelled','expired',
  'appeal_pending','appeal_accepted','closed'
));

-- 3) Index appeal status to speed up the appeal queue dashboard.
CREATE INDEX IF NOT EXISTS hr_memo_appeal_idx
  ON hr_inquiry_memos (status) WHERE status = 'appeal_pending';
