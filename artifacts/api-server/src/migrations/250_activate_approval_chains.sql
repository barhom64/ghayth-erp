-- Migration 250: Activate approval chains for the chain types the app uses
--
-- WHAT: seed approval_chains + approval_chain_steps, for every existing
--       company, for the 10 ApprovalChainType values the application actually
--       passes to initiateApprovalChain() — expenses, advances, procurement,
--       purchases, letters, loans, overtime, exit, leaves, umrah_commission_plan.
--       Idempotent: a NOT EXISTS guard per (company, chainType) means re-running
--       is a no-op and companies that already have a chain are left untouched.
--
-- WHY:  initiateApprovalChain() looks up approval_chains by "chainType". The
--       only previously-seeded types (migration 133) were leave_request /
--       purchase_order / expense / general — which match NONE of the chain
--       types the callers pass. With no matching chain the function returns
--       requiresApproval=false, so every expense / advance / custody / purchase
--       / loan / overtime / exit / official-letter / umrah-commission flow
--       auto-executed with no approval step. This migration arms the engine.
--
-- @rollback DELETE FROM approval_chain_steps WHERE "chainId" IN (SELECT id FROM approval_chains WHERE "chainType" IN ('expenses','advances','procurement','purchases','letters','loans','overtime','exit','leaves','umrah_commission_plan')); DELETE FROM approval_chains WHERE "chainType" IN ('expenses','advances','procurement','purchases','letters','loans','overtime','exit','leaves','umrah_commission_plan');

DO $$
DECLARE
  comp RECORD;
  c RECORD;
  new_chain_id INTEGER;
  defs JSONB := '[
    {"type":"leaves",                "name":"سلسلة موافقة الإجازات",        "roles":["hr_manager","general_manager"]},
    {"type":"expenses",              "name":"سلسلة موافقة المصروفات",       "roles":["branch_manager","finance_manager"]},
    {"type":"advances",              "name":"سلسلة موافقة السلف والعهد",    "roles":["finance_manager","general_manager"]},
    {"type":"purchases",             "name":"سلسلة موافقة أوامر الشراء",    "roles":["finance_manager","general_manager"]},
    {"type":"procurement",           "name":"سلسلة موافقة طلبات الشراء",    "roles":["finance_manager","general_manager"]},
    {"type":"letters",               "name":"سلسلة موافقة الخطابات الرسمية","roles":["hr_manager","general_manager"]},
    {"type":"loans",                 "name":"سلسلة موافقة القروض",          "roles":["hr_manager","finance_manager"]},
    {"type":"overtime",              "name":"سلسلة موافقة العمل الإضافي",   "roles":["branch_manager","hr_manager"]},
    {"type":"exit",                  "name":"سلسلة موافقة إنهاء الخدمة",    "roles":["hr_manager","general_manager"]},
    {"type":"umrah_commission_plan", "name":"سلسلة موافقة خطط العمولات",    "roles":["finance_manager","general_manager"]}
  ]'::jsonb;
BEGIN
  FOR comp IN SELECT id FROM companies LOOP
    FOR c IN SELECT * FROM jsonb_to_recordset(defs) AS x(type text, name text, roles jsonb) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM approval_chains
        WHERE "companyId" = comp.id AND "chainType" = c.type
      ) THEN
        INSERT INTO approval_chains ("companyId", name, "chainType", "minAmount", "maxAmount", "isActive")
        VALUES (comp.id, c.name, c.type, 0, 999999999, true)
        RETURNING id INTO new_chain_id;

        INSERT INTO approval_chain_steps ("chainId", "stepOrder", "requiredRole", "timeoutHours", "autoApproveOnTimeout")
        SELECT new_chain_id, t.ord::int, t.role, 48, false
        FROM jsonb_array_elements_text(c.roles) WITH ORDINALITY AS t(role, ord);
      END IF;
    END LOOP;
  END LOOP;
END $$;
