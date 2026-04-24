-- ============================================================================
-- 073_payroll_commission_column.sql
--
-- Adds a commission column to payroll_lines for Umrah commission integration.
-- Idempotent via IF NOT EXISTS pattern.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='payroll_lines' AND column_name='commission'
  ) THEN
    ALTER TABLE payroll_lines ADD COLUMN commission NUMERIC(12,2) DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- End of 073_payroll_commission_column.sql
-- ============================================================================
