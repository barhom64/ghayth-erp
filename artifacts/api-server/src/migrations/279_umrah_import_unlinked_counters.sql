-- Migration 279: umrah_import_batches.unlinked* counters
--
-- §3 of #1870. The engine already silently inserts pilgrims with
-- NULL agentId/groupId/subAgentId when the source row lacks the
-- nuskAgentNumber/nuskGroupNumber/nuskCode resolver inputs (see
-- resolveAgent / resolveGroup / resolveSubAgent fallback). The
-- operator never sees this — the batch row reports newCount=N
-- and they assume N is the visible-data count.
--
-- These three counters get written during confirmMutamersImport's
-- row loop and surface on the batch detail page + the new
-- /umrah/import/:batchId/unlinked recovery screen. They are
-- nullable for back-compat with legacy batches that pre-date the
-- counters; the UI treats NULL as "unknown, no recovery needed".
--
-- Pairs with the read-side query in
-- routes/umrah.ts → /import/batches/:id/unlinked which JOINs
-- umrah_pilgrims to umrah_import_changes to surface the actual
-- row data per unlinkage category.
--
-- @rollback: ALTER TABLE umrah_import_batches
--   DROP COLUMN IF EXISTS "unlinkedAgentCount",
--   DROP COLUMN IF EXISTS "unlinkedGroupCount",
--   DROP COLUMN IF EXISTS "unlinkedSubAgentCount";

ALTER TABLE umrah_import_batches
  ADD COLUMN IF NOT EXISTS "unlinkedAgentCount" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unlinkedGroupCount" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unlinkedSubAgentCount" integer DEFAULT 0;
