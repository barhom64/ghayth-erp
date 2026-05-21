-- ===========================================================================
-- NNN_short_snake_case_name.sql
-- ---------------------------------------------------------------------------
-- Template for a new Ghayth ERP migration. Copy it into
-- artifacts/api-server/src/migrations/ and rename it. This file lives under
-- docs/ on purpose — it is NOT a real migration and is never applied.
--
-- WHAT:    one sentence describing the schema change this migration makes.
-- WHY:     the feature, ticket, or RCA that requires it.
-- SAFETY:  is it zero-downtime? does it backfill? how long does it lock a
--          large table? (see docs/MIGRATION_POLICY.md §7)
-- @rollback: how to undo this migration — or an explicit statement of why it
--            is irreversible (e.g. "irreversible: drops data").
-- ===========================================================================

-- Prefer idempotent DDL (IF NOT EXISTS / IF EXISTS) so a partially-applied
-- migration can be safely re-run. The runner records success in
-- schema_migrations only after the whole file commits.

ALTER TABLE example_table
  ADD COLUMN IF NOT EXISTS new_column text;

CREATE INDEX IF NOT EXISTS idx_example_table_new_column
  ON example_table (new_column);

-- ---------------------------------------------------------------------------
-- Destructive changes (DROP TABLE / DROP COLUMN / TRUNCATE / DROP SCHEMA)
-- MUST be acknowledged with the line below. The migration-policy guard
-- (scripts/src/check-migration-policy.mjs) fails the build otherwise, so a
-- reviewer's attention is always drawn to the irreversible part.
--
-- @policy:destructive
-- DROP TABLE IF EXISTS deprecated_table;
