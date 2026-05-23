-- 200_invoice_lines_dimensional_allocation.sql
--
-- @rollback: DROP the two partial indexes
--   (idx_invoice_lines_account_code, idx_invoke_lines_unmapped) then
--   ALTER TABLE invoice_lines DROP COLUMN for each of the 20 added
--   columns. Safe to roll back at any time — every added column is
--   NULLABLE with a sensible default and no existing code path reads
--   from them when the column is absent (the per-line approval flow
--   tolerates missing accountCode by falling back to the company-level
--   invoice_revenue account).
--
-- Finance Line-Level Accounting Allocation — Phase 1 (P0).
--
-- The current revenue posting model collapses every invoice line into a
-- single CR Revenue posting on the invoice header, regardless of what
-- the lines actually are. A tenant that bills "نقل رمل" + "إيجار قلاب"
-- + "تأشيرة عمرة" on one invoice gets one undifferentiated revenue
-- credit on a single generic account; per-vehicle/per-property/per-
-- season profitability reports are impossible because the dimension is
-- lost between the invoice line and the journal entry.
--
-- This migration adds the missing dimensional + accounting fields on
-- invoice_lines so the approval flow can:
--   * resolve a specific revenue account per line (from accountCode)
--   * carry vehicleId/propertyId/projectId/contractId/etc through to
--     the journal_lines insert (those columns already exist on
--     journal_lines — see schema_pre.sql 9295-9306)
--   * record the resolution outcome (allocationStatus) so the operator
--     UI can highlight unmapped lines BEFORE approval
--
-- All new columns are NULLABLE with sensible defaults. Existing
-- invoice_lines rows are untouched; existing INSERTs continue to work
-- (the new columns just default to NULL/'unmapped'), so this migration
-- is backwards-compatible — the per-line revenue posting only kicks in
-- when the lines actually carry an accountCode.
--
-- Per migration policy, every ADD COLUMN uses IF NOT EXISTS so a
-- re-run is a no-op.

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS "accountId"            integer,
  ADD COLUMN IF NOT EXISTS "accountCode"          varchar(20),
  ADD COLUMN IF NOT EXISTS "costCenterId"         integer,
  ADD COLUMN IF NOT EXISTS "activityType"         varchar(50),
  ADD COLUMN IF NOT EXISTS "projectId"            integer,
  ADD COLUMN IF NOT EXISTS "vehicleId"            integer,
  ADD COLUMN IF NOT EXISTS "propertyId"           integer,
  ADD COLUMN IF NOT EXISTS "unitId"               integer,
  ADD COLUMN IF NOT EXISTS "assetId"              integer,
  ADD COLUMN IF NOT EXISTS "employeeId"           integer,
  ADD COLUMN IF NOT EXISTS "driverId"             integer,
  ADD COLUMN IF NOT EXISTS "contractId"           integer,
  ADD COLUMN IF NOT EXISTS "umrahSeasonId"        integer,
  ADD COLUMN IF NOT EXISTS "umrahAgentId"         integer,
  ADD COLUMN IF NOT EXISTS "productId"            integer,
  ADD COLUMN IF NOT EXISTS "taxCode"              varchar(20),
  ADD COLUMN IF NOT EXISTS "allocationRuleId"     integer,
  ADD COLUMN IF NOT EXISTS "allocationStatus"     varchar(20) DEFAULT 'unmapped',
  ADD COLUMN IF NOT EXISTS "dimensionJson"        jsonb,
  ADD COLUMN IF NOT EXISTS "manualOverrideReason" text;

-- accountCode lookup hot path — approval reads every line's accountCode
-- to group by account for the per-line revenue posting. A partial
-- index avoids bloating the table while the column is mostly NULL
-- during the transition period.
CREATE INDEX IF NOT EXISTS idx_invoice_lines_account_code
  ON public.invoice_lines ("accountCode")
  WHERE "accountCode" IS NOT NULL;

-- allocationStatus drives the "unmapped lines" report and the approval
-- gate. Filter index for the unmapped state since that's the hot
-- governance query.
CREATE INDEX IF NOT EXISTS idx_invoice_lines_unmapped
  ON public.invoice_lines ("invoiceId")
  WHERE "allocationStatus" = 'unmapped';
