-- Migration 002: Alter audit_logs.entityId from integer to text
-- This allows composite/string entity identifiers (e.g., settings keys, compound IDs)
-- while maintaining backward compatibility with numeric entity IDs cast to text.

ALTER TABLE audit_logs ALTER COLUMN "entityId" TYPE TEXT USING "entityId"::TEXT;
