-- 296_project_boq_items.sql
--
-- Projects BOQ (Bill of Quantities) line-item billing (#1594 projects package).
--
-- Owner decision: projects bill by LINE ITEM (BOQ), not hourly T&M. Each line is
-- quantity x unitPrice. Two kinds:
--   • aggregate  — measured totals (e.g. by the metre / m2): area x rate
--   • custom     — specific scoped items (لياسة / changing a lightbulb …)
--
-- Billing reuses the existing project.invoice.requested event (no new invoicing
-- path): a bill run sums the selected pending lines into one invoice, each BOQ
-- line becoming an invoice_line, and stamps the lines billed + invoiceId.
--
-- @rollback:
--   DROP TABLE IF EXISTS public.project_boq_items;

CREATE TABLE IF NOT EXISTS public.project_boq_items (
  id            SERIAL PRIMARY KEY,
  "companyId"   integer NOT NULL,
  "branchId"    integer,
  "projectId"   integer NOT NULL,
  "phaseId"     integer,                 -- optional: bill per phase/milestone
  "itemType"    varchar(20) NOT NULL DEFAULT 'custom'
                  CHECK ("itemType" IN ('aggregate','custom')),
  description   text NOT NULL,
  unit          varchar(20),             -- 'm','m2','m3','piece','job','lumpsum'
  quantity      numeric(14,3) NOT NULL DEFAULT 1,
  "unitPrice"   numeric(14,2) NOT NULL DEFAULT 0,
  "lineTotal"   numeric(14,2) NOT NULL DEFAULT 0,   -- quantity x unitPrice (app-computed)
  status        varchar(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','billed','cancelled')),
  "invoiceId"   integer,                 -- set when billed
  "sortOrder"   integer NOT NULL DEFAULT 0,
  notes         text,
  "createdBy"   integer,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),
  "deletedAt"   timestamptz
);

CREATE INDEX IF NOT EXISTS project_boq_items_project_idx
  ON public.project_boq_items ("companyId", "projectId") WHERE "deletedAt" IS NULL;
