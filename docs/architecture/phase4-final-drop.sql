-- ===========================================================================
-- DEFERRED: Phase 4 Final DROP — communications unification complete
-- ---------------------------------------------------------------------------
-- This is NOT a regular migration. It is NOT in `artifacts/api-server/src/migrations/`
-- because the migration runner would apply it on the next deploy, and the
-- DROP needs an explicit operator-confirmed soak window first.
--
-- WHEN TO RUN: after observing in production logs for at least 7 days that:
--   1. Zero reads against `communications_log`, `notification_log`,
--      `email_queue`, `sms_queue`, `whatsapp_queue` from application code.
--      Check with:
--        SELECT relname, n_tup_fetched
--          FROM pg_stat_user_tables
--         WHERE relname IN ('communications_log','notification_log',
--                           'email_queue','sms_queue','whatsapp_queue');
--      n_tup_fetched should stop growing after the slice-6 deploy.
--
--   2. cronScheduler reverse-mirror UPDATEs to those tables are still
--      running (visible via n_tup_upd). That's expected — they're the
--      shadow-keep-alive that lets you DROP confidently.
--
--   3. Manual verification that the inbox + manager dashboards still
--      render correctly after a service restart with the slice-9 deploy.
--
-- HOW TO RUN: from a psql session on the production DB, after putting
-- the API server in maintenance mode (so no in-flight writer hits a
-- missing table mid-statement):
--
--   psql $DATABASE_URL -1 -f docs/architecture/phase4-final-drop.sql
--
-- The single transaction (-1) ensures any failure rolls back everything.
--
-- AFTER RUNNING:
--   - Deploy a code-cleanup PR removing the now-dead legacy-table writes
--     from messageSender / notificationEngine / eventListeners / requests /
--     inbox-calls / cronScheduler reverse-mirror. The system continues to
--     work without those writes because they're no-op'd by the missing
--     tables, but removing them speeds up the hot path.
--
--   - The v_message_log_all view (created in migration 221) already
--     queries only message_log, so no view rebuild is required.
--
-- ROLLBACK: not directly possible — the DROP discards the data. The only
-- recovery path is a point-in-time restore from a pre-DROP backup. Take
-- a fresh pg_dump immediately before running this, store it for 30 days.
-- ===========================================================================

BEGIN;

-- Sanity-check: refuse to run if any legacy table still has unmirrored
-- rows (rows whose legacyId isn't in message_log / outbound_queue).
-- This guards against running the DROP before the soak has fully drained
-- the dual-write to the unified tables.

DO $$
DECLARE
  unmirrored_log integer;
  unmirrored_email integer;
  unmirrored_sms integer;
  unmirrored_whatsapp integer;
BEGIN
  SELECT COUNT(*) INTO unmirrored_log
    FROM communications_log cl
   WHERE NOT EXISTS (
     SELECT 1 FROM message_log ml
      WHERE ml."legacySource" = 'communications_log' AND ml."legacyId" = cl.id
   );
  IF unmirrored_log > 0 THEN
    RAISE EXCEPTION 'communications_log has % unmirrored rows — re-run the migration-221 backfill or extend the soak before dropping.', unmirrored_log;
  END IF;

  SELECT COUNT(*) INTO unmirrored_email
    FROM email_queue eq
   WHERE eq.status IN ('pending','queued')
     AND NOT EXISTS (
       SELECT 1 FROM outbound_queue oq
        WHERE oq."legacySource" = 'email_queue' AND oq."legacyId" = eq.id
     );
  IF unmirrored_email > 0 THEN
    RAISE EXCEPTION 'email_queue has % unmirrored pending rows.', unmirrored_email;
  END IF;

  SELECT COUNT(*) INTO unmirrored_sms
    FROM sms_queue sq
   WHERE sq.status IN ('pending','queued')
     AND NOT EXISTS (
       SELECT 1 FROM outbound_queue oq
        WHERE oq."legacySource" = 'sms_queue' AND oq."legacyId" = sq.id
     );
  IF unmirrored_sms > 0 THEN
    RAISE EXCEPTION 'sms_queue has % unmirrored pending rows.', unmirrored_sms;
  END IF;

  SELECT COUNT(*) INTO unmirrored_whatsapp
    FROM whatsapp_queue wq
   WHERE wq.status IN ('pending','queued')
     AND NOT EXISTS (
       SELECT 1 FROM outbound_queue oq
        WHERE oq."legacySource" = 'whatsapp_queue' AND oq."legacyId" = wq.id
     );
  IF unmirrored_whatsapp > 0 THEN
    RAISE EXCEPTION 'whatsapp_queue has % unmirrored pending rows.', unmirrored_whatsapp;
  END IF;
END $$;

-- Drop the 5 legacy tables. CASCADE handles the dependent indexes /
-- sequences automatically. There are NO foreign keys pointing into
-- these tables from outside the communications domain (audited in
-- the contract slices 1-9), so CASCADE has no surprise side-effects.

DROP TABLE IF EXISTS public.communications_log CASCADE;
DROP TABLE IF EXISTS public.notification_log CASCADE;
DROP TABLE IF EXISTS public.email_queue CASCADE;
DROP TABLE IF EXISTS public.sms_queue CASCADE;
DROP TABLE IF EXISTS public.whatsapp_queue CASCADE;

-- The v_message_log_all view from migration 221 already references only
-- message_log, so no rebuild is needed. Verify it's still intact:
SELECT
  CASE WHEN COUNT(*) = 1 THEN 'v_message_log_all OK'
       ELSE 'v_message_log_all MISSING — recreate from migration 221' END
  AS view_check
  FROM pg_views WHERE schemaname = 'public' AND viewname = 'v_message_log_all';

COMMIT;

-- After commit, take a pg_dump --schema-only and refresh
-- db/schema_pre.sql + db/schema_post.sql via:
--   DATABASE_URL=... bash db/dump-schema.sh
-- then commit the resulting diff.
