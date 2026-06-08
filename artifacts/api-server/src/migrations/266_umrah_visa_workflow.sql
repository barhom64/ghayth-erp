-- Migration 266 — Umrah visa application workflow
--
-- @rollback:
--   DROP INDEX IF EXISTS idx_umrah_pilgrims_visa_active;
--   ALTER TABLE umrah_pilgrims DROP COLUMN IF EXISTS "visaStatus";
--   ALTER TABLE umrah_pilgrims DROP COLUMN IF EXISTS "visaRequestedAt";
--   ALTER TABLE umrah_pilgrims DROP COLUMN IF EXISTS "visaIssuedAt";
--   ALTER TABLE umrah_pilgrims DROP COLUMN IF EXISTS "visaRejectedAt";
--   ALTER TABLE umrah_pilgrims DROP COLUMN IF EXISTS "visaRejectionReason";
--
-- Existing schema captures the visa AFTER it exists: `visaNumber`,
-- `visaExpiry`. Nothing tracks the application LEADING UP TO that.
-- Agencies pre-book visas weeks before the season; ops need to know:
--
--   "is the visa for this pilgrim still pending review at MOFA, or
--    has it actually been issued?"
--   "which pilgrims need their visa application chased today?"
--   "is the family-of-5 approved as a unit or are 2 still pending?"
--
-- This migration adds a small lifecycle column + timestamps so the
-- compliance dashboard can split its visa KPI between "pending" and
-- "issued — expiring", and the operator has a single column to filter
-- on for the daily chase list.
--
-- Lifecycle states:
--
--   not_requested (default) → ما طلبنا للمعتمر تأشيرة بعد (e.g. local
--                              Saudi citizen / GCC national)
--   requested              → submitted to MOFA
--   under_review           → MOFA processing
--   approved               → MOFA approved, visa not yet issued
--   issued                 → visa number assigned (visaNumber populated)
--   delivered              → physical/digital visa handed to pilgrim
--   rejected               → MOFA rejected (terminal — needs new request)
--   cancelled              → operator cancelled the application
--
-- The `visaNumber` field already captured the "issued" milestone but
-- only when populated; this column makes the milestone explicit so a
-- pilgrim can be "approved (waiting on visa number)" without forcing
-- ops to either leave the column null or write "approved" into the
-- visa number field as a placeholder.

ALTER TABLE umrah_pilgrims
  ADD COLUMN IF NOT EXISTS "visaStatus" VARCHAR(20) DEFAULT 'not_requested' NOT NULL;

-- Backfill: pre-existing rows with a visaNumber are presumed already
-- "issued"; those with no number stay at the default ("not_requested").
-- The default catches every new row going forward.
UPDATE umrah_pilgrims
   SET "visaStatus" = 'issued'
 WHERE "visaNumber" IS NOT NULL
   AND "visaStatus" = 'not_requested';

-- Timestamps for the operationally significant transitions. NULL when
-- the state hasn't been reached yet. The cron `umrah_visa_expiry_alerts`
-- already alerts on `visaExpiry`; these timestamps support a future
-- "stuck in review > 7 days" alert + agency SLA reporting.
ALTER TABLE umrah_pilgrims
  ADD COLUMN IF NOT EXISTS "visaRequestedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "visaIssuedAt"    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "visaRejectedAt"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "visaRejectionReason" TEXT;

-- Partial index on the active workflow states — the daily-chase
-- dashboard query filters `visaStatus IN ('requested', 'under_review',
-- 'approved')` and skips terminal/inactive rows. Smaller index = faster
-- scan.
CREATE INDEX IF NOT EXISTS idx_umrah_pilgrims_visa_active
  ON umrah_pilgrims("companyId", "visaStatus")
  WHERE "deletedAt" IS NULL
    AND "visaStatus" IN ('requested', 'under_review', 'approved');
