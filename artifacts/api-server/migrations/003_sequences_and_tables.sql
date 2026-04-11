-- Create sequences for race-safe number generation
CREATE SEQUENCE IF NOT EXISTS employee_number_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS pr_number_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1000;

-- Loan accounts for payroll deductions
CREATE TABLE IF NOT EXISTS loan_accounts (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "assignmentId" INTEGER NOT NULL,
  "employeeId" INTEGER NOT NULL,
  amount NUMERIC DEFAULT 0,
  "remainingAmount" NUMERIC DEFAULT 0,
  "monthlyInstallment" NUMERIC DEFAULT 0,
  status VARCHAR DEFAULT 'active',
  notes TEXT,
  "startDate" DATE,
  "createdAt" TIMESTAMP DEFAULT now()
);

-- Invoice line items
CREATE TABLE IF NOT EXISTS invoice_lines (
  id SERIAL PRIMARY KEY,
  "invoiceId" INTEGER NOT NULL,
  description TEXT,
  quantity NUMERIC DEFAULT 1,
  "unitPrice" NUMERIC DEFAULT 0,
  "lineTotal" NUMERIC DEFAULT 0,
  "vatAmount" NUMERIC DEFAULT 0,
  "lineGross" NUMERIC DEFAULT 0
);

-- Collection follow-up scheduling
CREATE TABLE IF NOT EXISTS collection_follow_ups (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  "scheduledDate" DATE NOT NULL,
  type VARCHAR NOT NULL DEFAULT 'reminder',
  notes TEXT,
  status VARCHAR DEFAULT 'pending',
  "assignedTo" INTEGER,
  "createdAt" TIMESTAMP DEFAULT now()
);

-- Persisted collection stage state machine
CREATE TABLE IF NOT EXISTS invoice_collection_stages (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  stage INTEGER NOT NULL DEFAULT 1,
  "stageName" VARCHAR NOT NULL,
  notes TEXT,
  "performedBy" INTEGER,
  "performedAt" TIMESTAMP DEFAULT now()
);

-- Staged leave approval tracking
CREATE TABLE IF NOT EXISTS leave_approval_stages (
  id SERIAL PRIMARY KEY,
  "leaveRequestId" INTEGER NOT NULL,
  stage INTEGER NOT NULL,
  "requiredRole" VARCHAR NOT NULL,
  "assignedTo" INTEGER,
  status VARCHAR DEFAULT 'pending',
  decision VARCHAR,
  "decidedBy" INTEGER,
  "decidedAt" TIMESTAMP,
  "expiresAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT now()
);

-- Monthly attendance stats cache
CREATE TABLE IF NOT EXISTS employee_monthly_attendance (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "assignmentId" INTEGER NOT NULL,
  period VARCHAR NOT NULL,
  "presentDays" INTEGER DEFAULT 0,
  "absentDays" INTEGER DEFAULT 0,
  "lateDays" INTEGER DEFAULT 0,
  "totalLateMinutes" INTEGER DEFAULT 0,
  "totalDeduction" NUMERIC DEFAULT 0,
  UNIQUE ("assignmentId", period)
);
