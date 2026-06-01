-- Migration 241: align digital_signature_otps / digital_signature_logs with
-- the columns routes/digital-signature.ts actually reads and writes.
--
-- Context: the e-signature flow keys every OTP and signature log on the
-- triple (entityType, entityId, action) — request-otp inserts them, verify
-- SELECTs by them, GET /logs filters by them — plus userAgent/usedAt on the
-- OTP and signatureRef/otpRef on the log. None of those columns existed on
-- the two tables (baseline only had documentId/otp/... ), so:
--   * POST /digital-signature/request-otp  -> INSERT 42703
--   * POST /digital-signature/verify       -> SELECT/UPDATE/INSERT 42703
--   * GET  /digital-signature/logs         -> SELECT 42703
-- all surfaced to the user as "خطأ في هيكل قاعدة البيانات". The route is
-- internally consistent around these names; it was the schema that drifted.
--
-- The digital_signature_logs.action CHECK only allowed the event-type set
-- ['otp_requested','otp_verified','signed','rejected'], but the sole writer
-- stores the *business* action (e.g. the document operation being signed
-- off), so the CHECK could never be satisfied and is dropped. No other
-- writer inserts the canonical values (verified by grep), so this is safe.
--
-- Additive + idempotent (IF NOT EXISTS / IF EXISTS); zero-downtime.
--
-- @rollback:
--   ALTER TABLE digital_signature_otps
--     DROP COLUMN IF EXISTS "entityType", DROP COLUMN IF EXISTS "entityId",
--     DROP COLUMN IF EXISTS action, DROP COLUMN IF EXISTS "userAgent",
--     DROP COLUMN IF EXISTS "usedAt";
--   ALTER TABLE digital_signature_logs
--     DROP COLUMN IF EXISTS "entityType", DROP COLUMN IF EXISTS "entityId",
--     DROP COLUMN IF EXISTS "signatureRef", DROP COLUMN IF EXISTS "otpRef";

ALTER TABLE digital_signature_otps
  ADD COLUMN IF NOT EXISTS "entityType" TEXT,
  ADD COLUMN IF NOT EXISTS "entityId"   TEXT,
  ADD COLUMN IF NOT EXISTS action       TEXT,
  ADD COLUMN IF NOT EXISTS "userAgent"  TEXT,
  ADD COLUMN IF NOT EXISTS "usedAt"     TIMESTAMPTZ;

ALTER TABLE digital_signature_logs
  ADD COLUMN IF NOT EXISTS "entityType"   TEXT,
  ADD COLUMN IF NOT EXISTS "entityId"     TEXT,
  ADD COLUMN IF NOT EXISTS "signatureRef" TEXT,
  ADD COLUMN IF NOT EXISTS "otpRef"       INTEGER;

-- @policy:breaking
-- Dropping the action CHECK is reversible (the constraint can be re-added)
-- and does not narrow behaviour for the only writer: the pre-change app
-- already inserted a *business* action that this CHECK rejected, so signing
-- was already failing. Loosening the column to free text is strictly safer
-- for a rolling deploy, not more dangerous.
ALTER TABLE digital_signature_logs
  DROP CONSTRAINT IF EXISTS digital_signature_logs_action_check;
