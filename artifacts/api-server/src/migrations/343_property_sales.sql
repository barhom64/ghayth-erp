-- @rollback: DROP TABLE IF EXISTS property_sales;

CREATE TABLE IF NOT EXISTS property_sales (
  id                SERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "buildingId"      INTEGER REFERENCES property_buildings(id) ON DELETE SET NULL,
  "buyerName"       TEXT NOT NULL,
  "buyerPhone"      TEXT,
  "buyerNationalId" TEXT,
  "salePrice"       NUMERIC(14,2) NOT NULL,
  "bookValue"       NUMERIC(14,2) NOT NULL DEFAULT 0,
  "vatAmount"       NUMERIC(14,2) NOT NULL DEFAULT 0,
  "saleDate"        DATE NOT NULL,
  "transferDate"    DATE,
  status            TEXT NOT NULL DEFAULT 'pending',
  notes             TEXT,
  "journalEntryId"  INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
  "createdBy"       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "createdAt"       TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt"       TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_property_sales_company ON property_sales ("companyId");
CREATE INDEX IF NOT EXISTS idx_property_sales_building ON property_sales ("buildingId");
