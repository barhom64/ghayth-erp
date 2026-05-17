-- 178_zatca_b2c_pause_events.sql
--
-- Task #391: persist every B2C spike-gate pause so finance can see on
-- the /finance/zatca-missing-tax screen how often the pause has actually
-- saved a wrong-route invoice (and therefore tune the threshold envs
-- ZATCA_B2C_SPIKE_MULTIPLIER / ZATCA_B2C_SPIKE_MIN_ABS with evidence).
--
-- One row per (companyId, calendar day): the cron fires every minute,
-- so without the day-bucket unique index the table would grow by ~1440
-- rows/day per paused company and the "how many times has the gate
-- fired" KPI would be meaningless. The day-bucket matches finance's
-- intuition — one paused day == one saved batch — and the row's
-- snapshot fields are refreshed on every tick via ON CONFLICT so the
-- numbers stay current as more invoices arrive throughout the day.
--
-- Idempotent: safe to re-apply.

CREATE TABLE IF NOT EXISTS zatca_b2c_pause_events (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "pauseDate"     DATE NOT NULL DEFAULT CURRENT_DATE,
  "todayCount"    INTEGER NOT NULL,
  "baseline"      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  "multiplier"    INTEGER NOT NULL,
  "minAbs"        INTEGER NOT NULL,
  "topClientId"   INTEGER,
  "topClientName" TEXT,
  "topClientCount" INTEGER,
  "reason"        TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS zatca_b2c_pause_events_company_day_uk
  ON zatca_b2c_pause_events ("companyId", "pauseDate");

CREATE INDEX IF NOT EXISTS zatca_b2c_pause_events_company_created_idx
  ON zatca_b2c_pause_events ("companyId", "createdAt" DESC);
