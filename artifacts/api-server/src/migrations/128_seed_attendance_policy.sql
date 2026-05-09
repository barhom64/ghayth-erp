-- Migration 128: Seed default attendance policy per company
-- Required for: /hr/attendance/* — no rules = no deductions

INSERT INTO attendance_policies ("companyId", "lateThresholdMinutes", "gpsRadiusMeters",
  "penaltyLevel1", "penaltyLevel2", "penaltyLevel3", "penaltyLevel4", "penaltyLevel5",
  "penaltyLevel1Label", "penaltyLevel2Label", "penaltyLevel3Label", "penaltyLevel4Label", "penaltyLevel5Label")
SELECT c.id, 15, 500,
  0, 50, 100, 200, 500,
  'إنذار شفهي', 'إنذار كتابي', 'خصم يوم', 'خصم يومين', 'خصم ثلاثة أيام + إنذار نهائي'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM attendance_policies ap WHERE ap."companyId" = c.id
);
