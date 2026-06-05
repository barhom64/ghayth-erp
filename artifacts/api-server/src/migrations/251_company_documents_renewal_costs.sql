-- 251_company_documents_renewal_costs.sql
--
-- WHAT:    add `renewalCost`, `renewalAccountCode`, and
--          `responsibleDepartmentId` columns to company_documents so
--          renewal of a CR / license / medical insurance / Zakat
--          certificate carries the renewal fee + the GL account it
--          posts to + the department responsible for handling the
--          renewal task.
--
-- WHY:     the user said: "I want the renewal of the commercial
--          registration to be tied to money in the expenses, and any
--          time before something expires the system must open a task
--          for the responsible department". This lets a single
--          company-documents record drive THREE things on next renewal:
--            1. the obligation (already wired in 250)
--            2. an auto-task assigned to the responsibleDepartmentId
--               (or to whoever has the matching manager role)
--            3. an expense JE for the renewal fee
--
-- SAFETY:  pure additive ADD COLUMN. All three are NULLable so every
--          existing company_documents row is grandfathered — the
--          renewal flow simply doesn't fire the expense path unless
--          renewalCost > 0, and falls back to a global-role assignee
--          when responsibleDepartmentId is NULL.
--
-- @rollback: ALTER TABLE company_documents DROP COLUMN "renewalCost",
--                                          DROP COLUMN "renewalAccountCode",
--                                          DROP COLUMN "responsibleDepartmentId";

BEGIN;

ALTER TABLE public.company_documents
  ADD COLUMN IF NOT EXISTS "renewalCost" numeric(14,2);

ALTER TABLE public.company_documents
  ADD COLUMN IF NOT EXISTS "renewalAccountCode" character varying(20);

ALTER TABLE public.company_documents
  ADD COLUMN IF NOT EXISTS "responsibleDepartmentId" integer;

COMMIT;
