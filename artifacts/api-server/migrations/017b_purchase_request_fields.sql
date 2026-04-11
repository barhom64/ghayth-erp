-- Migration 017: Add new financial metadata columns
-- Purchase requests: costCenter and expectedDelivery
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS "costCenter" TEXT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS "expectedDelivery" DATE;

-- Journal entries: projectId (header-level) and taxCategory for expense tracking
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "projectId" INTEGER;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "taxCategory" VARCHAR(50);
