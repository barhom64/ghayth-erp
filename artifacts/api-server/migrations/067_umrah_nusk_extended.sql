-- ============================================================
-- Migration 067: Umrah sub-agent contact/pricing fields + Phase 1 reconciliation
-- ============================================================
-- Phase 1 of the NUSK extension shipped table-DDL directly into the
-- live database; `db/schema.sql` and `db/seed.sql` already mirror the
-- 11 new tables (umrah_sub_agents, umrah_groups, umrah_mutamers,
-- umrah_pricing, umrah_nusk_invoices, umrah_violations,
-- umrah_import_batches, umrah_import_changes, employee_commission_*)
-- and the 8 umrah.* default settings + season 1447 H.
--
-- What this migration adds:
--
--   1. Four columns the new sub-agent detail page consumes
--      (`umrah-sub-agent-detail.tsx`): defaultPricePerMutamer,
--      phone, email, country. These were specced in Phase 1 but
--      missed in the original DDL.
--   2. Defensive re-seed of the 8 umrah.* settings + season 1447
--      so any environment that came up without `db/seed.sql`
--      ends up with the correct defaults.
--
-- All statements are idempotent (IF NOT EXISTS / WHERE NOT EXISTS).
-- ============================================================

BEGIN;

-- 1. umrah_sub_agents — missing contact + default-pricing columns
ALTER TABLE umrah_sub_agents ADD COLUMN IF NOT EXISTS "defaultPricePerMutamer" NUMERIC(12,2);
ALTER TABLE umrah_sub_agents ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE umrah_sub_agents ADD COLUMN IF NOT EXISTS email VARCHAR(200);
ALTER TABLE umrah_sub_agents ADD COLUMN IF NOT EXISTS country VARCHAR(100);

-- 2. Defensive re-seed of the 8 umrah.* settings (default scope: NULL/NULL).
--    Mirrors db/seed.sql; safe to run repeatedly thanks to WHERE NOT EXISTS.
INSERT INTO system_settings (key, value, "dataType")
SELECT k, v, t FROM (VALUES
  ('umrah.overstay_daily_penalty', '0', 'number'),
  ('umrah.absconder_penalty', '2000', 'number'),
  ('umrah.default_program_duration', '14', 'number'),
  ('umrah.import_auto_create_groups', 'true', 'boolean'),
  ('umrah.import_auto_create_purchase', 'true', 'boolean'),
  ('umrah.commission_auto_calculate', 'false', 'boolean'),
  ('umrah.tier_unit', '10000', 'number'),
  ('umrah.require_agent_linking', 'true', 'boolean')
) AS defaults(k, v, t)
WHERE NOT EXISTS (
  SELECT 1 FROM system_settings s
  WHERE s.key = defaults.k AND s."companyId" IS NULL AND s."branchId" IS NULL
);

-- 3. Defensive re-seed of the current Hijri season (1447 H) per active company.
--    Mirrors db/seed.sql.
INSERT INTO umrah_seasons ("companyId", title, "hijriYear", "startDate", "endDate", "isCurrent", status)
SELECT c.id, 'موسم 1447 هـ', 1447, DATE '2025-07-27', DATE '2026-07-16', true, 'open'
FROM companies c
WHERE c.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM umrah_seasons s
    WHERE s."companyId" = c.id AND s."hijriYear" = 1447
  );

COMMIT;
