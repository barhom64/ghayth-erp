-- ============================================================================
-- 115_pilgrim_sensitive_fields_hash.sql
--
-- Add blind-index hash columns for encrypted sensitive pilgrim fields.
-- The actual field values will be encrypted at the application layer;
-- these hash columns enable equality lookups without decryption.
-- ============================================================================

ALTER TABLE umrah_pilgrims
  ADD COLUMN IF NOT EXISTS "passportNumber_hash" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "visaNumber_hash" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "mofaNumber_hash" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "borderNumber_hash" VARCHAR(16);

CREATE INDEX IF NOT EXISTS idx_umrah_pilgrims_passport_hash
  ON umrah_pilgrims ("passportNumber_hash") WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_umrah_pilgrims_visa_hash
  ON umrah_pilgrims ("visaNumber_hash") WHERE "deletedAt" IS NULL;

-- ============================================================================
-- End of 115_pilgrim_sensitive_fields_hash.sql
-- ============================================================================
