-- ═══════════════════════════════════════════════════════════════════
-- Migration 075: إنشاء الجداول المفقودة لوحدات HR
-- hr_exit_requests, hr_exit_clearance, hr_overtime_requests,
-- hr_employee_loans, hr_loan_installments
-- ═══════════════════════════════════════════════════════════════════

-- 1. طلبات نهاية الخدمة
CREATE TABLE IF NOT EXISTS hr_exit_requests (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "branchId" INTEGER REFERENCES branches(id),
  "assignmentId" INTEGER NOT NULL REFERENCES employee_assignments(id),
  "employeeId" INTEGER NOT NULL REFERENCES employees(id),
  "exitNumber" VARCHAR(30) NOT NULL,
  "exitType" VARCHAR(30) NOT NULL DEFAULT 'resignation',
  "requestDate" DATE DEFAULT CURRENT_DATE,
  "lastWorkingDay" DATE,
  "exitReason" TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  "approvedBy" INTEGER REFERENCES users(id),
  "approvedAt" TIMESTAMPTZ,
  "rejectionReason" TEXT,
  "clearanceCompleted" BOOLEAN DEFAULT FALSE,
  "settlementAmount" NUMERIC(12,2),
  "settlementPaid" BOOLEAN DEFAULT FALSE,
  "gratuityAmount" NUMERIC(12,2),
  "leaveBalance" NUMERIC(8,2),
  "leaveCompensation" NUMERIC(12,2),
  "loanDeductions" NUMERIC(12,2) DEFAULT 0,
  "otherDeductions" NUMERIC(12,2) DEFAULT 0,
  "netSettlement" NUMERIC(12,2),
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hr_exit_requests_company ON hr_exit_requests("companyId");
CREATE INDEX IF NOT EXISTS idx_hr_exit_requests_assignment ON hr_exit_requests("assignmentId");
CREATE INDEX IF NOT EXISTS idx_hr_exit_requests_status ON hr_exit_requests(status);

-- 2. إخلاء الطرف
CREATE TABLE IF NOT EXISTS hr_exit_clearance (
  id SERIAL PRIMARY KEY,
  "exitRequestId" INTEGER NOT NULL REFERENCES hr_exit_requests(id),
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  department VARCHAR(50) NOT NULL,
  "departmentLabel" VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  "clearedBy" INTEGER REFERENCES users(id),
  "clearedAt" TIMESTAMPTZ,
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_exit_clearance_request ON hr_exit_clearance("exitRequestId");

-- 3. طلبات الوقت الإضافي
CREATE TABLE IF NOT EXISTS hr_overtime_requests (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "branchId" INTEGER REFERENCES branches(id),
  "assignmentId" INTEGER NOT NULL REFERENCES employee_assignments(id),
  "employeeId" INTEGER NOT NULL REFERENCES employees(id),
  "requestNumber" VARCHAR(30) NOT NULL,
  "overtimeDate" DATE NOT NULL,
  "startTime" TIME NOT NULL,
  "endTime" TIME NOT NULL,
  hours NUMERIC(5,2) NOT NULL,
  "hourlyRate" NUMERIC(10,2),
  multiplier NUMERIC(3,2) DEFAULT 1.50,
  "totalAmount" NUMERIC(12,2),
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  "approvedBy" INTEGER REFERENCES users(id),
  "approvedAt" TIMESTAMPTZ,
  "rejectionReason" TEXT,
  "payrollPeriod" VARCHAR(7),
  "payrollLineId" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hr_overtime_requests_company ON hr_overtime_requests("companyId");
CREATE INDEX IF NOT EXISTS idx_hr_overtime_requests_assignment ON hr_overtime_requests("assignmentId");
CREATE INDEX IF NOT EXISTS idx_hr_overtime_requests_status ON hr_overtime_requests(status);
CREATE INDEX IF NOT EXISTS idx_hr_overtime_requests_date ON hr_overtime_requests("overtimeDate");

-- 4. سلف الموظفين
CREATE TABLE IF NOT EXISTS hr_employee_loans (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "branchId" INTEGER REFERENCES branches(id),
  "assignmentId" INTEGER NOT NULL REFERENCES employee_assignments(id),
  "employeeId" INTEGER NOT NULL REFERENCES employees(id),
  "loanNumber" VARCHAR(30) NOT NULL,
  "loanType" VARCHAR(30) DEFAULT 'salary_advance',
  amount NUMERIC(12,2) NOT NULL,
  "installmentCount" INTEGER NOT NULL DEFAULT 1,
  "installmentAmount" NUMERIC(12,2) NOT NULL,
  "paidAmount" NUMERIC(12,2) DEFAULT 0,
  "remainingAmount" NUMERIC(12,2) NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  "requestDate" DATE DEFAULT CURRENT_DATE,
  "approvedBy" INTEGER REFERENCES users(id),
  "approvedAt" TIMESTAMPTZ,
  "startDeductionPeriod" VARCHAR(7),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hr_employee_loans_company ON hr_employee_loans("companyId");
CREATE INDEX IF NOT EXISTS idx_hr_employee_loans_assignment ON hr_employee_loans("assignmentId");
CREATE INDEX IF NOT EXISTS idx_hr_employee_loans_status ON hr_employee_loans(status);

-- 5. أقساط السلف
CREATE TABLE IF NOT EXISTS hr_loan_installments (
  id SERIAL PRIMARY KEY,
  "loanId" INTEGER NOT NULL REFERENCES hr_employee_loans(id),
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "assignmentId" INTEGER NOT NULL REFERENCES employee_assignments(id),
  "installmentNumber" INTEGER NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  period VARCHAR(7) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  "paidAt" TIMESTAMPTZ,
  "payrollLineId" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_loan_installments_loan ON hr_loan_installments("loanId");
CREATE INDEX IF NOT EXISTS idx_hr_loan_installments_period ON hr_loan_installments(period);
