-- 279_lifecycle_tables_updated_at.sql
--
-- Operational-readiness fix (#1594 — write-path review).
--
-- PROBLEM
-- lifecycleEngine.applyTransition always appends `"updatedAt" = NOW()` to its
-- UPDATE (unless skipUpdatedAt). Five lifecycle-managed tables have createdAt
-- but NO updatedAt, so EVERY state transition on them crashes with
--   column "updatedAt" of relation "<table>" does not exist
-- This was caught live on purchase_orders: converting an approved purchase
-- request creates the PO, but `PATCH /purchase-orders/:id/approve` (→ the PO
-- lifecycle) 500'd, so a PO could be created but never approved/received —
-- the whole purchase→PO→GRN→GL chain was blocked. The same latent break
-- exists on fleet_maintenance, fleet_traffic_violations, payroll_runs and
-- umrah_penalties. Same root cause + fix as migration 252 (fleet_trips).
--
-- FIX
-- Add the standard updatedAt column to all five (additive, NOT NULL
-- DEFAULT now() — safe on a rolling deploy; IF NOT EXISTS so it is
-- idempotent and a no-op where a later schema already added it). Brings them
-- in line with every other lifecycle entity.
--
-- @rollback:
--   ALTER TABLE public.purchase_orders            DROP COLUMN IF EXISTS "updatedAt";
--   ALTER TABLE public.fleet_maintenance          DROP COLUMN IF EXISTS "updatedAt";
--   ALTER TABLE public.fleet_traffic_violations   DROP COLUMN IF EXISTS "updatedAt";
--   ALTER TABLE public.payroll_runs               DROP COLUMN IF EXISTS "updatedAt";
--   ALTER TABLE public.umrah_penalties            DROP COLUMN IF EXISTS "updatedAt";

ALTER TABLE public.purchase_orders          ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.fleet_maintenance        ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.fleet_traffic_violations ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.payroll_runs             ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.umrah_penalties          ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
