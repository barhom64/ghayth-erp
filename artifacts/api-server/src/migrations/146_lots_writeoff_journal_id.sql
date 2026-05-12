-- Track the journal entry that wrote a lot off its books. Lots that
-- exit the active pool via `recalled` / `expired` / `disposed` need a
-- DR inventory_writeoff_loss / CR inventory_asset entry posted; the
-- new helper at lib/inventory/post-lot-writeoff-journal.ts stamps
-- this id on the lot row so the next call detects "already written
-- off" cleanly (same idempotency pattern as
-- warehouse_cycle_count_lines."adjustmentJournalEntryId").
ALTER TABLE warehouse_stock_lots
  ADD COLUMN IF NOT EXISTS "writeoffJournalEntryId" INTEGER;

CREATE INDEX IF NOT EXISTS warehouse_stock_lots_writeoff_journal_idx
  ON warehouse_stock_lots ("writeoffJournalEntryId")
  WHERE "writeoffJournalEntryId" IS NOT NULL;
