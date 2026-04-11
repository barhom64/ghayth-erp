CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_links_unique_entity
  ON gov_integration_links("companyId", "integrationId", "entityType", "entityId");
