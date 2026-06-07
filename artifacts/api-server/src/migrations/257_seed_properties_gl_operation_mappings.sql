-- 257_seed_properties_gl_operation_mappings.sql
--
-- #1594 — extend the controllable GL-mapping layer (254/256) to PROPERTIES.
--
-- PROBLEM
-- propertiesEngine resolves rent/deposit GL via getAccountCodeFromMapping with
-- hardcoded defaults that don't match the standard Saudi COA:
--   rent_revenue→4100 / rental_revenue→4100 (non-postable parent
--   "الإيرادات التشغيلية"), property_cash→1100 (non-postable parent),
--   security_deposit_liability→2300 (absent). With accounting_mappings empty,
--   rent payment / deposit journals would post to non-postable parents → 422.
--
-- FIX
-- Seed accounting_mappings for the properties operation keys → the company's
-- actual postable COA leaves: AR 1131, residential rent revenue 4121, cash 1111,
-- customer deposits/guarantees 2170. Same idempotent, controllable pattern as
-- 254/256 (only where the account exists & posts; ON CONFLICT DO NOTHING).
--
-- @rollback:
--   DELETE FROM accounting_mappings WHERE "operationType" IN (
--     'rent_receivable','rent_revenue','rental_cash_receipt','rental_revenue',
--     'property_cash','security_deposit_liability');
--   (only safe if these mappings were not manually customised afterwards.)

INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT coa."companyId", v.op, v.label,
       CASE WHEN v.side = 'debit'  THEN coa.code END,
       CASE WHEN v.side = 'credit' THEN coa.code END,
       true, now(), now()
FROM (VALUES
  ('rent_receivable',           'debit',  '1131', 'ذمم إيجارات مدينة'),
  ('rent_revenue',              'credit', '4121', 'إيراد إيجارات سكنية'),
  ('rental_cash_receipt',       'debit',  '1111', 'النقدية — تحصيل إيجار'),
  ('rental_revenue',            'credit', '4121', 'إيراد إيجارات سكنية'),
  ('property_cash',             'debit',  '1111', 'النقدية — عقارات'),
  ('security_deposit_liability','credit', '2170', 'تأمينات وضمانات من العملاء')
) AS v(op, side, code, label)
JOIN chart_of_accounts coa
  ON coa.code = v.code AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ON CONFLICT ("companyId","operationType") DO NOTHING;
