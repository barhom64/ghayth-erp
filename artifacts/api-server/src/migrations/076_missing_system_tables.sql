-- ═══════════════════════════════════════════════════════════════════
-- Migration 076: إنشاء الجداول المفقودة عبر النظام
-- Finance: credit_memos, debit_memos, customer_advances, dunning_letters,
--          payment_runs, payment_run_items, fx_rates, fx_revaluations,
--          purchase_order_lines, invoice_items, workflow_requests
-- HR:      delegations, payroll_deductions, discipline_memos,
--          payroll_records, employee_kpi_snapshots, hr_violations
-- Training: trainings, training_courses, training_participants
-- Property: property_contracts
-- Catalog:  products
-- ═══════════════════════════════════════════════════════════════════

-- ─── Finance ─────────────────────────────────────────────────────

-- 1. إشعارات دائنة
CREATE TABLE IF NOT EXISTS credit_memos (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "branchId" INTEGER REFERENCES branches(id),
  "invoiceId" INTEGER NOT NULL REFERENCES invoices(id),
  "clientId" INTEGER REFERENCES clients(id),
  amount NUMERIC(18,2) NOT NULL,
  "netAmount" NUMERIC(18,2) NOT NULL,
  "vatAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  "memoDate" DATE NOT NULL,
  "journalId" INTEGER,
  "createdBy" INTEGER REFERENCES users(id),
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_memos_invoice ON credit_memos("invoiceId");
CREATE INDEX IF NOT EXISTS idx_credit_memos_company ON credit_memos("companyId");

-- 2. إشعارات مدينة
CREATE TABLE IF NOT EXISTS debit_memos (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "branchId" INTEGER REFERENCES branches(id),
  "invoiceId" INTEGER NOT NULL REFERENCES invoices(id),
  "clientId" INTEGER REFERENCES clients(id),
  amount NUMERIC(18,2) NOT NULL,
  "netAmount" NUMERIC(18,2) NOT NULL,
  "vatAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  "memoDate" DATE NOT NULL,
  "journalId" INTEGER,
  "createdBy" INTEGER REFERENCES users(id),
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_debit_memos_invoice ON debit_memos("invoiceId");
CREATE INDEX IF NOT EXISTS idx_debit_memos_company ON debit_memos("companyId");

-- 3. دفعات العملاء المقدمة
CREATE TABLE IF NOT EXISTS customer_advances (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "branchId" INTEGER REFERENCES branches(id),
  "clientId" INTEGER NOT NULL REFERENCES clients(id),
  ref TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  "appliedAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
  method TEXT,
  "receivedDate" DATE NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  "journalId" INTEGER,
  "createdBy" INTEGER REFERENCES users(id),
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_advances_client ON customer_advances("clientId");
CREATE INDEX IF NOT EXISTS idx_customer_advances_company ON customer_advances("companyId");

-- 4. خطابات المطالبة
CREATE TABLE IF NOT EXISTS dunning_letters (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "invoiceId" INTEGER NOT NULL REFERENCES invoices(id),
  "clientId" INTEGER REFERENCES clients(id),
  stage INTEGER NOT NULL,
  "daysPastDue" INTEGER NOT NULL,
  "outstandingAmount" NUMERIC(18,2) NOT NULL,
  "letterContent" TEXT,
  "sentAt" TIMESTAMPTZ DEFAULT NOW(),
  "sentBy" INTEGER REFERENCES users(id),
  "sentVia" VARCHAR(16) DEFAULT 'manual',
  status VARCHAR(16) DEFAULT 'sent'
);
CREATE INDEX IF NOT EXISTS idx_dunning_letters_invoice ON dunning_letters("invoiceId");

-- 5. دورات الدفع
CREATE TABLE IF NOT EXISTS payment_runs (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "branchId" INTEGER REFERENCES branches(id),
  ref TEXT NOT NULL,
  "paymentDate" DATE NOT NULL,
  method TEXT,
  "bankAccount" TEXT,
  "totalAmount" NUMERIC(18,2) NOT NULL,
  "poCount" INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'executed',
  "journalId" INTEGER,
  "createdBy" INTEGER REFERENCES users(id),
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_runs_company ON payment_runs("companyId");

-- 6. بنود دورات الدفع
CREATE TABLE IF NOT EXISTS payment_run_items (
  id SERIAL PRIMARY KEY,
  "runId" INTEGER NOT NULL REFERENCES payment_runs(id) ON DELETE CASCADE,
  "poId" INTEGER NOT NULL,
  "supplierId" INTEGER,
  amount NUMERIC(18,2) NOT NULL,
  "journalId" INTEGER
);
CREATE INDEX IF NOT EXISTS idx_payment_run_items_run ON payment_run_items("runId");

-- 7. أسعار العملات
CREATE TABLE IF NOT EXISTS fx_rates (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "rateDate" DATE NOT NULL,
  "fromCurrency" VARCHAR(8) NOT NULL,
  "toCurrency" VARCHAR(8) NOT NULL DEFAULT 'SAR',
  rate NUMERIC(18,8) NOT NULL,
  type VARCHAR(16) NOT NULL DEFAULT 'spot',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("companyId","rateDate","fromCurrency","toCurrency",type)
);
CREATE INDEX IF NOT EXISTS idx_fx_rates_company ON fx_rates("companyId");

-- 8. إعادة تقييم العملات
CREATE TABLE IF NOT EXISTS fx_revaluations (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  period VARCHAR(7) NOT NULL,
  "journalEntryId" INTEGER,
  "totalGain" NUMERIC(18,2) DEFAULT 0,
  "totalLoss" NUMERIC(18,2) DEFAULT 0,
  details JSONB,
  "postedBy" INTEGER REFERENCES users(id),
  "postedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("companyId",period)
);

-- 9. بنود أوامر الشراء
CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id SERIAL PRIMARY KEY,
  "purchaseOrderId" INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  "productId" INTEGER,
  description TEXT,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  "unitPrice" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "vatRate" NUMERIC(5,2) DEFAULT 15,
  "totalPrice" NUMERIC(18,2) NOT NULL DEFAULT 0,
  unit VARCHAR(20),
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po ON purchase_order_lines("purchaseOrderId");

-- 10. بنود الفواتير
CREATE TABLE IF NOT EXISTS invoice_items (
  id SERIAL PRIMARY KEY,
  "invoiceId" INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  "productId" INTEGER,
  description TEXT,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  "unitPrice" NUMERIC(18,2) NOT NULL DEFAULT 0,
  "vatRate" NUMERIC(5,2) DEFAULT 15,
  "totalPrice" NUMERIC(18,2) NOT NULL DEFAULT 0,
  unit VARCHAR(20),
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items("invoiceId");

-- 11. طلبات سير العمل
CREATE TABLE IF NOT EXISTS workflow_requests (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "requestType" VARCHAR(30) NOT NULL,
  title TEXT,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  amount NUMERIC(18,2),
  "submittedBy" INTEGER,
  "approvedBy" INTEGER,
  "approvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workflow_requests_company ON workflow_requests("companyId");
CREATE INDEX IF NOT EXISTS idx_workflow_requests_type ON workflow_requests("requestType");

-- ─── HR ──────────────────────────────────────────────────────────

-- 12. التفويضات
CREATE TABLE IF NOT EXISTS delegations (
  id SERIAL PRIMARY KEY,
  "delegatorId" INTEGER NOT NULL REFERENCES employees(id),
  "delegateId" INTEGER NOT NULL REFERENCES employees(id),
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  scope TEXT DEFAULT 'عام',
  reason TEXT,
  status VARCHAR(20) DEFAULT 'active',
  "startDate" DATE,
  "endDate" DATE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_delegations_company ON delegations("companyId");

-- 13. خصومات الرواتب
CREATE TABLE IF NOT EXISTS payroll_deductions (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "employeeId" INTEGER NOT NULL REFERENCES employees(id),
  type VARCHAR(30) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT,
  date DATE DEFAULT CURRENT_DATE,
  status VARCHAR(20),
  "payrollLineId" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payroll_deductions_company ON payroll_deductions("companyId");
CREATE INDEX IF NOT EXISTS idx_payroll_deductions_employee ON payroll_deductions("employeeId");

-- 14. محاضر التحقيق
CREATE TABLE IF NOT EXISTS discipline_memos (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "violationId" INTEGER NOT NULL REFERENCES employee_violations(id),
  "memoNumber" VARCHAR(30),
  status VARCHAR(20) DEFAULT 'draft',
  "penaltyLabel" TEXT,
  "baseDeductionAmount" NUMERIC(12,2) DEFAULT 0,
  "totalDeductionAmount" NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  "issuedBy" INTEGER REFERENCES users(id),
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_discipline_memos_violation ON discipline_memos("violationId");
CREATE INDEX IF NOT EXISTS idx_discipline_memos_company ON discipline_memos("companyId");

-- 15. سجلات الرواتب (قد يكون موجوداً كعرض VIEW)
-- payroll_records exists as a VIEW in the base schema — skip table+index creation
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'payroll_records') THEN
    CREATE TABLE payroll_records (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES companies(id),
      "employeeAssignmentId" INTEGER NOT NULL REFERENCES employee_assignments(id),
      period VARCHAR(7) NOT NULL,
      ref TEXT,
      "grossSalary" NUMERIC(12,2),
      "netSalary" NUMERIC(12,2),
      deductions NUMERIC(12,2) DEFAULT 0,
      additions NUMERIC(12,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending',
      "createdAt" TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX idx_payroll_records_assignment ON payroll_records("employeeAssignmentId");
    CREATE INDEX idx_payroll_records_company ON payroll_records("companyId");
  END IF;
END $$;

-- 16. لقطات مؤشرات أداء الموظفين
CREATE TABLE IF NOT EXISTS employee_kpi_snapshots (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "employeeId" INTEGER NOT NULL REFERENCES employees(id),
  "snapshotDate" DATE DEFAULT CURRENT_DATE,
  "kpiName" TEXT,
  "kpiValue" NUMERIC(12,2),
  metadata JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_kpi_snapshots_company ON employee_kpi_snapshots("companyId");

-- 17. مخالفات الموارد البشرية (عرض مجمع)
CREATE TABLE IF NOT EXISTS hr_violations (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "employeeId" INTEGER NOT NULL REFERENCES employees(id),
  "assignmentId" INTEGER REFERENCES employee_assignments(id),
  "violationType" VARCHAR(30),
  description TEXT,
  "incidentDate" DATE,
  status VARCHAR(20) DEFAULT 'pending',
  severity VARCHAR(20) DEFAULT 'minor',
  "penaltyId" INTEGER,
  deduction NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  "createdBy" INTEGER REFERENCES users(id),
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hr_violations_company ON hr_violations("companyId");
CREATE INDEX IF NOT EXISTS idx_hr_violations_status ON hr_violations(status);

-- ─── Training ────────────────────────────────────────────────────

-- 18. البرامج التدريبية (BI analytics)
CREATE TABLE IF NOT EXISTS trainings (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  title TEXT NOT NULL,
  type VARCHAR(30),
  description TEXT,
  "startDate" DATE,
  "endDate" DATE,
  location TEXT,
  trainer TEXT,
  cost NUMERIC(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'planned',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trainings_company ON trainings("companyId");

-- 19. الدورات التدريبية (employee detail)
CREATE TABLE IF NOT EXISTS training_courses (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  title TEXT NOT NULL,
  type VARCHAR(30),
  description TEXT,
  "startDate" DATE,
  "endDate" DATE,
  hours NUMERIC(6,2),
  provider TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_courses_company ON training_courses("companyId");

-- 20. المشاركون في التدريب
CREATE TABLE IF NOT EXISTS training_participants (
  id SERIAL PRIMARY KEY,
  "trainingId" INTEGER REFERENCES trainings(id),
  "courseId" INTEGER REFERENCES training_courses(id),
  "employeeId" INTEGER NOT NULL REFERENCES employees(id),
  status VARCHAR(20) DEFAULT 'enrolled',
  score NUMERIC(5,2),
  hours NUMERIC(6,2),
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_participants_training ON training_participants("trainingId");
CREATE INDEX IF NOT EXISTS idx_training_participants_employee ON training_participants("employeeId");

-- ─── Property / Catalog ─────────────────────────────────────────

-- 21. عقود العقارات
CREATE TABLE IF NOT EXISTS property_contracts (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "unitId" INTEGER REFERENCES property_units(id),
  "tenantId" INTEGER REFERENCES tenants(id),
  "contractNumber" VARCHAR(30),
  "startDate" DATE,
  "endDate" DATE,
  "monthlyRent" NUMERIC(12,2),
  status VARCHAR(20) DEFAULT 'active',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_property_contracts_company ON property_contracts("companyId");

-- 22. المنتجات (كتالوج المشتريات)
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  description TEXT,
  sku VARCHAR(50),
  category VARCHAR(50),
  "unitPrice" NUMERIC(18,2),
  unit VARCHAR(20),
  "isActive" BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_company ON products("companyId");

-- ─── Ensure dunning columns on invoices ─────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "lastDunningStage" INTEGER DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "lastDunningAt" TIMESTAMPTZ;

-- ─── Ensure currency columns ────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'SAR';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "exchangeRate" NUMERIC(18,8) DEFAULT 1;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'SAR';
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS "exchangeRate" NUMERIC(18,8) DEFAULT 1;
