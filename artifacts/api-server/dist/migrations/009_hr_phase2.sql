-- ============================================================
-- Migration 009: HR Phase 2 — Full Automation
-- Employee contracts, onboarding tasks, approval chains,
-- payroll line enhancements, attendance policy
-- ============================================================

-- Employee contracts and probation tracking
CREATE TABLE IF NOT EXISTS employee_contracts (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "employeeId" INTEGER NOT NULL,
  "assignmentId" INTEGER NOT NULL,
  "contractType" VARCHAR(50) DEFAULT 'full_time',
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  "probationEndDate" DATE,
  "probationStatus" VARCHAR(20) DEFAULT 'active',
  "probationAlertSent" BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  "createdAt" TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_contracts_company_idx ON employee_contracts ("companyId");
CREATE INDEX IF NOT EXISTS employee_contracts_employee_idx ON employee_contracts ("employeeId");
CREATE INDEX IF NOT EXISTS employee_contracts_probation_idx ON employee_contracts ("probationEndDate") WHERE "probationStatus" = 'active';

-- Onboarding tasks tracking
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "employeeId" INTEGER NOT NULL,
  "assignmentId" INTEGER NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  "assignedTo" INTEGER,
  status VARCHAR(20) DEFAULT 'pending',
  "dueDate" DATE,
  "completedAt" TIMESTAMP,
  "completedBy" INTEGER,
  "createdAt" TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_tasks_company_idx ON onboarding_tasks ("companyId");
CREATE INDEX IF NOT EXISTS onboarding_tasks_employee_idx ON onboarding_tasks ("employeeId");

-- Generic approval chains (5 types)
CREATE TABLE IF NOT EXISTS approval_chains (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  name VARCHAR(200) NOT NULL,
  "chainType" VARCHAR(50) NOT NULL,
  "minAmount" NUMERIC DEFAULT 0,
  "maxAmount" NUMERIC DEFAULT 999999999,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approval_chains_company_type_idx ON approval_chains ("companyId", "chainType");

CREATE TABLE IF NOT EXISTS approval_chain_steps (
  id SERIAL PRIMARY KEY,
  "chainId" INTEGER NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
  "stepOrder" INTEGER NOT NULL,
  "requiredRole" VARCHAR(50) NOT NULL,
  "timeoutHours" INTEGER DEFAULT 48,
  "autoApproveOnTimeout" BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP DEFAULT now()
);

-- Approval requests table (if not exists)
CREATE TABLE IF NOT EXISTS approval_requests (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "refType" VARCHAR(50) NOT NULL,
  "refId" INTEGER NOT NULL,
  "requiredRole" VARCHAR(50),
  "assignedTo" INTEGER,
  status VARCHAR(20) DEFAULT 'pending',
  "decidedBy" INTEGER,
  "decidedAt" TIMESTAMP,
  "expiresAt" TIMESTAMP,
  "escalationLevel" INTEGER DEFAULT 0,
  "lastReminderAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approval_requests_ref_idx ON approval_requests ("refType", "refId");
CREATE INDEX IF NOT EXISTS approval_requests_status_idx ON approval_requests (status) WHERE status = 'pending';

-- Attendance policy per company
CREATE TABLE IF NOT EXISTS attendance_policies (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "lateThresholdMinutes" INTEGER DEFAULT 15,
  "gpsRadiusMeters" INTEGER DEFAULT 500,
  "penaltyLevel1" NUMERIC DEFAULT 0,
  "penaltyLevel2" NUMERIC DEFAULT 50,
  "penaltyLevel3" NUMERIC DEFAULT 100,
  "penaltyLevel4" NUMERIC DEFAULT 200,
  "penaltyLevel5" NUMERIC DEFAULT 500,
  "penaltyLevel1Label" VARCHAR(100) DEFAULT 'إنذار شفهي',
  "penaltyLevel2Label" VARCHAR(100) DEFAULT 'إنذار كتابي',
  "penaltyLevel3Label" VARCHAR(100) DEFAULT 'خصم يوم',
  "penaltyLevel4Label" VARCHAR(100) DEFAULT 'خصم يومين',
  "penaltyLevel5Label" VARCHAR(100) DEFAULT 'خصم ثلاثة أيام + إنذار نهائي',
  "createdAt" TIMESTAMP DEFAULT now(),
  UNIQUE ("companyId")
);

-- Add missing columns to payroll_lines for 12-item breakdown
DO $$ BEGIN
  BEGIN ALTER TABLE payroll_lines ADD COLUMN "housingAllowance" NUMERIC DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE payroll_lines ADD COLUMN "transportAllowance" NUMERIC DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE payroll_lines ADD COLUMN "absenceDeduction" NUMERIC DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE payroll_lines ADD COLUMN "violationDeduction" NUMERIC DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE payroll_lines ADD COLUMN "loanDeduction" NUMERIC DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE payroll_lines ADD COLUMN "overtime" NUMERIC DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE payroll_lines ADD COLUMN "overtimeHours" NUMERIC DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE payroll_lines ADD COLUMN "gosiEmployer" NUMERIC DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE payroll_lines ADD COLUMN "employeeId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Add escalation tracking columns to leave_approval_stages
DO $$ BEGIN
  BEGIN ALTER TABLE leave_approval_stages ADD COLUMN "reminderSentAt" TIMESTAMP; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE leave_approval_stages ADD COLUMN "warningSentAt" TIMESTAMP; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE leave_approval_stages ADD COLUMN "escalatedAt" TIMESTAMP; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE leave_approval_stages ADD COLUMN "autoApprovedAt" TIMESTAMP; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Add gender/service checks to hr_leave_types
DO $$ BEGIN
  BEGIN ALTER TABLE hr_leave_types ADD COLUMN "genderRestriction" VARCHAR(10); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE hr_leave_types ADD COLUMN "minServiceMonths" INTEGER DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE hr_leave_types ADD COLUMN "oncePerCareer" BOOLEAN DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE hr_leave_types ADD COLUMN "requiresDocument" BOOLEAN DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE hr_leave_types ADD COLUMN "maxDeptAbsentPct" NUMERIC DEFAULT 25; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Add performance columns to performance_reviews
DO $$ BEGIN
  BEGIN ALTER TABLE performance_reviews ADD COLUMN comments TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE performance_reviews ADD COLUMN strengths TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE performance_reviews ADD COLUMN improvements TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE performance_reviews ADD COLUMN goals TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE performance_reviews ADD COLUMN "updatedAt" TIMESTAMP DEFAULT now(); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE performance_reviews ADD COLUMN "reviewDate" DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Add overtime tracking to attendance
DO $$ BEGIN
  BEGIN ALTER TABLE attendance ADD COLUMN "overtimeMinutes" INTEGER DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Add companyId to attendance if missing
DO $$ BEGIN
  BEGIN ALTER TABLE attendance ADD COLUMN "companyId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE attendance ADD COLUMN "branchId" INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Add chainId, currentStepOrder, escalationLevel, lastReminderAt to approval_requests
DO $$ BEGIN
  BEGIN ALTER TABLE approval_requests ADD COLUMN "chainId" INTEGER REFERENCES approval_chains(id); EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE approval_requests ADD COLUMN "currentStepOrder" INTEGER DEFAULT 1; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE approval_requests ADD COLUMN "escalationLevel" INTEGER DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN ALTER TABLE approval_requests ADD COLUMN "lastReminderAt" TIMESTAMP; EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;
