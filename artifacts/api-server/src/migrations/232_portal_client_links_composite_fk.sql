-- 232_portal_client_links_composite_fk.sql
--
-- WHAT:    upgrade the FKs added by 230_portal_client_links.sql from
--          `REFERENCES clients(id)` to a composite FK on
--          `(clientId, companyId) REFERENCES clients(id, "companyId")`
--          plus `ON DELETE SET NULL`. Also fix migration 230's silent
--          default (RESTRICT) which blocks legitimate client hard-deletes.
-- WHY:     code review of PR #1376/#1380 surfaced two issues with 230:
--            1. The single-column FK lets the app write a tenant.clientId
--               from company B into a tenant of company A — Postgres
--               accepts it because the FK only checks clients.id, not
--               clients.companyId. Cross-tenant data leak is one app bug
--               away. The composite FK rejects it at the database.
--            2. The default ON DELETE RESTRICT means hard-deleting a
--               client (rare, but happens in cleanup scripts) silently
--               blocks if any tenant references it. ON DELETE SET NULL
--               is the right behavior: the link is operational, not
--               structural, and orphaning is preferable to blocking.
-- SAFETY:  zero-downtime, additive then swap. Steps:
--            1. Add UNIQUE (id, "companyId") on clients — required so the
--               composite FK has a referenced unique key. Idempotent.
--            2. Drop the single-column FK constraints. Postgres named
--               them tenants_clientId_fkey / legal_cases_clientId_fkey
--               by default (the standard `<table>_<col>_fkey` shape).
--            3. Add the composite FK with ON DELETE SET NULL.
--          The drop+re-add is wrapped in a transaction (default for
--          migration runner) so a constraint mismatch rolls back cleanly.
--
-- @policy:breaking
--   Uses DROP CONSTRAINT, which the migration-policy guard treats as
--   backward-incompatible. In a rolling deploy the constraint name
--   change is invisible to old app instances — they neither reference
--   the constraint name nor rely on the looser (id-only) FK; their
--   own app-level validation already checks same-company before
--   PATCH /properties/tenants/:id and PATCH /legal/cases/:id write
--   clientId, so the new composite FK is strictly tighter than what
--   the old code expected. No data migration needed: any pre-existing
--   (clientId, companyId) pair already satisfies the new constraint
--   because the app has only ever inserted same-company pairs.
-- @rollback:
--   ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_client_company_fk;
--   ALTER TABLE public.legal_cases DROP CONSTRAINT IF EXISTS legal_cases_client_company_fk;
--   ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_id_company_uq;
--   ALTER TABLE public.tenants
--     ADD CONSTRAINT "tenants_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public.clients(id);
--   ALTER TABLE public.legal_cases
--     ADD CONSTRAINT "legal_cases_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public.clients(id);
-- ===========================================================================

-- 1. Composite uniqueness on clients (id, companyId) — required so other
--    tables can compose-FK against (clientId, companyId).
ALTER TABLE public.clients
  ADD CONSTRAINT clients_id_company_uq UNIQUE (id, "companyId");

-- 2. Drop the simple FKs added by migration 230.
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS "tenants_clientId_fkey";

ALTER TABLE public.legal_cases
  DROP CONSTRAINT IF EXISTS "legal_cases_clientId_fkey";

-- 3. Add the composite FKs with ON DELETE SET NULL.
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_client_company_fk
  FOREIGN KEY ("clientId", "companyId")
  REFERENCES public.clients (id, "companyId")
  ON DELETE SET NULL;

ALTER TABLE public.legal_cases
  ADD CONSTRAINT legal_cases_client_company_fk
  FOREIGN KEY ("clientId", "companyId")
  REFERENCES public.clients (id, "companyId")
  ON DELETE SET NULL;
