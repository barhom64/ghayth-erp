-- 387_seed_transport_revenue_leaves.sql
--
-- STEP 1 of transport customer-invoicing — accounting foundation ONLY.
-- Adds three NEW postable revenue leaves under 4150 for every EXISTING company,
-- mirroring companyBootstrap so fresh tenants get them too:
--   4151 إيراد نقل المعتمرين  (Umrah Transport Revenue)
--   4152 إيراد نقل الركاب     (Passenger Transport Revenue)
--   4153 إيراد نقل البضائع    (Freight Revenue)
--
-- Purely additive — changes NO live posting. 4150 already exists as an L3
-- account on every chart and is KEPT POSTABLE here, because three live paths
-- still fall back to it (cargo_freight_revenue, fleet_rental_revenue,
-- early_termination_revenue). Repointing those to the leaves + flipping 4150 to
-- a non-postable rollup parent + seeding accounting_mappings is deferred to
-- Step 2, when the posting paths are reworked together (so check:postable-
-- fallbacks moves atomically). Existing journal_lines on 4150 are untouched.
--
-- Idempotent: insert-per-company only where the leaf does not yet exist.
--
-- @rollback:
--   DELETE FROM chart_of_accounts
--     WHERE code IN ('4151','4152','4153')
--       AND id NOT IN (SELECT DISTINCT "accountId" FROM journal_lines
--                      WHERE "accountId" IS NOT NULL);
--   -- (only removable while no journal line references them)

INSERT INTO chart_of_accounts
  ("companyId", code, name, "nameEn", type, "parentId", "parentCode", level, "allowPosting", "isActive", status)
SELECT
  c.id, m.code, m.name, m.name_en, 'revenue',
  (SELECT p.id FROM chart_of_accounts p
     WHERE p."companyId" = c.id AND p.code = '4150' AND p."deletedAt" IS NULL
     LIMIT 1),
  '4150', 4, true, true, 'active'
FROM companies c
CROSS JOIN (VALUES
  ('4151', 'إيراد نقل المعتمرين', 'Umrah Transport Revenue'),
  ('4152', 'إيراد نقل الركاب', 'Passenger Transport Revenue'),
  ('4153', 'إيراد نقل البضائع', 'Freight Revenue')
) AS m(code, name, name_en)
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts coa
  WHERE coa."companyId" = c.id AND coa.code = m.code
)
ON CONFLICT DO NOTHING;
