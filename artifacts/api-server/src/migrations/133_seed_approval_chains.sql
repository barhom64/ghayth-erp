-- Migration 133: Seed default approval chains and steps
-- Required for: all approval flows — without chains, requests auto-execute

DO $$
DECLARE
  comp RECORD;
  chain_id INTEGER;
BEGIN
  FOR comp IN SELECT id FROM companies LOOP

    -- Leave requests chain
    IF NOT EXISTS (SELECT 1 FROM approval_chains WHERE "companyId" = comp.id AND "chainType" = 'leave_request') THEN
      INSERT INTO approval_chains ("companyId", name, "chainType", "minAmount", "maxAmount")
      VALUES (comp.id, 'سلسلة موافقة الإجازات', 'leave_request', 0, 999999999)
      RETURNING id INTO chain_id;
      INSERT INTO approval_chain_steps ("chainId", "stepOrder", "requiredRole", "timeoutHours", "autoApproveOnTimeout")
      VALUES
        (chain_id, 1, 'hr_manager', 48, false),
        (chain_id, 2, 'general_manager', 72, false);
    END IF;

    -- Purchase orders chain
    IF NOT EXISTS (SELECT 1 FROM approval_chains WHERE "companyId" = comp.id AND "chainType" = 'purchase_order') THEN
      INSERT INTO approval_chains ("companyId", name, "chainType", "minAmount", "maxAmount")
      VALUES (comp.id, 'سلسلة موافقة المشتريات', 'purchase_order', 0, 999999999)
      RETURNING id INTO chain_id;
      INSERT INTO approval_chain_steps ("chainId", "stepOrder", "requiredRole", "timeoutHours", "autoApproveOnTimeout")
      VALUES
        (chain_id, 1, 'finance_manager', 48, false),
        (chain_id, 2, 'general_manager', 72, false);
    END IF;

    -- Expense claims chain
    IF NOT EXISTS (SELECT 1 FROM approval_chains WHERE "companyId" = comp.id AND "chainType" = 'expense') THEN
      INSERT INTO approval_chains ("companyId", name, "chainType", "minAmount", "maxAmount")
      VALUES (comp.id, 'سلسلة موافقة المصروفات', 'expense', 0, 999999999)
      RETURNING id INTO chain_id;
      INSERT INTO approval_chain_steps ("chainId", "stepOrder", "requiredRole", "timeoutHours", "autoApproveOnTimeout")
      VALUES
        (chain_id, 1, 'branch_manager', 48, false),
        (chain_id, 2, 'finance_manager', 72, false);
    END IF;

    -- General requests chain
    IF NOT EXISTS (SELECT 1 FROM approval_chains WHERE "companyId" = comp.id AND "chainType" = 'general') THEN
      INSERT INTO approval_chains ("companyId", name, "chainType", "minAmount", "maxAmount")
      VALUES (comp.id, 'سلسلة موافقة الطلبات العامة', 'general', 0, 999999999)
      RETURNING id INTO chain_id;
      INSERT INTO approval_chain_steps ("chainId", "stepOrder", "requiredRole", "timeoutHours", "autoApproveOnTimeout")
      VALUES
        (chain_id, 1, 'branch_manager', 48, false);
    END IF;

  END LOOP;
END $$;
