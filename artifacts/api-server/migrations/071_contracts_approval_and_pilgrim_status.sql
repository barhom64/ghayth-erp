-- ============================================================================
-- 071_contracts_approval_and_pilgrim_status.sql
--
-- Two follow-ups from the systematic DB/frontend audit:
--
-- 1. employee_contracts is missing approvedBy / approvedAt columns that the
--    approval workflow in hr-contracts.ts writes to.
-- 2. umrah_pilgrims status CHECK constraint does not allow 'overstay_penalized'
--    which the penalty engine sets after invoicing an overstay.
-- ============================================================================

-- 1. Contract approval metadata
ALTER TABLE employee_contracts
  ADD COLUMN IF NOT EXISTS "approvedBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP;

-- 2. Widen pilgrim status CHECK to accept 'overstay_penalized'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'umrah_pilgrims_status_check'
  ) THEN
    ALTER TABLE umrah_pilgrims DROP CONSTRAINT umrah_pilgrims_status_check;
  END IF;
END$$;

ALTER TABLE umrah_pilgrims
  ADD CONSTRAINT umrah_pilgrims_status_check
  CHECK (status IN (
    'pending','arrived','active','inside_kingdom','overstayed','overstay',
    'overstay_penalized','departed','exited','violated','absconded',
    'deceased','visa_rejected','visa_printed','cancelled'
  ));

-- ============================================================================
-- End of 071_contracts_approval_and_pilgrim_status.sql
-- ============================================================================
