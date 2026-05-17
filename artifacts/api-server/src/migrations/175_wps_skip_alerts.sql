-- Task #323: dedicated queue table for the "WPS build excluded N
-- employees — please fix before the bank cut-off" alert that is
-- enqueued at the moment a wps_runs file is built with skipped rows.
--
-- This table holds ONE row per (companyId, wpsRunId) regardless of
-- how many HR managers receive the in-app fan-out, so the build
-- caller can rely on an atomic dedupe via the UNIQUE index even
-- under concurrent rebuilds. The notifications fan-out (one row per
-- active hr_manager) happens only on the first successful insert.
CREATE TABLE IF NOT EXISTS wps_skip_alerts (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id),
  "wpsRunId"      INTEGER NOT NULL,
  period          TEXT    NOT NULL,
  "skippedCount"  INTEGER NOT NULL,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wps_skip_alerts_company_run
  ON wps_skip_alerts ("companyId", "wpsRunId");

CREATE INDEX IF NOT EXISTS idx_wps_skip_alerts_company_period
  ON wps_skip_alerts ("companyId", period);
