CREATE TABLE IF NOT EXISTS daily_closures (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  date DATE NOT NULL,
  "closedBy" INTEGER,
  "closedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("companyId", date)
);
