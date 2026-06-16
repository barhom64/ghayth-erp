-- 382_fix_purchase_grni_anchor.sql
-- FIN-SUB-01 follow-up — re-point `purchase_grni` at the dedicated GRNI leaf.
--
-- WHAT:    UPDATE the `purchase_grni` GL intent mapping to 2115
--          ("فواتير لم تُستلم (GRNI)") for every company where 2115
--          exists and is postable.
--
-- WHY:     336_vendor_ap_accounting_anchors.sql wrote the mapping at
--          2150 ("مصروفات مستحقة الدفع" / Accrued Expenses) because
--          the dedicated GRNI leaf 2115 was missing from the chart at
--          the time. 035_inventory_projects_gl_accounts.sql later
--          seeded 2115 to every company (replayed in provision after
--          companies exist), so the dedicated leaf is now live and
--          should be the anchor. Posting GRNI through an
--          accrued-expenses parent muddies the GRNI reconciliation
--          (which expects a single isolatable account).
--
-- SAFETY:  forward-only, idempotent (re-running sets the same value).
--          Scoped to ONE operationType. No row deletes, no schema
--          change. Companies without a postable 2115 (none exist on
--          a fully-seeded DB, but defence in depth) are left
--          untouched and continue to post via the 2150 anchor.
--
-- @rollback: (the prior value depended on each tenant; restore from
--   the audit log if needed. Practically: 2115 is the correct anchor
--   per the FIN-SUB-01 contract — no rollback expected.)

BEGIN;

UPDATE accounting_mappings am
   SET "debitAccountCode"  = '2115',
       "creditAccountCode" = '2115',
       "updatedAt"         = NOW()
 WHERE am."operationType" = 'purchase_grni'
   AND EXISTS (
     SELECT 1 FROM chart_of_accounts c
      WHERE c."companyId" = am."companyId"
        AND c.code = '2115'
        AND c."allowPosting" = true
        AND c."deletedAt" IS NULL
   );

COMMIT;
