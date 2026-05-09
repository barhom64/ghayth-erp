-- Migration 138: add visaExpiry to umrah_pilgrims (referenced by cron umrahVisaExpiryAlerts)
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "visaExpiry" date;
CREATE INDEX IF NOT EXISTS idx_umrah_pilgrims_visa_expiry ON umrah_pilgrims ("visaExpiry") WHERE "deletedAt" IS NULL;
