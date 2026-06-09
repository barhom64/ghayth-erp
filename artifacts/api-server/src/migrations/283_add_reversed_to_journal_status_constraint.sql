-- 283_add_reversed_to_journal_status_constraint.sql
--
-- Operational-readiness fix (#1594 — write-path review, status-literal sweep).
--
-- @policy:breaking
--
-- PROBLEM
-- POST /finance/journal/:id/reverse posts the reversing entry and then stamps
-- the ORIGINAL entry as reversed:
--   UPDATE journal_entries SET "reversedById"=…, "reversedAt"=NOW(),
--          "reversalReason"=…, status = 'reversed' WHERE id = …
-- (artifacts/api-server/src/routes/finance-journal.ts) — but
-- journal_entries_status_check allows only
--   draft, posted, pending_approval, approved, rejected, returned, cancelled.
-- So 'reversed' violates the constraint, the UPDATE throws, the whole reversal
-- transaction rolls back, and reversing ANY journal entry / payment voucher
-- 500s. Verified live: the UPDATE is rejected with check_violation.
--
-- Same class as migration 282 ('amended' on invoices) and 281 (lifecycle ↔
-- constraint reconciliation): a terminal state written directly by a route is
-- absent from the column's CHECK set. 'reversed' is a meaningful, distinct
-- terminal state (the original entry is neither cancelled nor rejected — it has
-- a live reversing counterpart), so the fix is to widen the set, not to reuse
-- an existing value.
--
-- FIX
-- Add 'reversed' to the allowed set (strict superset of the current 7 values;
-- existing rows unaffected).
--
-- @rollback:
--   ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_status_check;
--   ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_status_check CHECK (status::text = ANY (ARRAY['draft','posted','pending_approval','approved','rejected','returned','cancelled']::text[]));

ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_status_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='journal_entries_status_check' AND conrelid='public.journal_entries'::regclass) THEN
    ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_status_check CHECK (
      status::text = ANY (ARRAY[
        'draft','posted','pending_approval','approved','rejected','returned',
        'cancelled','reversed'
      ]::text[])
    );
  END IF;
END $$;
