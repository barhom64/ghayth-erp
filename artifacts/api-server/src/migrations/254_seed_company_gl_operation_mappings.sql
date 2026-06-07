-- 254_seed_company_gl_operation_mappings.sql
--
-- #1594 — "بعملية أقوى": a single, controllable GL-routing layer instead of
-- per-domain hardcoded account codes.
--
-- PROBLEM
-- The domain engines (umrah invoicing, fleet, finance payments) resolve GL
-- accounts via getAccountCodeFromMapping(companyId, operationType, side,
-- HARDCODED_DEFAULT). Those hardcoded defaults (e.g. umrah_invoice_revenue→4200,
-- vat_output→2300, fleet_fuel_expense→5200, invoice_payment_cash→1100) do NOT
-- match the seeded standard Saudi COA (where umrah/service revenue is 4130, VAT
-- output is 2131, fleet fuel is 5510, cash box is 1111, AR is 1131, and the
-- "defaults" 4200/2300/5200/1100 are non-postable parent headers). With
-- accounting_mappings empty, every domain GL posting fell back to a
-- non-postable parent → 422 "حساب تجميعي".
--
-- FIX
-- Seed accounting_mappings (the per-company, admin-editable control table read
-- by getAccountCodeFromMapping) for the core operation keys, resolving each to
-- the company's ACTUAL postable COA leaf by standard code. Only inserts a row
-- when the target account exists AND allows posting in that company (so a
-- minimal COA simply gets fewer rows — no breakage). ON CONFLICT DO NOTHING so
-- any mapping an operator already customised is preserved (controllable, not
-- static). This unblocks Umrah + Fleet + payment journeys end-to-end via one
-- mechanism; admins refine per company from /finance (accounting mappings UI).
--
-- @rollback:
--   DELETE FROM accounting_mappings WHERE "operationType" IN (
--     'umrah_invoice_ar','umrah_invoice_revenue','umrah_penalty_revenue',
--     'vat_output','invoice_payment_cash','invoice_payment_ar',
--     'fleet_fuel_expense','fleet_driver_fare','fleet_depreciation','fleet_cash_source');
--   (only safe if these mappings were not manually customised afterwards.)

INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT coa."companyId", v.op, v.label,
       CASE WHEN v.side = 'debit'  THEN coa.code END,
       CASE WHEN v.side = 'credit' THEN coa.code END,
       true, now(), now()
FROM (VALUES
  ('umrah_invoice_ar',      'debit',  '1131', 'ذمم مدينة — العمرة'),
  ('umrah_invoice_revenue', 'credit', '4130', 'إيراد العمرة (خدمات)'),
  ('umrah_penalty_revenue', 'credit', '4930', 'إيراد غرامات العمرة'),
  ('vat_output',            'credit', '2131', 'ضريبة القيمة المضافة (مخرجات)'),
  ('invoice_payment_cash',  'debit',  '1111', 'النقدية — تحصيل'),
  ('invoice_payment_ar',    'credit', '1131', 'ذمم مدينة — تحصيل'),
  ('fleet_fuel_expense',    'debit',  '5510', 'وقود الأسطول'),
  ('fleet_driver_fare',     'debit',  '5140', 'أجور النقل/السائقين'),
  ('fleet_depreciation',    'debit',  '5710', 'إهلاك المركبات'),
  ('fleet_cash_source',     'credit', '1111', 'النقدية — مصدر تكلفة الأسطول')
) AS v(op, side, code, label)
JOIN chart_of_accounts coa
  ON coa.code = v.code
 AND coa."allowPosting" = true
 AND coa."deletedAt" IS NULL
ON CONFLICT ("companyId","operationType") DO NOTHING;
