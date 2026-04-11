-- Financial periods table for locking closed accounting periods
CREATE TABLE IF NOT EXISTS financial_periods (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'locked')),
  "closedAt" TIMESTAMP,
  "closedBy" INTEGER REFERENCES employee_assignments(id),
  notes TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_periods_company ON financial_periods("companyId");
CREATE INDEX IF NOT EXISTS idx_financial_periods_status ON financial_periods("companyId", status);
CREATE INDEX IF NOT EXISTS idx_financial_periods_dates ON financial_periods("companyId", "startDate", "endDate");
