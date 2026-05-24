-- 208_withholding_tax_foundation.sql
--
-- @rollback:
--   ALTER TABLE public.suppliers DROP COLUMN "residencyStatus",
--                                DROP COLUMN "defaultWhtRate",
--                                DROP COLUMN "whtCategoryDefault",
--                                DROP COLUMN "taxResidenceCountry";
--   ALTER TABLE public.supplier_payment_allocations
--     DROP COLUMN "whtAmount", DROP COLUMN "whtRate",
--     DROP COLUMN "whtCategory";
--   DROP TABLE public.wht_categories;
--   Safe at any time — every added column NULLABLE with 0 / null
--   defaults; no behaviour change for existing rows.
--
-- Audit P1 #10 — Saudi Withholding Tax (WHT) compliance foundation.
--
-- ZATCA WHT rules (per the ZATCA "Withholding Tax Guideline" PDF
-- — implementing regulations under Income Tax Law Article 68):
--
--   * Resident suppliers (Saudi/GCC w/ permanent establishment)
--     → no WHT
--   * Non-resident suppliers → WHT withheld at source by the buyer:
--       Royalties, technical/consulting fees:  15%
--       Management fees, performance bonuses:  20%
--       Dividends, interest, rent of movable
--         property, telecommunications, air
--         tickets, freight shipping              5%
--   * Some treaties reduce the rates further.
--
-- The buyer withholds the WHT from the supplier payment and remits
-- it to ZATCA on the supplier's behalf. Invoice = 100,000.
-- Supplier residency = non-resident, service = technical (15%).
-- → buyer pays supplier 85,000 + remits 15,000 to ZATCA.
--
-- This migration is the FOUNDATION:
--   1. Per-supplier residency + default rate.
--   2. Per-category rate registry (so each company can configure
--      treaty-reduced rates).
--   3. Per-allocation WHT snapshot (rate + amount + category) so
--      vendor statements + ZATCA submissions can reproduce the
--      exact split.
--
-- The actual «withhold on payment» wiring in finance-purchase.ts
-- payment-run/execute is a SEPARATE PR — keeps schema review here
-- focused on the data model.

-- ── 1. wht_categories — per-company rate registry ────────────────────────
CREATE TABLE IF NOT EXISTS public.wht_categories (
  id                  serial PRIMARY KEY,
  "companyId"         integer NOT NULL,
  code                varchar(20) NOT NULL,
  name                varchar(100) NOT NULL,
  "nameEn"            varchar(100),
  rate                numeric(7,4) NOT NULL DEFAULT 0,    -- e.g. 15.0000 = 15%
  "appliesTo"         varchar(40) NOT NULL,               -- see ZATCA categories below
  "payableAccountId"  integer,                            -- WHT payable to ZATCA
  description         text,
  "isActive"          boolean DEFAULT true,
  "createdAt"         timestamp with time zone DEFAULT now(),
  "updatedAt"         timestamp with time zone DEFAULT now(),
  "deletedAt"         timestamp with time zone,
  CONSTRAINT wht_categories_company_code_uniq UNIQUE ("companyId", code),
  CONSTRAINT wht_categories_rate_check CHECK (rate >= 0 AND rate <= 100),
  CONSTRAINT wht_categories_applies_check CHECK (("appliesTo")::text = ANY (ARRAY[
    'royalties'::text,
    'technical_services'::text,
    'management_fees'::text,
    'dividends'::text,
    'interest'::text,
    'rent_movable'::text,
    'telecommunications'::text,
    'air_tickets'::text,
    'freight'::text,
    'insurance_premium'::text,
    'other'::text
  ]))
);

CREATE INDEX IF NOT EXISTS idx_wht_categories_active
  ON public.wht_categories ("companyId")
  WHERE "isActive" = true AND "deletedAt" IS NULL;

-- ── 2. Suppliers — residency status + default WHT ─────────────────────────
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS "residencyStatus"      varchar(20) DEFAULT 'resident',
  ADD COLUMN IF NOT EXISTS "taxResidenceCountry"  character(2),
  ADD COLUMN IF NOT EXISTS "defaultWhtRate"       numeric(7,4),
  ADD COLUMN IF NOT EXISTS "whtCategoryDefault"   varchar(20);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_residency_check') THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_residency_check
      CHECK ("residencyStatus" IS NULL OR ("residencyStatus")::text = ANY (ARRAY[
        'resident'::text,
        'non_resident_gcc'::text,
        'non_resident_treaty'::text,    -- has DTAA with Saudi
        'non_resident_other'::text
      ]));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_non_resident
  ON public.suppliers ("companyId", "residencyStatus")
  WHERE "residencyStatus" IS NOT NULL
    AND "residencyStatus" != 'resident'
    AND COALESCE("deletedAt", NULL) IS NULL;

-- ── 3. supplier_payment_allocations — WHT snapshot per allocation ─────────
--
-- When a payment voucher allocates against a supplier obligation,
-- the WHT amount, rate and category are snapshotted on the
-- allocation row. This lets vendor statements + ZATCA filings
-- reproduce exactly how the cash split (paid to supplier vs withheld
-- to ZATCA) was computed at payment time, even if the supplier's
-- default rate later changes.
ALTER TABLE public.supplier_payment_allocations
  ADD COLUMN IF NOT EXISTS "whtAmount"   numeric(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "whtRate"     numeric(7,4),
  ADD COLUMN IF NOT EXISTS "whtCategory" varchar(20);

CREATE INDEX IF NOT EXISTS idx_supplier_payment_allocations_wht
  ON public.supplier_payment_allocations ("companyId")
  WHERE "whtAmount" > 0 AND "deletedAt" IS NULL;

-- ── 4. Seed the default Saudi WHT categories for every company ───────────
DO $$
DECLARE
  c RECORD;
  payable_id integer;
BEGIN
  FOR c IN SELECT id FROM public.companies WHERE COALESCE(status, 'active') = 'active' LOOP
    -- ZATCA WHT payable account — try to resolve 2330 (post-VAT
    -- ZATCA liabilities) but tolerate it being absent.
    SELECT id INTO payable_id
      FROM public.chart_of_accounts
     WHERE "companyId" = c.id AND code = '2330'
     LIMIT 1;

    INSERT INTO public.wht_categories
      ("companyId", code, name, "nameEn", rate, "appliesTo", "payableAccountId", description)
    VALUES
      (c.id, 'WHT-ROY15',  'استقطاع الإتاوات 15%',           'WHT — Royalties 15%',
       15, 'royalties',         payable_id,
       'إتاوات وحقوق ملكية فكرية لغير المقيمين'),
      (c.id, 'WHT-TEC15',  'استقطاع خدمات فنية 15%',          'WHT — Technical Services 15%',
       15, 'technical_services', payable_id,
       'خدمات استشارية / فنية / مهنية لغير المقيمين'),
      (c.id, 'WHT-MGT20',  'استقطاع رسوم إدارة 20%',          'WHT — Management Fees 20%',
       20, 'management_fees',    payable_id,
       'أتعاب إدارية ومكافآت أداء لغير المقيمين'),
      (c.id, 'WHT-DIV5',   'استقطاع أرباح 5%',                'WHT — Dividends 5%',
       5,  'dividends',          payable_id, 'توزيعات أرباح لغير المقيمين'),
      (c.id, 'WHT-INT5',   'استقطاع فوائد 5%',                'WHT — Interest 5%',
       5,  'interest',           payable_id, 'فوائد لغير المقيمين'),
      (c.id, 'WHT-RNT5',   'استقطاع تأجير منقولات 5%',         'WHT — Rent of Movable 5%',
       5,  'rent_movable',       payable_id, 'تأجير منقولات لغير المقيمين'),
      (c.id, 'WHT-TEL5',   'استقطاع اتصالات 5%',              'WHT — Telecommunications 5%',
       5,  'telecommunications', payable_id, 'خدمات اتصالات لغير المقيمين'),
      (c.id, 'WHT-AIR5',   'استقطاع تذاكر طيران 5%',          'WHT — Air Tickets 5%',
       5,  'air_tickets',        payable_id, 'تذاكر طيران لغير المقيمين'),
      (c.id, 'WHT-FRT5',   'استقطاع شحن 5%',                  'WHT — Freight 5%',
       5,  'freight',            payable_id, 'شحن بحري/جوي/بري لغير المقيمين'),
      (c.id, 'WHT-INS5',   'استقطاع تأمين 5%',                'WHT — Insurance 5%',
       5,  'insurance_premium',  payable_id, 'أقساط تأمين لغير المقيمين')
    ON CONFLICT ("companyId", code) DO NOTHING;
  END LOOP;
END$$;
