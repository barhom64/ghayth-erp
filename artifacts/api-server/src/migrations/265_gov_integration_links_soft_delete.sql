-- 265_gov_integration_links_soft_delete.sql
--
-- @rollback:
--   DROP INDEX IF EXISTS idx_gov_integration_links_company_active;
--   ALTER TABLE public.gov_integration_links DROP COLUMN IF EXISTS "deletedAt";
--
-- Fix: gov_integration_links was designed for soft-delete but never got
-- the column. The route already issues
--   UPDATE gov_integration_links SET "deletedAt" = NOW() ...
-- on delete, and every SELECT/UPDATE filters `"deletedAt" IS NULL`, yet
-- the column did not exist — so every one of those statements raised
--   column "deletedAt" does not exist
-- a hard 500 on the entire gov-integrations surface (list / create /
-- upsert-link / delete). This adds the missing soft-delete column so the
-- existing, already-correct soft-delete semantics actually work.
--
-- Nullable, no default: existing rows are live (deletedAt = NULL), which
-- is exactly what the `IS NULL` predicates expect. Non-breaking,
-- non-destructive.

ALTER TABLE public.gov_integration_links
  ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz;

-- The hot path is "active links for this company" — partial index keeps
-- it lean by excluding soft-deleted rows, matching the route predicates
-- (companyId = $ AND "deletedAt" IS NULL).
CREATE INDEX IF NOT EXISTS idx_gov_integration_links_company_active
  ON public.gov_integration_links ("companyId")
  WHERE "deletedAt" IS NULL;
