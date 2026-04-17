-- GL integration columns for store orders, umrah invoices, and umrah transport
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS "journalEntryId" INTEGER;
ALTER TABLE umrah_agent_invoices ADD COLUMN IF NOT EXISTS "journalEntryId" INTEGER;
ALTER TABLE umrah_transport ADD COLUMN IF NOT EXISTS "journalEntryId" INTEGER;

-- Indexes for reverse lookup
CREATE INDEX IF NOT EXISTS idx_store_orders_journal ON store_orders("journalEntryId") WHERE "journalEntryId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_umrah_invoices_journal ON umrah_agent_invoices("journalEntryId") WHERE "journalEntryId" IS NOT NULL;
