DO $$ BEGIN
  BEGIN ALTER TABLE journal_lines ADD COLUMN "productId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "clientId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "vendorId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE journal_lines ADD COLUMN "driverId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

CREATE INDEX IF NOT EXISTS idx_journal_lines_product ON journal_lines("productId") WHERE "productId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journal_lines_client ON journal_lines("clientId") WHERE "clientId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journal_lines_vendor ON journal_lines("vendorId") WHERE "vendorId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journal_lines_driver ON journal_lines("driverId") WHERE "driverId" IS NOT NULL;
