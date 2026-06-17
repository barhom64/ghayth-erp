-- ===========================================================================
-- 385_attendance_deduction_memo_link.sql
-- ---------------------------------------------------------------------------
-- WHAT:    add a nullable "memoId" link column to attendance_deductions so a
--          discipline penalty row points back at the hr_inquiry_memos row that
--          created it.
-- WHY:     HR-REV-7 follow-up. gm-decision inserts a `pending_payroll` penalty
--          deduction, and appeal-acceptance must reverse exactly that row. The
--          reversal previously matched on (assignmentId, period, amount,
--          minutes) because there was no link — which collides when two memos
--          in the same period produce an identical amount AND duration. A
--          direct memoId makes the reversal target the correct row with no
--          heuristic.
-- SAFETY:  purely additive. The column is NULLABLE (legacy penalty rows and
--          every non-penalty deduction stay valid with memoId = NULL). No FK
--          constraint is added (avoids a non-idempotent ADD CONSTRAINT and
--          keeps cross-table coupling loose — the value is a soft link, and the
--          reversal still scopes by companyId + type + status). A partial index
--          speeds the reversal lookup over live penalty rows.
-- @rollback:
--   DROP INDEX IF EXISTS idx_attendance_deductions_memo_live;
--   ALTER TABLE public.attendance_deductions DROP COLUMN IF EXISTS "memoId";
-- ===========================================================================

ALTER TABLE public.attendance_deductions
  ADD COLUMN IF NOT EXISTS "memoId" INTEGER;

CREATE INDEX IF NOT EXISTS idx_attendance_deductions_memo_live
  ON public.attendance_deductions ("memoId")
  WHERE "memoId" IS NOT NULL;
