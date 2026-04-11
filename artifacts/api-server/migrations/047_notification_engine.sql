-- ============================================================
-- 027: Notification Engine — comprehensive tables
-- ============================================================

-- 1. Per-user notification preferences — extend existing table with new columns
-- Defensive repair: ensure required columns exist regardless of how the table was originally created.
-- In some environments the table may have been seeded with an older schema (e.g. using "assignmentId"
-- instead of "userId"/"companyId"), which would cause CREATE INDEX ... ON notification_preferences("userId")
-- to fail with "column does not exist" inside ComputeIndexAttrs.
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  -- Add userId if missing (older schema used "assignmentId" instead)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences' AND column_name = 'userId'
  ) THEN
    ALTER TABLE notification_preferences ADD COLUMN "userId" INTEGER;
  END IF;

  -- Add companyId if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences' AND column_name = 'companyId'
  ) THEN
    ALTER TABLE notification_preferences ADD COLUMN "companyId" INTEGER NOT NULL DEFAULT 1;
  END IF;

  -- Drop any stale UNIQUE constraint that included assignmentId (old schema artifact).
  -- Only targets UNIQUE constraints to avoid touching the primary key.
  SELECT tc.constraint_name INTO v_constraint
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name AND kcu.table_name = tc.table_name
  WHERE tc.table_name = 'notification_preferences'
    AND tc.constraint_type = 'UNIQUE'
    AND kcu.column_name = 'assignmentId'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE notification_preferences DROP CONSTRAINT IF EXISTS %I', v_constraint);
  END IF;
END $$;

ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS "inApp" BOOLEAN DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email BOOLEAN DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS sms BOOLEAN DEFAULT false;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS whatsapp BOOLEAN DEFAULT false;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS push BOOLEAN DEFAULT true;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS webhook BOOLEAN DEFAULT false;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS "quietHoursStart" TIME;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS "quietHoursEnd" TIME;

CREATE INDEX IF NOT EXISTS idx_notif_pref_user ON notification_preferences("userId");
CREATE INDEX IF NOT EXISTS idx_notif_pref_company ON notification_preferences("companyId");

-- 2. Company-level routing rules (replaces hardcoded TYPE_CHANNEL_MAP)
CREATE TABLE IF NOT EXISTS notification_routing_rules (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER REFERENCES companies(id),
  "eventCategory" VARCHAR(100) NOT NULL,
  channels JSONB NOT NULL DEFAULT '["in_app"]',
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  "isActive" BOOLEAN DEFAULT true,
  description TEXT,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("companyId", "eventCategory")
);

CREATE INDEX IF NOT EXISTS idx_routing_rules_company ON notification_routing_rules("companyId");
CREATE INDEX IF NOT EXISTS idx_routing_rules_event ON notification_routing_rules("eventCategory");

-- Seed default routing rules (companyId NULL = global defaults)
INSERT INTO notification_routing_rules ("companyId", "eventCategory", channels, priority, description)
VALUES
  (NULL, 'alert',       '["in_app","push"]', 'high', 'تنبيهات النظام'),
  (NULL, 'task',        '["in_app","email","push"]', 'normal', 'المهام'),
  (NULL, 'payroll',     '["in_app","email"]', 'normal', 'الرواتب'),
  (NULL, 'leave',       '["in_app","email","push"]', 'high', 'الإجازات'),
  (NULL, 'support',     '["in_app","email","whatsapp"]', 'normal', 'الدعم الفني'),
  (NULL, 'crm',         '["in_app","email"]', 'normal', 'إدارة العلاقات'),
  (NULL, 'system',      '["in_app"]', 'low', 'إشعارات النظام'),
  (NULL, 'invoice',     '["in_app","email","sms"]', 'normal', 'الفواتير'),
  (NULL, 'attendance',  '["in_app"]', 'low', 'الحضور والانصراف'),
  (NULL, 'kpi',         '["in_app","push"]', 'normal', 'مؤشرات الأداء'),
  (NULL, 'maintenance', '["in_app","whatsapp","push"]', 'high', 'الصيانة'),
  (NULL, 'contract',    '["in_app","email"]', 'normal', 'العقود'),
  (NULL, 'fleet',       '["in_app","push"]', 'normal', 'الأسطول'),
  (NULL, 'hr',          '["in_app","email"]', 'normal', 'الموارد البشرية'),
  (NULL, 'finance',     '["in_app","email"]', 'normal', 'المالية'),
  (NULL, 'workflow',    '["in_app","email","push"]', 'high', 'الإجراءات'),
  (NULL, 'escalation',  '["in_app","email","sms","whatsapp","push"]', 'urgent', 'التصعيد')
ON CONFLICT DO NOTHING;

-- 3. Notification message templates (editable from UI, replaces hardcoded templates)
CREATE TABLE IF NOT EXISTS notification_templates (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER REFERENCES companies(id),
  "templateKey" VARCHAR(150) NOT NULL,
  channel VARCHAR(30) NOT NULL CHECK (channel IN ('sms','whatsapp','email','push','in_app','webhook')),
  "titleTemplate" TEXT,
  "bodyTemplate" TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  language VARCHAR(10) DEFAULT 'ar',
  "isActive" BOOLEAN DEFAULT true,
  "isDefault" BOOLEAN DEFAULT false,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("companyId", "templateKey", channel, language)
);

CREATE INDEX IF NOT EXISTS idx_notif_templates_key ON notification_templates("templateKey");
CREATE INDEX IF NOT EXISTS idx_notif_templates_company ON notification_templates("companyId");

-- Seed default notification templates
INSERT INTO notification_templates ("companyId", "templateKey", channel, "titleTemplate", "bodyTemplate", variables, language, "isDefault")
VALUES
  (NULL, 'invoice_reminder', 'sms', NULL,
   'عزيزي {{clientName}}، لديك فاتورة رقم {{ref}} بمبلغ {{amount}} ريال مستحقة بتاريخ {{dueDate}}. شكراً لتعاملكم معنا.',
   '[{"key":"clientName","label":"اسم العميل"},{"key":"ref","label":"رقم الفاتورة"},{"key":"amount","label":"المبلغ"},{"key":"dueDate","label":"تاريخ الاستحقاق"}]'::jsonb, 'ar', true),

  (NULL, 'invoice_reminder', 'whatsapp', NULL,
   E'مرحباً {{clientName}} \nلديكم فاتورة مستحقة:\nالرقم: {{ref}}\nالمبلغ: {{amount}} ريال\nالاستحقاق: {{dueDate}}\n\nنأمل السداد في الموعد. شكراً لثقتكم.',
   '[{"key":"clientName","label":"اسم العميل"},{"key":"ref","label":"رقم الفاتورة"},{"key":"amount","label":"المبلغ"},{"key":"dueDate","label":"تاريخ الاستحقاق"}]'::jsonb, 'ar', true),

  (NULL, 'invoice_reminder', 'email', 'تذكير بفاتورة مستحقة - {{ref}}',
   E'عزيزي {{clientName}},\n\nنود تذكيركم بالفاتورة رقم {{ref}} بمبلغ {{amount}} ريال المستحقة بتاريخ {{dueDate}}.\n\nنأمل السداد في الموعد المحدد.\n\nمع أطيب التحيات,\nفريق غيث',
   '[{"key":"clientName","label":"اسم العميل"},{"key":"ref","label":"رقم الفاتورة"},{"key":"amount","label":"المبلغ"},{"key":"dueDate","label":"تاريخ الاستحقاق"}]'::jsonb, 'ar', true),

  (NULL, 'welcome', 'sms', NULL,
   'أهلاً بك {{clientName}} في خدمات غيث. رقم حسابك: {{code}}. نسعد بخدمتك دائماً.',
   '[{"key":"clientName","label":"اسم العميل"},{"key":"code","label":"رقم الحساب"}]'::jsonb, 'ar', true),

  (NULL, 'welcome', 'whatsapp', NULL,
   E'مرحباً {{clientName}}\n\nتم إنشاء حسابك لدى غيث.\nرقم حسابك: {{code}}\n\nنسعد بخدمتكم دائماً',
   '[{"key":"clientName","label":"اسم العميل"},{"key":"code","label":"رقم الحساب"}]'::jsonb, 'ar', true),

  (NULL, 'welcome', 'email', 'مرحباً بك في غيث',
   E'عزيزي {{clientName}},\n\nيسعدنا انضمامك إلينا. رقم حسابك هو: {{code}}.\n\nلا تتردد في التواصل معنا لأي استفسار.\n\nمع أطيب التحيات,\nفريق غيث',
   '[{"key":"clientName","label":"اسم العميل"},{"key":"code","label":"رقم الحساب"}]'::jsonb, 'ar', true),

  (NULL, 'ticket_update', 'sms', NULL,
   'تم تحديث تذكرة الدعم رقم {{ref}}: {{status}}. {{details}}',
   '[{"key":"ref","label":"رقم التذكرة"},{"key":"status","label":"الحالة"},{"key":"details","label":"التفاصيل"}]'::jsonb, 'ar', true),

  (NULL, 'ticket_update', 'whatsapp', NULL,
   E'تحديث تذكرة الدعم\n\nالرقم: {{ref}}\nالحالة: {{status}}\n{{details}}',
   '[{"key":"ref","label":"رقم التذكرة"},{"key":"status","label":"الحالة"},{"key":"details","label":"التفاصيل"}]'::jsonb, 'ar', true),

  (NULL, 'payment_received', 'sms', NULL,
   'شكراً {{clientName}}، تم استلام دفعة بمبلغ {{amount}} ريال لفاتورة {{ref}}.',
   '[{"key":"clientName","label":"اسم العميل"},{"key":"amount","label":"المبلغ"},{"key":"ref","label":"رقم الفاتورة"}]'::jsonb, 'ar', true),

  (NULL, 'leave_request', 'email', 'طلب إجازة جديد - {{employeeName}}',
   E'تم تقديم طلب إجازة جديد:\n\nالموظف: {{employeeName}}\nنوع الإجازة: {{leaveType}}\nمن: {{startDate}}\nإلى: {{endDate}}\n\nيرجى المراجعة والاعتماد.',
   '[{"key":"employeeName","label":"اسم الموظف"},{"key":"leaveType","label":"نوع الإجازة"},{"key":"startDate","label":"تاريخ البداية"},{"key":"endDate","label":"تاريخ النهاية"}]'::jsonb, 'ar', true),

  (NULL, 'leave_request', 'push', 'طلب إجازة جديد',
   'طلب إجازة من {{employeeName}} — {{leaveType}}',
   '[{"key":"employeeName","label":"اسم الموظف"},{"key":"leaveType","label":"نوع الإجازة"}]'::jsonb, 'ar', true),

  (NULL, 'task_assigned', 'push', 'مهمة جديدة',
   'تم تعيين مهمة لك: {{taskTitle}}',
   '[{"key":"taskTitle","label":"عنوان المهمة"}]'::jsonb, 'ar', true),

  (NULL, 'task_assigned', 'email', 'مهمة جديدة - {{taskTitle}}',
   E'تم تعيين مهمة جديدة لك:\n\nالعنوان: {{taskTitle}}\nالأولوية: {{priority}}\nالموعد النهائي: {{deadline}}\n\nيرجى مراجعة التفاصيل والبدء بالتنفيذ.',
   '[{"key":"taskTitle","label":"عنوان المهمة"},{"key":"priority","label":"الأولوية"},{"key":"deadline","label":"الموعد النهائي"}]'::jsonb, 'ar', true),

  (NULL, 'escalation', 'sms', NULL,
   'تصعيد: {{title}} — {{body}}',
   '[{"key":"title","label":"العنوان"},{"key":"body","label":"التفاصيل"}]'::jsonb, 'ar', true),

  (NULL, 'escalation', 'email', 'تصعيد عاجل: {{title}}',
   E'تنبيه تصعيد:\n\n{{title}}\n\n{{body}}\n\nيرجى اتخاذ الإجراء المطلوب فوراً.',
   '[{"key":"title","label":"العنوان"},{"key":"body","label":"التفاصيل"}]'::jsonb, 'ar', true)
ON CONFLICT DO NOTHING;

-- 4. Fallback / escalation chains
CREATE TABLE IF NOT EXISTS notification_fallback_chains (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER REFERENCES companies(id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]',
  "isActive" BOOLEAN DEFAULT true,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fallback_chains_company ON notification_fallback_chains("companyId");

-- Seed default fallback chains
INSERT INTO notification_fallback_chains ("companyId", name, description, steps, "isActive")
VALUES
  (NULL, 'سلسلة SMS التصعيدية',
   'إذا فشل SMS، يُحاول واتساب، ثم إيميل',
   '[{"channel":"sms","waitMinutes":0},{"channel":"whatsapp","waitMinutes":5},{"channel":"email","waitMinutes":10}]'::jsonb,
   true),
  (NULL, 'سلسلة واتساب التصعيدية',
   'إذا فشل واتساب، يُحاول SMS، ثم إيميل',
   '[{"channel":"whatsapp","waitMinutes":0},{"channel":"sms","waitMinutes":5},{"channel":"email","waitMinutes":10}]'::jsonb,
   true),
  (NULL, 'سلسلة الحالات الحرجة',
   'كل القنوات في نفس الوقت',
   '[{"channel":"sms","waitMinutes":0},{"channel":"whatsapp","waitMinutes":0},{"channel":"email","waitMinutes":0},{"channel":"push","waitMinutes":0}]'::jsonb,
   true)
ON CONFLICT DO NOTHING;

-- 5. Notification routing rule ↔ fallback chain link
ALTER TABLE notification_routing_rules ADD COLUMN IF NOT EXISTS "fallbackChainId" INTEGER REFERENCES notification_fallback_chains(id);

-- 6. Unified delivery tracking log
CREATE TABLE IF NOT EXISTS notification_delivery_log (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "notificationId" INTEGER,
  channel VARCHAR(30) NOT NULL,
  recipient VARCHAR(300) NOT NULL,
  "templateKey" VARCHAR(150),
  subject TEXT,
  body TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','delivered','failed','bounced','rejected','fallback_triggered')),
  "externalId" VARCHAR(300),
  "providerResponse" JSONB,
  "errorMessage" TEXT,
  "attemptCount" INTEGER DEFAULT 0,
  "fallbackChainId" INTEGER REFERENCES notification_fallback_chains(id),
  "fallbackStep" INTEGER DEFAULT 0,
  "parentDeliveryId" INTEGER REFERENCES notification_delivery_log(id),
  metadata JSONB DEFAULT '{}',
  "queuedAt" TIMESTAMPTZ DEFAULT NOW(),
  "sentAt" TIMESTAMPTZ,
  "deliveredAt" TIMESTAMPTZ,
  "failedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_log_company ON notification_delivery_log("companyId");
CREATE INDEX IF NOT EXISTS idx_delivery_log_status ON notification_delivery_log(status);
CREATE INDEX IF NOT EXISTS idx_delivery_log_channel ON notification_delivery_log(channel);
CREATE INDEX IF NOT EXISTS idx_delivery_log_created ON notification_delivery_log("createdAt");
CREATE INDEX IF NOT EXISTS idx_delivery_log_notification ON notification_delivery_log("notificationId");

-- 7. Outbound webhook subscriptions
CREATE TABLE IF NOT EXISTS notification_webhooks (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  name VARCHAR(200) NOT NULL,
  url TEXT NOT NULL,
  secret VARCHAR(500),
  events JSONB NOT NULL DEFAULT '["*"]',
  headers JSONB DEFAULT '{}',
  "isActive" BOOLEAN DEFAULT true,
  "lastSuccessAt" TIMESTAMPTZ,
  "lastFailureAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "failCount" INTEGER DEFAULT 0,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_webhooks_company ON notification_webhooks("companyId");
CREATE INDEX IF NOT EXISTS idx_notif_webhooks_active ON notification_webhooks("isActive");
