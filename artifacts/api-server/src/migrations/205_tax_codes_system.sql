-- 205_tax_codes_system.sql
--
-- @rollback:
--   DROP TABLE public.tax_codes;
--   ALTER TABLE invoices DROP COLUMN "taxCode", DROP COLUMN "taxInclusive";
--   ALTER TABLE invoice_lines DROP COLUMN "taxInclusive";
--   ALTER TABLE purchase_order_items DROP COLUMN "taxInclusive";
--   ALTER TABLE goods_receipt_items DROP COLUMN "taxInclusive";
--   ALTER TABLE purchase_request_items DROP COLUMN "taxInclusive";
--   ALTER TABLE credit_memos DROP COLUMN "taxCode", DROP COLUMN "taxInclusive";
--   ALTER TABLE debit_memos DROP COLUMN "taxCode", DROP COLUMN "taxInclusive";
--   Safe at any time — everything NULLABLE; the legacy `vatRate` path
--   stays valid.
--
-- Tax Codes System — like Daftra / Zoho Books.
--
-- Today every invoice/line stores a `vatRate` numeric directly. Saudi
-- VAT has multiple categories (Standard 15% / Zero 0% / Exempt /
-- Out-of-scope / Reverse-charge for imports) and each tenant may want
-- its own VAT account per category. Asking the operator to type `15`
-- every line is brittle: a typo → 1.5% silently posted, and the VAT
-- return cannot group by category for the ZATCA Form-A bucket.
--
-- New model:
--
--   tax_codes(code, name, rate, type, accountId, isInclusiveDefault, isActive)
--     ↑
--   invoice_lines.taxCode + invoice_lines.taxInclusive
--   purchase_order_items.taxCode + .taxInclusive
--   goods_receipt_items.taxCode + .taxInclusive
--   credit_memos.taxCode + .taxInclusive
--   debit_memos.taxCode + .taxInclusive
--
-- Helper `computeTaxFromTaxCode(amount, taxInclusive, taxCode)` returns
-- { net, tax, gross } — single source of truth, no scattered
-- `roundTo2(x * 0.15)` literals.
--
-- VAT return groups journal entries by linked tax_codes.type so the
-- ZATCA filing breaks down standard / zero / exempt / RC correctly.

-- ── 1. tax_codes table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tax_codes (
  id                  serial PRIMARY KEY,
  "companyId"         integer NOT NULL,
  code                varchar(20) NOT NULL,
  name                varchar(100) NOT NULL,
  "nameEn"            varchar(100),
  rate                numeric(7,4) NOT NULL DEFAULT 0,   -- e.g., 15.0000 = 15%
  "taxType"           varchar(30) NOT NULL,              -- 'standard' | 'zero' | 'exempt' | 'out_of_scope' | 'reverse_charge'
  "accountId"         integer,                           -- output VAT account (for invoices)
  "inputAccountId"    integer,                           -- input VAT account (for purchases)
  "isInclusiveDefault" boolean DEFAULT false,            -- whether prices defaulting to this code are tax-inclusive
  "zatcaCategoryCode" varchar(10),                       -- 'S' | 'Z' | 'E' | 'O' (for ZATCA XML)
  "zatcaExemptionReason" text,                           -- required if taxType = exempt or zero
  description         text,
  "isActive"          boolean DEFAULT true,
  "createdAt"         timestamp with time zone DEFAULT now(),
  "updatedAt"         timestamp with time zone DEFAULT now(),
  "deletedAt"         timestamp with time zone,
  CONSTRAINT tax_codes_company_code_uniq UNIQUE ("companyId", code),
  CONSTRAINT tax_codes_type_check CHECK (("taxType")::text = ANY (ARRAY[
    'standard'::text, 'zero'::text, 'exempt'::text, 'out_of_scope'::text, 'reverse_charge'::text
  ])),
  CONSTRAINT tax_codes_rate_check CHECK (rate >= 0 AND rate <= 100)
);

CREATE INDEX IF NOT EXISTS idx_tax_codes_company_active
  ON public.tax_codes ("companyId")
  WHERE "isActive" = true AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_tax_codes_type
  ON public.tax_codes ("companyId", "taxType")
  WHERE "isActive" = true AND "deletedAt" IS NULL;

-- ── 2. inclusive flag on line tables ──────────────────────────────────────
--
-- The legacy lines store `unitPrice` and `vatAmount` separately, with no
-- notion of "is the unitPrice already tax-inclusive or not". The
-- inclusive flag lets the entry form ask once and the math falls out:
--
--   if taxInclusive  → net = amount / (1 + rate/100);  tax = amount − net
--   else (exclusive) → net = amount;                   tax = amount * rate/100
--
-- `taxCode` already exists on the line tables (added in migrations
-- 200, 202); only `taxInclusive` needs adding here.

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS "taxInclusive" boolean DEFAULT false;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS "taxInclusive" boolean DEFAULT false;

ALTER TABLE public.purchase_request_items
  ADD COLUMN IF NOT EXISTS "taxInclusive" boolean DEFAULT false;

ALTER TABLE public.goods_receipt_items
  ADD COLUMN IF NOT EXISTS "taxInclusive" boolean DEFAULT false;

-- credit/debit memos don't have taxCode yet — add both.
ALTER TABLE public.credit_memos
  ADD COLUMN IF NOT EXISTS "taxCode"      varchar(20),
  ADD COLUMN IF NOT EXISTS "taxInclusive" boolean DEFAULT false;

ALTER TABLE public.debit_memos
  ADD COLUMN IF NOT EXISTS "taxCode"      varchar(20),
  ADD COLUMN IF NOT EXISTS "taxInclusive" boolean DEFAULT false;

-- ── 3. invoice header-level default ──────────────────────────────────────
--
-- A whole invoice can declare a default taxCode + inclusive flag so
-- lines that don't override inherit them. Matches the Daftra pattern
-- where the invoice form picks "VAT 15% inclusive" once and every line
-- adopts it.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS "taxCode"      varchar(20),
  ADD COLUMN IF NOT EXISTS "taxInclusive" boolean DEFAULT false;

-- ── 4. Seed the default Saudi tax codes for every existing company ───────
--
-- These five cover the standard ZATCA categories. Each tenant can edit
-- name/accountId/rate after seed.
DO $$
DECLARE
  c RECORD;
  -- Resolve the existing VAT payable / VAT input accounts so the seed
  -- points at real GL nodes from day 1.
  vat_payable_id integer;
  vat_input_id   integer;
BEGIN
  FOR c IN SELECT id FROM public.companies WHERE COALESCE(status, 'active') = 'active' LOOP
    SELECT id INTO vat_payable_id
      FROM public.chart_of_accounts
     WHERE "companyId" = c.id AND code = '2300'
     LIMIT 1;
    SELECT id INTO vat_input_id
      FROM public.chart_of_accounts
     WHERE "companyId" = c.id AND code = '1180'
     LIMIT 1;

    -- Standard rate 15% — Saudi VAT default
    INSERT INTO public.tax_codes
      ("companyId", code, name, "nameEn", rate, "taxType",
       "accountId", "inputAccountId", "zatcaCategoryCode", "isInclusiveDefault")
    VALUES
      (c.id, 'VAT15', 'ضريبة قيمة مضافة 15%', 'Standard VAT 15%',
       15, 'standard', vat_payable_id, vat_input_id, 'S', false)
    ON CONFLICT ("companyId", code) DO NOTHING;

    -- Zero rated — exports, qualifying medicines/medical devices
    INSERT INTO public.tax_codes
      ("companyId", code, name, "nameEn", rate, "taxType",
       "accountId", "inputAccountId", "zatcaCategoryCode", "zatcaExemptionReason")
    VALUES
      (c.id, 'VAT0', 'صفرية', 'Zero Rated',
       0, 'zero', vat_payable_id, vat_input_id, 'Z',
       'صادرات / سلع وخدمات بنسبة 0%')
    ON CONFLICT ("companyId", code) DO NOTHING;

    -- Exempt — financial services, residential rent
    INSERT INTO public.tax_codes
      ("companyId", code, name, "nameEn", rate, "taxType",
       "accountId", "inputAccountId", "zatcaCategoryCode", "zatcaExemptionReason")
    VALUES
      (c.id, 'EXEMPT', 'معفاة', 'Exempt',
       0, 'exempt', NULL, NULL, 'E',
       'سلع/خدمات معفاة بالنظام السعودي')
    ON CONFLICT ("companyId", code) DO NOTHING;

    -- Out of scope — transactions outside Saudi VAT
    INSERT INTO public.tax_codes
      ("companyId", code, name, "nameEn", rate, "taxType",
       "accountId", "inputAccountId", "zatcaCategoryCode")
    VALUES
      (c.id, 'OOS', 'خارج نطاق الضريبة', 'Out of Scope',
       0, 'out_of_scope', NULL, NULL, 'O')
    ON CONFLICT ("companyId", code) DO NOTHING;

    -- Reverse charge — imports + non-resident supplies
    INSERT INTO public.tax_codes
      ("companyId", code, name, "nameEn", rate, "taxType",
       "accountId", "inputAccountId", "zatcaCategoryCode")
    VALUES
      (c.id, 'RCM15', 'احتساب عكسي 15%', 'Reverse Charge 15%',
       15, 'reverse_charge', vat_payable_id, vat_input_id, 'S')
    ON CONFLICT ("companyId", code) DO NOTHING;
  END LOOP;
END$$;

-- ── 5. Convenience FK from invoice_lines.taxCode to tax_codes ───────────
--
-- The column is varchar (matches legacy code field), so the FK is
-- soft: we DON'T add a hard FK because companies that imported
-- legacy data with free-text taxCode values shouldn't fail the
-- migration. The route layer validates against tax_codes on insert.
--
-- An index on (companyId, taxCode) on each line table speeds up VAT
-- return aggregation by category.

CREATE INDEX IF NOT EXISTS idx_invoice_lines_tax_code
  ON public.invoice_lines ("taxCode")
  WHERE "taxCode" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_tax_code
  ON public.purchase_order_items ("taxCode")
  WHERE "taxCode" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_tax_code
  ON public.goods_receipt_items ("taxCode")
  WHERE "taxCode" IS NOT NULL;
