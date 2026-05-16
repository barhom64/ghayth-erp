-- Migration 181: add approval & posting audit columns to invoices
--
-- C3 fix: invoice approve/post flows reference these 4 columns at runtime
-- (SET "approvedBy" = $1, "approvedAt" = NOW(), "postedBy" = $2, "postedAt" = NOW())
-- but the columns were never declared in the schema, so the UPDATE crashes
-- with "column \"approvedBy\" of relation \"invoices\" does not exist" and the
-- request returns 500 to the user.
--
-- Idempotent — safe to re-run. No data mutation. No backfill required
-- (NULL = "never approved / never posted" which is the correct prior state).

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "approvedBy" INTEGER;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "postedBy"   INTEGER;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "postedAt"   TIMESTAMP;
