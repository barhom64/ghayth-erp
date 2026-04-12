-- Migration 062: Hash refresh tokens at rest
--
-- Refresh tokens were previously stored as plaintext in the `token` column.
-- This migration adds a `tokenHash` column (SHA-256 of the token), backfills
-- it from existing rows, then nulls out the plaintext column. The application
-- uses tokenHash for all lookups going forward.

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS "tokenHash" TEXT;

-- Backfill hash for any existing rows
UPDATE refresh_tokens
   SET "tokenHash" = encode(digest(token, 'sha256'), 'hex')
 WHERE "tokenHash" IS NULL
   AND token IS NOT NULL;

-- Ensure pgcrypto is available for digest()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Re-run backfill in case the extension was just installed
UPDATE refresh_tokens
   SET "tokenHash" = encode(digest(token, 'sha256'), 'hex')
 WHERE "tokenHash" IS NULL
   AND token IS NOT NULL;

-- Drop the plaintext value now that hash is populated
UPDATE refresh_tokens SET token = NULL WHERE token IS NOT NULL;

ALTER TABLE refresh_tokens ALTER COLUMN token DROP NOT NULL;

-- Unique index on the hash for fast O(1) lookups during refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
  ON refresh_tokens("tokenHash");
