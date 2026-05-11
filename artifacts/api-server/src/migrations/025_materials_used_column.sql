ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS "materialsUsed" JSONB DEFAULT NULL;
