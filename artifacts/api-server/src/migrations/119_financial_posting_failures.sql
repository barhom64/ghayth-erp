-- Financial posting failures tracking table — surfaces failed GL postings
CREATE TABLE IF NOT EXISTS financial_posting_failures (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" INTEGER,
  error TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMPTZ,
  "resolvedBy" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fpf_company_resolved
  ON financial_posting_failures ("companyId", resolved, "createdAt" DESC);
