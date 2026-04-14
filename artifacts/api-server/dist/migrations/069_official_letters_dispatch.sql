-- 069_official_letters_dispatch.sql
-- Adds the fields needed to close the official-letter lifecycle.
-- Before this migration the HR approval route updated status='approved'
-- but nothing dispatched the letter; we had no way to tell a queued letter
-- from a delivered one. With `sentAt` / `dispatchedVia` the new
-- `hr.letter.approved` event subscriber can safely mark a letter as sent
-- exactly once and avoid re-queueing on re-approval.

ALTER TABLE official_letters
  ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "dispatchedVia" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "approvedBy" INTEGER;

CREATE INDEX IF NOT EXISTS official_letters_status_sent_idx
  ON official_letters (status, "sentAt");
