-- ===========================================================================
-- 224_relax_message_log_channel_check.sql
-- ---------------------------------------------------------------------------
-- WHAT:    Phase 4 contract slice 9 prep. Relaxes the channel check
--          constraint on `message_log` + `outbound_queue` to accept
--          'internal' and 'pbx' alongside the existing
--          email/sms/whatsapp/push/in_app set.
--
--          - 'internal' is used by requests.ts logCommunication() for
--            in-system audit notes ("transferred from sales to billing")
--            — they belong in the unified log so the inbox/audit reader
--            shows the full conversation history.
--          - 'pbx' is used by inbox.ts POST /calls to mirror call
--            records into the unified thread view.
--
-- WHY:     Without this, the writer-migration slice can't move the
--          requests.ts and inbox.ts /calls inserts off communications_log
--          (the legacy table is the only one that accepts those values).
--          That blocks the final DROP.
--
-- SAFETY:  Constraint relaxation — only widens the set of accepted
--          channels. Existing rows continue to satisfy the new check.
--          No data migration needed.
--
-- @policy:breaking
-- This widens an existing CHECK constraint by dropping the old form
-- and recreating it. PostgreSQL allows this without table rewrite for
-- ADD CONSTRAINT, but the DROP/ADD pair is technically a breaking-policy
-- change (the column briefly accepts non-conforming values between
-- DROP and ADD inside the same transaction). The new constraint is
-- a strict superset of the old, so no row could already violate it.
--
-- @rollback:
--   ALTER TABLE public.message_log
--     DROP CONSTRAINT message_log_channel_check;
--   ALTER TABLE public.message_log
--     ADD CONSTRAINT message_log_channel_check
--       CHECK (channel IN ('email','sms','whatsapp','push','in_app'));
--   ALTER TABLE public.outbound_queue
--     DROP CONSTRAINT outbound_queue_channel_check;
--   ALTER TABLE public.outbound_queue
--     ADD CONSTRAINT outbound_queue_channel_check
--       CHECK (channel IN ('email','sms','whatsapp','push'));
-- ===========================================================================

ALTER TABLE public.message_log
  DROP CONSTRAINT IF EXISTS message_log_channel_check;
ALTER TABLE public.message_log
  ADD CONSTRAINT message_log_channel_check
    CHECK (channel IN ('email','sms','whatsapp','push','in_app','internal','pbx'));

ALTER TABLE public.outbound_queue
  DROP CONSTRAINT IF EXISTS outbound_queue_channel_check;
ALTER TABLE public.outbound_queue
  ADD CONSTRAINT outbound_queue_channel_check
    CHECK (channel IN ('email','sms','whatsapp','push','internal','pbx'));
