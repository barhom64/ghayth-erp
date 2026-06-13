-- @rollback: DELETE FROM accounting_mappings WHERE "operationType"='early_termination_revenue';
-- Seeds early_termination_revenue → 4130 (service revenue).
-- Idempotent: ON CONFLICT DO NOTHING. Only inserts if 4130 exists and is postable.
INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT coa."companyId", v.op, v.label, NULL, coa.code, true, now(), now()
FROM (VALUES
  ('early_termination_revenue', 'إيرادات الخدمات — غرامات إنهاء عقود إيجار')
) AS v(op, label)
JOIN chart_of_accounts coa
  ON coa.code = '4130' AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ON CONFLICT ("companyId","operationType") DO NOTHING;
