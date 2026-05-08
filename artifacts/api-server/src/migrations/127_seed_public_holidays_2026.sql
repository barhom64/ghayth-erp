-- Migration 127: Seed public_holidays with Saudi national holidays for 2025-2026
-- Required for: payroll calculations, leave day computation

INSERT INTO public_holidays ("companyId", name, "startDate", "endDate", year, type, description, "isRecurring")
SELECT c.id, h.name, h."startDate"::date, h."endDate"::date, h.year, h.type, h.description, h."isRecurring"
FROM companies c
CROSS JOIN (VALUES
  ('اليوم الوطني السعودي',  '2025-09-23', '2025-09-23', 2025, 'national', 'اليوم الوطني 93',          true),
  ('يوم التأسيس',           '2026-02-22', '2026-02-22', 2026, 'national', 'يوم التأسيس السعودي',      true),
  ('إجازة عيد الفطر',       '2026-03-20', '2026-03-24', 2026, 'religious','عيد الفطر المبارك 1447',   false),
  ('إجازة يوم عرفة',        '2026-05-26', '2026-05-26', 2026, 'religious','يوم عرفة 1447',            false),
  ('إجازة عيد الأضحى',      '2026-05-27', '2026-05-30', 2026, 'religious','عيد الأضحى المبارك 1447',  false),
  ('اليوم الوطني السعودي',  '2026-09-23', '2026-09-23', 2026, 'national', 'اليوم الوطني 94',          true)
) AS h(name, "startDate", "endDate", year, type, description, "isRecurring")
WHERE NOT EXISTS (
  SELECT 1 FROM public_holidays ph
  WHERE ph."companyId" = c.id AND ph.name = h.name AND ph.year = h.year
);
