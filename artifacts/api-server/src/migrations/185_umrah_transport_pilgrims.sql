-- Migration 185: umrah_transport_pilgrims — the trip <-> pilgrim join table.
--
-- DT-3 (C4): there was no real link between a transport trip and a
-- pilgrim. assign-pilgrims only flipped umrah_pilgrims."transportAssigned"
-- to true, and GET /transport/:id returned EVERY company pilgrim with
-- that flag set — so a trip page showed the wrong passengers, capacity
-- drifted, and re-assigning to a second trip double-counted.
--
-- Adopted model: a join table. Umrah transport is round-trip + transfers,
-- so a pilgrim legitimately belongs to several trips — a single
-- transportId column on the pilgrim could not express that.
--
-- The (transportId, pilgrimId) unique constraint makes re-assignment
-- idempotent. No GL change, no lifecycle change.
--
-- @rollback: DROP TABLE IF EXISTS umrah_transport_pilgrims;

CREATE TABLE IF NOT EXISTS umrah_transport_pilgrims (
  id SERIAL PRIMARY KEY,
  "companyId" integer NOT NULL,
  "transportId" integer NOT NULL,
  "pilgrimId" integer NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now(),
  UNIQUE ("transportId", "pilgrimId")
);

CREATE INDEX IF NOT EXISTS idx_umrah_transport_pilgrims_transport
  ON umrah_transport_pilgrims ("transportId");
CREATE INDEX IF NOT EXISTS idx_umrah_transport_pilgrims_pilgrim
  ON umrah_transport_pilgrims ("pilgrimId");
