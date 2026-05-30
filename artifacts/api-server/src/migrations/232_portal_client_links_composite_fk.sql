-- 232_portal_client_links_composite_fk.sql
-- Idempotent composite client/company FK hardening.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clients_id_company_uq'
      AND conrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_id_company_uq UNIQUE (id, "companyId");
  END IF;
END $$;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS "tenants_clientId_fkey";

ALTER TABLE public.legal_cases
  DROP CONSTRAINT IF EXISTS "legal_cases_clientId_fkey";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_client_company_fk'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_client_company_fk
      FOREIGN KEY ("clientId", "companyId")
      REFERENCES public.clients (id, "companyId")
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'legal_cases_client_company_fk'
      AND conrelid = 'public.legal_cases'::regclass
  ) THEN
    ALTER TABLE public.legal_cases
      ADD CONSTRAINT legal_cases_client_company_fk
      FOREIGN KEY ("clientId", "companyId")
      REFERENCES public.clients (id, "companyId")
      ON DELETE SET NULL;
  END IF;
END $$;
