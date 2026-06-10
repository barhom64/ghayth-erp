-- 291_seed_purchase_grni_mapping.sql
--
-- Operational-readiness fix (#1594 — controllable GL mappings, write-path review).
--
-- PROBLEM
-- The goods-receipt (GRN) posting resolves the GRNI (Goods Received, Not yet
-- Invoiced) clearing account via
--   financialEngine.resolveAccountCode(companyId, "purchase_grni", credit/debit, "2115")
-- With no `purchase_grni` row in accounting_mappings, it falls back to the
-- hard-coded "2115", which is NOT in the seeded Saudi chart — so receiving a
-- purchase order 500'd ("الحساب 2115 غير موجود في شجرة الحسابات") and the
-- purchase→PO→GRN→GL chain could not complete its journal.
--
-- FIX
-- Seed a controllable `purchase_grni` mapping (admin-editable, like the
-- mappings from 254/256/257) → the company's postable trade-payables leaf
-- 2111 (موردون محليون); GRNI is an accrued-payable, so the trade-payables
-- family is the correct anchor until a tenant pins a dedicated 2115 leaf.
-- Only inserted where the company HAS a postable 2111 (minimal charts get
-- no row and keep their existing fallback behaviour). ON CONFLICT DO NOTHING
-- preserves any operator override — controllable, not static.
--
-- @rollback:
--   DELETE FROM accounting_mappings WHERE "operationType" = 'purchase_grni';

INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT coa."companyId", 'purchase_grni', 'بضاعة مستلمة لم تُفوتر (GRNI)', coa.code, coa.code, true, now(), now()
FROM chart_of_accounts coa
WHERE coa.code = '2111' AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ON CONFLICT ("companyId","operationType") DO NOTHING;
