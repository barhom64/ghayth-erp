CREATE TABLE IF NOT EXISTS scheduled_reports (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "reportType" VARCHAR(80) NOT NULL,
  title VARCHAR(200) NOT NULL,
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  recipients JSONB NOT NULL DEFAULT '[]',
  params JSONB NOT NULL DEFAULT '{}',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSentAt" TIMESTAMPTZ,
  "createdBy" INTEGER REFERENCES employee_assignments(id),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduled_report_history (
  id SERIAL PRIMARY KEY,
  "scheduledReportId" INTEGER NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'sent',
  "sentAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recipients JSONB,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_company ON scheduled_reports("companyId");
CREATE INDEX IF NOT EXISTS idx_scheduled_report_history_report ON scheduled_report_history("scheduledReportId");
