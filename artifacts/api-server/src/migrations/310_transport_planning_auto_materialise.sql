-- 310_transport_planning_auto_materialise.sql
--
-- WHAT: add `autoMaterialiseEnabled` boolean column to
--       transport_planning_settings (default FALSE) so the new daily
--       cron job materialises route patterns for the next operational
--       day only on companies that explicitly opt in.
--
-- WHY:  #2079 audit TA-CONF-01 finding — transport-route-patterns.ts
--       claimed "Materialised … by the daily cron" but no such job
--       existed in cronScheduler.ts. A dispatcher relying on the
--       promise would lose tomorrow's bookings silently. We add the
--       job in the same commit and gate it behind this opt-in to
--       keep existing tenants on the manual materialise path until
--       they consciously flip the switch (ops review of every
--       company's active patterns + their activeFrom/Until windows
--       before automation is non-trivial — manual stays the safe
--       default).
--
-- SAFETY: pure additive. Default FALSE preserves current behaviour
--         for every existing company; only a deliberate UPDATE turns
--         it on. The cron handler short-circuits on FALSE without
--         querying any pattern.
--
-- @rollback: BEGIN;
--              ALTER TABLE transport_planning_settings
--                DROP COLUMN IF EXISTS "autoMaterialiseEnabled";
--            COMMIT;

BEGIN;

ALTER TABLE transport_planning_settings
  ADD COLUMN IF NOT EXISTS "autoMaterialiseEnabled" BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN transport_planning_settings."autoMaterialiseEnabled" IS
  'Opt-in for the daily cron (materialise_due_route_patterns @ 06:30 Riyadh). '
  'When TRUE: active patterns whose daysOfWeekMask matches tomorrow (Riyadh) '
  'and whose activeFrom..activeUntil window contains tomorrow are materialised '
  'into a draft transport_booking. Idempotent on (companyId, bookingNumber).';

COMMIT;
