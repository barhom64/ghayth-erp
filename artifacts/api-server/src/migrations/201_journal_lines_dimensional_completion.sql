-- 201_journal_lines_dimensional_completion.sql
--
-- @rollback: ALTER TABLE journal_lines DROP COLUMN for each of the 7
--   added columns + DROP INDEX for the two new indexes. Safe to roll
--   back at any time — every added column is NULLABLE with no default
--   and no foreign key, and the existing INSERT path tolerates the
--   columns being absent because the engine builds the column list
--   dynamically from the line shape.
--
-- Finance Line-Level Allocation — Phase 2 P0.
--
-- Phase 1 (migration 200) added dimensional columns to invoice_lines so
-- callers could allocate per-line. journal_lines already had most of
-- the dimensions (projectId/vehicleId/propertyId/contractId/employeeId
-- /driverId/productId/clientId/vendorId/activityType — see schema_pre
-- 9285-9310), but a handful are still missing for the full reporting
-- contract:
--
--   * costCenterId  — numeric FK to cost_centers; today journal_lines
--                     has a free-text `costCenter` column only, which
--                     made aggregation reports impossible.
--   * unitId        — property sub-unit (per-unit profitability).
--   * assetId       — fixed asset (depreciation + maintenance posting).
--   * umrahSeasonId — Umrah season cost centre (per-season profit).
--   * umrahAgentId  — Umrah agent cost centre.
--   * sourceLineTable + sourceLineId — back-pointer from a journal_line
--                     to the originating source row (invoice_lines.id,
--                     purchase_order_items.id, etc.). Lets the operator
--                     drill from the GL line back to the bill of sale.
--   * dimensionJson — bag of arbitrary dimensions a future allocation
--                     rule may need without another schema migration.
--
-- All NULLABLE so existing INSERTs continue to work — the engine's
-- INSERT path skips columns whose value is undefined.

ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS "costCenterId"     integer,
  ADD COLUMN IF NOT EXISTS "unitId"           integer,
  ADD COLUMN IF NOT EXISTS "assetId"          integer,
  ADD COLUMN IF NOT EXISTS "umrahSeasonId"    integer,
  ADD COLUMN IF NOT EXISTS "umrahAgentId"     integer,
  ADD COLUMN IF NOT EXISTS "sourceLineTable"  varchar(64),
  ADD COLUMN IF NOT EXISTS "sourceLineId"     integer,
  ADD COLUMN IF NOT EXISTS "dimensionJson"    jsonb;

-- Drill-back hot path: «أعطني كل قيود السطر invoice_lines.id=42».
CREATE INDEX IF NOT EXISTS idx_journal_lines_source_line
  ON public.journal_lines ("sourceLineTable", "sourceLineId")
  WHERE "sourceLineTable" IS NOT NULL;

-- Per-vehicle / per-property / per-project aggregation hot path. The
-- existing per-column indexes on projectId/vehicleId/propertyId remain;
-- this is a composite for the «الربحية حسب المركبة» report that joins
-- by (companyId, vehicleId).
CREATE INDEX IF NOT EXISTS idx_journal_lines_dim_vehicle
  ON public.journal_lines ("vehicleId")
  WHERE "vehicleId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journal_lines_dim_property
  ON public.journal_lines ("propertyId")
  WHERE "propertyId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journal_lines_dim_project
  ON public.journal_lines ("projectId")
  WHERE "projectId" IS NOT NULL;
