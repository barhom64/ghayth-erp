-- 205_tax_codes_system.sql
-- Tax Codes System. Idempotent for schema dumps where tax_codes already exists
-- with either serial or identity id behavior.

ALTER TABLE public.tax_codes
  ADD COLUMN IF NOT EXISTS "nameEn" varchar(100),
  ADD COLUMN IF NOT EXISTS "inputAccountId" integer,
  ADD COLUMN IF NOT EXISTS "isInclusiveDefault" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "zatcaCategoryCode" varchar(10),
  ADD COLUMN IF NOT EXISTS "zatcaExemptionReason" text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS "isActive" boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone;

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS "taxInclusive" boolean DEFAULT false;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS "taxInclusive" boolean DEFAULT false;

ALTER TABLE public.purchase_request_items
  ADD COLUMN IF NOT EXISTS "taxInclusive" boolean DEFAULT false;

ALTER TABLE public.goods_receipt_items
  ADD COLUMN IF NOT EXISTS "taxInclusive" boolean DEFAULT false;

ALTER TABLE public.credit_memos
  ADD COLUMN IF NOT EXISTS "taxCode" varchar(20),
  ADD COLUMN IF NOT EXISTS "taxInclusive" boolean DEFAULT false;

ALTER TABLE public.debit_memos
  ADD COLUMN IF NOT EXISTS "taxCode" varchar(20),
  ADD COLUMN IF NOT EXISTS "taxInclusive" boolean DEFAULT false;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS "taxCode" varchar(20),
  ADD COLUMN IF NOT EXISTS "taxInclusive" boolean DEFAULT false;

DO $$
DECLARE
  c RECORD;
  vat_payable_id integer;
  vat_input_id integer;
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

    INSERT INTO public.tax_codes
      (id, "companyId", code, name, "nameEn", rate, "taxType",
       "accountId", "inputAccountId", "zatcaCategoryCode", "isInclusiveDefault")
    VALUES
      (nextval(pg_get_serial_sequence('public.tax_codes','id')), c.id, 'VAT15', 'ضريبة قيمة مضافة 15%', 'Standard VAT 15%',
       15, 'standard', vat_payable_id, vat_input_id, 'S', false)
    ON CONFLICT ("companyId", code) DO NOTHING;

    INSERT INTO public.tax_codes
      (id, "companyId", code, name, "nameEn", rate, "taxType",
       "accountId", "inputAccountId", "zatcaCategoryCode", "zatcaExemptionReason")
    VALUES
      (nextval(pg_get_serial_sequence('public.tax_codes','id')), c.id, 'VAT0', 'صفرية', 'Zero Rated',
       0, 'zero', vat_payable_id, vat_input_id, 'Z', 'صادرات / سلع وخدمات بنسبة 0%')
    ON CONFLICT ("companyId", code) DO NOTHING;

    INSERT INTO public.tax_codes
      (id, "companyId", code, name, "nameEn", rate, "taxType",
       "accountId", "inputAccountId", "zatcaCategoryCode", "zatcaExemptionReason")
    VALUES
      (nextval(pg_get_serial_sequence('public.tax_codes','id')), c.id, 'EXEMPT', 'معفاة', 'Exempt',
       0, 'exempt', NULL, NULL, 'E', 'سلع/خدمات معفاة بالنظام السعودي')
    ON CONFLICT ("companyId", code) DO NOTHING;

    INSERT INTO public.tax_codes
      (id, "companyId", code, name, "nameEn", rate, "taxType",
       "accountId", "inputAccountId", "zatcaCategoryCode")
    VALUES
      (nextval(pg_get_serial_sequence('public.tax_codes','id')), c.id, 'OOS', 'خارج نطاق الضريبة', 'Out of Scope',
       0, 'out_of_scope', NULL, NULL, 'O')
    ON CONFLICT ("companyId", code) DO NOTHING;

    INSERT INTO public.tax_codes
      (id, "companyId", code, name, "nameEn", rate, "taxType",
       "accountId", "inputAccountId", "zatcaCategoryCode")
    VALUES
      (nextval(pg_get_serial_sequence('public.tax_codes','id')), c.id, 'RCM15', 'احتساب عكسي 15%', 'Reverse Charge 15%',
       15, 'reverse_charge', vat_payable_id, vat_input_id, 'S')
    ON CONFLICT ("companyId", code) DO NOTHING;
  END LOOP;
END$$;

CREATE INDEX IF NOT EXISTS idx_tax_codes_company_active
  ON public.tax_codes ("companyId")
  WHERE "isActive" = true AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_tax_codes_type
  ON public.tax_codes ("companyId", "taxType")
  WHERE "isActive" = true AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_tax_code
  ON public.invoice_lines ("taxCode")
  WHERE "taxCode" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_tax_code
  ON public.purchase_order_items ("taxCode")
  WHERE "taxCode" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_tax_code
  ON public.goods_receipt_items ("taxCode")
  WHERE "taxCode" IS NOT NULL;
