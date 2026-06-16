-- 297_rename_collided_migration_filenames.sql
--
-- Healer for the parallel-work filename collisions in the 280..287 band.
-- Six migrations shared three numbers (two 280s/281s/282s, three 284s, two
-- 287s), which broke the deterministic application order migrate.ts relies
-- on. This PR renames the alphabetically-later file in each group to a
-- fresh number; this healer migration updates schema_migrations on
-- environments that already applied them under the OLD names so the
-- system keeps recognising the same logical migration.
--
-- For brand-new sandboxes (pnpm db:provision-agent) the table is empty
-- and every UPDATE is a no-op; for production / staging the old filename
-- rows are renamed in-place. ON CONFLICT-equivalent: the WHERE clause
-- only fires when the old row exists, AND when the new row does NOT —
-- so re-running this migration is harmless.
--
-- IMPORTANT: This migration MUST be applied BEFORE the renamed files
-- have a chance to re-run. migrate.ts skips files whose filename is in
-- schema_migrations, so renaming + this healer = the new filenames are
-- recognised as "already applied" and the DDL inside them never
-- re-executes (which is what we want — the DDL was applied months ago
-- under the old name).
--
-- @rollback:
--   -- Reverse rename map (only if you also git-revert the file renames):
--   UPDATE schema_migrations SET filename='280_seed_purchase_grni_mapping.sql'         WHERE filename='291_seed_purchase_grni_mapping.sql';
--   UPDATE schema_migrations SET filename='281_transport_booking_lines_geo_and_kind.sql' WHERE filename='292_transport_booking_lines_geo_and_kind.sql';
--   UPDATE schema_migrations SET filename='282_fleet_rental_inspection_and_driver.sql' WHERE filename='293_fleet_rental_inspection_and_driver.sql';
--   UPDATE schema_migrations SET filename='284_audit_context_completeness.sql'         WHERE filename='294_audit_context_completeness.sql';
--   UPDATE schema_migrations SET filename='284_transport_cargo_passenger_canon.sql'    WHERE filename='295_transport_cargo_passenger_canon.sql';
--   UPDATE schema_migrations SET filename='287_project_boq_items.sql'                  WHERE filename='296_project_boq_items.sql';

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz DEFAULT NOW()
);

-- Each pair: only rename when the old row exists AND the new row does not
-- (re-runs become no-ops; freshly-provisioned DBs that have neither row
-- skip cleanly).
UPDATE schema_migrations SET filename = '291_seed_purchase_grni_mapping.sql'
 WHERE filename = '280_seed_purchase_grni_mapping.sql'
   AND NOT EXISTS (SELECT 1 FROM schema_migrations s2 WHERE s2.filename = '291_seed_purchase_grni_mapping.sql');

UPDATE schema_migrations SET filename = '292_transport_booking_lines_geo_and_kind.sql'
 WHERE filename = '281_transport_booking_lines_geo_and_kind.sql'
   AND NOT EXISTS (SELECT 1 FROM schema_migrations s2 WHERE s2.filename = '292_transport_booking_lines_geo_and_kind.sql');

UPDATE schema_migrations SET filename = '293_fleet_rental_inspection_and_driver.sql'
 WHERE filename = '282_fleet_rental_inspection_and_driver.sql'
   AND NOT EXISTS (SELECT 1 FROM schema_migrations s2 WHERE s2.filename = '293_fleet_rental_inspection_and_driver.sql');

UPDATE schema_migrations SET filename = '294_audit_context_completeness.sql'
 WHERE filename = '284_audit_context_completeness.sql'
   AND NOT EXISTS (SELECT 1 FROM schema_migrations s2 WHERE s2.filename = '294_audit_context_completeness.sql');

UPDATE schema_migrations SET filename = '295_transport_cargo_passenger_canon.sql'
 WHERE filename = '284_transport_cargo_passenger_canon.sql'
   AND NOT EXISTS (SELECT 1 FROM schema_migrations s2 WHERE s2.filename = '295_transport_cargo_passenger_canon.sql');

UPDATE schema_migrations SET filename = '296_project_boq_items.sql'
 WHERE filename = '287_project_boq_items.sql'
   AND NOT EXISTS (SELECT 1 FROM schema_migrations s2 WHERE s2.filename = '296_project_boq_items.sql');
