CREATE TABLE IF NOT EXISTS client_rfm_scores (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "clientId" INTEGER NOT NULL REFERENCES clients(id),
  "recencyDays" INTEGER DEFAULT 0,
  "frequencyCount" INTEGER DEFAULT 0,
  "monetaryValue" NUMERIC(14,2) DEFAULT 0,
  "rfmScore" NUMERIC(5,2) DEFAULT 0,
  segment VARCHAR(50) DEFAULT 'new',
  "churnRisk" VARCHAR(20) DEFAULT 'low',
  "churnScore" NUMERIC(5,2) DEFAULT 0,
  ltv NUMERIC(14,2) DEFAULT 0,
  "lastCalculated" TIMESTAMP DEFAULT NOW(),
  UNIQUE("companyId", "clientId")
);

CREATE INDEX IF NOT EXISTS idx_rfm_company ON client_rfm_scores("companyId");
CREATE INDEX IF NOT EXISTS idx_rfm_segment ON client_rfm_scores("companyId", segment);
CREATE INDEX IF NOT EXISTS idx_rfm_churn ON client_rfm_scores("companyId", "churnRisk");

CREATE TABLE IF NOT EXISTS user_activity_log (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "userId" INTEGER,
  "assignmentId" INTEGER,
  "sessionId" VARCHAR(255),
  page VARCHAR(500),
  action VARCHAR(100),
  entity VARCHAR(100),
  method VARCHAR(10),
  path VARCHAR(500),
  "durationMs" INTEGER,
  "ipAddress" VARCHAR(50),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ual_company ON user_activity_log("companyId");
CREATE INDEX IF NOT EXISTS idx_ual_user ON user_activity_log("companyId", "userId");
CREATE INDEX IF NOT EXISTS idx_ual_created ON user_activity_log("createdAt");
