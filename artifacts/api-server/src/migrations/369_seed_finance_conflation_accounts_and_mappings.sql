-- 366_seed_finance_conflation_accounts_and_mappings.sql
--
-- #2277 (account-conflation) — the remaining 11 unmapped purposes that fell to
-- a SHARED generic fallback (2150/4910/2120/2140), so distinct liabilities /
-- income could not be told apart on the balance sheet & income statement.
--
-- This migration (a) backfills 4 NEW postable leaves for the genuinely-distinct
-- liability/income types that had no home account, then (b) seeds controllable
-- accounting_mappings for all 11 → their correct leaf. Mirrors 035 (chart
-- backfill) + 291/323 (mapping seed): per-company, idempotent, only where the
-- target leaf exists & is postable; ON CONFLICT preserves operator overrides.
-- New leaves are also added to companyBootstrap so fresh tenants get them.
--
-- Account choices (owner delegated the accounting call):
--   • commission_payable      → 2155 عمولات مستحقة                (new)
--   • owner_payable /
--     property_owner_payable   → 2156 ذمم مُلّاك العقارات          (new)
--   • fleet_fines_payable      → 2157 غرامات مرورية مستحقة         (new)
--   • fx_revaluation_gain      → 4950 أرباح فروق عملة              (new; 4930/4940 taken)
--   • legal_payable / legal_fee_payable / cargo_freight_payable /
--     fleet_trip_payable       → 2111 موردون محليون               (vendor obligations)
--   • settlement_payable       → 2120 مستحقات الرواتب             (EOS net pay; off GOSI 2140)
--   • employee_deductions      → 2150 مصروفات مستحقة              (matches payroll_deductions_payable, mig 256)
--
-- @rollback:
--   DELETE FROM accounting_mappings WHERE "operationType" IN
--     ('commission_payable','owner_payable','property_owner_payable','fleet_fines_payable',
--      'fx_revaluation_gain','legal_payable','legal_fee_payable','cargo_freight_payable',
--      'fleet_trip_payable','settlement_payable','employee_deductions');
--   -- (new leaves 2155/2156/2157/4950 are additive; drop manually only if unused)

-- ── (a) New postable leaves for existing companies ──────────────────────────
INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, level, "parentCode", "isActive")
SELECT c.id, m.code, m.name, m.name_en, m.type, 3, m.parent, true
FROM companies c
CROSS JOIN (VALUES
  ('2155','عمولات مستحقة','Commissions Payable','liability','2100'),
  ('2156','ذمم مُلّاك العقارات','Property Owners Payable','liability','2100'),
  ('2157','غرامات مرورية مستحقة','Traffic Fines Payable','liability','2100'),
  ('4950','أرباح فروق عملة','FX Revaluation Gain','revenue','4900')
) AS m(code, name, name_en, type, parent)
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts coa WHERE coa."companyId" = c.id AND coa.code = m.code
)
ON CONFLICT DO NOTHING;

-- ── (b) Controllable mappings for the 11 purposes → correct leaf ────────────
INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT coa."companyId", m.op, m.label, coa.code, coa.code, true, now(), now()
FROM (VALUES
  ('commission_payable',     'عمولات مستحقة',        '2155'),
  ('owner_payable',          'ذمم مُلّاك العقارات',  '2156'),
  ('property_owner_payable',  'ذمم مُلّاك العقارات',  '2156'),
  ('fleet_fines_payable',    'غرامات مرورية مستحقة', '2157'),
  ('fx_revaluation_gain',    'أرباح فروق عملة',      '4950'),
  ('legal_payable',          'ذمم قانونية (مورد)',   '2111'),
  ('legal_fee_payable',      'أتعاب قانونية (مورد)', '2111'),
  ('cargo_freight_payable',  'ذمم شحن (مورد)',       '2111'),
  ('fleet_trip_payable',     'ذمم رحلات (مورد)',     '2111'),
  ('settlement_payable',     'مستحقات تسوية نهاية الخدمة', '2120'),
  ('employee_deductions',    'استقطاعات الموظفين',   '2150')
) AS m(op, label, code)
JOIN chart_of_accounts coa
  ON coa.code = m.code AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ON CONFLICT ("companyId","operationType") DO NOTHING;
