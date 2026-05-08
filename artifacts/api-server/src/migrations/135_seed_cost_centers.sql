-- Migration 135: Seed default cost centers per company
-- Required for: /finance/journal/create — mandatory in QuickBooks-style posting

INSERT INTO cost_centers ("companyId", code, name, type, status)
SELECT c.id, cc.code, cc.name, cc.type, 'active'
FROM companies c
CROSS JOIN (VALUES
  ('CC-001', 'الإدارة العامة',    'department'),
  ('CC-002', 'الموارد البشرية',   'department'),
  ('CC-003', 'المالية',           'department'),
  ('CC-004', 'المبيعات',          'department'),
  ('CC-005', 'العمليات',          'department'),
  ('CC-006', 'تقنية المعلومات',   'department'),
  ('CC-007', 'خدمة العملاء',      'department')
) AS cc(code, name, type)
WHERE NOT EXISTS (
  SELECT 1 FROM cost_centers cce WHERE cce."companyId" = c.id AND cce.code = cc.code
);
