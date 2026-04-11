-- Business Rules Engine tables
CREATE TABLE IF NOT EXISTS business_rules (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER REFERENCES companies(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  "triggerEvent" VARCHAR(255) NOT NULL,
  "conditionField" VARCHAR(255),
  "conditionOperator" VARCHAR(50) DEFAULT '>=',
  "conditionValue" VARCHAR(255),
  "actionType" VARCHAR(100) NOT NULL,
  "actionTarget" VARCHAR(255),
  "actionConfig" JSONB DEFAULT '{}',
  module VARCHAR(100),
  priority INTEGER DEFAULT 0,
  "isActive" BOOLEAN DEFAULT true,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_rule_logs (
  id SERIAL PRIMARY KEY,
  "ruleId" INTEGER REFERENCES business_rules(id) ON DELETE SET NULL,
  "ruleName" VARCHAR(255),
  "triggerEvent" VARCHAR(255),
  "companyId" INTEGER,
  "entityId" INTEGER,
  "entityType" VARCHAR(100),
  "actionTaken" VARCHAR(255),
  "actionResult" TEXT,
  status VARCHAR(50) DEFAULT 'success',
  "executedAt" TIMESTAMP DEFAULT NOW(),
  details JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_business_rules_company ON business_rules("companyId");
CREATE INDEX IF NOT EXISTS idx_business_rules_trigger ON business_rules("triggerEvent");
CREATE INDEX IF NOT EXISTS idx_business_rules_active ON business_rules("isActive");
CREATE INDEX IF NOT EXISTS idx_business_rule_logs_rule ON business_rule_logs("ruleId");
CREATE INDEX IF NOT EXISTS idx_business_rule_logs_company ON business_rule_logs("companyId");
CREATE INDEX IF NOT EXISTS idx_business_rule_logs_executed ON business_rule_logs("executedAt");

-- Seed 10+ default business rules (companyId NULL = template for all companies)
INSERT INTO business_rules ("companyId", name, description, "triggerEvent", "conditionField", "conditionOperator", "conditionValue", "actionType", "actionTarget", "actionConfig", module, priority, "isActive")
VALUES
  (NULL, 'تأخر 3 مرات = إشعار المدير', 'عند تأخر الموظف 3 مرات في الشهر يتم إشعار المدير', 'attendance.checkin', 'monthlyLateCount', '>=', '3', 'notification', 'manager', '{"title":"تأخر متكرر","body":"الموظف تأخر {count} مرات هذا الشهر","priority":"high","type":"hr"}', 'hr', 10, true),

  (NULL, 'تأخر سداد 30 يوم = تصعيد للقانونية', 'عند تأخر سداد فاتورة أكثر من 30 يوم يتم التصعيد للقسم القانوني', 'invoice.overdue_check', 'daysOverdue', '>=', '30', 'escalation', 'legal', '{"title":"تصعيد تحصيل","body":"فاتورة {ref} متأخرة {days} يوم","priority":"urgent"}', 'finance', 20, true),

  (NULL, 'انتهاء عقد قبل 30 يوم = مهمة تجديد', 'عند اقتراب انتهاء عقد بأقل من 30 يوم يتم إنشاء مهمة تجديد', 'contract.expiry_check', 'daysToExpiry', '<=', '30', 'create_task', 'hr', '{"title":"تجديد عقد","body":"عقد {name} ينتهي خلال {days} يوم","priority":"high"}', 'hr', 15, true),

  (NULL, 'شكوى صيانة حرجة = مهلة 4 ساعات', 'عند ورود شكوى صيانة حرجة يتم تحديد مهلة 4 ساعات', 'support.ticket.created', 'priority', '==', 'critical', 'set_sla', 'support', '{"slaHours":4,"title":"بلاغ صيانة حرج","body":"بلاغ صيانة حرج - مهلة 4 ساعات","priority":"urgent"}', 'support', 25, true),

  (NULL, 'طلب صرف أعلى من الحد = مستوى اعتماد أعلى', 'عند وجود طلب صرف يتجاوز الحد المحدد يتم رفعه لمستوى اعتماد أعلى', 'expense.created', 'amount', '>=', '10000', 'escalation', 'director', '{"title":"طلب صرف عالي","body":"طلب صرف بمبلغ {amount} ريال يحتاج اعتماد أعلى","priority":"high"}', 'finance', 20, true),

  (NULL, 'غياب بدون إذن = إنذار تلقائي', 'عند تسجيل غياب بدون إذن مسبق يتم إصدار إنذار', 'attendance.absent', 'hasLeave', '==', 'false', 'notification', 'employee', '{"title":"إنذار غياب","body":"تم تسجيل غيابك اليوم بدون إذن مسبق","priority":"high","type":"hr"}', 'hr', 10, true),

  (NULL, 'مركبة تجاوزت موعد الصيانة = تعليق', 'عند تجاوز مركبة لموعد الصيانة الدورية يتم تعليقها', 'fleet.maintenance_check', 'daysOverdue', '>=', '0', 'status_change', 'fleet_vehicle', '{"newStatus":"needs_service","title":"صيانة متأخرة","body":"المركبة {plateNumber} تجاوزت موعد الصيانة","priority":"high"}', 'fleet', 15, true),

  (NULL, 'تأمين مركبة منتهي = إشعار عاجل', 'عند انتهاء تأمين مركبة يتم إشعار إدارة النقليات', 'fleet.insurance_check', 'daysToExpiry', '<=', '0', 'notification', 'fleet_manager', '{"title":"تأمين منتهي","body":"تأمين المركبة {plateNumber} منتهي - يرجى التجديد فوراً","priority":"urgent"}', 'fleet', 25, true),

  (NULL, 'مشروع تجاوز الميزانية 80% = تحذير', 'عند وصول مشروع إلى 80% من الميزانية يتم إشعار مدير المشروع', 'project.budget_check', 'budgetUsagePct', '>=', '80', 'notification', 'project_manager', '{"title":"تحذير ميزانية","body":"المشروع {name} وصل إلى {pct}% من الميزانية","priority":"high"}', 'projects', 15, true),

  (NULL, 'عقد إيجار ينتهي خلال 60 يوم = إشعار', 'عند اقتراب انتهاء عقد إيجار يتم إشعار إدارة الأملاك', 'property.contract_check', 'daysToExpiry', '<=', '60', 'notification', 'property_manager', '{"title":"عقد إيجار ينتهي","body":"عقد إيجار الوحدة {unit} ينتهي خلال {days} يوم","priority":"normal"}', 'property', 10, true),

  (NULL, 'قضية قانونية جديدة = إشعار المدير', 'عند فتح قضية قانونية جديدة يتم إشعار المدير العام', 'legal.case.created', 'priority', '==', 'high', 'notification', 'director', '{"title":"قضية قانونية عاجلة","body":"تم فتح قضية قانونية عالية الأولوية: {title}","priority":"urgent"}', 'legal', 20, true),

  (NULL, 'طلب إجازة طويلة = موافقة مدير أعلى', 'إجازة أكثر من 5 أيام تحتاج موافقة مدير أعلى', 'leave.requested', 'days', '>=', '5', 'escalation', 'director', '{"title":"إجازة طويلة","body":"طلب إجازة {days} أيام يحتاج موافقة مدير أعلى","priority":"high"}', 'hr', 15, true)
ON CONFLICT DO NOTHING;
