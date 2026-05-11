-- Track the journal entry that booked a Mudad salary settlement. An
-- acknowledged salary row from Mudad is the operator's signal that
-- payroll for that employee in that period actually went out — at
-- which point the salary expense + payable/deductions need to land
-- in the GL. The new helper at
-- lib/saudi-compliance/mudad/post-salary-journal.ts stamps this id on
-- the settlement row so the next call detects "already booked"
-- cleanly (same idempotency pattern as
-- warehouse_cycle_count_lines."adjustmentJournalEntryId" and
-- warehouse_stock_lots."writeoffJournalEntryId").
ALTER TABLE mudad_settlements
  ADD COLUMN IF NOT EXISTS "journalEntryId" INTEGER;

CREATE INDEX IF NOT EXISTS mudad_settlements_journal_idx
  ON mudad_settlements ("journalEntryId")
  WHERE "journalEntryId" IS NOT NULL;
