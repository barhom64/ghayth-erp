-- 257_seed_custody_voucher_allocation_rules.sql
--
-- @rollback:
--   DELETE FROM accounting_allocation_rules
--     WHERE name LIKE 'تلقائي — %' AND priority = 55;
--
-- Extends the resolver coverage from migration 256 to two more
-- document types: vouchers and custodies. The voucher route now calls
-- resolveLineAllocation (PR #1664) and the custody route follows the
-- same wiring — both look up rules with documentType in
-- ('voucher_receipt', 'voucher_payment', 'custody') and fill the
-- cost-centre slot from the rule's strategy when the operator hadn't
-- pinned one. Account selection stays operator-driven for these flows
-- (vouchers carry the explicit revenue/expense account the operator
-- picked; custodies hit a fixed 1400 account anchored in the engine).

DO $$
DECLARE
  c_id INTEGER;
BEGIN
  FOR c_id IN
    -- `companies` is not soft-deletable (no deletedAt column; lifecycle is
    -- tracked via `status`). Seed allocation rules for every company.
    SELECT id FROM public.companies
  LOOP
    -- Receipt voucher from a customer → CC from project/branch (header)
    INSERT INTO public.accounting_allocation_rules
      ("companyId", name, "documentType", "lineType", "entityType",
       "costCenterStrategy",
       priority, "isActive", "autoCreateMissing")
    SELECT c_id, 'تلقائي — قبض من عميل', 'voucher_receipt', NULL, 'customer',
           'from_header',
           55, true, false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.accounting_allocation_rules
       WHERE "companyId" = c_id AND name = 'تلقائي — قبض من عميل'
         AND "deletedAt" IS NULL
    );

    -- Payment voucher to a supplier → CC from project/branch
    INSERT INTO public.accounting_allocation_rules
      ("companyId", name, "documentType", "lineType", "entityType",
       "costCenterStrategy",
       priority, "isActive", "autoCreateMissing")
    SELECT c_id, 'تلقائي — دفع لمورد', 'voucher_payment', NULL, 'supplier',
           'from_header',
           55, true, false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.accounting_allocation_rules
       WHERE "companyId" = c_id AND name = 'تلقائي — دفع لمورد'
         AND "deletedAt" IS NULL
    );

    -- Payment voucher to an employee (salary advance / reimbursement)
    --   → CC from employee department
    INSERT INTO public.accounting_allocation_rules
      ("companyId", name, "documentType", "lineType", "entityType",
       "costCenterStrategy",
       priority, "isActive", "autoCreateMissing")
    SELECT c_id, 'تلقائي — دفع لموظف', 'voucher_payment', NULL, 'employee',
           'from_employee_dept',
           55, true, false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.accounting_allocation_rules
       WHERE "companyId" = c_id AND name = 'تلقائي — دفع لموظف'
         AND "deletedAt" IS NULL
    );

    -- Payment voucher for a contract obligation → CC from contract
    INSERT INTO public.accounting_allocation_rules
      ("companyId", name, "documentType", "lineType", "entityType",
       "costCenterStrategy",
       priority, "isActive", "autoCreateMissing")
    SELECT c_id, 'تلقائي — دفع عقد', 'voucher_payment', NULL, 'contract',
           'from_contract',
           55, true, false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.accounting_allocation_rules
       WHERE "companyId" = c_id AND name = 'تلقائي — دفع عقد'
         AND "deletedAt" IS NULL
    );

    -- Custody (cash advance to employee) → CC from employee department
    INSERT INTO public.accounting_allocation_rules
      ("companyId", name, "documentType", "lineType", "entityType",
       "costCenterStrategy",
       priority, "isActive", "autoCreateMissing")
    SELECT c_id, 'تلقائي — عهدة موظف', 'custody', NULL, 'employee',
           'from_employee_dept',
           55, true, false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.accounting_allocation_rules
       WHERE "companyId" = c_id AND name = 'تلقائي — عهدة موظف'
         AND "deletedAt" IS NULL
    );
  END LOOP;
END $$;
