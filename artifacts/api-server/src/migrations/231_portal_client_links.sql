-- 231_portal_client_links.sql
--
-- WHAT:    add nullable clientId FK to `tenants` and `legal_cases` so the
--          customer portal can scope tenant/legal sections to the right
--          authenticated client (mirrors the existing `projects.clientId`
--          and `umrah_sub_agents.clientId` linkage).
--
--          FK is **composite** on (clientId, companyId) referencing
--          clients(id, "companyId") so cross-tenant linking is impossible
--          at the database layer — not just by app-level checks.
--
-- WHY:     PR #1376 surfaced customer-type-aware sections in /portal/me
--          and added /portal/projects + /portal/umrah/*, but had to defer
--          property-tenant + legal-client sections because no FK existed.
--          A simple `REFERENCES clients(id)` would let any application
--          bug write a clientId from company B into a tenant of company A;
--          the composite FK rejects that at the database, defense-in-depth.
-- SAFETY:  zero-downtime, additive only. Nullable columns + partial indexes.
--          Existing tenants / legal_cases rows stay clientId=NULL until an
--          operator links them via the existing CRM workflow (out of scope).
--          No backfill — the link is operational, not derivable, so we leave
--          it to the admin UI. ON DELETE SET NULL so hard-deleting a client
--          quietly unlinks rather than blocking the delete with RESTRICT.
-- @rollback:
--   ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_client_company_fk;
--   ALTER TABLE public.legal_cases DROP CONSTRAINT IF EXISTS legal_cases_client_company_fk;
--   ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_id_company_uq;
--   ALTER TABLE public.tenants DROP COLUMN IF EXISTS "clientId";
--   ALTER TABLE public.legal_cases DROP COLUMN IF EXISTS "clientId";
--   DROP INDEX IF EXISTS public.idx_tenants_company_client;
--   DROP INDEX IF EXISTS public.idx_legal_cases_company_client;
--   Safe at any time — both columns are nullable, no FK from other tables
--   depends on them.
-- ===========================================================================

-- 1. Composite uniqueness on clients (id, companyId).
--    Required so other tables can compose-FK against (clientId, companyId)
--    and have Postgres enforce same-company linkage.
ALTER TABLE public.clients
  ADD CONSTRAINT clients_id_company_uq UNIQUE (id, "companyId");

-- 2. tenants.clientId — nullable, composite FK enforces same-company.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS "clientId" INTEGER;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_client_company_fk
  FOREIGN KEY ("clientId", "companyId")
  REFERENCES public.clients (id, "companyId")
  ON DELETE SET NULL;

-- 3. legal_cases.clientId — same shape.
ALTER TABLE public.legal_cases
  ADD COLUMN IF NOT EXISTS "clientId" INTEGER;

ALTER TABLE public.legal_cases
  ADD CONSTRAINT legal_cases_client_company_fk
  FOREIGN KEY ("clientId", "companyId")
  REFERENCES public.clients (id, "companyId")
  ON DELETE SET NULL;

-- 4. Partial indexes — only useful rows (where clientId actually points
--    somewhere) participate. Keeps the indexes small until adoption ramps up.
CREATE INDEX IF NOT EXISTS idx_tenants_company_client
  ON public.tenants ("companyId", "clientId")
  WHERE "clientId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_legal_cases_company_client
  ON public.legal_cases ("companyId", "clientId")
  WHERE "clientId" IS NOT NULL;
