-- 230_portal_client_links.sql
--
-- WHAT:    add nullable clientId FK to `tenants` and `legal_cases` so the
--          customer portal can scope tenant/legal sections to the right
--          authenticated client (mirrors the existing `projects.clientId`
--          and `umrah_sub_agents.clientId` linkage).
-- WHY:     PR #1376 surfaced customer-type-aware sections in /portal/me
--          and added /portal/projects + /portal/umrah/*, but had to defer
--          property-tenant + legal-client sections because no FK existed.
--          Owner requested closing this. Adding the columns lets a single
--          portal account (bound to clients.id) see all relationships the
--          client holds — tenant of unit X, plaintiff/defendant in case Y —
--          without duplicating portal-account logic per relationship type.
-- SAFETY:  zero-downtime, additive only. Nullable columns + partial indexes.
--          Existing tenants / legal_cases rows stay clientId=NULL until an
--          operator links them via the existing CRM workflow (out of scope).
--          No backfill — the link is operational, not derivable, so we leave
--          it to the admin UI.
-- @rollback:
--   ALTER TABLE public.tenants DROP COLUMN IF EXISTS "clientId";
--   ALTER TABLE public.legal_cases DROP COLUMN IF EXISTS "clientId";
--   DROP INDEX IF EXISTS public.idx_tenants_company_client;
--   DROP INDEX IF EXISTS public.idx_legal_cases_company_client;
--   Safe at any time — both columns are nullable, no FK from other tables
--   depends on them.
-- ===========================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS "clientId" INTEGER REFERENCES public.clients(id);

ALTER TABLE public.legal_cases
  ADD COLUMN IF NOT EXISTS "clientId" INTEGER REFERENCES public.clients(id);

-- Partial indexes — only useful rows (where clientId actually points
-- somewhere) participate. Keeps the indexes small until adoption ramps up.
CREATE INDEX IF NOT EXISTS idx_tenants_company_client
  ON public.tenants ("companyId", "clientId")
  WHERE "clientId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_legal_cases_company_client
  ON public.legal_cases ("companyId", "clientId")
  WHERE "clientId" IS NOT NULL;
