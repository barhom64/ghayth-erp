-- 067_lifecycle_columns.sql
-- Adds the small set of columns needed by Phase 2 lifecycle endpoints
-- (renew/terminate/cancel/close/convert) across legal, fleet, recruitment, CRM.
-- All columns are nullable so the migration is safe to re-run and does not
-- break existing rows.

-- Legal contracts: renew + terminate -----------------------------------------
ALTER TABLE legal_contracts
  ADD COLUMN IF NOT EXISTS "terminationDate"    timestamptz,
  ADD COLUMN IF NOT EXISTS "terminationReason"  text,
  ADD COLUMN IF NOT EXISTS "renewedFromId"      integer,
  ADD COLUMN IF NOT EXISTS "renewedAt"          timestamptz,
  ADD COLUMN IF NOT EXISTS "renewalCount"       integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_legal_contracts_renewed_from
  ON legal_contracts ("renewedFromId") WHERE "renewedFromId" IS NOT NULL;

-- Fleet trips: cancellation ---------------------------------------------------
ALTER TABLE fleet_trips
  ADD COLUMN IF NOT EXISTS "cancelledAt"        timestamptz,
  ADD COLUMN IF NOT EXISTS "cancellationReason" text;

-- Recruitment job_postings: explicit open/close with audit trail --------------
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS "closedAt"    timestamptz,
  ADD COLUMN IF NOT EXISTS "closedReason" text,
  ADD COLUMN IF NOT EXISTS "reopenedAt"  timestamptz;

-- CRM opportunities: convertedAt marker + cancellation tracking ---------------
ALTER TABLE crm_opportunities
  ADD COLUMN IF NOT EXISTS "convertedAt"        timestamptz,
  ADD COLUMN IF NOT EXISTS "convertedClientId"  integer;

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_converted_client
  ON crm_opportunities ("convertedClientId") WHERE "convertedClientId" IS NOT NULL;
