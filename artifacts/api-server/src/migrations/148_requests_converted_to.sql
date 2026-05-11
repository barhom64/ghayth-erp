-- The requests route at routes/requests.ts uses "convertedTo" in 7
-- places (DELETE guard, convert-to-entity check, and the UPDATE that
-- stamps the target id when a request is converted into a maintenance
-- ticket / purchase order / legal case). The column was referenced
-- consistently across read + write paths but the migration that adds
-- it was never written, so DELETE /api/requests/:id and POST
-- /api/requests/:id/convert have been crashing with
-- `column "convertedTo" does not exist` since the feature landed.
-- Adding it here makes the existing route logic actually work.

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS "convertedTo" character varying(100);
