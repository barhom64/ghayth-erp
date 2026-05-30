-- ============================================================
-- Migration 239: companies.nuskSupplierId + vendor-statement
-- integration for umrah_nusk_invoices
-- ============================================================
--
-- Closes the LAST gap from the umrah↔finance audit (vendor side):
-- umrah_nusk_invoices has no supplierId column, so the vendor
-- statement at /reports/vendor-statement/:supplierId can't filter by
-- supplier — making umrah AP invisible to the finance module.
--
-- Solution: a per-company default supplier ID that represents NUSK.
-- When the vendor statement is opened for that supplier, the endpoint
-- detects the match and includes umrah_nusk_invoices in the timeline
-- (same UNION pattern as PR #1449 used for customer statement and
-- umrah_sales_invoices).
--
-- Nullable column: pre-existing companies stay valid; operators set
-- this once when they register a supplier row representing NUSK.
--
-- @rollback: ALTER TABLE companies DROP COLUMN IF EXISTS "nuskSupplierId";
--   (The vendor-statement endpoint reads `nuskSupplierId IS NOT NULL`
--   before doing the umrah include, so a dropped column gracefully
--   falls back to "no umrah rows" — no broken queries.)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS "nuskSupplierId" integer;

COMMENT ON COLUMN companies."nuskSupplierId" IS
  'FK to suppliers.id — the supplier row representing NUSK (the Saudi government umrah authority). When set, vendor-statement reports for that supplier include all umrah_nusk_invoices rows; when null, the umrah branch is skipped.';
