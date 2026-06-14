-- 352_rbac_sod_rules_expansion.sql
--
-- WHAT:  expands the seeded Segregation-of-Duties (SoD) rule set. Migration
--        109 shipped 5 baseline rules (journal/invoice/purchase create↔approve,
--        payroll calculate↔approve, employee self-approve). This adds 11 more
--        cross-feature and same-feature conflict pairs that the runtime
--        enforcer (sodEnforcement.ts) and the admin SoD report consume.
--
-- WHY:   the baseline only covered the most obvious finance/HR pairs. Real
--        Saudi-accounting control frameworks separate many more duties:
--        whoever maintains the vendor master must not approve that vendor's
--        purchase order; whoever creates a custody/loan/overtime/exit
--        settlement must not approve it; whoever moves stock between branches
--        must not approve the transfer. Each rule below pairs a `create`
--        (or master-data) action with the corresponding `approve`.
--
-- SCOPE: all rules are SYSTEM rules (companyId NULL) — they apply to every
--        tenant and cannot be deleted from the UI (only toggled off). Every
--        feature_key / action below is a real entry in featureCatalog.ts
--        with the referenced action in its availableActions.
--
-- SAFETY: fully idempotent — ON CONFLICT ("companyId", rule_key) DO NOTHING,
--         matching the rbac_sod_rules unique constraint from migration 109.
--         Adds rows only; never edits or deletes existing rules (including
--         any per-company rules an admin created).
--
-- @rollback: DELETE FROM rbac_sod_rules WHERE "companyId" IS NULL AND rule_key IN ('finance_vendor_create_purchase_approve','finance_purchase_create_invoice_approve','finance_custody_create_approve','finance_budget_create_approve','finance_recurring_create_journal_approve','finance_contract_create_invoice_approve','hr_loan_create_approve','hr_exit_settlement_create_approve','hr_overtime_create_approve','warehouse_transfer_create_approve','property_contract_create_approve');

INSERT INTO rbac_sod_rules (rule_key, label_ar, feature_a, action_a, feature_b, action_b, severity)
VALUES
  -- Vendor master steward must not approve that vendor's purchase order.
  ('finance_vendor_create_purchase_approve', 'فصل إدارة بيانات الموردين عن اعتماد أوامر الشراء', 'finance.vendors', 'create', 'finance.purchase', 'approve', 'high'),
  -- Whoever raises the purchase must not approve the invoice that pays it.
  ('finance_purchase_create_invoice_approve', 'فصل إنشاء أمر الشراء عن اعتماد فاتورته', 'finance.purchase', 'create', 'finance.invoices', 'approve', 'high'),
  -- Custody (عُهدة): disburser is not the approver.
  ('finance_custody_create_approve', 'فصل صرف العهدة عن اعتمادها', 'finance.custodies', 'create', 'finance.custodies', 'approve', 'high'),
  -- Budget preparer is not the budget approver.
  ('finance_budget_create_approve', 'فصل إعداد الميزانية عن اعتمادها', 'finance.budget', 'create', 'finance.budget', 'approve', 'medium'),
  -- Recurring-entry author must not approve the journal it posts to.
  ('finance_recurring_create_journal_approve', 'فصل إنشاء القيد المتكرر عن اعتماد القيد المحاسبي', 'finance.recurring', 'create', 'finance.journal', 'approve', 'high'),
  -- Vendor-contract author must not approve invoices billed against it.
  ('finance_contract_create_invoice_approve', 'فصل إبرام عقد المورّد عن اعتماد فواتيره', 'finance.contracts', 'create', 'finance.invoices', 'approve', 'medium'),
  -- Loan creator is not the loan approver (sensitive amounts).
  ('hr_loan_create_approve', 'فصل إنشاء السلفة عن اعتمادها', 'hr.loans', 'create', 'hr.loans', 'approve', 'high'),
  -- End-of-service settlement: preparer is not the approver (critical payout).
  ('hr_exit_settlement_create_approve', 'فصل إعداد مكافأة نهاية الخدمة عن اعتمادها', 'hr.exit', 'create', 'hr.exit', 'approve', 'critical'),
  -- Overtime requester/recorder is not the overtime approver.
  ('hr_overtime_create_approve', 'فصل تسجيل العمل الإضافي عن اعتماده', 'hr.overtime', 'create', 'hr.overtime', 'approve', 'medium'),
  -- Inter-branch stock transfer initiator is not the transfer approver.
  ('warehouse_transfer_create_approve', 'فصل إنشاء التحويل المخزني عن اعتماده', 'warehouse.transfers', 'create', 'warehouse.transfers', 'approve', 'medium'),
  -- Lease/property contract author is not the contract approver.
  ('property_contract_create_approve', 'فصل إبرام عقد العقار عن اعتماده', 'properties.contracts', 'create', 'properties.contracts', 'approve', 'medium')
ON CONFLICT ("companyId", rule_key) DO NOTHING;
