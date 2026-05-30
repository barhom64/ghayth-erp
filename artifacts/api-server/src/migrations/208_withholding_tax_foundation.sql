-- 208_withholding_tax_foundation.sql
-- Saudi Withholding Tax foundation. Idempotent for schema dumps where
-- wht_categories already exists with a NOT NULL id but no default sequence.

DO $$
BEGIN
  IF pg_get_serial_sequence('public.wht_categories','id') IS NULL THEN
    CREATE SEQUENCE IF NOT EXISTS public.wht_categories_id_seq;
    PERFORM setval('public.wht_categories_id_seq', COALESCE((SELECT MAX(id) FROM public.wht_categories), 0) + 1, false);
    ALTER TABLE public.wht_categories ALTER COLUMN id SET DEFAULT nextval('public.wht_categories_id_seq');
    ALTER SEQUENCE public.wht_categories_id_seq OWNED BY public.wht_categories.id;
  END IF;
END $$;

ALTER TABLE public.wht_categories
  ADD COLUMN IF NOT EXISTS "nameEn" varchar(100),
  ADD COLUMN IF NOT EXISTS "payableAccountId" integer,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS "isActive" boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_wht_categories_active
  ON public.wht_categories ("companyId")
  WHERE "isActive" = true AND "deletedAt" IS NULL;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS "residencyStatus" varchar(20) DEFAULT 'resident',
  ADD COLUMN IF NOT EXISTS "taxResidenceCountry" character(2),
  ADD COLUMN IF NOT EXISTS "defaultWhtRate" numeric(7,4),
  ADD COLUMN IF NOT EXISTS "whtCategoryDefault" varchar(20);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_residency_check') THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_residency_check
      CHECK ("residencyStatus" IS NULL OR ("residencyStatus")::text = ANY (ARRAY[
        'resident'::text,
        'non_resident_gcc'::text,
        'non_resident_treaty'::text,
        'non_resident_other'::text
      ]));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_non_resident
  ON public.suppliers ("companyId", "residencyStatus")
  WHERE "residencyStatus" IS NOT NULL
    AND "residencyStatus" != 'resident'
    AND COALESCE("deletedAt", NULL) IS NULL;

ALTER TABLE public.supplier_payment_allocations
  ADD COLUMN IF NOT EXISTS "whtAmount" numeric(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "whtRate" numeric(7,4),
  ADD COLUMN IF NOT EXISTS "whtCategory" varchar(20);

CREATE INDEX IF NOT EXISTS idx_supplier_payment_allocations_wht
  ON public.supplier_payment_allocations ("companyId")
  WHERE "whtAmount" > 0 AND "deletedAt" IS NULL;

DO $$
DECLARE
  c RECORD;
  payable_id integer;
BEGIN
  FOR c IN SELECT id FROM public.companies WHERE COALESCE(status, 'active') = 'active' LOOP
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
