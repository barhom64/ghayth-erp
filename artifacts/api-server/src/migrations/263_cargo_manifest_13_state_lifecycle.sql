-- 263_cargo_manifest_13_state_lifecycle.sql
--
-- @policy:breaking — this migration narrows the cargo_manifests.status
-- domain (three of the seven old names are no longer accepted). The
-- DROP+ADD is wrapped in a BEGIN/COMMIT, the same transaction does the
-- data rename, and the new route code only writes the new alphabet, so
-- there is no rolling-deploy window where old code writes a banned
-- value. Old rows are migrated semantically (confirmed→approved,
-- loading→loaded, closed→completed) — see the body below.
--
-- @rollback:
--   UPDATE cargo_manifests SET status = 'confirmed' WHERE status IN ('requested','approved','assigned_to_driver','driver_accepted');
--   UPDATE cargo_manifests SET status = 'loading'   WHERE status IN ('trip_started','arrived_pickup','loaded');
--   UPDATE cargo_manifests SET status = 'in_transit' WHERE status IN ('arrived_delivery');
--   UPDATE cargo_manifests SET status = 'closed'    WHERE status = 'completed';
--   ALTER TABLE cargo_manifests DROP CONSTRAINT IF EXISTS cargo_manifests_status_check;
--   ALTER TABLE cargo_manifests ADD CONSTRAINT cargo_manifests_status_check
--     CHECK (status IN ('draft','confirmed','loading','in_transit','delivered','closed','cancelled'));
--
-- #1733 Blocker #3 — expand the cargo lifecycle from 7 to 13 states.
--
-- #1733 mandates a granular, audit-friendly cargo flow:
--
--   Draft → Requested → Approved → AssignedToDriver → DriverAccepted →
--   TripStarted → ArrivedPickup → Loaded → InTransit → ArrivedDelivery →
--   Delivered → Completed
--
-- The pre-#1733 system collapsed 6 of those into 3 (`confirmed`, `loading`,
-- `closed`) which lost the audit granularity an operator needs to answer
-- "where exactly is the bottleneck?" (driver hasn't accepted? truck
-- hasn't arrived at pickup? loaded but not departed?).
--
-- Mapping for existing rows (semantically closest target):
--
--   draft       → draft         (unchanged)
--   confirmed   → approved      (dispatcher approval is the closest meaning)
--   loading     → loaded        (the old "loading" implied the load was on)
--   in_transit  → in_transit    (unchanged)
--   delivered   → delivered     (unchanged)
--   closed      → completed     (semantic rename)
--   cancelled   → cancelled     (unchanged)
--
-- Three new "process" states (requested, assigned_to_driver,
-- driver_accepted, trip_started, arrived_pickup, arrived_delivery) have
-- no analog in the 7-state world — they are forward-only progress
-- markers a manifest can only enter once new code starts emitting them.
-- This migration is therefore additive: no existing row lands in an
-- unreachable state.

BEGIN;

-- 1. Drop the old constraint so the rename UPDATEs aren't refused.
ALTER TABLE public.cargo_manifests
  DROP CONSTRAINT IF EXISTS cargo_manifests_status_check;

-- 2. Rename the three renamed states. Wrapped so a half-migration can't
--    leave the table in a constraint-less limbo.
UPDATE public.cargo_manifests SET status = 'approved'  WHERE status = 'confirmed';
UPDATE public.cargo_manifests SET status = 'loaded'    WHERE status = 'loading';
UPDATE public.cargo_manifests SET status = 'completed' WHERE status = 'closed';

-- 3. Re-add the constraint with the full 13-state alphabet.
ALTER TABLE public.cargo_manifests
  ADD CONSTRAINT cargo_manifests_status_check CHECK (
    status::text = ANY (ARRAY[
      'draft',
      'requested',
      'approved',
      'assigned_to_driver',
      'driver_accepted',
      'trip_started',
      'arrived_pickup',
      'loaded',
      'in_transit',
      'arrived_delivery',
      'delivered',
      'completed',
      'cancelled'
    ]::text[])
  );

COMMIT;
