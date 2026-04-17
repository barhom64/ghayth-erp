-- 078: Department manager routing, request↔correspondence link, connectivity fixes

-- 1. Add correspondenceType and requiresApproval to request_types
ALTER TABLE request_types ADD COLUMN IF NOT EXISTS "requiresApproval" boolean DEFAULT true;
ALTER TABLE request_types ADD COLUMN IF NOT EXISTS "correspondenceType" varchar(50);
ALTER TABLE request_types ADD COLUMN IF NOT EXISTS "autoApproveForDeptManager" boolean DEFAULT false;

-- 2. Link official_letters back to source request
ALTER TABLE official_letters ADD COLUMN IF NOT EXISTS "sourceRequestType" varchar(50);
ALTER TABLE official_letters ADD COLUMN IF NOT EXISTS "sourceRequestId" integer;
ALTER TABLE official_letters ADD COLUMN IF NOT EXISTS "sourceTable" varchar(100);

-- 3. Notification acknowledgment
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "requiresAck" boolean DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "acknowledgedAt" timestamptz;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "acknowledgedBy" integer;

-- 4. Training ↔ Performance link
ALTER TABLE performance_reviews ADD COLUMN IF NOT EXISTS "trainingIds" jsonb DEFAULT '[]';
ALTER TABLE performance_reviews ADD COLUMN IF NOT EXISTS "trainingScore" numeric(3,1);

-- 5. Exit ↔ Finance settlement integrity
ALTER TABLE hr_exit_requests ADD COLUMN IF NOT EXISTS "outstandingLoans" numeric(12,2) DEFAULT 0;
ALTER TABLE hr_exit_requests ADD COLUMN IF NOT EXISTS "loansClearedAt" timestamptz;
ALTER TABLE hr_exit_requests ADD COLUMN IF NOT EXISTS "settlementJournalId" integer;
ALTER TABLE hr_exit_requests ADD COLUMN IF NOT EXISTS "finalSettlementAmount" numeric(12,2);

-- 6. Recruitment → Onboarding link
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS "createdEmployeeId" integer;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS "onboardedAt" timestamptz;

-- 7. Employee violations: approved leave exclusion flag
ALTER TABLE employee_violations ADD COLUMN IF NOT EXISTS "excludedByLeave" boolean DEFAULT false;
ALTER TABLE employee_violations ADD COLUMN IF NOT EXISTS "leaveRequestId" integer;

-- 8. Contracts ↔ Overtime policy
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "overtimeEligible" boolean DEFAULT true;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "overtimeMultiplier" numeric(3,2) DEFAULT 1.50;

-- 9. Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_official_letters_source ON official_letters ("sourceRequestType", "sourceRequestId");
CREATE INDEX IF NOT EXISTS idx_notifications_ack ON notifications ("requiresAck", "acknowledgedAt") WHERE "requiresAck" = true;
CREATE INDEX IF NOT EXISTS idx_job_applications_employee ON job_applications ("createdEmployeeId") WHERE "createdEmployeeId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_violations_excluded ON employee_violations ("excludedByLeave") WHERE "excludedByLeave" = true;
