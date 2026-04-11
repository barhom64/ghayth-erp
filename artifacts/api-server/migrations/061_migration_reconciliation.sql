-- Reconciliation migration: ensures old duplicate migration filenames from src/migrations/
-- are recorded in schema_migrations if they were ever applied from there, preventing
-- any re-application when the active migration directory (../migrations relative to src/lib)
-- is the canonical source.
-- This is a safety no-op: if these entries already exist they are ignored.

INSERT INTO schema_migrations (filename, "appliedAt")
SELECT unnest(ARRAY[
  '014_proactive_automation.sql',
  '016_behavioral_intelligence.sql',
  '018_soft_delete_financial.sql',
  '019_materials_used.sql',
  '019_materials_used_column.sql',
  '021_salary_history_and_employee_components.sql',
  '021_client_portal_accounts.sql',
  '022_portal_account_client_unique.sql',
  '023_db_constraints_archiving.sql',
  '023_scheduled_reports.sql',
  '023_financial_algorithms.sql',
  '023_push_subscriptions.sql',
  '023_zatca_integration.sql',
  '026_property_buildings.sql',
  '026_security_log.sql',
  '027_projects_permissions_seed.sql'
]), NOW()
ON CONFLICT (filename) DO NOTHING;
