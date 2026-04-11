-- Replace the partial unique index from migration 059 with a proper unique constraint
-- that PostgreSQL can use for ON CONFLICT ("companyId", "endpointHash") resolution.
-- NULL endpointHash values are safe: PostgreSQL treats NULLs as distinct in unique constraints.

DROP INDEX IF EXISTS "push_subscriptions_endpointHash_key";

ALTER TABLE push_subscriptions
  DROP CONSTRAINT IF EXISTS "push_subscriptions_companyId_endpointHash_key";

-- Remove any duplicate non-null hash rows (keep newest) before adding constraint
DELETE FROM push_subscriptions ps
WHERE "endpointHash" IS NOT NULL
  AND id NOT IN (
    SELECT MAX(id)
    FROM push_subscriptions
    WHERE "endpointHash" IS NOT NULL
    GROUP BY "companyId", "endpointHash"
  );

ALTER TABLE push_subscriptions
  ADD CONSTRAINT "push_subscriptions_companyId_endpointHash_key"
  UNIQUE ("companyId", "endpointHash");
