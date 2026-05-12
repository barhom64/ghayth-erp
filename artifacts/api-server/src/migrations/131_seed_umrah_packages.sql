-- Migration 131: Seed umrah_packages with basic packages
-- Required for: /umrah/pilgrims/create — causes 500 error without packages

INSERT INTO umrah_packages ("companyId", name, "costPrice", "sellPrice",
  "includesTransport", "includesHotel", "includesMeals", "includesZiyarat",
  duration, description, status)
SELECT c.id, p.name, p."costPrice", p."sellPrice",
  p."includesTransport", p."includesHotel", p."includesMeals", p."includesZiyarat",
  p.duration, p.description, 'active'
FROM companies c
CROSS JOIN (VALUES
  ('باقة العمرة الاقتصادية',  2500, 3500, true,  true,  false, false, 5,  'باقة اقتصادية تشمل النقل والسكن'),
  ('باقة العمرة المميزة',     4000, 6000, true,  true,  true,  true,  7,  'باقة شاملة النقل والسكن والوجبات والزيارات'),
  ('باقة العمرة VIP',         7000, 10000, true, true,  true,  true,  10, 'باقة فاخرة بفنادق 5 نجوم وخدمات خاصة'),
  ('باقة عمرة يوم واحد',     800,  1200, true,  false, false, false, 1,  'عمرة يوم واحد مع النقل فقط')
) AS p(name, "costPrice", "sellPrice", "includesTransport", "includesHotel", "includesMeals", "includesZiyarat", duration, description)
WHERE NOT EXISTS (
  SELECT 1 FROM umrah_packages up WHERE up."companyId" = c.id AND up.name = p.name
);
