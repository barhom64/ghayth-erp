-- @rollback: ALTER TABLE tasks DROP COLUMN IF EXISTS "slaReminderSentAt"; ALTER TABLE tasks DROP COLUMN IF EXISTS "slaFinalReminderSentAt";

-- Add idempotency stamps for the inbox SLA reminder cron
-- (inbox_task_sla_reminder_scan). Two separate timestamps allow the cron to
-- distinguish the first-reminder window from the optional second (final)
-- reminder window, and prevent re-sending on repeated runs.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS "slaReminderSentAt"      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "slaFinalReminderSentAt" TIMESTAMPTZ;
