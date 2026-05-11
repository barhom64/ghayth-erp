-- ============================================================
-- 035: Seed COA accounts and accounting mappings for the
--      inventory/warehouse and projects GL integrations.
--
-- Notes on code collisions with existing COA (see 016_accounting_engine):
--   * 5100 is already a non-posting parent ("تكاليف الموارد البشرية")
--     so we use 5110 for COGS.
--   * 5200 is already a non-posting parent ("مصروفات التشغيل")
--     so we use 5225 for transferred project cost.
--   * 2110 is already "رواتب مستحقة" so we use 2115 for GRNI.
--   * 5150 is unused → used for Inventory Variance.
--   * 1350 is unused → used for WIP.
-- ============================================================

-- 1. Seed new accounts for every company that does not yet have them
INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, level, "isActive")
SELECT c.id, '1350', 'أعمال تحت التنفيذ (WIP)', 'Work In Progress', 'asset', 3, true
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts coa WHERE coa."companyId" = c.id AND coa.code = '1350'
)
ON CONFLICT DO NOTHING;

INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, level, "isActive")
SELECT c.id, '2115', 'فواتير لم تُستلم (GRNI)', 'Goods Received Not Invoiced', 'liability', 3, true
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts coa WHERE coa."companyId" = c.id AND coa.code = '2115'
)
ON CONFLICT DO NOTHING;

INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, level, "isActive")
SELECT c.id, '5110', 'تكلفة البضاعة المباعة', 'Cost of Goods Sold', 'expense', 3, true
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts coa WHERE coa."companyId" = c.id AND coa.code = '5110'
)
ON CONFLICT DO NOTHING;

INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, level, "isActive")
SELECT c.id, '5150', 'فروقات جرد', 'Inventory Variance', 'expense', 3, true
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts coa WHERE coa."companyId" = c.id AND coa.code = '5150'
)
ON CONFLICT DO NOTHING;

INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, level, "isActive")
SELECT c.id, '5225', 'تكلفة المشاريع (محولة من WIP)', 'Project Cost Transferred', 'expense', 3, true
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts coa WHERE coa."companyId" = c.id AND coa.code = '5225'
)
ON CONFLICT DO NOTHING;

-- 2. Seed new accounting_mappings operation types per company.
--    These allow admins to override the defaults for each company.
DO $$
DECLARE
  comp_id INTEGER;
  op_types TEXT[][] := ARRAY[
    ARRAY['inventory_receipt',      'استلام مخزون'],
    ARRAY['inventory_issue_cogs',   'صرف مخزون - تكلفة البضاعة'],
    ARRAY['inventory_variance',     'فروقات جرد المخزون'],
    ARRAY['project_wip',            'تكاليف المشاريع - WIP'],
    ARRAY['project_cost_transfer',  'تحويل WIP إلى تكلفة المشروع']
  ];
  t TEXT[];
BEGIN
  FOR comp_id IN SELECT id FROM companies LOOP
    FOREACH t SLICE 1 IN ARRAY op_types LOOP
      INSERT INTO accounting_mappings ("companyId", "operationType", "operationLabel")
      VALUES (comp_id, t[1], t[2])
      ON CONFLICT ("companyId", "operationType") DO NOTHING;
    END LOOP;
  END LOOP;
EXCEPTION WHEN undefined_table THEN
  -- accounting_mappings table not present in this deployment; skip
  NULL;
END $$;
