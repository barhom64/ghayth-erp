-- ===========================================================================
-- 323_seed_properties_maintenance_and_vat_mappings.sql
-- ---------------------------------------------------------------------------
-- WHAT:  Extends migration 257 with the FOUR operationTypes propertiesEngine
--        also resolves but which were never seeded:
--          - property_maintenance_expense   (DR side of postMaintenanceExpenseGL)
--          - property_maintenance_payable   (CR side of postMaintenanceExpenseGL)
--          - vat_output                     (CR side of rent + sale + owner-bill)
--          - property_building_asset        (used by future postSaleGL stack)
--          - property_building_purchase_cash (used by postBuildingAssetGL)
--        All four already have hardcoded fallbacks inside the engine (6400 /
--        2100 / 2200 / 1520 / 1100). Those fallbacks do NOT exist as postable
--        accounts in the seeded Saudi COA — so resolving them falls through
--        to ValidationError "الحساب غير موجود". Caught live by the extended
--        rent journey (verify-property-rent-journey.sh) on the maintenance
--        completion step.
-- WHY:   Without these rows the maintenance-completion path 502s end-to-end
--        and the whole non-residential GL (commercial VAT, sale, owner-
--        billed maintenance, building-asset capitalisation) inherits the
--        same blind spot. Adding them under the controllable accounting_
--        mappings layer (same pattern as 257) means an operator who later
--        wants a different account just edits one row — no code change.
-- SAFETY: Additive, idempotent. Same INSERT … SELECT … ON CONFLICT pattern
--         as 257 (rows only land when the target COA leaf exists AND is
--         marked postable). Re-runs are no-ops.
-- @rollback:
--   DELETE FROM accounting_mappings WHERE "operationType" IN (
--     'property_maintenance_expense','property_maintenance_payable',
--     'vat_output','property_building_asset',
--     'property_building_purchase_cash');
--   (only safe if these mappings were not manually customised afterwards.)
-- ===========================================================================

INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT coa."companyId", v.op, v.label,
       CASE WHEN v.side = 'debit'  THEN coa.code END,
       CASE WHEN v.side = 'credit' THEN coa.code END,
       true, now(), now()
FROM (VALUES
  -- Maintenance: expense lands on the property-specific buildings line;
  -- payable on the generic accrued-expenses-payable bucket (or per-
  -- vendor when a vendor was supplied — current engine doesn't yet
  -- pass vendorId, so the accrual goes here).
  ('property_maintenance_expense',   'debit',  '5610', 'صيانة المباني والوحدات'),
  ('property_maintenance_payable',   'credit', '2150', 'مصروفات مستحقة الدفع'),
  -- VAT output: shared with the existing rent VAT credit (#2039). 2131
  -- is the seeded payable account for output VAT.
  ('vat_output',                     'credit', '2131', 'ضريبة القيمة المضافة المستحقة (مخرجات)'),
  -- Building asset capitalisation (postBuildingAssetGL) — DR the asset,
  -- CR cash. Both currently fall back to non-postable parents
  -- (1520 / 1100); map them to the postable Saudi-COA leaves.
  ('property_building_asset',        'debit',  '1240', 'المباني والعقارات'),
  ('property_building_purchase_cash','credit', '1111', 'النقدية في البنوك')
) AS v(op, side, code, label)
JOIN chart_of_accounts coa
  ON coa.code = v.code AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ON CONFLICT ("companyId","operationType") DO NOTHING;
