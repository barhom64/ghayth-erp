-- ============================================================
-- Migration 014: Proactive Automation Engine
-- Automation log table + seed proactive automation rules
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_logs (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER,
  "automationType" VARCHAR(100) NOT NULL,
  "triggerReason" TEXT NOT NULL,
  "actionTaken" TEXT NOT NULL,
  "entityType" VARCHAR(100),
  "entityId" INTEGER,
  "createdEntityType" VARCHAR(100),
  "createdEntityId" INTEGER,
  "assignedTo" INTEGER,
  status VARCHAR(20) DEFAULT 'success',
  details JSONB,
  "createdAt" TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_logs_company_idx ON automation_logs ("companyId");
CREATE INDEX IF NOT EXISTS automation_logs_type_idx ON automation_logs ("automationType");
CREATE INDEX IF NOT EXISTS automation_logs_created_idx ON automation_logs ("createdAt" DESC);

CREATE TABLE IF NOT EXISTS proactive_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  "nameAr" VARCHAR(200) NOT NULL,
  description TEXT,
  "descriptionAr" TEXT,
  module VARCHAR(50) NOT NULL,
  "triggerType" VARCHAR(50) NOT NULL DEFAULT 'cron',
  "isActive" BOOLEAN DEFAULT true,
  "lastRunAt" TIMESTAMP,
  "totalExecutions" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS proactive_rules_name_idx ON proactive_rules (name);

INSERT INTO proactive_rules (name, "nameAr", description, "descriptionAr", module, "triggerType")
VALUES
  ('employee_contract_expiry', 'تجديد عقد موظف', 'Create HR renewal task 30 days before employee contract expiry', 'إنشاء مهمة تجديد تلقائية قبل 30 يوم من انتهاء عقد الموظف', 'hr', 'cron'),
  ('invoice_overdue_collection', 'مطالبة تحصيل فاتورة', 'Create collection claim when invoice is 30+ days overdue', 'إنشاء مطالبة تحصيل تلقائية عند تأخر سداد فاتورة 30 يوم', 'finance', 'cron'),
  ('unauthorized_absence_inquiry', 'استفسار غياب بدون إذن', 'Create manager inquiry when employee is absent without leave', 'إنشاء استفسار تلقائي من المدير المباشر عند غياب موظف بدون إذن', 'hr', 'cron'),
  ('vehicle_breakdown_maintenance', 'طلب صيانة مركبة', 'Create maintenance request when vehicle reports breakdown', 'إنشاء طلب صيانة تلقائي عند عطل مركبة', 'fleet', 'event'),
  ('vehicle_insurance_expiry', 'تجديد تأمين مركبة', 'Create insurance renewal task 30 days before expiry', 'إنشاء مهمة تجديد تأمين تلقائية قبل 30 يوم من انتهاء التأمين', 'fleet', 'cron'),
  ('rental_contract_expiry', 'متابعة عقد إيجار', 'Create follow-up task 60 days before rental contract expiry', 'إنشاء مهمة متابعة تلقائية قبل 60 يوم من انتهاء عقد الإيجار', 'property', 'cron'),
  ('annual_performance_review', 'تقييم أداء سنوي', 'Create annual performance review task', 'إنشاء مهمة تقييم أداء سنوي تلقائية', 'hr', 'cron'),
  ('probation_completion_review', 'مراجعة تثبيت موظف', 'Create confirmation review task when probation ends', 'إنشاء مهمة مراجعة تثبيت عند إتمام فترة التجربة', 'hr', 'cron')
ON CONFLICT (name) DO NOTHING;
