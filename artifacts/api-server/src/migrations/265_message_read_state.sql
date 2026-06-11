-- 265_message_read_state.sql
--
-- @rollback:
--   DROP TABLE IF EXISTS public.message_read_state;
--
-- Per-user read-tracking for inbox messages.
--
-- message_log has no read/seen columns — when a user opens a thread the
-- frontend has no way to remember "I already read this". Multi-employee
-- tenants need *per-user* state (not a shared isRead flag) because two
-- employees can independently mark the same inbound email as read.
--
-- Composite PK on (messageLogId, userId) gives idempotent UPSERTs:
-- repeated marks just bump readAt. companyId is denormalised onto the
-- row so the per-tenant unread-count query stays a single index scan.

CREATE TABLE IF NOT EXISTS public.message_read_state (
  "messageLogId" BIGINT      NOT NULL REFERENCES public.message_log(id) ON DELETE CASCADE,
  "userId"       INTEGER     NOT NULL REFERENCES public.users(id)       ON DELETE CASCADE,
  "companyId"    INTEGER     NOT NULL,
  "readAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("messageLogId", "userId")
);

-- Lookup all read messageLogIds for a given (user, company). Used by
-- the unread-count query and by the threads endpoint to LEFT JOIN
-- against the user's read set.
CREATE INDEX IF NOT EXISTS idx_message_read_state_user
  ON public.message_read_state ("userId", "companyId");
