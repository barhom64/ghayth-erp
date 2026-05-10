-- Migration 130: Seed CRM pipeline stages
-- Required for: /crm/leads/* — pipeline view is empty without stages

INSERT INTO crm_pipeline_stages ("companyId", name, "nameEn", color, "order", probability, "isActive")
SELECT c.id, s.name, s."nameEn", s.color, s."order", s.probability, true
FROM companies c
CROSS JOIN (VALUES
  ('عميل محتمل',     'Lead',          '#94A3B8', 1,  10),
  ('تم التواصل',     'Contacted',     '#60A5FA', 2,  20),
  ('مؤهل',           'Qualified',     '#818CF8', 3,  40),
  ('عرض سعر مقدّم',  'Proposal Sent', '#F59E0B', 4,  60),
  ('تفاوض',          'Negotiation',   '#FB923C', 5,  75),
  ('فوز',            'Won',           '#22C55E', 6, 100),
  ('خسارة',          'Lost',          '#EF4444', 7,   0)
) AS s(name, "nameEn", color, "order", probability)
WHERE NOT EXISTS (
  SELECT 1 FROM crm_pipeline_stages ps WHERE ps."companyId" = c.id AND ps.name = s.name
);
