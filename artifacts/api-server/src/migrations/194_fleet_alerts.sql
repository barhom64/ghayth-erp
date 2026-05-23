-- FLT-006: persist computed fleet alerts so they can be acknowledged /
-- dismissed and so a stale condition becomes 'resolved' across reads
-- instead of disappearing silently. The GET /fleet/alerts endpoint
-- reconciles each computed alert into this table by a natural key.
--
-- @rollback: DROP TABLE IF EXISTS fleet_alerts CASCADE;
--   (the alerts are derived data — dropping the table just falls back
--   to the previous live-computation behaviour, no data loss.)

CREATE TABLE IF NOT EXISTS fleet_alerts (
  id serial PRIMARY KEY,
  "companyId" integer NOT NULL,
  "branchId" integer,
  type varchar(40) NOT NULL,
  severity varchar(20) NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  "relatedType" varchar(40),
  "relatedId" integer,
  "daysLeft" integer,
  status varchar(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','acknowledged','resolved','dismissed')),
  "acknowledgedBy" integer,
  "acknowledgedAt" timestamptz,
  "dismissedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE ("companyId", type, "relatedType", "relatedId")
);

CREATE INDEX IF NOT EXISTS idx_fleet_alerts_company_status
  ON fleet_alerts ("companyId", status);

CREATE INDEX IF NOT EXISTS idx_fleet_alerts_related
  ON fleet_alerts ("relatedType", "relatedId");
