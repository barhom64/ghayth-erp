-- Migration 248: materialise journey_instances in the schema
--
-- Context: lib/journeyEngine.ts creates journey_instances lazily at runtime
-- via an ensureTable() guard (CREATE TABLE IF NOT EXISTS on first use) and
-- then INSERT/SELECT/UPDATEs it through rawQuery. It was the ONLY table the
-- api-server references that had no migration and is absent from the schema
-- dump (db/schema_*.sql) — the same "lazily created … but should be in
-- schema" gap migration 105 closed for auto_detection_log. Every other
-- lazily-created table (credit_memos, payment_runs, hr_employee_loans, …)
-- already pairs its runtime CREATE IF NOT EXISTS with a migration; this
-- brings journey_instances in line so a freshly-bootstrapped / staging DB
-- has the table (and its index) before any caller runs, instead of relying
-- on the engine's first-use guard.
--
-- DDL mirrors journeyEngine.ensureTable() exactly. Additive + idempotent
-- (IF NOT EXISTS); zero-downtime. The runtime guard is intentionally left in
-- place — it is idempotent and matches the house pattern for these tables.
--
-- @rollback:
--   DROP TABLE IF EXISTS journey_instances;

CREATE TABLE IF NOT EXISTS journey_instances (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "journeyType"   VARCHAR(40) NOT NULL,
  "entityType"    VARCHAR(40),
  "entityId"      INTEGER,
  label           TEXT NOT NULL,
  "completedSteps" JSONB NOT NULL DEFAULT '[]',
  "totalSteps"    INTEGER NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  metadata        JSONB,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journey_company
  ON journey_instances ("companyId", "journeyType", status);
