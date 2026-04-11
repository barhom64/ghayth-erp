ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS "slaDeadline" TIMESTAMPTZ;
