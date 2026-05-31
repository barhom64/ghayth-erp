-- ============================================================
-- Migration 240: umrah_sales_invoice_items — per-line VAT + GL
-- routing (apply the finance pattern to umrah)
-- ============================================================
--
-- The product owner's example:
--   تأشيرة 422 ر.س — بدون ضريبة (رسوم حكومية pass-through)
--   خدمات أرضية 50 ر.س — مع ضريبة 15%
--   نقل 200 ر.س — مع ضريبة 15%
--
-- Pre-PR `umrah_sales_invoice_items` had only itemType + groupId/
-- violationId + quantity/unitPrice/lineTotal — no per-line VAT, no
-- product link, no GL account routing. VAT was computed on the
-- aggregate margin (PR #1457) which gives the right TOTAL but
-- couldn't express "this specific line is zero-rated" for ZATCA
-- e-invoice line items.
--
-- This migration adds the 4 columns the finance `invoice_items`
-- table already carries:
--
--   productId    — FK to products (gives access to defaultTaxCode,
--                  defaultRevenueAccountId, etc.)
--   vatRate      — per-line VAT rate (0 for visa, 15 for services)
--   vatAmount    — persisted so the SUM matches the invoice header
--                  without recomputing on every read
--   accountCode  — optional GL revenue-account override; when set,
--                  the engine routes THIS line's revenue to this
--                  account instead of the bundled umrah_invoice_revenue
--                  (umrahInvoicingEngine line 316). When null, the
--                  current bundled posting still works.
--
-- Phase 1 (this migration + engine.persist): write per-line values
-- on every new invoice. The aggregate vatAmount on the invoice
-- header still works as today; per-line values are an additive
-- richer source.
--
-- Phase 2 (follow-up PR): GL posting splits revenue + VAT credits
-- by accountCode + taxRate buckets instead of one lump JE line.
-- The schema is ready; only the engine needs the second pass.
--
-- @rollback: ALTER TABLE umrah_sales_invoice_items
--              DROP COLUMN IF EXISTS "accountCode",
--              DROP COLUMN IF EXISTS "vatAmount",
--              DROP COLUMN IF EXISTS "vatRate",
--              DROP COLUMN IF EXISTS "productId";
--   (Additive columns — drop them and the invoice generation falls
--   back to the existing aggregate path. No data loss; the JEs are
--   intact and the invoice header still has the totals.)

ALTER TABLE umrah_sales_invoice_items
  ADD COLUMN IF NOT EXISTS "productId" integer,
  ADD COLUMN IF NOT EXISTS "vatRate" numeric(5,2) DEFAULT 15,
  ADD COLUMN IF NOT EXISTS "vatAmount" numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "accountCode" varchar(20);

COMMENT ON COLUMN umrah_sales_invoice_items."productId" IS
  'FK to products.id — gives the line access to defaultTaxCode + defaultRevenueAccountId from the product master.';
COMMENT ON COLUMN umrah_sales_invoice_items."vatRate" IS
  'Per-line VAT rate. 0 for visa pass-through (zero-rated), 15 for standard services. Persisted so e-invoice line items can render the rate exactly as charged.';
COMMENT ON COLUMN umrah_sales_invoice_items."vatAmount" IS
  'Persisted per-line VAT amount = lineTotal × vatRate / 100 (tax-exclusive). Sum across lines = the invoice header''s vatAmount when all items use line-level VAT.';
COMMENT ON COLUMN umrah_sales_invoice_items."accountCode" IS
  'Optional GL revenue-account override. When set, Phase 2 posting routes THIS line''s revenue here instead of the bundled umrah_invoice_revenue account. Null = use the resolver fallback.';
