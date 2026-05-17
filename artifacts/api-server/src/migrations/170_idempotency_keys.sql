-- Migration 170: idempotency_keys table
-- Stores last response per (key, user, route) for sensitive financial POSTs
-- (invoice payments, credit/debit memos, customer advances, bad-debt,
-- umrah penalty waive/bulk-waive, agent-invoice payments, payroll runs).
-- The middleware in lib/idempotency.ts replays the cached response when the
-- same Idempotency-Key header is replayed within the TTL window.

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id BIGSERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  key TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "statusCode" INTEGER,
  "responseBody" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMP,
  CONSTRAINT idempotency_keys_unique UNIQUE ("companyId", "userId", method, path, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_createdAt
  ON idempotency_keys ("createdAt");
