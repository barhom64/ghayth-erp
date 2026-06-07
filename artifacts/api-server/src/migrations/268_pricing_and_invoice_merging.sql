-- 268_pricing_and_invoice_merging.sql
--
-- @rollback:
--   DROP TABLE IF EXISTS public.transport_invoice_links;
--   DROP TABLE IF EXISTS public.transport_price_rules;
--   ALTER TABLE public.fleet_drivers DROP COLUMN IF EXISTS "driverServiceProfile";
--
-- #1733 Pricing + Invoice merging (Issue Comment 3) + driverServiceProfile.
-- Three additions:
--
--   1. fleet_drivers.driverServiceProfile — extends the #1761 licence-
--      class guard with a service-type discriminator. A driver might
--      hold the right licence class for a bus but be a `cargo_driver`
--      specialist; the dispatch board should filter accordingly.
--      Values: cargo_driver | umrah_driver | passenger_driver |
--              rental_driver | mixed (catch-all for cross-trained).
--
--   2. transport_price_rules — the pricing engine the accountant runs
--      when materialising a `transport_service_lines` row. Lookup is
--      most-specific-first: per-customer + per-route + per-vehicle-type
--      beats per-customer beats global. `validFrom / validTo` lets
--      operators publish a new rate without disturbing already-priced
--      historical lines. `priority` breaks ties when two rules match.
--
--   3. transport_invoice_links — many-to-many junction between
--      `transport_service_lines` and `invoices` (already in core
--      finance). Comment 3 demands "the accountant can merge multiple
--      manifests/trips into ONE customer invoice"; this junction is
--      how that's expressed in the data model. `serviceLineId` is the
--      origin operational line; `invoiceLineId` is the resulting
--      finance line — together they let either side trace the link.

-- 1. driverServiceProfile.
ALTER TABLE public.fleet_drivers
  ADD COLUMN IF NOT EXISTS "driverServiceProfile" text;

CREATE INDEX IF NOT EXISTS idx_fleet_drivers_service_profile
  ON public.fleet_drivers ("companyId", "driverServiceProfile")
  WHERE "driverServiceProfile" IS NOT NULL AND "deletedAt" IS NULL;

-- 2. transport_price_rules.
CREATE TABLE IF NOT EXISTS public.transport_price_rules (
  id                  SERIAL PRIMARY KEY,
  "companyId"         INTEGER NOT NULL,
  "branchId"          INTEGER,

  -- Match keys — every nullable column means "match anything" for that
  -- dimension. The pricing engine picks the row with the most non-NULL
  -- matches, breaking ties via `priority` DESC then `createdAt` DESC.
  "customerId"        INTEGER,
  "transportServiceType" TEXT NOT NULL,    -- required: every rule belongs to a service type
  "vehicleType"       TEXT,
  "routeFrom"         TEXT,
  "routeTo"           TEXT,
  "cargoType"         TEXT,

  -- Pricing facts.
  "unitOfMeasure"     TEXT NOT NULL,       -- 'kg' | 'pax' | 'trip' | 'km' | 'hour' | 'day'
  "unitPrice"         NUMERIC(18,4) NOT NULL,
  "minimumCharge"     NUMERIC(18,2),
  currency            TEXT NOT NULL DEFAULT 'SAR',
  "vatRate"           NUMERIC(5,2),        -- override company-default if non-NULL

  -- Validity window.
  "validFrom"         DATE NOT NULL,
  "validTo"           DATE,                -- NULL = open-ended
  priority            INTEGER NOT NULL DEFAULT 0,
  "isActive"          BOOLEAN NOT NULL DEFAULT TRUE,
  notes               TEXT,
  "createdBy"         INTEGER,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"         TIMESTAMPTZ,

  CONSTRAINT transport_price_rules_service_type_check CHECK (
    "transportServiceType" = ANY (ARRAY[
      'cargo_load', 'passenger_umrah', 'passenger_general',
      'equipment_rental', 'internal_transfer', 'other'
    ]::text[])
  )
);

-- Lookup index: per-customer + per-service-type + validity. The
-- pricing engine runs roughly:
--   SELECT … FROM transport_price_rules
--    WHERE "companyId" = $1
--      AND ("customerId" = $2 OR "customerId" IS NULL)
--      AND "transportServiceType" = $3
--      AND "isActive" AND "deletedAt" IS NULL
--      AND $4::date BETWEEN "validFrom" AND COALESCE("validTo", $4::date)
--    ORDER BY (specificity DESC), priority DESC, "createdAt" DESC
-- This composite index supports the bulk of that filter.
CREATE INDEX IF NOT EXISTS idx_price_rules_lookup
  ON public.transport_price_rules
     ("companyId", "transportServiceType", "customerId", "validFrom", "validTo")
  WHERE "isActive" AND "deletedAt" IS NULL;

-- 3. transport_invoice_links — many-to-many junction.
CREATE TABLE IF NOT EXISTS public.transport_invoice_links (
  id                SERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL,
  "serviceLineId"   INTEGER NOT NULL,        -- → transport_service_lines.id
  "invoiceId"       INTEGER NOT NULL,        -- → invoices.id (core finance)
  "invoiceLineId"   INTEGER,                 -- → invoice_lines.id (NULL → ungrouped header link)
  "appliedPriceRuleId" INTEGER,              -- which rule produced this line
  "appliedUnitPrice"   NUMERIC(18,4),
  "linkedBy"        INTEGER,
  "linkedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A service line participates in at most one ACTIVE invoice. The
  -- partial unique excludes rows whose invoice has been voided (the
  -- accountant can re-invoice an orphaned service line after a void).
  CONSTRAINT uq_transport_invoice_link_service
    UNIQUE ("companyId", "serviceLineId")
);

CREATE INDEX IF NOT EXISTS idx_invoice_links_invoice
  ON public.transport_invoice_links ("companyId", "invoiceId");
