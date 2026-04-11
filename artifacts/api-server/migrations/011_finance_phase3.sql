ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS classification VARCHAR(50) DEFAULT 'active';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'invoice_collection_stages') THEN
    CREATE TABLE invoice_collection_stages (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL,
      "invoiceId" INTEGER NOT NULL,
      stage INTEGER NOT NULL,
      "stageName" VARCHAR(100) NOT NULL,
      notes TEXT,
      "performedBy" INTEGER,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'collection_follow_ups') THEN
    CREATE TABLE collection_follow_ups (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL,
      "invoiceId" INTEGER NOT NULL,
      "scheduledDate" DATE NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'reminder',
      notes TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      "assignedTo" INTEGER,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'deliveredAt') THEN
    ALTER TABLE purchase_orders ADD COLUMN "deliveredAt" TIMESTAMPTZ;
  END IF;
END $$;

INSERT INTO chart_of_accounts ("companyId", code, name, type, status)
SELECT c.id, '5100', 'مصروف رواتب', 'expense', 'active'
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE "companyId" = c.id AND code = '5100')
ON CONFLICT DO NOTHING;

INSERT INTO chart_of_accounts ("companyId", code, name, type, status)
SELECT c.id, '5110', 'مصروف GOSI صاحب العمل', 'expense', 'active'
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE "companyId" = c.id AND code = '5110')
ON CONFLICT DO NOTHING;

INSERT INTO chart_of_accounts ("companyId", code, name, type, status)
SELECT c.id, '2200', 'مستحقات GOSI', 'liability', 'active'
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE "companyId" = c.id AND code = '2200')
ON CONFLICT DO NOTHING;

INSERT INTO chart_of_accounts ("companyId", code, name, type, status)
SELECT c.id, '2210', 'خصومات مستحقة', 'liability', 'active'
FROM companies c
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE "companyId" = c.id AND code = '2210')
ON CONFLICT DO NOTHING;
