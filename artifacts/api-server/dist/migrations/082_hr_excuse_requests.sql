-- HR Excuse Requests (استئذان الخروج المبكر / التأخر)
CREATE TABLE IF NOT EXISTS hr_excuse_requests (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "assignmentId" INTEGER NOT NULL,
  "employeeId" INTEGER NOT NULL,
  "excuseDate" DATE NOT NULL,
  "excuseType" VARCHAR(30) NOT NULL DEFAULT 'early_leave',
  "startTime" TIME,
  "endTime" TIME,
  "estimatedMinutes" INTEGER DEFAULT 0,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  "approvedBy" INTEGER,
  "approvedAt" TIMESTAMPTZ,
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_excuse_type CHECK ("excuseType" IN ('early_leave', 'late_arrival', 'personal'))
);

CREATE INDEX IF NOT EXISTS idx_excuse_company_date ON hr_excuse_requests ("companyId", "excuseDate");
CREATE INDEX IF NOT EXISTS idx_excuse_assignment ON hr_excuse_requests ("assignmentId", status);
