CREATE TABLE IF NOT EXISTS salary_history (
  id SERIAL PRIMARY KEY,
  "employeeId" INTEGER NOT NULL,
  "assignmentId" INTEGER,
  "companyId" INTEGER NOT NULL,
  "oldSalary" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "newSalary" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "effectiveDate" DATE NOT NULL DEFAULT CURRENT_DATE,
  "changedBy" INTEGER,
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_history_employee ON salary_history ("employeeId");
CREATE INDEX IF NOT EXISTS idx_salary_history_company ON salary_history ("companyId");

CREATE TABLE IF NOT EXISTS employee_salary_components (
  id SERIAL PRIMARY KEY,
  "employeeId" INTEGER NOT NULL,
  "assignmentId" INTEGER,
  "companyId" INTEGER NOT NULL,
  "componentId" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "customValue" NUMERIC(12,2),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("assignmentId", "componentId")
);

CREATE INDEX IF NOT EXISTS idx_emp_salary_comp_employee ON employee_salary_components ("employeeId");
CREATE INDEX IF NOT EXISTS idx_emp_salary_comp_company ON employee_salary_components ("companyId");

ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER DEFAULT 0;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMPTZ;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ;
