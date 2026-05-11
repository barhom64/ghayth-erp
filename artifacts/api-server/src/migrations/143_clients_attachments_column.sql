-- 143_clients_attachments_column.sql
-- Add missing "attachments" JSONB column to clients table.
-- POST /api/clients (artifacts/api-server/src/routes/clients.ts) inserts into
-- this column but the schema never declared it, causing a hard 500 on every
-- create-client request ("column \"attachments\" of relation \"clients\" does
-- not exist"). The route already coerces the value to JSON.stringify(...) or
-- null, so JSONB is the correct type and a NULL default is safe.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS "attachments" JSONB;
