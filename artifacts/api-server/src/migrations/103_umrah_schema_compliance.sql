-- ============================================================================
-- 074_umrah_schema_compliance.sql
--
-- Adds missing mandatory columns (companyId, branchId, createdBy, updatedBy,
-- updatedAt, deletedAt) to 4 sub-tables that were missing them:
--   1. employee_commission_tiers
--   2. umrah_import_changes
--   3. umrah_sales_invoice_items
--   4. umrah_payment_allocations
--
-- Idempotent via DO $$ IF NOT EXISTS pattern.
-- ============================================================================

-- 1. employee_commission_tiers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_commission_tiers' AND column_name='companyId') THEN
    ALTER TABLE employee_commission_tiers ADD COLUMN "companyId" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_commission_tiers' AND column_name='branchId') THEN
    ALTER TABLE employee_commission_tiers ADD COLUMN "branchId" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_commission_tiers' AND column_name='createdBy') THEN
    ALTER TABLE employee_commission_tiers ADD COLUMN "createdBy" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_commission_tiers' AND column_name='updatedBy') THEN
    ALTER TABLE employee_commission_tiers ADD COLUMN "updatedBy" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_commission_tiers' AND column_name='updatedAt') THEN
    ALTER TABLE employee_commission_tiers ADD COLUMN "updatedAt" TIMESTAMPTZ DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employee_commission_tiers' AND column_name='deletedAt') THEN
    ALTER TABLE employee_commission_tiers ADD COLUMN "deletedAt" TIMESTAMPTZ;
  END IF;
END $$;

-- 2. umrah_import_changes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_import_changes' AND column_name='companyId') THEN
    ALTER TABLE umrah_import_changes ADD COLUMN "companyId" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_import_changes' AND column_name='branchId') THEN
    ALTER TABLE umrah_import_changes ADD COLUMN "branchId" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_import_changes' AND column_name='createdBy') THEN
    ALTER TABLE umrah_import_changes ADD COLUMN "createdBy" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_import_changes' AND column_name='updatedBy') THEN
    ALTER TABLE umrah_import_changes ADD COLUMN "updatedBy" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_import_changes' AND column_name='updatedAt') THEN
    ALTER TABLE umrah_import_changes ADD COLUMN "updatedAt" TIMESTAMPTZ DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_import_changes' AND column_name='deletedAt') THEN
    ALTER TABLE umrah_import_changes ADD COLUMN "deletedAt" TIMESTAMPTZ;
  END IF;
END $$;

-- 3. umrah_sales_invoice_items
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_sales_invoice_items' AND column_name='companyId') THEN
    ALTER TABLE umrah_sales_invoice_items ADD COLUMN "companyId" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_sales_invoice_items' AND column_name='branchId') THEN
    ALTER TABLE umrah_sales_invoice_items ADD COLUMN "branchId" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_sales_invoice_items' AND column_name='createdBy') THEN
    ALTER TABLE umrah_sales_invoice_items ADD COLUMN "createdBy" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_sales_invoice_items' AND column_name='updatedBy') THEN
    ALTER TABLE umrah_sales_invoice_items ADD COLUMN "updatedBy" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_sales_invoice_items' AND column_name='updatedAt') THEN
    ALTER TABLE umrah_sales_invoice_items ADD COLUMN "updatedAt" TIMESTAMPTZ DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_sales_invoice_items' AND column_name='deletedAt') THEN
    ALTER TABLE umrah_sales_invoice_items ADD COLUMN "deletedAt" TIMESTAMPTZ;
  END IF;
END $$;

-- 4. umrah_payment_allocations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_payment_allocations' AND column_name='companyId') THEN
    ALTER TABLE umrah_payment_allocations ADD COLUMN "companyId" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_payment_allocations' AND column_name='branchId') THEN
    ALTER TABLE umrah_payment_allocations ADD COLUMN "branchId" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_payment_allocations' AND column_name='createdBy') THEN
    ALTER TABLE umrah_payment_allocations ADD COLUMN "createdBy" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_payment_allocations' AND column_name='updatedBy') THEN
    ALTER TABLE umrah_payment_allocations ADD COLUMN "updatedBy" INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_payment_allocations' AND column_name='updatedAt') THEN
    ALTER TABLE umrah_payment_allocations ADD COLUMN "updatedAt" TIMESTAMPTZ DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='umrah_payment_allocations' AND column_name='deletedAt') THEN
    ALTER TABLE umrah_payment_allocations ADD COLUMN "deletedAt" TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================================================
-- End of 074_umrah_schema_compliance.sql
-- ============================================================================
