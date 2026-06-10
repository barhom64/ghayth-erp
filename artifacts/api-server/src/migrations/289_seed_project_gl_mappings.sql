-- 289_seed_project_gl_mappings.sql
--
-- Seed the project-domain GL mappings (#1594 projects package, Wave C.2).
--
-- ROOT CAUSE (verified live)
-- projectsEngine resolves its accounts via accounting_mappings with hard
-- fallbacks (project_wip→1350, project_cost_transfer→5225) — but NONE of the
-- project operation keys were ever seeded, and the fallbacks exist only on the
-- thin/legacy COA (company 1). On the full seeded COA the WIP account is
-- 1270 "أعمال تحت التنفيذ" and the project-cost account is 5130, so:
--   • project cost → WIP posting has been failing SILENTLY on every cost
--     (try/catch logs and continues — 0 PROJ-COST journals exist),
--   • project closure (WIP → cost transfer) would fail the same way,
--   • the new dev-unit sale COGS (WIP → cost of sales) failed loudly, which is
--     how this whole class surfaced.
--
-- FIX — same pattern as migration 280 (purchase_grni seed): per company, map
-- each operation key to the FIRST existing postable account in a preference
-- list, so finance can remap later from the accounting-mappings screen.
--   project_wip            → 1350 (thin) | 1270 (full)        [WIP asset]
--   project_cost_transfer  → 5225 (thin) | 5130 (full) | 5110 [closure expense]
--   dev_unit_cogs          → 5130 (full) | 5225 (thin) | 5110 [unit-sale COGS]
--   project_cost_cash      → 1100 (thin) | 1111 (full)        [cash credit side:
--                            1100 on the full COA is a non-postable PARENT]
--
-- @rollback:
--   DELETE FROM accounting_mappings WHERE "operationType" IN ('project_wip','project_cost_transfer','dev_unit_cogs','project_cost_cash');

INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT DISTINCT ON (coa."companyId")
  coa."companyId", 'project_wip', 'أعمال تحت التنفيذ (مشاريع)',
  coa.code, coa.code, true, now(), now()
FROM chart_of_accounts coa
WHERE coa.code IN ('1350','1270')
  AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ORDER BY coa."companyId", array_position(ARRAY['1350','1270'], coa.code)
ON CONFLICT ("companyId","operationType") DO NOTHING;

INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT DISTINCT ON (coa."companyId")
  coa."companyId", 'project_cost_transfer', 'تحويل تكلفة المشاريع من WIP',
  coa.code, coa.code, true, now(), now()
FROM chart_of_accounts coa
WHERE coa.code IN ('5225','5130','5110')
  AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ORDER BY coa."companyId", array_position(ARRAY['5225','5130','5110'], coa.code)
ON CONFLICT ("companyId","operationType") DO NOTHING;

INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT DISTINCT ON (coa."companyId")
  coa."companyId", 'dev_unit_cogs', 'تكلفة وحدات التطوير المباعة',
  coa.code, coa.code, true, now(), now()
FROM chart_of_accounts coa
WHERE coa.code IN ('5130','5225','5110')
  AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ORDER BY coa."companyId", array_position(ARRAY['5130','5225','5110'], coa.code)
ON CONFLICT ("companyId","operationType") DO NOTHING;

INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT DISTINCT ON (coa."companyId")
  coa."companyId", 'project_cost_cash', 'تكلفة مشروع — الطرف الدائن (نقد)',
  coa.code, coa.code, true, now(), now()
FROM chart_of_accounts coa
WHERE coa.code IN ('1100','1111')
  AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ORDER BY coa."companyId", array_position(ARRAY['1100','1111'], coa.code)
ON CONFLICT ("companyId","operationType") DO NOTHING;
