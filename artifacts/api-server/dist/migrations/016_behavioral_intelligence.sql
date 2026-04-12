-- ============================================================
-- Migration 016: Behavioral Intelligence & Client Analytics
-- ============================================================

-- User Activity Log: track every page view and API action
CREATE TABLE IF NOT EXISTS user_activity_log (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  "userId"        INTEGER,
  "assignmentId"  INTEGER,
  "sessionId"     VARCHAR(64),
  page            VARCHAR(200),
  action          VARCHAR(100),
  entity          VARCHAR(100),
  "entityId"      INTEGER,
  method          VARCHAR(10),
  path            VARCHAR(500),
  "durationMs"    INTEGER,
  "ipAddress"     VARCHAR(45),
  metadata        JSONB,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ual_company_idx ON user_activity_log ("companyId");
CREATE INDEX IF NOT EXISTS ual_user_idx ON user_activity_log ("userId");
CREATE INDEX IF NOT EXISTS ual_created_idx ON user_activity_log ("createdAt");
CREATE INDEX IF NOT EXISTS ual_page_idx ON user_activity_log (page);

-- Client RFM Scores: Recency-Frequency-Monetary scoring
CREATE TABLE IF NOT EXISTS client_rfm_scores (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  "clientId"      INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  "recencyDays"   INTEGER,
  "frequencyCount" INTEGER,
  "monetaryValue" NUMERIC(14,2),
  "rfmScore"      NUMERIC(5,2),
  segment         VARCHAR(50),
  "churnRisk"     VARCHAR(20),
  "churnScore"    NUMERIC(5,2),
  "ltv"           NUMERIC(14,2),
  "lastCalculated" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("companyId", "clientId")
);

CREATE INDEX IF NOT EXISTS rfm_company_idx ON client_rfm_scores ("companyId");
CREATE INDEX IF NOT EXISTS rfm_segment_idx ON client_rfm_scores (segment);

-- Smart Recommendations
CREATE TABLE IF NOT EXISTS smart_recommendations (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  "userId"        INTEGER,
  "assignmentId"  INTEGER,
  type            VARCHAR(100),
  title           VARCHAR(300),
  description     TEXT,
  action          VARCHAR(200),
  "actionLink"    VARCHAR(500),
  priority        VARCHAR(20) DEFAULT 'normal',
  status          VARCHAR(20) DEFAULT 'active',
  metadata        JSONB,
  "expiresAt"     TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS srec_company_idx ON smart_recommendations ("companyId");
CREATE INDEX IF NOT EXISTS srec_user_idx ON smart_recommendations ("userId");
CREATE INDEX IF NOT EXISTS srec_status_idx ON smart_recommendations (status);
