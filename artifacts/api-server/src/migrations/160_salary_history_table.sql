-- Create salary_history table for tracking employee salary changes
CREATE TABLE IF NOT EXISTS salary_history (
    id SERIAL PRIMARY KEY,
    "employeeId" INTEGER NOT NULL,
    "assignmentId" INTEGER,
    "companyId" INTEGER NOT NULL,
    "oldSalary" NUMERIC(12,2) DEFAULT 0,
    "newSalary" NUMERIC(12,2) DEFAULT 0,
    "effectiveDate" DATE DEFAULT CURRENT_DATE,
    "changedBy" INTEGER,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_history_employee
  ON salary_history ("employeeId", "createdAt" DESC);
