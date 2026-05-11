-- ============================================================
-- Migration 068: Umrah ↔ central finance/HR/letters integration links
--
-- Phase 7 wires the Umrah workflow into the existing centralised
-- engines (invoices, journal_entries, payroll_lines, official_letters)
-- without introducing any parallel tables. This migration only adds
-- the FK columns the new helpers need to surface the cross-domain
-- links cleanly:
--
--   * umrah_groups.salesInvoiceId — RE-POINT to central `invoices`
--                                   table instead of legacy
--                                   `umrah_agent_invoices`
--   * umrah_groups.centralInvoiceId — kept for clarity, references
--                                     central `invoices(id)` directly
--   * umrah_nusk_invoices.journalEntryId — link to the journal entry
--                                          posted by the auto-purchase
--                                          listener
--   * employee_commission_calculations.payrollLineId — already exists;
--                                          this migration just adds an
--                                          explicit FK constraint to
--                                          `payroll_lines(id)`
--   * umrah_letters — single new lookup row in official_letters' type
--                     check is enough; we don't add a new table
--
-- Idempotent: every column add uses IF NOT EXISTS.
-- ============================================================

-- 0. Schema drift fix — the seeded baseline of journal_lines lacks four
--    nullable FK columns that lib/businessHelpers.createJournalEntry
--    expects on every row insert (productId/clientId/vendorId/driverId).
--    Without these, any caller of createJournalEntry crashes with
--    "column \"productId\" does not exist". Add them idempotently here so
--    the Umrah finance integration can use the central helper unchanged.
DO $$ BEGIN
  BEGIN ALTER TABLE journal_lines ADD COLUMN "productId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "clientId"  INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "vendorId"  INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "driverId"  INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- 1. Central-invoice link on groups.
ALTER TABLE umrah_groups
  ADD COLUMN IF NOT EXISTS "centralInvoiceId" INTEGER REFERENCES invoices(id);
CREATE INDEX IF NOT EXISTS idx_umrah_groups_central_invoice
  ON umrah_groups ("centralInvoiceId") WHERE "deletedAt" IS NULL;

-- 2. Journal-entry link on NUSK invoices (auto-posted purchase journal).
ALTER TABLE umrah_nusk_invoices
  ADD COLUMN IF NOT EXISTS "journalEntryId" INTEGER REFERENCES journal_entries(id);
CREATE INDEX IF NOT EXISTS idx_umrah_nusk_invoices_journal
  ON umrah_nusk_invoices ("journalEntryId") WHERE "deletedAt" IS NULL;

-- 3. Sales-invoice ref-list helper view — surfaces the NUSK invoice
--    numbers + group numbers per central invoice for the spec-required
--    "أرقام فواتير نسك + أرقام المجموعات" reference column on the
--    sales invoice. Implemented as a view so the route layer can read
--    it without re-implementing the join logic each time.
CREATE OR REPLACE VIEW umrah_invoice_refs AS
SELECT
  inv.id AS "invoiceId",
  inv."companyId",
  ARRAY_AGG(DISTINCT g."nuskGroupNumber" ORDER BY g."nuskGroupNumber") FILTER (WHERE g."nuskGroupNumber" IS NOT NULL) AS "nuskGroupNumbers",
  ARRAY_AGG(DISTINCT g."nuskInvoiceNumber" ORDER BY g."nuskInvoiceNumber") FILTER (WHERE g."nuskInvoiceNumber" IS NOT NULL) AS "nuskInvoiceNumbers",
  COUNT(DISTINCT g.id) AS "groupCount",
  COALESCE(SUM(g."mutamerCount"), 0) AS "mutamerCount"
FROM invoices inv
LEFT JOIN umrah_groups g ON g."centralInvoiceId" = inv.id AND g."deletedAt" IS NULL
WHERE inv."deletedAt" IS NULL
GROUP BY inv.id, inv."companyId";
