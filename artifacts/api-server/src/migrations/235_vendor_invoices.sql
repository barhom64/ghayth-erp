-- 235_vendor_invoices.sql
--
-- @rollback: DROP TABLE IF EXISTS vendor_invoices;
--
-- Supplier-issued invoice (AP). Until now the /invoices route was
-- dual-purpose (AR + AP) but only accepted clientId — a vendor
-- invoice had to be entered with the vendor's name in a fake
-- "client" record, posting clientId on what should be vendor-
-- subledger movements. The new /vendor-invoices route routes
-- through this dedicated table so AR and AP stay clean.

CREATE TABLE IF NOT EXISTS vendor_invoices (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "branchId"      INTEGER,
  "supplierId"    INTEGER NOT NULL,
  ref             TEXT NOT NULL,
  "invoiceDate"   DATE NOT NULL,
  "dueDate"       DATE,
  "poId"          INTEGER,
  subtotal        NUMERIC(18,2) NOT NULL,
  "vatAmount"     NUMERIC(18,2) NOT NULL DEFAULT 0,
  total           NUMERIC(18,2) NOT NULL,
  "paidAmount"    NUMERIC(18,2) NOT NULL DEFAULT 0,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'approved',
  "journalId"     INTEGER,
  "sourceKey"     VARCHAR(128),
  "createdBy"     INTEGER,
  "createdAt"     TIMESTAMP DEFAULT NOW(),
  "deletedAt"     TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_invoices_source_key
  ON vendor_invoices ("companyId", "sourceKey")
  WHERE "sourceKey" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_invoices_supplier_status
  ON vendor_invoices ("companyId", "supplierId", status)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_invoices_po
  ON vendor_invoices ("poId")
  WHERE "poId" IS NOT NULL AND "deletedAt" IS NULL;
