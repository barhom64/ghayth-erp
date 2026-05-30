-- ===========================================================================
-- 235_mailbox_accounts_branch.sql
-- ---------------------------------------------------------------------------
-- WHAT:    Adds an optional "branchId" to mailbox_accounts so a connected
--          mailbox can be scoped to a specific branch (e.g. all door.sa
--          department mailboxes under the "الدور الحديثة" branch) instead of
--          living only under the connecting user.
--
-- WHY:     The original design (222) tied every mailbox to (companyId,
--          userId) — "each employee connects their own inbox". Operators
--          asked to register shared department mailboxes at the branch
--          level so they're visible across the branch's team, not hidden
--          under one person's account.
--
-- SAFETY:  Additive only — nullable column, no backfill. Existing per-user
--          mailboxes keep branchId = NULL and behave exactly as before.
--
-- @rollback:
--   DROP INDEX IF EXISTS idx_mailbox_accounts_branch;
--   ALTER TABLE public.mailbox_accounts DROP COLUMN IF EXISTS "branchId";
-- ===========================================================================

ALTER TABLE public.mailbox_accounts
  ADD COLUMN IF NOT EXISTS "branchId" integer;

-- Branch-scoped lookup (list a branch's shared mailboxes). Partial on
-- live rows only, matching the other mailbox_accounts indexes.
CREATE INDEX IF NOT EXISTS idx_mailbox_accounts_branch
  ON public.mailbox_accounts("companyId", "branchId")
  WHERE "deletedAt" IS NULL;
