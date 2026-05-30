-- ============================================================
-- Migration 236: company_feature_flags
-- ============================================================
-- VIS-002 (Ghaith Operating Foundation): partial activation ("التفعيل
-- الجزئي الذكي"). A feature/track is ENABLED by default; this table records
-- only the EXPLICIT per-company state so the absence of a row means enabled.
-- The frontend (AppContext.isFeatureEnabled) and visibility engine hide a
-- track/supporting-service only when a row sets enabled = false.
--
-- Default-ON semantics keep every existing deployment unchanged (no rows ⇒
-- everything visible exactly as today) while giving admins a safe lever to
-- hide unsubscribed tracks. feature_key matches the RBAC featureCatalog keys
-- (e.g. "umrah", "finance.invoices") so the same vocabulary governs
-- permissions and activation.
--
-- See docs/frontend/VISIBILITY_ENGINE_SPEC.md and
-- docs/architecture/VISIBILITY_GOVERNANCE_MATRIX.md.
-- ============================================================
--
-- @rollback: DROP TABLE IF EXISTS company_feature_flags;
--   (All features revert to the implicit default-ON; no permission or data
--   loss — RBAC remains the authority over WHO can use a feature.)

CREATE TABLE IF NOT EXISTS company_feature_flags (
  id            serial PRIMARY KEY,
  "companyId"   integer NOT NULL,
  feature_key   text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  reason        text,
  "updatedBy"   integer,
  "createdAt"   timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt"   timestamptz NOT NULL DEFAULT NOW()
);

-- One row per (company, feature). The route upserts on this key.
CREATE UNIQUE INDEX IF NOT EXISTS company_feature_flags_uq
  ON company_feature_flags ("companyId", feature_key);

-- Fast lookup of a company's disabled set on every /permissions/my call.
CREATE INDEX IF NOT EXISTS company_feature_flags_disabled_idx
  ON company_feature_flags ("companyId")
  WHERE enabled = false;

COMMENT ON TABLE company_feature_flags IS
  'VIS-002 partial activation. Absence of a row ⇒ feature enabled (default-ON). '
  'feature_key aligns with RBAC featureCatalog keys.';
