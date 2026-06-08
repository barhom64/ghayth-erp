-- Migration 249: Party / Master-Data registry (slice 1 — additive foundation)
--
-- WHAT: introduce a unifying identity layer over the 10 historically-siloed
--       person-like tables (employees, clients, suppliers, umrah_agents,
--       umrah_sub_agents, umrah_pilgrims, property_owners, fleet_drivers,
--       tenants) so the same human (a driver who is also an employee, a
--       supplier who is also a client, …) can be resolved to ONE party and a
--       360° view becomes possible.
--
-- WHY:  there is currently no shared identity — each table is independent with
--       no personId/partyId, making de-duplication, global search and a single
--       contact record impossible.
--
-- SAFETY: purely additive. Two NEW tables, zero changes to existing tables or
--       FKs. Nothing reads/writes these until the partyService + /parties
--       routes opt in, and population is operator-triggered (backfillCompany),
--       never an automatic data migration on boot. Idempotent.
--
-- @rollback:
--   DROP TABLE IF EXISTS party_links;
--   DROP TABLE IF EXISTS parties;

CREATE TABLE IF NOT EXISTS parties (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL,
  kind          VARCHAR(20) NOT NULL DEFAULT 'person',   -- person | organization
  "displayName" TEXT NOT NULL,
  "nationalId"  VARCHAR(40),
  phone         VARCHAR(40),
  email         VARCHAR(200),
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Identity de-dup key: at most one party per (company, nationalId) when a
-- nationalId is known. Rows without a nationalId are matched on phone by the
-- service layer (a partial-unique index can't express that cleanly).
CREATE UNIQUE INDEX IF NOT EXISTS uq_parties_company_nationalid
  ON parties ("companyId", "nationalId") WHERE "nationalId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parties_company_phone ON parties ("companyId", phone);
CREATE INDEX IF NOT EXISTS idx_parties_company_name  ON parties ("companyId", "displayName");

CREATE TABLE IF NOT EXISTS party_links (
  id            SERIAL PRIMARY KEY,
  "partyId"     INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  "companyId"   INTEGER NOT NULL,
  "entityTable" VARCHAR(50) NOT NULL,   -- e.g. 'employees', 'umrah_pilgrims'
  "entityId"    INTEGER NOT NULL,
  role          VARCHAR(30) NOT NULL,   -- employee | customer | supplier | agent | pilgrim | owner | driver | tenant
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_party_links_entity UNIQUE ("companyId", "entityTable", "entityId")
);
CREATE INDEX IF NOT EXISTS idx_party_links_party ON party_links ("partyId");
CREATE INDEX IF NOT EXISTS idx_party_links_company ON party_links ("companyId");

COMMENT ON TABLE parties IS 'Master-data identity registry (Party model slice 1). One row per resolved human/org; siloed entity tables link to it via party_links.';
COMMENT ON TABLE party_links IS 'Join from a party to a concrete entity row (employees/clients/…) with the role that row plays.';
