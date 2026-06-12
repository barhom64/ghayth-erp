-- 290_project_phases_lifecycle_columns.sql
--
-- Fix: completing a project phase has ALWAYS 500'd (#1594 projects package).
--
-- PROBLEM (verified live)
-- PATCH /projects/:id/phases/:phaseId/complete runs applyTransition on
-- project_phases, but lifecycleEngine hard-codes its tenancy seatbelt
--   SELECT … WHERE id = $1 AND "companyId" = $2 FOR UPDATE
-- and appends "updatedAt" = NOW() — and project_phases has NEITHER column.
-- Every phase completion crashes with `column "companyId" does not exist`,
-- which also makes milestone billing unreachable (the invoice fires after the
-- transition). A sweep of ALL 33 lifecycle-managed tables found the other two
-- gaps (inventory_counts, property_security_deposits — updatedAt only) already
-- carry documented skipUpdatedAt workarounds; project_phases is the only table
-- that is actually broken, because the companyId seatbelt cannot be skipped.
--
-- FIX
-- Bring project_phases up to the lifecycle-engine contract (same class as
-- migrations 252/279/284): add companyId (backfilled from the owning project;
-- kept nullable so the migration is non-breaking — orphan rows simply stay
-- invisible to transitions) and the standard updatedAt.
--
-- @rollback:
--   ALTER TABLE public.project_phases DROP COLUMN IF EXISTS "companyId";
--   ALTER TABLE public.project_phases DROP COLUMN IF EXISTS "updatedAt";

ALTER TABLE public.project_phases ADD COLUMN IF NOT EXISTS "companyId" integer;

UPDATE project_phases ph
   SET "companyId" = p."companyId"
  FROM projects p
 WHERE ph."projectId" = p.id
   AND ph."companyId" IS NULL;

ALTER TABLE public.project_phases ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS project_phases_company_idx
  ON public.project_phases ("companyId", "projectId") WHERE "deletedAt" IS NULL;
