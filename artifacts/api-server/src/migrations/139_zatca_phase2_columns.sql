-- 139_zatca_phase2_columns.sql
-- Foundations for ZATCA Phase 2 (Fatoora real integration). See
-- docs/ZATCA_PHASE_2_DESIGN.md for the full plan. This migration is
-- Week 1 of that plan: it adds the columns and tables every later
-- step assumes, but does NOT wire them into the route handlers.
-- Existing Phase 1 sandbox simulation keeps working unchanged.

BEGIN;

-- 1. invoices: Phase-2 specific fields beyond what Phase 1 already has
--    (zatcaUuid / zatcaHash / zatcaQrCode / zatcaStatus exist already).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "zatcaIcv"               BIGINT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "zatcaPih"               CHAR(64);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "zatcaSignature"         TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "zatcaClearedXml"        TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "zatcaClearanceStatus"   VARCHAR(20);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "zatcaClearedAt"         TIMESTAMPTZ;

-- icv must be unique per company once set, so duplicates surface as a
-- constraint violation instead of a quiet PIH-chain break.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_company_icv
  ON invoices ("companyId", "zatcaIcv")
  WHERE "zatcaIcv" IS NOT NULL;

-- 2. Per-company ICV state. Read with FOR UPDATE inside a tx so the
--    counter stays monotonic under concurrency (see lib/zatca/icv.ts).
CREATE TABLE IF NOT EXISTS zatca_icv_counters (
  "companyId"        INTEGER PRIMARY KEY REFERENCES companies(id),
  "lastIcv"          BIGINT NOT NULL DEFAULT 0,
  -- Base64 of SHA-256("0") — the spec-mandated PIH for the first invoice.
  "lastInvoiceHash"  CHAR(64) NOT NULL DEFAULT 'NWZkOWEwMmIwODBhMzE3NWQwMDFiYjJhMjBhMDU2NDgyZjVlMmIwYWY3ZWI3ZmU0YjY1NDk2NWY0YjkwYTk1OQ==',
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Re-submission queue: when ZATCA returns 5xx or times out, queue the
--    submission with exponential backoff. The retry worker (Week 4 of
--    the plan) will pick up rows where attempts < 5 and nextAttemptAt
--    has passed.
CREATE TABLE IF NOT EXISTS zatca_retry_queue (
  id                  SERIAL PRIMARY KEY,
  "submissionLogId"   INTEGER REFERENCES zatca_submission_log(id),
  "companyId"         INTEGER NOT NULL REFERENCES companies(id),
  "nextAttemptAt"     TIMESTAMPTZ NOT NULL,
  "attempts"          INTEGER NOT NULL DEFAULT 0,
  "lastError"         TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zatca_retry_queue_due
  ON zatca_retry_queue ("nextAttemptAt")
  WHERE attempts < 5;

-- 4. zatca_settings: certificate metadata for the onboarding workflow.
--    privateKeyPem MUST be encrypted at rest (FIELD_ENCRYPTION_KEY) —
--    the route handlers use lib/secrets.ts to apply this.
ALTER TABLE zatca_settings ADD COLUMN IF NOT EXISTS "complianceCsid"          TEXT;
ALTER TABLE zatca_settings ADD COLUMN IF NOT EXISTS "productionCsid"          TEXT;
ALTER TABLE zatca_settings ADD COLUMN IF NOT EXISTS "csrPem"                  TEXT;
ALTER TABLE zatca_settings ADD COLUMN IF NOT EXISTS "privateKeyPem"           TEXT;
ALTER TABLE zatca_settings ADD COLUMN IF NOT EXISTS "certificateExpiresAt"    TIMESTAMPTZ;
ALTER TABLE zatca_settings ADD COLUMN IF NOT EXISTS "onboardingStage"         VARCHAR(40);
-- onboardingStage values: 'not_started' | 'csr_generated' | 'compliance_csid_received'
--                         | 'compliance_test_passed' | 'production_csid_received' | 'expired'

COMMIT;
