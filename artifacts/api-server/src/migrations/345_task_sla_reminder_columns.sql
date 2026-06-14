-- Migration 345: pre-breach SLA reminder bookkeeping on tasks.
--
-- WHAT: add two nullable timestamp columns to `tasks`:
--   - "slaReminderSentAt": stamped when the inbox_task_sla_reminder_scan cron
--     re-pings the current assignee because the task's slaDeadline is
--     approaching (within the per-company-configured lead window).
--   - "slaFinalReminderSentAt": stamped when the same cron fires the OPTIONAL
--     second reminder closer to the deadline (the finalReminderHours window),
--     after the first lead-time reminder already went out.
--
-- WHY: auto-classified inbox tasks ping the assignee once on assignment, but
--   nothing nudges them again as the deadline approaches. These columns make
--   the new scan idempotent — each reminder fires at most once per task no
--   matter how often the */15 scan runs (the stamp is an atomic
--   compare-and-set: WHERE "...SentAt" IS NULL).
--
-- SAFETY: additive only. Existing rows stay NULL (never reminded), so the scan
--   treats the existing backlog as eligible on its first pass and then records
--   the action. No data is read, written, or destroyed.
--
-- @rollback:
--   ALTER TABLE tasks DROP COLUMN IF EXISTS "slaReminderSentAt";
--   ALTER TABLE tasks DROP COLUMN IF EXISTS "slaFinalReminderSentAt";

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS "slaReminderSentAt"      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "slaFinalReminderSentAt" TIMESTAMPTZ;
