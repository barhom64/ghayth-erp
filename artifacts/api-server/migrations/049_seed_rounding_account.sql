-- Seed rounding differences account 9999 for all existing companies that don't have it
INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, level, "isActive")
SELECT c.id, '9999', 'فروقات التقريب', 'Rounding Differences', 'expense', 2, true
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts coa WHERE coa."companyId" = c.id AND coa.code = '9999'
)
ON CONFLICT DO NOTHING;
