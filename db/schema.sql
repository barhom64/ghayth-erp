-- db/schema.sql — wrapper that loads the schema in two halves.
--
-- The full schema is too large for some upload paths (the Replit GitHub
-- proxy tops out around 800 KB per file), so the dump is split at the
-- last `CREATE TABLE` boundary into:
--
--   db/schema_pre.sql   — DROP CONSTRAINT/INDEX, DROP TABLE, CREATE TABLE
--   db/schema_post.sql  — ALTER TABLE … ADD CONSTRAINT (PK/FK), CREATE INDEX
--
-- This wrapper uses psql's `\ir` (include-relative) so it works regardless
-- of the caller's CWD: `psql -f db/schema.sql` resolves both halves
-- relative to this file's location.
--
-- Regenerate with: bash db/dump-schema.sh
\ir schema_pre.sql
\ir schema_post.sql
