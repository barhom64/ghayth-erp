-- 252_event_outbox_idempotency_key.sql
--
-- WHAT:    add `idempotencyKey` (nullable) to event_outbox + a partial
--          unique index on (eventName, idempotencyKey) so the relay's
--          opt-in deduplication is enforced at the DB.
--
-- WHY:     P2.2 of the workflow plan. The relay already dispatches each
--          pending row via dispatchFromOutbox (P2.1, commit f9931b22).
--          The remaining gap is: if a producer emits the same logical
--          event twice (retry from a flaky API call, retry from a worker
--          handler that crashed and re-fired) both INSERTs land in the
--          outbox and the relay dispatches twice. Listeners see a
--          duplicate. With this column callers that need exactly-once
--          set `payload.idempotencyKey = "<stable-id>"` and the second
--          INSERT is rejected at the unique-index level. Callers that
--          don't pass the key keep current at-least-once behaviour.
--
-- SAFETY:  pure additive. The column is NULLable (default omitted) so
--          every existing row is grandfathered. The unique index is
--          PARTIAL (WHERE idempotencyKey IS NOT NULL) so it only
--          enforces the rule on rows that opt in.
--
-- @rollback: ALTER TABLE event_outbox DROP COLUMN "idempotencyKey";
--            DROP INDEX IF EXISTS event_outbox_idem_uniq;

BEGIN;

ALTER TABLE public.event_outbox
  ADD COLUMN IF NOT EXISTS "idempotencyKey" character varying(200);

-- Partial unique index. PG 9.5+ honours partial indexes in ON CONFLICT
-- conflict-target clauses, so captureToOutbox below uses
-- `ON CONFLICT ("eventName", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL DO NOTHING`
-- to silently drop duplicates without breaking the "no key" path.
CREATE UNIQUE INDEX IF NOT EXISTS event_outbox_idem_uniq
  ON public.event_outbox ("eventName", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

COMMIT;
