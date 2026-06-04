-- #1354 — driver portal foundation. Mirrors client_portal_accounts
-- (migration 021) so the driver-side login + my-trips views can be
-- built without entangling fleet_drivers with auth concerns.
--
-- @rollback: DROP TABLE driver_portal_accounts (no other table FK's into
--   this one yet; safe rollback). The fleet_drivers row keeps its phone
--   number and continues to receive the WhatsApp dispatch.
-- @policy: additive — creates one new table, one FK to fleet_drivers,
--   two indexes. No backfill needed. Drivers without a portal account
--   continue to receive WhatsApp-only notifications as before.

CREATE TABLE IF NOT EXISTS driver_portal_accounts (
  id                   SERIAL PRIMARY KEY,
  "driverId"           INTEGER NOT NULL REFERENCES fleet_drivers(id) ON DELETE CASCADE,
  "companyId"          INTEGER NOT NULL,
  email                VARCHAR(255) NOT NULL UNIQUE,
  "passwordHash"       TEXT NOT NULL,
  "isActive"           BOOLEAN NOT NULL DEFAULT true,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt"        TIMESTAMPTZ,
  "tokenVersion"       INTEGER NOT NULL DEFAULT 1,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_portal_accounts_driver
  ON driver_portal_accounts ("driverId", "companyId");

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_portal_accounts_email
  ON driver_portal_accounts (email);
