-- 233_clientid_composite_fk_sweep.sql
--
-- WHAT:    extend the composite-FK pattern (introduced for tenants +
--          legal_cases in migration 232) to every other operational
--          table that carries a `clientId` column alongside a
--          `companyId` column. Each gets a composite FK on
--          (clientId, companyId) referencing clients(id, "companyId")
--          so cross-tenant linking is rejected at the database, not
--          just at the application layer.
--
-- WHY:     PR #1386 closed the cross-tenant write window for
--          tenants + legal_cases. The same window remained open for
--          all the other tables added across the system's growth:
--          invoices, customer_advances, credit/debit memos, dunning
--          letters, projects, support_tickets, tasks, CRM contacts +
--          opportunities, umrah_sub_agents, umrah_sales_invoices,
--          fleet_trips, vouchers, pricing_rule_applications.
--          Each is a one-app-bug-away from leaking cross-tenant data.
--          Tightening every FK closes that class of bug for good.
--
-- SAFETY:  ADD CONSTRAINT … NOT VALID enforces the rule on every
--          NEW write immediately, but skips validating pre-existing
--          rows. Production deployments can run VALIDATE CONSTRAINT
--          asynchronously per-table during low-traffic windows
--          without holding the table lock. If a row fails validation
--          (i.e. a pre-existing cross-tenant clientId from before
--          this fix), it's surfaced as an operational issue to clean
--          up in CRM, not a deploy blocker.
--
--          The clients_id_company_uq UNIQUE constraint required as
--          the referenced key was added in migration 232 — this
--          migration reuses it.
--
-- @policy:breaking
--   DROP CONSTRAINT IF EXISTS is technically a backward-incompatible
--   statement in the migration-policy guard. In a rolling deploy
--   the constraint NAME change is invisible to old app instances:
--   they never reference the constraint name, and their existing
--   app-level same-company validation already produces FK-compatible
--   writes. The replacement constraint is strictly tighter than
--   what the old code expected. No data migration needed.
-- @rollback:
--   For each table below, in reverse order:
--     ALTER TABLE public.<table> DROP CONSTRAINT IF EXISTS <table>_client_company_fk;
--     ALTER TABLE public.<table> ADD CONSTRAINT "<table>_clientId_fkey"
--       FOREIGN KEY ("clientId") REFERENCES public.clients(id);
-- ===========================================================================

-- Helper: each table follows the same three-step shape:
--   1. drop the old single-column FK (if it exists)
--   2. add the composite FK NOT VALID — enforces from now on
-- Tables touched: 16. All have both clientId and companyId columns.

-- ─── Finance ────────────────────────────────────────────────────────────────
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS "invoices_clientId_fkey";
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_client_company_fk;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE public.credit_memos
  DROP CONSTRAINT IF EXISTS "credit_memos_clientId_fkey";
ALTER TABLE public.credit_memos
  DROP CONSTRAINT IF EXISTS credit_memos_client_company_fk;
ALTER TABLE public.credit_memos
  ADD CONSTRAINT credit_memos_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE public.debit_memos
  DROP CONSTRAINT IF EXISTS "debit_memos_clientId_fkey";
ALTER TABLE public.debit_memos
  DROP CONSTRAINT IF EXISTS debit_memos_client_company_fk;
ALTER TABLE public.debit_memos
  ADD CONSTRAINT debit_memos_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE public.customer_advances
  DROP CONSTRAINT IF EXISTS "customer_advances_clientId_fkey";
ALTER TABLE public.customer_advances
  DROP CONSTRAINT IF EXISTS customer_advances_client_company_fk;
ALTER TABLE public.customer_advances
  ADD CONSTRAINT customer_advances_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE public.dunning_letters
  DROP CONSTRAINT IF EXISTS "dunning_letters_clientId_fkey";
ALTER TABLE public.dunning_letters
  DROP CONSTRAINT IF EXISTS dunning_letters_client_company_fk;
ALTER TABLE public.dunning_letters
  ADD CONSTRAINT dunning_letters_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE public.vouchers
  DROP CONSTRAINT IF EXISTS "vouchers_clientId_fkey";
ALTER TABLE public.vouchers
  DROP CONSTRAINT IF EXISTS vouchers_client_company_fk;
ALTER TABLE public.vouchers
  ADD CONSTRAINT vouchers_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE public.pricing_rule_applications
  DROP CONSTRAINT IF EXISTS "pricing_rule_applications_clientId_fkey";
ALTER TABLE public.pricing_rule_applications
  DROP CONSTRAINT IF EXISTS pricing_rule_applications_client_company_fk;
ALTER TABLE public.pricing_rule_applications
  ADD CONSTRAINT pricing_rule_applications_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;

-- ─── CRM ────────────────────────────────────────────────────────────────────
ALTER TABLE public.crm_opportunities
  DROP CONSTRAINT IF EXISTS "crm_opportunities_clientId_fkey";
ALTER TABLE public.crm_opportunities
  DROP CONSTRAINT IF EXISTS crm_opportunities_client_company_fk;
ALTER TABLE public.crm_opportunities
  ADD CONSTRAINT crm_opportunities_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE public.crm_contacts
  DROP CONSTRAINT IF EXISTS "crm_contacts_clientId_fkey";
ALTER TABLE public.crm_contacts
  DROP CONSTRAINT IF EXISTS crm_contacts_client_company_fk;
ALTER TABLE public.crm_contacts
  ADD CONSTRAINT crm_contacts_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;

-- ─── Projects + Tasks + Support ─────────────────────────────────────────────
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS "projects_clientId_fkey";
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_client_company_fk;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS "support_tickets_clientId_fkey";
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_client_company_fk;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS "tasks_clientId_fkey";
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_client_company_fk;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;

-- ─── Umrah + Fleet ──────────────────────────────────────────────────────────
ALTER TABLE public.umrah_sub_agents
  DROP CONSTRAINT IF EXISTS "umrah_sub_agents_clientId_fkey";
ALTER TABLE public.umrah_sub_agents
  DROP CONSTRAINT IF EXISTS umrah_sub_agents_client_company_fk;
ALTER TABLE public.umrah_sub_agents
  ADD CONSTRAINT umrah_sub_agents_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE public.umrah_sales_invoices
  DROP CONSTRAINT IF EXISTS "umrah_sales_invoices_clientId_fkey";
ALTER TABLE public.umrah_sales_invoices
  DROP CONSTRAINT IF EXISTS umrah_sales_invoices_client_company_fk;
ALTER TABLE public.umrah_sales_invoices
  ADD CONSTRAINT umrah_sales_invoices_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;

ALTER TABLE public.fleet_trips
  DROP CONSTRAINT IF EXISTS "fleet_trips_clientId_fkey";
ALTER TABLE public.fleet_trips
  DROP CONSTRAINT IF EXISTS fleet_trips_client_company_fk;
ALTER TABLE public.fleet_trips
  ADD CONSTRAINT fleet_trips_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;

-- invoice_payments has a clientId column added later; tighten that too.
ALTER TABLE public.invoice_payments
  DROP CONSTRAINT IF EXISTS "invoice_payments_clientId_fkey";
ALTER TABLE public.invoice_payments
  DROP CONSTRAINT IF EXISTS invoice_payments_client_company_fk;
ALTER TABLE public.invoice_payments
  ADD CONSTRAINT invoice_payments_client_company_fk
  FOREIGN KEY ("clientId", "companyId") REFERENCES public.clients(id, "companyId")
  ON DELETE SET NULL NOT VALID;
