-- Migration 280 — KSA-aligned driver identity + license origin
--
-- @rollback: Fully additive. To undo:
--   ALTER TABLE fleet_drivers
--     DROP COLUMN IF EXISTS "nationalId",
--     DROP COLUMN IF EXISTS "iqamaNumber",
--     DROP COLUMN IF EXISTS "licenseIssueDate",
--     DROP COLUMN IF EXISTS "licenseIssuingAuthority",
--     DROP COLUMN IF EXISTS "licenseOrigin";
--
-- #1812 operational review — the user explicitly called out:
--   "حقول رخص السائق غير صحيحة — يجب أن تكون النوع/الفئة/تاريخ
--    الانتهاء + الهوية/الإقامة لا مجرد رقم رخصة."
--   (KSA driver license fields are wrong — need type/class/expiry +
--    ID/Iqama, not just a license number.)
--
-- Background:
--   - licenseClass    is in #264 (private / light_trans / medium / heavy / …)
--   - licenseExpiry   is in the original fleet_drivers create
--   - licenseNumber   is in the original fleet_drivers create
--   - licenseType     existed as a freeform TEXT — the user wants it
--     tightened to the actual KSA license-origin alphabet.
--
-- This migration adds the missing identity columns + tightens semantics:
--
--   nationalId               — هوية وطنية (10-digit Saudi national ID).
--                              REQUIRED for KSA drivers (validated app-side).
--   iqamaNumber              — رقم الإقامة (residence permit for expats).
--                              REQUIRED for non-Saudi drivers (app-side).
--   licenseIssueDate         — تاريخ إصدار الرخصة.
--   licenseIssuingAuthority  — الإدارة العامة للمرور (or other issuing body).
--   licenseOrigin            — saudi / gcc / international / temporary.
--                              Replaces the previous freeform `licenseType`
--                              from the app layer — the column is kept for
--                              backwards compatibility but the surface now
--                              binds licenseOrigin.
--
-- All columns are nullable so existing fleets aren't blocked.
-- The app layer enforces the "Saudi → nationalId required" /
-- "non-Saudi → iqamaNumber required" rule at create-time so legacy rows
-- aren't retroactively invalidated.

ALTER TABLE public.fleet_drivers
  ADD COLUMN IF NOT EXISTS "nationalId"              TEXT,
  ADD COLUMN IF NOT EXISTS "iqamaNumber"             TEXT,
  ADD COLUMN IF NOT EXISTS "licenseIssueDate"        DATE,
  ADD COLUMN IF NOT EXISTS "licenseIssuingAuthority" TEXT,
  ADD COLUMN IF NOT EXISTS "licenseOrigin"           TEXT;

-- Identity lookup index — used by HR onboarding to dedupe a driver
-- across multiple branches of the same company.
CREATE INDEX IF NOT EXISTS idx_fleet_drivers_national_id
  ON public.fleet_drivers ("companyId", "nationalId")
  WHERE "nationalId" IS NOT NULL AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_drivers_iqama
  ON public.fleet_drivers ("companyId", "iqamaNumber")
  WHERE "iqamaNumber" IS NOT NULL AND "deletedAt" IS NULL;
