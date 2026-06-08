-- 256_seed_default_allocation_rules_per_company.sql
--
-- @rollback:
--   DELETE FROM accounting_allocation_rules
--     WHERE name LIKE 'تلقائي — %' AND priority = 50;
--
-- Activates the centralised resolver (accountingAllocation.ts) for
-- every existing company by seeding a baseline set of rules that map
-- the common Saudi operations to their canonical expense accounts +
-- the right cost-centre strategy. Without these rows the resolver
-- table is empty per tenant and the operator has to author rules
-- before the auto-allocation can fire — the user explicitly asked
-- for cost-centre derivation by operation type to be the system
-- default, not a per-tenant set-up step ("النظام المالي المركزي
-- القوي ... الذي يحدد مراكز التكلفة تلقائيا حسب النشاط والنوع").
--
-- Rules use the resolver's existing semantics:
--   - documentType matches the route handler that calls the resolver
--   - lineType is the operationType / expense category
--   - entityType anchors the cost-centre strategy (from_vehicle /
--     from_property / from_project) so the cost-centre auto-creator
--     (costCenterAutoCreate.ts) lands the operator on the right CC
--   - expenseAccountId is the COA row matched by Saudi default code
--   - priority=50 leaves room for tenant overrides at 40 and below
--
-- Tenants on a custom COA (no row at the canonical code) get NULL
-- in expenseAccountId — the resolver falls back to the route's
-- existing account-resolution path (financialEngine.resolveAccountCode
-- with the same canonical key), so the rule is a no-op rather than a
-- failure mode.

DO $$
DECLARE
  c_id INTEGER;
BEGIN
  FOR c_id IN
    -- `companies` is not soft-deletable (no deletedAt column; lifecycle is
    -- tracked via `status`). Seed allocation rules for every company.
    SELECT id FROM public.companies
  LOOP
    -- Vehicle fuel → expense 5350, CC from vehicle
    INSERT INTO public.accounting_allocation_rules
      ("companyId", name, "documentType", "lineType", "entityType",
       "expenseAccountId", "costCenterStrategy", "requiresEntityLink",
       priority, "isActive", "autoCreateMissing")
    SELECT c_id, 'تلقائي — وقود مركبة', 'expense', 'fuel', 'vehicle',
           coa.id, 'from_vehicle', true, 50, true, true
    FROM public.chart_of_accounts coa
    WHERE coa."companyId" = c_id AND coa.code = '5350' AND coa."deletedAt" IS NULL
    LIMIT 1;

    -- Vehicle maintenance → expense 5360, CC from vehicle
    INSERT INTO public.accounting_allocation_rules
      ("companyId", name, "documentType", "lineType", "entityType",
       "expenseAccountId", "costCenterStrategy", "requiresEntityLink",
       priority, "isActive", "autoCreateMissing")
    SELECT c_id, 'تلقائي — صيانة مركبة', 'expense', 'maintenance', 'vehicle',
           coa.id, 'from_vehicle', true, 50, true, true
    FROM public.chart_of_accounts coa
    WHERE coa."companyId" = c_id AND coa.code = '5360' AND coa."deletedAt" IS NULL
    LIMIT 1;

    -- Property rent → expense 5400, CC from property
    INSERT INTO public.accounting_allocation_rules
      ("companyId", name, "documentType", "lineType", "entityType",
       "expenseAccountId", "costCenterStrategy", "requiresEntityLink",
       priority, "isActive", "autoCreateMissing")
    SELECT c_id, 'تلقائي — إيجار عقار', 'expense', 'rent', 'property',
           coa.id, 'from_property', true, 50, true, true
    FROM public.chart_of_accounts coa
    WHERE coa."companyId" = c_id AND coa.code = '5400' AND coa."deletedAt" IS NULL
    LIMIT 1;

    -- Employee salary → expense 5100, CC from employee department
    INSERT INTO public.accounting_allocation_rules
      ("companyId", name, "documentType", "lineType", "entityType",
       "expenseAccountId", "costCenterStrategy", "requiresEntityLink",
       priority, "isActive", "autoCreateMissing")
    SELECT c_id, 'تلقائي — راتب موظف', 'expense', 'salary', 'employee',
           coa.id, 'from_employee_dept', true, 50, true, false
    FROM public.chart_of_accounts coa
    WHERE coa."companyId" = c_id AND coa.code = '5100' AND coa."deletedAt" IS NULL
    LIMIT 1;

    -- Employee advance → asset/receivable 1430, CC from employee dept
    INSERT INTO public.accounting_allocation_rules
      ("companyId", name, "documentType", "lineType", "entityType",
       "expenseAccountId", "costCenterStrategy", "requiresEntityLink",
       priority, "isActive", "autoCreateMissing")
    SELECT c_id, 'تلقائي — سلفة موظف', 'expense', 'advance', 'employee',
           coa.id, 'from_employee_dept', true, 50, true, false
    FROM public.chart_of_accounts coa
    WHERE coa."companyId" = c_id AND coa.code = '1430' AND coa."deletedAt" IS NULL
    LIMIT 1;

    -- Vendor invoice — general expense → 5500, CC from header project/dept
    INSERT INTO public.accounting_allocation_rules
      ("companyId", name, "documentType", "lineType", "entityType",
       "expenseAccountId", "costCenterStrategy",
       priority, "isActive", "autoCreateMissing")
    SELECT c_id, 'تلقائي — فاتورة مورد عامة', 'vendor_invoice', NULL, 'supplier',
           coa.id, 'from_header',
           60, true, false
    FROM public.chart_of_accounts coa
    WHERE coa."companyId" = c_id AND coa.code = '5500' AND coa."deletedAt" IS NULL
    LIMIT 1;

    -- Customer invoice — revenue → 4000, CC from project/branch
    INSERT INTO public.accounting_allocation_rules
      ("companyId", name, "documentType", "lineType", "entityType",
       "revenueAccountId", "costCenterStrategy",
       priority, "isActive", "autoCreateMissing")
    SELECT c_id, 'تلقائي — إيراد مبيعات', 'invoice', 'service', 'client',
           coa.id, 'from_header',
           60, true, false
    FROM public.chart_of_accounts coa
    WHERE coa."companyId" = c_id AND coa.code = '4000' AND coa."deletedAt" IS NULL
    LIMIT 1;

    -- Insurance → expense 5450, CC from header
    INSERT INTO public.accounting_allocation_rules
      ("companyId", name, "documentType", "lineType",
       "expenseAccountId", "costCenterStrategy",
       priority, "isActive", "autoCreateMissing")
    SELECT c_id, 'تلقائي — تأمين', 'expense', 'insurance',
           coa.id, 'from_header',
           50, true, false
    FROM public.chart_of_accounts coa
    WHERE coa."companyId" = c_id AND coa.code = '5450' AND coa."deletedAt" IS NULL
    LIMIT 1;

    -- Legal fees → expense 5470, CC from header
    INSERT INTO public.accounting_allocation_rules
      ("companyId", name, "documentType", "lineType",
       "expenseAccountId", "costCenterStrategy",
       priority, "isActive", "autoCreateMissing")
    SELECT c_id, 'تلقائي — أتعاب قانونية', 'expense', 'legal_fee',
           coa.id, 'from_header',
           50, true, false
    FROM public.chart_of_accounts coa
    WHERE coa."companyId" = c_id AND coa.code = '5470' AND coa."deletedAt" IS NULL
    LIMIT 1;
  END LOOP;
END $$;
