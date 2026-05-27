-- 223_finance_enforce_line_allocation.sql
--
-- @rollback:
--   DROP TABLE public.allocation_override_log;
--   DELETE FROM public.system_settings
--      WHERE key = 'finance.enforce_line_allocation'
--        AND "companyId" IS NULL AND "branchId" IS NULL;
--   Safe at any time — no other table FKs allocation_override_log, and
--   the system_settings row is just a seed default.
--
-- Finance Line-Level Allocation — Phase 5 P2 (Enforcement).
--
-- The resolver (accountingAllocation.resolveLineAllocation) already
-- returns status='unmapped' for lines that don't match any rule.
-- Approval endpoints currently *log* the resolution but fall back to
-- the generic invoice_revenue / generic expense account so the journal
-- still posts. That keeps the books moving but defeats the dimensional
-- reporting we built the resolver for.
--
-- This migration adds the enforcement substrate:
--
--   1. system_settings key `finance.enforce_line_allocation`
--      (false by default → legacy behavior; flip per-company to opt in)
--
--   2. allocation_override_log audit trail — records every approval that
--      went through with unmapped lines while enforcement was ON,
--      together with the actor + reason + the original blockers list.
--      The blocker JSON lets compliance reconstruct what the resolver
--      flagged at approval time even after rules change.
--
-- Permission gate `finance.allocation.override` is added in
-- featureCatalog.ts (no schema needed — RBAC reads from code).

-- ── 1. allocation_override_log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.allocation_override_log (
    id                      bigserial PRIMARY KEY,
    "companyId"             integer NOT NULL,
    "branchId"              integer,
    "actorAssignmentId"     integer,
    "actorUserId"           integer,
    "documentType"          varchar(40) NOT NULL,        -- invoice|purchase|grn|expense|...
    "documentId"            bigint NOT NULL,
    "sourceTable"           varchar(40) NOT NULL,        -- invoice_lines|purchase_order_items|...
    "blockersJson"          jsonb NOT NULL DEFAULT '[]'::jsonb,
    "overrideReason"        text NOT NULL,
    "createdAt"             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_allocation_override_log_company
  ON public.allocation_override_log ("companyId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_allocation_override_log_doc
  ON public.allocation_override_log ("companyId", "documentType", "documentId");

CREATE INDEX IF NOT EXISTS idx_allocation_override_log_actor
  ON public.allocation_override_log ("actorAssignmentId", "createdAt" DESC);

COMMENT ON TABLE public.allocation_override_log IS
  'Audit trail for approvals that bypassed enforce_line_allocation. One row per approve call that contained unmapped lines.';

-- ── 2. Seed system-wide default for the enforce flag ──────────────────────
-- Ensure branchId exists (businessHelpers.ts already reads it but no
-- earlier migration explicitly added it, so we keep this idempotent
-- guard for fresh DBs / dev resets).
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS "branchId" integer;

-- Safe to re-run — guarded by NOT EXISTS so we don't depend on which
-- unique index is present (the table has shifted between (companyId,key)
-- and (companyId,branchId,key) historically).
INSERT INTO public.system_settings ("companyId", "branchId", key, value)
SELECT NULL::int, NULL::int, 'finance.enforce_line_allocation', 'false'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings
   WHERE key = 'finance.enforce_line_allocation'
     AND "companyId" IS NULL
     AND "branchId" IS NULL
);
