-- artifacts/api-server/src/migrations/172_zatca_settings_branchId.sql
--
-- Adds `branchId` to zatca_settings so each VAT-registered branch can
-- maintain its own ZATCA credentials (CSID, PIH key, OAuth secret,
-- VAT number). Saudi tenants like Al-Diyaa register multiple branches
-- with separate VAT numbers — Makkah branch 7026091798, Hafar Al-Batin
-- 7033364436, Al-Door 7026091814 — and each must onboard with ZATCA
-- independently. The existing unique (companyId) constraint forced a
-- single row per company, blocking the multi-VAT scenario.
--
-- Schema change:
--   • ADD COLUMN "branchId" integer (nullable; NULL = company default)
--   • DROP CONSTRAINT zatca_settings_companyId_key
--   • ADD partial unique indexes covering both the branch-specific row
--     and the company-default row, since NULLs are distinct in btree.
--
-- No data migration needed — existing rows keep branchId NULL and
-- continue to serve as the company-wide default. New per-branch rows
-- are inserted by the operator (or seeded by the application) when
-- ZATCA onboarding starts for a specific branch.

BEGIN;

ALTER TABLE zatca_settings
  ADD COLUMN IF NOT EXISTS "branchId" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'zatca_settings_branchId_fkey'
  ) THEN
    ALTER TABLE zatca_settings
      ADD CONSTRAINT "zatca_settings_branchId_fkey"
        FOREIGN KEY ("branchId") REFERENCES branches(id);
  END IF;
END $$;

-- Drop the old company-only uniqueness so multiple (company, branch)
-- rows can coexist.
ALTER TABLE zatca_settings
  DROP CONSTRAINT IF EXISTS "zatca_settings_companyId_key";

-- One row per (companyId, branchId) — branch-specific credentials.
CREATE UNIQUE INDEX IF NOT EXISTS zatca_settings_company_branch_uq
  ON zatca_settings ("companyId", "branchId")
  WHERE "branchId" IS NOT NULL;

-- One company-wide default per companyId — branchId IS NULL serves as
-- the fallback when no per-branch row exists.
CREATE UNIQUE INDEX IF NOT EXISTS zatca_settings_company_default_uq
  ON zatca_settings ("companyId")
  WHERE "branchId" IS NULL;

CREATE INDEX IF NOT EXISTS idx_zatca_settings_branchid
  ON zatca_settings ("branchId")
  WHERE "branchId" IS NOT NULL;

COMMIT;
