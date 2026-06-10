-- 288_development_units.sql
--
-- Internal development units (#1594 projects package, Wave C.1).
--
-- Owner decision: internal development (build-to-sell) uses a SEPARATE table from
-- the rental-only property_units — these carry a cost basis, a project link, and
-- a sale price. The flow: project costs accumulate (project_costs → spentAmount);
-- each unit's cost value is its AREA SHARE of the project's accumulated cost
-- (computed live: spentAmount x area / Σarea); on sale the share is snapshotted
-- into costBasis and posted as COGS so profit = salePrice − costBasis. Selling
-- emits a client invoice via the existing project.invoice.requested event (no
-- journal is ever written from the project screen — finance owns posting).
--
-- C.1 (this) is the unit data model + CRUD; the sale → invoice + COGS flow is C.2.
--
-- @rollback:
--   DROP TABLE IF EXISTS public.development_units;

CREATE TABLE IF NOT EXISTS public.development_units (
  id            SERIAL PRIMARY KEY,
  "companyId"   integer NOT NULL,
  "branchId"    integer,
  "projectId"   integer NOT NULL,        -- the development project
  code          varchar(50),
  name          varchar(200) NOT NULL,
  area          numeric(14,3) NOT NULL DEFAULT 0,   -- drives area-share cost allocation
  status        varchar(20) NOT NULL DEFAULT 'under_development'
                  CHECK (status IN ('under_development','for_sale','sold','cancelled')),
  "salePrice"   numeric(14,2),
  "costBasis"   numeric(14,2),           -- snapshotted at sale (the COGS); null until sold
  "soldAt"      timestamptz,
  "buyerClientId" integer,
  "invoiceId"   integer,                 -- the sale invoice
  notes         text,
  "createdBy"   integer,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),
  "deletedAt"   timestamptz
);

CREATE INDEX IF NOT EXISTS development_units_project_idx
  ON public.development_units ("companyId", "projectId") WHERE "deletedAt" IS NULL;
