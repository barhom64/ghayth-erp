-- 371_maps_usage_daily_counters.sql
-- TA-GAP-09 Phase 1 — Maps Quota Monitoring (storage).
--
-- WHAT:    a per-day, per-(provider, apiSurface), per-company counter
--          for outbound calls to mapping providers (google_maps,
--          mapbox, …). Each row sums one (companyId, callDate,
--          provider, apiSurface) tuple.
--
-- WHY:     the owner needs the option to set a daily/monthly cap on
--          Google Maps / Mapbox spend per company (audit doc file 20
--          §10 TA-GAP-09 "مراقبة حصة الخرائط"). The cap must work
--          WITHOUT touching the Google Cloud Billing API — we count
--          OUR side (every call we make) so caps + alerts fire
--          regardless of whether the upstream billing console is
--          accessible / shared / consolidated.
--
--          Phase 1 (this migration + lib/fleet/mapsUsageCounter.ts +
--          MapsService wiring) records counters at the source. Phase 2
--          will add the GET /fleet/maps/usage endpoint + the SPA chart.
--
-- SAFETY:  pure additive table + UNIQUE index. No FKs to existing
--          rows; companyId is plain FK to companies. Counter rows are
--          best-effort writes (the MapsService caller swallows any
--          insert error so a counter outage never blocks a real route
--          estimate).
--
-- @rollback:
--   BEGIN;
--     DROP TABLE IF EXISTS maps_usage_daily_counters;
--   COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS maps_usage_daily_counters (
  id           SERIAL PRIMARY KEY,
  "companyId"  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "callDate"   DATE    NOT NULL,
  provider     TEXT    NOT NULL,
  -- Which method on MapsService consumed the call (estimateRoute /
  -- geocode / etc). Keeps the counter forward-compatible as the
  -- service surface grows.
  "apiSurface" TEXT    NOT NULL,
  "callCount"  INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per (companyId, callDate, provider, apiSurface) — the
-- UPSERT path keys on this.
CREATE UNIQUE INDEX IF NOT EXISTS maps_usage_daily_counters_uniq
  ON maps_usage_daily_counters ("companyId", "callDate", provider, "apiSurface");

-- Ranking index for the dashboard: "last 30 days of usage for company X".
CREATE INDEX IF NOT EXISTS maps_usage_daily_counters_company_date_idx
  ON maps_usage_daily_counters ("companyId", "callDate" DESC);

-- Hard guarantees on the numeric columns — a counter that ever went
-- negative would mean something corrupted the table. DO blocks make
-- the constraint adds idempotent (a re-run over a partially-applied
-- DB no-ops instead of erroring).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'maps_usage_daily_counters_callcount_nonneg'
  ) THEN
    ALTER TABLE maps_usage_daily_counters
      ADD CONSTRAINT maps_usage_daily_counters_callcount_nonneg
        CHECK ("callCount" >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'maps_usage_daily_counters_errorcount_nonneg'
  ) THEN
    ALTER TABLE maps_usage_daily_counters
      ADD CONSTRAINT maps_usage_daily_counters_errorcount_nonneg
        CHECK ("errorCount" >= 0);
  END IF;
END $$;

COMMIT;
