-- 362_seed_finance_conflation_mappings.sql
--
-- #2277 (account-conflation) — controllable mappings for the unambiguous,
-- no-new-account purposes. Mirrors 291/323: seed accounting_mappings only
-- where the target leaf exists + is postable; ON CONFLICT DO NOTHING preserves
-- operator overrides (controllable, not static).
--
-- PROBLEM
-- Two posting purposes fall to a SHARED fallback that misclassifies them:
--   • property_sale_gain → fell back to 4910 «فوائد ومرابحات بنكية» (Bank
--     Interest) — a property-sale gain is NOT bank interest. Wrong P&L line.
--   • leave_accrual_liability → fell back to the generic 2150 «مصروفات مستحقة»
--     (correct family, but unmapped/uncontrollable).
--
-- FIX
-- Pin each to its correct postable leaf:
--   • property_sale_gain → 4920 «أرباح بيع أصول ثابتة» (Gain on Sale of Assets) —
--     a property is a fixed asset, so its disposal gain belongs here, NOT 4910.
--   • leave_accrual_liability → 2150 «مصروفات مستحقة الدفع» (Accrued Expenses) —
--     making the (already-correct) fallback an explicit, admin-editable mapping.
-- The remaining 11 conflated purposes (legal/owner/commission/fx-gain/fines/…)
-- need NEW dedicated sub-accounts + an accounting decision and are intentionally
-- NOT in this migration (see #2277).
--
-- @rollback:
--   DELETE FROM accounting_mappings WHERE "operationType" IN ('property_sale_gain','leave_accrual_liability');

-- property_sale_gain → 4920 (Gain on Sale of Assets) — corrects 4910 misclassification.
INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT coa."companyId", 'property_sale_gain', 'أرباح بيع عقارات', coa.code, coa.code, true, now(), now()
FROM chart_of_accounts coa
WHERE coa.code = '4920' AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ON CONFLICT ("companyId","operationType") DO NOTHING;

-- leave_accrual_liability → 2150 (Accrued Expenses) — pin the correct fallback.
INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT coa."companyId", 'leave_accrual_liability', 'التزام إجازات مستحقة', coa.code, coa.code, true, now(), now()
FROM chart_of_accounts coa
WHERE coa.code = '2150' AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ON CONFLICT ("companyId","operationType") DO NOTHING;
