-- ===========================================================================
-- 380_auth_token_columns.sql
-- ---------------------------------------------------------------------------
-- WHAT:    extend the EXISTING password_reset_requests table to carry
--          single-use, hashed, expiring auth tokens for BOTH password
--          reset and account activation/invitation — no new table.
-- WHY:     #2137 slice 2. Today /forgot-password only inserts an
--          admin-review row (email + status), with no token, no email,
--          no TTL. Slice 2 turns it into a real self-service flow:
--          a strong random token whose HASH (sha256) is stored here,
--          short-lived and single-use, delivered as a link through the
--          unified messaging path (sendMessage → message_log →
--          outbound_queue). The same table+columns serve account
--          activation/invitation via the `purpose` discriminator.
-- SAFETY:  purely additive. Every new column is NULLABLE, so existing
--          admin-review rows (the legacy_admin_review_fallback path,
--          kept as compatibility this slice) stay valid untouched.
--          The raw token NEVER lands here — only its sha256 hash.
-- @rollback:
--   ALTER TABLE public.password_reset_requests
--     DROP COLUMN IF EXISTS "userId",
--     DROP COLUMN IF EXISTS "tokenHash",
--     DROP COLUMN IF EXISTS purpose,
--     DROP COLUMN IF EXISTS "expiresAt",
--     DROP COLUMN IF EXISTS "usedAt";
--   DROP INDEX IF EXISTS uq_password_reset_token_hash_live;
--   DROP INDEX IF EXISTS idx_password_reset_user_purpose_live;
-- ===========================================================================

ALTER TABLE public.password_reset_requests
  ADD COLUMN IF NOT EXISTS "userId"    integer,
  ADD COLUMN IF NOT EXISTS "tokenHash" varchar(64),   -- sha256 hex; raw token is never stored
  ADD COLUMN IF NOT EXISTS purpose     varchar(20) NOT NULL DEFAULT 'password_reset'
                                       CHECK (purpose IN ('password_reset','activation','invitation')),
  ADD COLUMN IF NOT EXISTS "expiresAt" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "usedAt"    timestamp with time zone;

-- A token hash is unique among LIVE (unused) rows so consume-by-hash is
-- an exact single-row lookup; once used, the partial index frees the
-- hash (a fresh issue for the same user can't collide).
CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_token_hash_live
  ON public.password_reset_requests ("tokenHash")
  WHERE "tokenHash" IS NOT NULL AND "usedAt" IS NULL;

-- Fast "invalidate previous unused tokens for this (userId, purpose)"
-- when a new token is issued.
CREATE INDEX IF NOT EXISTS idx_password_reset_user_purpose_live
  ON public.password_reset_requests ("userId", purpose)
  WHERE "userId" IS NOT NULL AND "usedAt" IS NULL;
