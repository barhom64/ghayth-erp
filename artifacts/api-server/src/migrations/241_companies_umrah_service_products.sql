-- ============================================================
-- Migration 241: companies — umrah service-type → product mapping
-- (Phase 3a of the per-line refactor)
-- ============================================================
--
-- The product owner's example:
--   تأشيرة 422 ر.س — بدون ضريبة
--   خدمات أرضية 50 ر.س — مع ضريبة
--   نقل 200 ر.س — مع ضريبة
--
-- For the engine to ROUTE each line to its own account + VAT rate,
-- it needs to know which `products` row represents each service
-- category. PR #1467 added the per-line columns (productId / vatRate
-- / vatAmount / accountCode) and PR #1468 made the GL posting use
-- them — but until the engine knows "this group's visa portion =
-- product X with defaultTaxCode=zero", it can't actually populate
-- those fields.
--
-- This migration adds the 3 FKs that close that loop. Phase 3b (next
-- PR) extends the engine to:
--   1. Look up these 3 products on every sales-invoice generation
--   2. Pull defaultTaxCode + defaultRevenueAccountId from each
--   3. Split a group's lineTotal into 3 lineItems (visa + services
--      + transport) with the matching product references
--   4. Phase 2's bucketing loop (#1468) then emits 3 distinct CR
--      Revenue lines on the JE automatically
--
-- Nullable columns: companies stay valid pre-mapping. The engine
-- will fall back to the single bundled line when any of the 3 is
-- unset (graceful degradation — no errors, just no split).
--
-- @rollback: ALTER TABLE companies
--              DROP COLUMN IF EXISTS "umrahTransportProductId",
--              DROP COLUMN IF EXISTS "umrahServicesProductId",
--              DROP COLUMN IF EXISTS "umrahVisaProductId";
--   (Additive columns — drop them and the engine falls back to the
--   pre-Phase-3a bundled-line path. No data loss; per-line columns
--   on existing invoices stay populated with their captured values.)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS "umrahVisaProductId" integer,
  ADD COLUMN IF NOT EXISTS "umrahServicesProductId" integer,
  ADD COLUMN IF NOT EXISTS "umrahTransportProductId" integer;

COMMENT ON COLUMN companies."umrahVisaProductId" IS
  'FK to products.id — the product representing the visa pass-through line on umrah sales invoices. Typically configured with defaultTaxCode=zero so the per-line VAT is 0 (visa fees are KSA government pass-through, not vatable). Phase 3b engine uses this product''s defaults to populate vatRate + accountCode on the visa line.';
COMMENT ON COLUMN companies."umrahServicesProductId" IS
  'FK to products.id — the product representing the operator''s ground-services markup line on umrah sales invoices. Typically defaultTaxCode=standard (15%). The "marginBase" amount (PR #1457) flows through this line.';
COMMENT ON COLUMN companies."umrahTransportProductId" IS
  'FK to products.id — the product representing the transport line on umrah sales invoices. Typically defaultTaxCode=standard (15%) since transport is a vatable service.';
