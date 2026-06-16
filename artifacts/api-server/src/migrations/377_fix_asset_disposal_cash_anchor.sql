-- 377_fix_asset_disposal_cash_anchor.sql
-- FIN #2140 slice 5-a follow-up — correct the asset_disposal_cash anchor.
--
-- WHAT:    re-point the `asset_disposal_cash` GL intent mapping at the
--          company's MAIN CASH leaf (1111) instead of whatever the
--          338 keyword-resolver happened to pick.
--
-- WHY:     338_fixed_assets_anchors.sql seeds asset_disposal_cash with
--          a fallback of 1100 (الأصول المتداولة / Current Assets). 1100
--          is a non-postable CONTROL parent — the parent-account posting
--          guard (#2197) explicitly forbids posting to it. So 338's
--          step-1 (use the fallback if postable) always failed for this
--          intent and step-2 keyword-matched to an arbitrary postable
--          cash account (e.g. 1113 العهد النقدية / Cash Custody). For an
--          asset-disposal cash receipt the correct anchor is the MAIN
--          CASH account (1111), not petty/custody cash. This migration
--          makes the anchor deterministic + accounting-correct.
--
-- HOW:     UPDATE the text code columns (debitAccountCode / creditAccountCode
--          — the columns 338 actually writes for the asset_* intents) to
--          '1111' for every company whose chart_of_accounts has a postable
--          1111. Companies without a postable 1111 are left untouched
--          (their existing resolution stands).
--
-- SAFETY:  forward-only, idempotent (re-running sets the same value).
--          Scoped to ONE operationType. No row deletes, no schema change,
--          no effect on any other intent mapping.
--
-- @rollback: (no clean automatic rollback — the prior value was a
--   non-deterministic keyword-match. To revert, re-run 338's resolver
--   for asset_disposal_cash. Practically: not needed — 1111 is the
--   correct anchor.)

BEGIN;

UPDATE accounting_mappings am
   SET "debitAccountCode"  = '1111',
       "creditAccountCode" = '1111',
       "updatedAt"         = NOW()
 WHERE am."operationType" = 'asset_disposal_cash'
   AND EXISTS (
     SELECT 1 FROM chart_of_accounts c
      WHERE c."companyId" = am."companyId"
        AND c.code = '1111'
        AND c."allowPosting" = true
        AND c."deletedAt" IS NULL
   );

COMMIT;
