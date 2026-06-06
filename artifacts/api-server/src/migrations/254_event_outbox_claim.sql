-- 254_event_outbox_claim.sql
--
-- WHAT:    add `claimedAt` (nullable timestamptz) to event_outbox and a
--          partial index on (status, "claimedAt") for the stale-claim
--          reaper. Enables the atomic-claim relay pattern (P2.6).
--
-- WHY:     P2.6 of the workflow plan. Writing live-DB integration tests
--          for the outbox relay surfaced a real concurrency bug: the
--          relay's `fetchBatch` ran `SELECT ... FOR UPDATE SKIP LOCKED`
--          on the pool in AUTO-COMMIT mode (no surrounding transaction),
--          so the row-level lock released the instant the SELECT
--          returned — BEFORE the follow-up `markProcessed` UPDATE ran.
--          Two relay replicas could therefore both grab the same pending
--          row and dispatch it twice; the SKIP LOCKED was effectively a
--          no-op across ticks.
--
--          The fix is the canonical transactional-outbox claim pattern:
--          a single `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP
--          LOCKED) RETURNING ...` atomically transitions pending →
--          'processing' in one statement (so the lock genuinely spans
--          the claim), stamping `claimedAt`. The relay then dispatches
--          OUTSIDE any held lock and marks each row processed /
--          failed_retry / dead. A reaper resets rows stuck in
--          'processing' (a worker that crashed mid-dispatch) back to
--          'pending' once `claimedAt` ages past a threshold.
--
-- SAFETY:  pure additive. The column is NULLable so every existing row
--          is grandfathered. The 'processing' status value fits the
--          existing varchar(20) with no CHECK constraint to alter. The
--          status-aware purge (migration / eventBus.purgeAgedOutboxEntries)
--          only deletes 'processed' / 'dead', so a 'processing' row is
--          never purged out from under the reaper.
--
-- @rollback:
--   DROP INDEX IF EXISTS event_outbox_processing_idx;
--   ALTER TABLE event_outbox DROP COLUMN IF EXISTS "claimedAt";

BEGIN;

ALTER TABLE public.event_outbox
  ADD COLUMN IF NOT EXISTS "claimedAt" timestamp with time zone;

-- Partial index drives the reaper's hot path:
--   UPDATE ... WHERE status='processing' AND "claimedAt" < now() - interval
-- Only 'processing' rows are indexed, so it stays tiny.
CREATE INDEX IF NOT EXISTS event_outbox_processing_idx
  ON public.event_outbox (status, "claimedAt")
  WHERE status = 'processing';

COMMIT;
