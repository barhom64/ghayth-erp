-- 375_maps_usage_thresholds.sql
-- TA-GAP-09 Phase 3 — operator-set quota thresholds + alert tracking.
--
-- WHAT:    a per-company configuration of "daily / monthly call cap
--          per maps provider" plus a dedupe log so the cron doesn't
--          spam alerts when a threshold stays over for hours.
--
-- WHY:     Phase 1 (#2439) recorded counts. Phase 2 (#2449) exposed
--          them to the operator. Phase 3 (this migration + the cron
--          + the routes) closes the loop: when the operator sets a
--          cap, the system emits `fleet.maps_usage.threshold_breached`
--          events at 80% (warning) and 100% (critical) so the on-call
--          knows BEFORE the production Google quota error.
--
-- DESIGN:  thresholds are per (companyId, period). period is
--          'daily' or 'monthly'. The check runs in the existing
--          cronScheduler against the Phase 1 daily counter table —
--          monthly = SUM of the trailing 30 days.
--
--          alerts table keeps one row per (companyId, period, level,
--          calendarDate-of-the-window) so re-running the cron over
--          the same window is idempotent.
--
-- SAFETY:  pure additive. No FKs to mutable rows except companies.
--          No engine integration, no finance touch.
--
-- @rollback:
--   BEGIN;
--     DROP TABLE IF EXISTS maps_usage_threshold_alerts;
--     DROP TABLE IF EXISTS maps_usage_thresholds;
--   COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS maps_usage_thresholds (
  id                   SERIAL PRIMARY KEY,
  "companyId"          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- 'daily' = the cap applies to today's calls (callDate = CURRENT_DATE)
  -- 'monthly' = the cap applies to the trailing 30 days.
  period               TEXT NOT NULL,
  -- The hard cap in absolute calls. Warnings fire at warningPct of this.
  "callCountThreshold" INTEGER NOT NULL,
  -- Percentage of the hard cap that triggers the warning event.
  -- 80 → "fleet.maps_usage.threshold_breached" with level='warning'.
  "warningPct"         INTEGER NOT NULL DEFAULT 80,
  "isActive"           BOOLEAN NOT NULL DEFAULT TRUE,
  notes                TEXT,
  "createdBy"          INTEGER REFERENCES users(id),
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency guards on the thresholds (DO blocks so re-runs no-op).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maps_usage_thresholds_period_check') THEN
    ALTER TABLE maps_usage_thresholds
      ADD CONSTRAINT maps_usage_thresholds_period_check
        CHECK (period IN ('daily', 'monthly'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maps_usage_thresholds_count_positive') THEN
    ALTER TABLE maps_usage_thresholds
      ADD CONSTRAINT maps_usage_thresholds_count_positive
        CHECK ("callCountThreshold" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maps_usage_thresholds_pct_bounds') THEN
    ALTER TABLE maps_usage_thresholds
      ADD CONSTRAINT maps_usage_thresholds_pct_bounds
        CHECK ("warningPct" BETWEEN 1 AND 99);
  END IF;
END $$;

-- One ACTIVE row per (companyId, period). Inactive rows are kept as
-- history so we can audit "the cap used to be 5,000 calls/day".
CREATE UNIQUE INDEX IF NOT EXISTS maps_usage_thresholds_active_uniq
  ON maps_usage_thresholds ("companyId", period)
  WHERE "isActive" = TRUE;

-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS maps_usage_threshold_alerts (
  id                          SERIAL PRIMARY KEY,
  "companyId"                 INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "thresholdId"               INTEGER NOT NULL REFERENCES maps_usage_thresholds(id) ON DELETE CASCADE,
  -- 'warning' = crossed warningPct%; 'critical' = crossed 100%.
  level                       TEXT NOT NULL,
  -- The calendar window key the alert was raised for:
  --   period='daily'   → 'YYYY-MM-DD' of CURRENT_DATE at fire time
  --   period='monthly' → 'YYYY-MM-DD' for the 30-day window start
  -- Used as the dedupe key — one row per (threshold, level, windowKey).
  "windowKey"                 TEXT NOT NULL,
  "triggeredCallCount"        INTEGER NOT NULL,
  "thresholdValueAtTrigger"   INTEGER NOT NULL,
  "alertedAt"                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maps_usage_threshold_alerts_level_check') THEN
    ALTER TABLE maps_usage_threshold_alerts
      ADD CONSTRAINT maps_usage_threshold_alerts_level_check
        CHECK (level IN ('warning', 'critical'));
  END IF;
END $$;

-- Dedupe key — one alert per (threshold, level, window).
CREATE UNIQUE INDEX IF NOT EXISTS maps_usage_threshold_alerts_uniq
  ON maps_usage_threshold_alerts ("thresholdId", level, "windowKey");

-- Dashboard read path: "show me the last 30 days of alerts for company X".
CREATE INDEX IF NOT EXISTS maps_usage_threshold_alerts_company_date_idx
  ON maps_usage_threshold_alerts ("companyId", "alertedAt" DESC);

COMMIT;
