-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 016: Extended financial metadata fields for journal_entries
-- Adds: costCenter, departmentId, relatedEntityType/Id, paymentMethod,
--       reference, isPaid, attachmentUrl, attachmentType, expenseType,
--       operationType to journal_entries for richer expense/voucher tracking
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='journal_entries' AND column_name='costCenter') THEN
    ALTER TABLE journal_entries ADD COLUMN "costCenter" VARCHAR(150);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='journal_entries' AND column_name='departmentId') THEN
    ALTER TABLE journal_entries ADD COLUMN "departmentId" INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='journal_entries' AND column_name='relatedEntityType') THEN
    ALTER TABLE journal_entries ADD COLUMN "relatedEntityType" VARCHAR(50);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='journal_entries' AND column_name='relatedEntityId') THEN
    ALTER TABLE journal_entries ADD COLUMN "relatedEntityId" INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='journal_entries' AND column_name='paymentMethod') THEN
    ALTER TABLE journal_entries ADD COLUMN "paymentMethod" VARCHAR(50) DEFAULT 'cash';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='journal_entries' AND column_name='reference') THEN
    ALTER TABLE journal_entries ADD COLUMN "reference" VARCHAR(200);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='journal_entries' AND column_name='isPaid') THEN
    ALTER TABLE journal_entries ADD COLUMN "isPaid" BOOLEAN DEFAULT TRUE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='journal_entries' AND column_name='attachmentUrl') THEN
    ALTER TABLE journal_entries ADD COLUMN "attachmentUrl" TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='journal_entries' AND column_name='attachmentType') THEN
    ALTER TABLE journal_entries ADD COLUMN "attachmentType" VARCHAR(50);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='journal_entries' AND column_name='expenseType') THEN
    ALTER TABLE journal_entries ADD COLUMN "expenseType" VARCHAR(50);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='journal_entries' AND column_name='operationType') THEN
    ALTER TABLE journal_entries ADD COLUMN "operationType" VARCHAR(50);
  END IF;
END $$;

-- Add a chart_of_accounts entry for insurance prepaid (1350) if not exists
INSERT INTO chart_of_accounts ("companyId", code, name, type)
SELECT c.id, '1350', 'تأمينات مدفوعة مقدماً', 'asset'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca."companyId" = c.id AND ca.code = '1350'
)
ON CONFLICT DO NOTHING;

-- Add 4100 Rental Revenue account if not exists
INSERT INTO chart_of_accounts ("companyId", code, name, type)
SELECT c.id, '4100', 'إيرادات الإيجار', 'revenue'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca."companyId" = c.id AND ca.code = '4100'
)
ON CONFLICT DO NOTHING;

-- Add 1400 VAT Input Tax account if not exists
INSERT INTO chart_of_accounts ("companyId", code, name, type)
SELECT c.id, '1400', 'ضريبة القيمة المضافة – مدخلات', 'asset'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca."companyId" = c.id AND ca.code = '1400'
)
ON CONFLICT DO NOTHING;

-- Add 2300 VAT Output Tax account if not exists
INSERT INTO chart_of_accounts ("companyId", code, name, type)
SELECT c.id, '2300', 'ضريبة القيمة المضافة – مخرجات', 'liability'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca."companyId" = c.id AND ca.code = '2300'
)
ON CONFLICT DO NOTHING;

-- Add 1110 Bank Account if not exists
INSERT INTO chart_of_accounts ("companyId", code, name, type)
SELECT c.id, '1110', 'حساب البنك', 'asset'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca."companyId" = c.id AND ca.code = '1110'
)
ON CONFLICT DO NOTHING;

-- Add 5400 Legal Fees account if not exists
INSERT INTO chart_of_accounts ("companyId", code, name, type)
SELECT c.id, '5400', 'أتعاب قانونية ومحاماة', 'expense'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca."companyId" = c.id AND ca.code = '5400'
)
ON CONFLICT DO NOTHING;

-- Add 2100 Accounts Payable if not exists
INSERT INTO chart_of_accounts ("companyId", code, name, type)
SELECT c.id, '2100', 'ذمم دائنة', 'liability'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts ca WHERE ca."companyId" = c.id AND ca.code = '2100'
)
ON CONFLICT DO NOTHING;
