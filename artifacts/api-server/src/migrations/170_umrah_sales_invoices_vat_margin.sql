-- ============================================================
-- Migration 170: umrah_sales_invoices — VAT margin base columns
-- ============================================================
-- Adds cost_basis + margin_base columns so the sales invoice retains the
-- numbers that drove the VAT calculation (audit trail + reporting).
-- Companion to the umrahInvoicingEngine.ts change that switched VAT from
-- (subtotal × rate) to ((subtotal − costBasis) × rate).
--
-- Idempotent: both columns are nullable; existing rows show NULL which
-- the reporting layer treats as "pre-margin-scheme".
-- ============================================================

ALTER TABLE umrah_sales_invoices
  ADD COLUMN IF NOT EXISTS "costBasis" numeric(12,2) DEFAULT 0;

ALTER TABLE umrah_sales_invoices
  ADD COLUMN IF NOT EXISTS "marginBase" numeric(12,2) DEFAULT 0;

COMMENT ON COLUMN umrah_sales_invoices."costBasis" IS
  'Sum of umrah_nusk_invoices.totalAmount for the groups billed on this invoice. Drives VAT margin scheme.';

COMMENT ON COLUMN umrah_sales_invoices."marginBase" IS
  'VAT base = max(0, subtotal − costBasis). VAT amount = marginBase × vatRate / 100.';
