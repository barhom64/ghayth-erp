-- ============================================================
-- Migration 238: umrah_penalties.journalEntryId — closes the
-- traceability gap flagged in the umrah↔finance audit.
-- ============================================================
--
-- Before this migration:
--   umrahEngine.postPenaltyGL() called financialEngine.postJournalEntry()
--   and threw away the returned journalId. The GL had the entry (sourceType
--   = 'umrah_penalty', sourceId = penalty.id) but the penalty row had no
--   way to navigate back. Every other umrah financial table (agent_invoices,
--   sales_invoices, payments, nusk_invoices) carries journalEntryId for
--   exactly this reason — penalties were the odd one out.
--
-- After:
--   The column is added nullable so old rows (created before the engine
--   change) stay valid. New penalty rows have the JE link populated by
--   postPenaltyGL after the JE is inserted.
--
-- @rollback: ALTER TABLE umrah_penalties DROP COLUMN IF EXISTS "journalEntryId";
--   (Drops the link column. The actual JE rows in journal_entries stay
--   intact — they're still discoverable via sourceType='umrah_penalty'
--   + sourceId — only the inverse navigation is lost.)

ALTER TABLE umrah_penalties
  ADD COLUMN IF NOT EXISTS "journalEntryId" integer;

-- Index for the inverse lookup: "show me every penalty that posted into
-- this journal entry". Partial index — most rows are nullable on early
-- data, no point indexing nulls.
CREATE INDEX IF NOT EXISTS umrah_penalties_journal_entry_idx
  ON umrah_penalties ("journalEntryId")
  WHERE "journalEntryId" IS NOT NULL;

COMMENT ON COLUMN umrah_penalties."journalEntryId" IS
  'FK to journal_entries.id — set by umrahEngine.postPenaltyGL after the JE posts. Provides bidirectional navigation between the penalty and its GL trail.';
