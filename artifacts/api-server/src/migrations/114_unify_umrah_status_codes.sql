-- ============================================================================
-- 114_unify_umrah_status_codes.sql
--
-- Normalize pilgrim status values to the canonical lifecycle states:
--   inside_kingdom → arrived
--   overstay       → overstayed
--   exited         → departed
-- ============================================================================

UPDATE umrah_pilgrims SET status = 'arrived'   WHERE status = 'inside_kingdom';
UPDATE umrah_pilgrims SET status = 'overstayed' WHERE status = 'overstay';
UPDATE umrah_pilgrims SET status = 'departed'  WHERE status = 'exited';

-- Tighten the CHECK constraint to canonical values only
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
    'pending','arrived','active','overstayed','overstay_penalized',
    'departed','violated','absconded','deceased',
    'visa_rejected','visa_printed','cancelled'
  ));

-- ============================================================================
-- End of 114_unify_umrah_status_codes.sql
-- ============================================================================
