-- 173_zatca_phase2_real_integration.sql
-- Task #271 — wire the existing ZATCA Phase 2 primitives into the live
-- invoice flow + retry worker.
--
-- Adds the storage the Week-1 schema (139_zatca_phase2_columns.sql) left
-- behind:
--
--   1. zatca_submission_log.fullSignedXmlBase64 — so the retry worker
--      can re-submit byte-for-byte instead of giving up. The worker
--      comment in lib/zatca/worker.ts called this out as the blocker.
--   2. zatca_submission_log.invoiceType — 'standard' (B2B clearance)
--      vs 'simplified' (B2C reporting). The worker dispatches to the
--      right Fatoora endpoint based on this.
--   3. zatca_settings.complianceCsidSecret / productionCsidSecret /
--      complianceRequestId — Migration 139 added the binarySecurityToken
--      columns (complianceCsid / productionCsid) but not the matching
--      `secret` values, which together form the Basic-auth pair the
--      Fatoora API needs. The CSIDs themselves are NOT secrets (they
--      are X.509 certs); the `secret` half IS encrypted at rest by
--      lib/fieldEncryption.ts.
--   4. invoices.zatcaReportedAt / zatcaLastError — fields the new B2C
--      reporting cron and monitoring screen need.
--
-- Safe to re-run (all ALTERs are IF NOT EXISTS).

BEGIN;

ALTER TABLE zatca_submission_log
  ADD COLUMN IF NOT EXISTS "fullSignedXmlBase64"  TEXT;
ALTER TABLE zatca_submission_log
  ADD COLUMN IF NOT EXISTS "invoiceType"          VARCHAR(20);
ALTER TABLE zatca_submission_log
  ADD COLUMN IF NOT EXISTS "zatcaIcv"             BIGINT;
ALTER TABLE zatca_submission_log
  ADD COLUMN IF NOT EXISTS "zatcaPih"             CHAR(64);

-- Indexed for the monitoring screen's "show me everything still pending"
-- filter — small partial index, only pending / submitted rows live in it.
CREATE INDEX IF NOT EXISTS idx_zatca_submission_log_pending
  ON zatca_submission_log ("companyId", "createdAt" DESC)
  WHERE status IN ('pending', 'submitted');

ALTER TABLE zatca_settings
  ADD COLUMN IF NOT EXISTS "complianceCsidSecret"   TEXT;
ALTER TABLE zatca_settings
  ADD COLUMN IF NOT EXISTS "productionCsidSecret"   TEXT;
ALTER TABLE zatca_settings
  ADD COLUMN IF NOT EXISTS "complianceRequestId"    TEXT;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS "zatcaReportedAt"  TIMESTAMPTZ;
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS "zatcaLastError"   TEXT;

-- Drives the new B2C reporting cron: pick taxLinked simplified invoices
-- that are not yet reported / cleared and that were issued at least 5
-- minutes ago (so the user has a chance to cancel before reporting).
CREATE INDEX IF NOT EXISTS idx_invoices_zatca_b2c_reportable
  ON invoices ("companyId", "createdAt")
  WHERE "isTaxLinked" = TRUE
    AND "deletedAt" IS NULL
    AND ("zatcaStatus" IS NULL OR "zatcaStatus" IN ('pending', 'queued', 'error'))
    AND ("invoiceTypeCode" = '388' OR "invoiceTypeCode" IS NULL);

COMMIT;
