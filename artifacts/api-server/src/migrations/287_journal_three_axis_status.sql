-- ===========================================================================
-- 287_journal_three_axis_status.sql
-- ---------------------------------------------------------------------------
-- WHAT:    add documentStatus / paymentStatus / postingStatus to
--          journal_entries, and backfill them from the legacy single `status`
--          column + the `isPaid` flag.
-- WHY:     #1945 — the finance status was conflated into one `status` column
--          plus an inert `isPaid` checkbox (a draft could read as "paid"). The
--          FE already separates the three axes (status-model.ts). This makes
--          the separation first-class in the ledger schema. Additive only:
--          `status`/`isPaid` stay the operational source until the posting
--          path is wired to populate these (a later PR).
-- SAFETY:  zero-downtime. Three NULLable text columns + a one-time backfill +
--          CHECK constraints. Non-destructive, idempotent DDL. The backfill
--          mirrors mapJournalStatus(status) for document+posting, and sets
--          paymentStatus='paid' ONLY when isPaid AND the document is approved
--          (canBePaid) — so a draft/pending is never "paid".
-- @rollback:
--   ALTER TABLE journal_entries
--     DROP CONSTRAINT IF EXISTS journal_entries_documentstatus_chk,
--     DROP CONSTRAINT IF EXISTS journal_entries_paymentstatus_chk,
--     DROP CONSTRAINT IF EXISTS journal_entries_postingstatus_chk,
--     DROP COLUMN IF EXISTS "documentStatus",
--     DROP COLUMN IF EXISTS "paymentStatus",
--     DROP COLUMN IF EXISTS "postingStatus";
-- ===========================================================================

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS "documentStatus" text,
  ADD COLUMN IF NOT EXISTS "paymentStatus"  text,
  ADD COLUMN IF NOT EXISTS "postingStatus"  text;

-- Backfill the three axes from the legacy status + isPaid. The document and
-- posting mappings are byte-for-byte mapJournalStatus(status); paymentStatus
-- enforces the canBePaid invariant (only an approved document can be paid).
UPDATE journal_entries SET
  "documentStatus" = CASE status
     WHEN 'posted'           THEN 'approved'
     WHEN 'approved'         THEN 'approved'
     WHEN 'reversed'         THEN 'approved'
     WHEN 'pending_approval' THEN 'submitted'
     WHEN 'returned'         THEN 'submitted'
     WHEN 'rejected'         THEN 'rejected'
     WHEN 'cancelled'        THEN 'cancelled'
     ELSE 'draft' END,
  "postingStatus" = CASE status
     WHEN 'posted'    THEN 'posted'
     WHEN 'approved'  THEN 'posted'
     WHEN 'cancelled' THEN 'reversed'
     WHEN 'reversed'  THEN 'reversed'
     ELSE 'unposted' END,
  "paymentStatus" = CASE
     WHEN "isPaid" IS TRUE AND status IN ('posted', 'approved', 'reversed') THEN 'paid'
     ELSE 'unpaid' END
WHERE "documentStatus" IS NULL;

-- CHECK constraints — expand-only (additive). Idempotent via IF NOT EXISTS in
-- a DO block (no DROP, so no backward-incompatible step). NULL is allowed until
-- every writer populates the columns.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_documentstatus_chk') THEN
    ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_documentstatus_chk
      CHECK ("documentStatus" IS NULL OR "documentStatus" IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_paymentstatus_chk') THEN
    ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_paymentstatus_chk
      CHECK ("paymentStatus" IS NULL OR "paymentStatus" IN ('unpaid', 'partially_paid', 'paid'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_postingstatus_chk') THEN
    ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_postingstatus_chk
      CHECK ("postingStatus" IS NULL OR "postingStatus" IN ('unposted', 'posted', 'reversed'));
  END IF;
END $$;
