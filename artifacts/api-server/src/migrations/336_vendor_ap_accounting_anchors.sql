-- ===========================================================================
-- 336_vendor_ap_accounting_anchors.sql
-- ---------------------------------------------------------------------------
-- WHAT:    plant the accounting anchors for the Accounts-Payable vendor
--          documents (vendor invoices / vendor advances / vendor credit
--          memos) so their GL postings resolve to REAL, POSTABLE accounts on
--          every company — existing and freshly seeded.
--          (1) add a new postable account 1190 "دفعات مقدمة للموردين" to every
--              company chart that lacks it (the AP mirror of the customer
--              advance account; the code-level fallback was 1420 which never
--              existed in the canonical chart).
--          (2) seed/fill accounting_mappings for the nine AP operation intents
--              to the correct postable detail accounts, FILLING the empty
--              placeholder rows that already exist (purchase_vendor_ap,
--              purchase_grni, purchase_grn_vat) and INSERTing the missing ones.
-- WHY:     #2140 slice 2-أ. A clean-install probe proved 10/11 finance-purchase
--          intents resolved to broken accounts: 3 MISSING (1420, 1400, 2115)
--          and 5 GROUP/non-postable (2100, 2110, 5400, 1100, +2110), plus one
--          semantically wrong (vendor_return_revenue → 5550 "إيجار مركبات").
--          createJournalEntry rejects group/missing accounts, so vendor invoice
--          + advance + credit ALL 500'd at creation on a fresh tenant. The
--          handler code-fallbacks are corrected in the same PR; this migration
--          fixes the DATA layer (chart + accounting_mappings) so the binding is
--          explicit, per-tenant configurable, and auditable — not buried in code.
--
--          Account choices (postable detail, never a group/parent):
--            vendor_advance_receivable → 1190 NEW (asset, ↑1100, postable)
--            vendor_advance_cash       → 1111 الصندوق الرئيسي (cash)
--            purchase_vendor_ap        → 2111 موردون محليون (AP detail)
--            vendor_credit_clearing    → 2111 موردون محليون (AP detail)
--            vendor_invoice_expense    → 5340 (uncategorised default; the
--                                        handler honours a per-invoice
--                                        expenseAccountCode override first)
--            vendor_return_revenue     → 5110 تكلفة البضاعة المباعة (contra-cost
--                                        for purchase returns; replaces the
--                                        wrong vehicle-rental 5550)
--            purchase_vat_input        → 1180 ضريبة مدخلات (was missing 1400)
--            vat_input_reversal        → 1180 ضريبة مدخلات
--            purchase_grni             → 2150 مصروفات مستحقة الدفع (GRNI accrual;
--                                        was missing 2115)
--
-- SAFETY:  idempotent. The account insert is ON CONFLICT DO NOTHING. The
--          mapping upsert FILLS empty rows only (debitAccountCode IS NULL AND
--          debitAccountId IS NULL) and NEVER overwrites a tenant-customised
--          mapping. Re-running changes nothing.
--
-- @rollback
--   DELETE FROM accounting_mappings
--     WHERE "operationLabel" = '#2140 vendor AP anchors';
--   DELETE FROM chart_of_accounts WHERE code = '1190'
--     AND id NOT IN (SELECT DISTINCT "accountId" FROM journal_lines WHERE "accountId" IS NOT NULL);
--   -- (1190 is only removable while no JE line references it.)
-- ===========================================================================

-- (1) New account 1190 "دفعات مقدمة للموردين" on every company chart.
INSERT INTO chart_of_accounts
  ("companyId", code, name, "nameEn", type, "parentId", "parentCode", level, "allowPosting", "isActive", status)
SELECT
  c.id, '1190', 'دفعات مقدمة للموردين', 'Advances to Suppliers', 'asset',
  (SELECT p.id FROM chart_of_accounts p
     WHERE p."companyId" = c.id AND p.code = '1100' AND p."deletedAt" IS NULL LIMIT 1),
  '1100', 3, true, true, 'active'
FROM companies c
ON CONFLICT ("companyId", code) DO NOTHING;

-- (2) AP operation intents → correct postable accounts.
WITH intent(op, code) AS (VALUES
  ('vendor_advance_receivable', '1190'),
  ('vendor_advance_cash',       '1111'),
  ('purchase_vendor_ap',        '2111'),
  ('vendor_credit_clearing',    '2111'),
  ('vendor_invoice_expense',    '5340'),
  ('vendor_return_revenue',     '5110'),
  ('purchase_vat_input',        '1180'),
  ('vat_input_reversal',        '1180'),
  ('purchase_grni',             '2150')
),
resolved AS (
  -- Only bind where the target account actually exists AND is postable on
  -- that company's chart. A company whose chart lacks the code is skipped
  -- (it keeps the corrected code-level fallback), never bound to a bad code.
  SELECT c.id AS company_id, i.op, a.code AS resolved_code
  FROM companies c
  CROSS JOIN intent i
  JOIN chart_of_accounts a
    ON a."companyId" = c.id AND a.code = i.code
   AND a."allowPosting" = true AND a."deletedAt" IS NULL
)
INSERT INTO accounting_mappings
  ("companyId", "operationType", "operationLabel", "debitAccountCode", "creditAccountCode", "isActive", "createdAt", "updatedAt")
SELECT company_id, op, '#2140 vendor AP anchors', resolved_code, resolved_code, true, now(), now()
FROM resolved
ON CONFLICT ("companyId", "operationType") DO UPDATE SET
  "debitAccountCode"  = EXCLUDED."debitAccountCode",
  "creditAccountCode" = EXCLUDED."creditAccountCode",
  "operationLabel"    = EXCLUDED."operationLabel",
  "updatedAt"         = now()
WHERE accounting_mappings."debitAccountCode" IS NULL
  AND accounting_mappings."creditAccountCode" IS NULL
  AND accounting_mappings."debitAccountId" IS NULL
  AND accounting_mappings."creditAccountId" IS NULL;
