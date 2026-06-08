-- 240_invoice_amendment_chain.sql
--
-- @rollback: ALTER TABLE invoices
--             DROP COLUMN IF EXISTS "amendedFromInvoiceId",
--             DROP COLUMN IF EXISTS "amendedToInvoiceId",
--             DROP COLUMN IF EXISTS "amendmentReason",
--             DROP COLUMN IF EXISTS "amendedAt";
--            DROP INDEX IF EXISTS idx_invoices_amendment_chain;
--
-- ZATCA compliance: per Saudi tax authority rules, an issued (approved)
-- tax invoice cannot be edited in place. The correction protocol is:
--   1. Issue a credit memo against the original invoice for the full
--      amount, reversing AR + VAT output + COGS / inventory in the GL.
--   2. Issue a NEW tax invoice with a fresh sequential number,
--      reflecting the corrected line items.
--   3. Link the two so audit trail + ZATCA filing can reconstruct the
--      amendment chain.
--
-- This migration adds the bidirectional FK columns so the orchestrator
-- (POST /invoices/:id/amend) can wire the chain in one transaction.
-- Existing rows backfill as NULL (no historical amendments to
-- reconstruct). The amendmentReason column lets ZATCA filings include
-- the operator's free-text justification when downstream tools query
-- the chain.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS "amendedFromInvoiceId" INTEGER,
  ADD COLUMN IF NOT EXISTS "amendedToInvoiceId"   INTEGER,
  ADD COLUMN IF NOT EXISTS "amendmentReason"      TEXT,
  ADD COLUMN IF NOT EXISTS "amendedAt"            TIMESTAMPTZ;

-- Chain lookup index — used by the invoice detail page when rendering
-- the "this is an amendment of #N" / "this was amended by #M" banners.
CREATE INDEX IF NOT EXISTS idx_invoices_amendment_chain
  ON public.invoices ("companyId", "amendedFromInvoiceId")
  WHERE "amendedFromInvoiceId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_amended_to
  ON public.invoices ("companyId", "amendedToInvoiceId")
  WHERE "amendedToInvoiceId" IS NOT NULL;
