-- 232_vendor_advances_credit_memos.sql
--
-- @rollback: DROP TABLE IF EXISTS vendor_credit_memos;
--            DROP TABLE IF EXISTS vendor_advances;
--
-- AP mirror of customer_advances + credit_memos. The audit flagged
-- both as HIGH gaps: supplier prepayments had no clean home, and
-- vendor returns corrupted AR by going through the customer
-- credit-memo path (creating fake clientId entries on what should
-- be vendor subledger movements).
--
-- vendor_advances mirrors customer_advances column-for-column.
-- vendor_credit_memos mirrors credit_memos with poId as the
-- (optional) link back to the originating PO.
--
-- sourceKey on both tables — populated by the routes
-- POST /vendor-advances + POST /vendor-credits using the
-- requestIdempotencyToken pattern (matches 231).

CREATE TABLE IF NOT EXISTS vendor_advances (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "branchId"      INTEGER,
  "supplierId"    INTEGER NOT NULL,
  ref             TEXT NOT NULL,
  amount          NUMERIC(18,2) NOT NULL,
  "appliedAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  method          TEXT,
  "paidDate"      DATE NOT NULL,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  "journalId"     INTEGER,
  "sourceKey"     VARCHAR(128),
  "createdBy"     INTEGER,
  "createdAt"     TIMESTAMP DEFAULT NOW(),
  "deletedAt"     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vendor_advances_company_supplier
  ON vendor_advances ("companyId", "supplierId")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_advances_source_key
  ON vendor_advances ("companyId", "sourceKey")
  WHERE "sourceKey" IS NOT NULL;

CREATE TABLE IF NOT EXISTS vendor_credit_memos (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "branchId"      INTEGER,
  "supplierId"    INTEGER NOT NULL,
  "poId"          INTEGER,
  ref             TEXT NOT NULL,
  amount          NUMERIC(18,2) NOT NULL,
  "vatAmount"     NUMERIC(18,2) NOT NULL DEFAULT 0,
  "totalAmount"   NUMERIC(18,2) NOT NULL,
  "appliedAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "memoDate"      DATE NOT NULL,
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',
  "journalId"     INTEGER,
  "sourceKey"     VARCHAR(128),
  "createdBy"     INTEGER,
  "createdAt"     TIMESTAMP DEFAULT NOW(),
  "deletedAt"     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vendor_credit_memos_company_supplier
  ON vendor_credit_memos ("companyId", "supplierId")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_credit_memos_source_key
  ON vendor_credit_memos ("companyId", "sourceKey")
  WHERE "sourceKey" IS NOT NULL;
