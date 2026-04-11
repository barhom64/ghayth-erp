-- ============================================================
-- Migration 006: System Settings - add unique index on key and seed defaults
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS system_settings_key_uq ON system_settings (key)
  WHERE "companyId" IS NULL AND "branchId" IS NULL;

INSERT INTO system_settings (key, value)
SELECT k, v
FROM (VALUES
  ('companyName', ''),
  ('companyNameEn', ''),
  ('currency', 'SAR'),
  ('timezone', 'Asia/Riyadh'),
  ('language', 'ar'),
  ('taxNumber', ''),
  ('crNumber', ''),
  ('phone', ''),
  ('email', ''),
  ('address', '')
) AS defaults(k, v)
WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = k AND "companyId" IS NULL AND "branchId" IS NULL);
