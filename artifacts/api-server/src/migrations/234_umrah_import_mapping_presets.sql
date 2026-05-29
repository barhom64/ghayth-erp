-- ============================================================
-- Migration 234: umrah_import_mapping_presets
-- ============================================================
-- Stores the operator's column-mapping decisions per import file type
-- (mutamers / vouchers) so the next time the same partner's Excel
-- arrives the wizard auto-applies the saved layout instead of asking
-- the operator to re-map every column.
--
-- Scoped per company + per user. The optional `isDefault` flag marks
-- one preset per (companyId, userId, fileType) tuple as the auto-pick
-- when the wizard opens a new file.
-- ============================================================

CREATE TABLE IF NOT EXISTS umrah_import_mapping_presets (
  id            serial PRIMARY KEY,
  "companyId"   integer NOT NULL,
  "branchId"    integer,
  "userId"      integer NOT NULL,
  name          varchar(120) NOT NULL,
  "fileType"    varchar(20) NOT NULL CHECK ("fileType" IN ('mutamers', 'vouchers')),
  mapping       jsonb NOT NULL DEFAULT '{}'::jsonb,
  "isDefault"   boolean NOT NULL DEFAULT false,
  "createdAt"   timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt"   timestamptz NOT NULL DEFAULT NOW(),
  "deletedAt"   timestamptz
);

-- One preset name per (company, user, fileType) — prevents accidental
-- duplicates when the operator saves the same preset twice.
CREATE UNIQUE INDEX IF NOT EXISTS umrah_import_mapping_presets_name_uq
  ON umrah_import_mapping_presets ("companyId", "userId", "fileType", name)
  WHERE "deletedAt" IS NULL;

-- Only ONE default per (company, user, fileType). The route enforces
-- this by un-flagging siblings on update.
CREATE UNIQUE INDEX IF NOT EXISTS umrah_import_mapping_presets_default_uq
  ON umrah_import_mapping_presets ("companyId", "userId", "fileType")
  WHERE "isDefault" = true AND "deletedAt" IS NULL;

-- List index for the dropdown query (filters by company/user/fileType).
CREATE INDEX IF NOT EXISTS umrah_import_mapping_presets_list_idx
  ON umrah_import_mapping_presets ("companyId", "userId", "fileType")
  WHERE "deletedAt" IS NULL;

COMMENT ON TABLE umrah_import_mapping_presets IS
  'Per-user saved Arabic-header → DB-field mappings for the umrah import wizard.';
COMMENT ON COLUMN umrah_import_mapping_presets.mapping IS
  'Record<excelHeader, dbFieldName>. Empty values mean "ignore this column".';
COMMENT ON COLUMN umrah_import_mapping_presets."isDefault" IS
  'When true, the wizard auto-applies this preset on file pick.';
