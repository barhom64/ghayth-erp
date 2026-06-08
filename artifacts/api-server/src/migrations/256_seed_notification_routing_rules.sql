-- ===========================================================================
-- Migration 256: Seed default notification routing rules (ACTIVATION)
-- ---------------------------------------------------------------------------
-- The notification engine's getRoutingRule() looks a rule up by the FIRST
-- segment of the event category (e.g. "leave.request.created" → "leave")
-- and, when none is found, falls back to in_app ONLY. That meant every
-- event wired through notifyBusinessEvent (#1639/#1643) silently never
-- reached email / sms / whatsapp — the pipes were built but never opened.
--
-- This seeds GLOBAL defaults (companyId IS NULL) keyed by the top-level
-- prefix. getRoutingRule reads `("companyId" = $1 OR "companyId" IS NULL)`
-- so every company inherits these out of the box, and any company can
-- override a prefix by inserting its own row (the admin routing UI does
-- exactly that). Idempotent via WHERE NOT EXISTS on (NULL, prefix).
--
-- Channel mix rationale: in_app is always on (cheap, in-system). email is
-- added wherever an external party or a record-of-decision matters.
-- whatsapp is reserved for time-critical / personal events (payslip,
-- document/iqama expiry, approvals the recipient is blocked on, dunning,
-- umrah logistics) where a push to the phone genuinely helps.
--
-- @rollback: DELETE FROM notification_routing_rules WHERE "companyId" IS NULL
--            AND "eventCategory" IN ('leave','payroll','invoice','document',
--            'contract','approval','task','support','fleet','inventory',
--            'property','opportunity','overtime','loan','exit',
--            'purchase_request','purchase_order','expense','lead','umrah',
--            'user','discipline','attendance','receipt','payment','project');
-- ===========================================================================

INSERT INTO notification_routing_rules ("companyId", "eventCategory", channels, priority, "isActive", description)
SELECT NULL, t.prefix, t.channels::jsonb, t.priority, true, t.description
FROM (VALUES
  ('leave',            '["in_app","email"]',                     'high',   'طلبات وقرارات الإجازات'),
  ('payroll',          '["in_app","email","whatsapp"]',          'normal', 'كشوف ومسيرات الرواتب'),
  ('invoice',          '["in_app","email"]',                     'normal', 'الفواتير وإشعاراتها (إنشاء/سداد/تأخر)'),
  ('document',         '["in_app","email","whatsapp"]',          'high',   'انتهاء الوثائق (إقامة/جواز/رخصة)'),
  ('contract',         '["in_app","email"]',                     'high',   'انتهاء العقود'),
  ('approval',         '["in_app","email"]',                     'high',   'طلبات الموافقة والتصعيد'),
  ('task',             '["in_app"]',                             'normal', 'المهام'),
  ('support',          '["in_app","email"]',                     'normal', 'تذاكر الدعم'),
  ('fleet',            '["in_app","email"]',                     'high',   'الأسطول (صيانة/حوادث/استمارات)'),
  ('inventory',        '["in_app","email"]',                     'normal', 'تنبيهات المخزون'),
  ('property',         '["in_app","email"]',                     'normal', 'العقارات والإيجارات'),
  ('opportunity',      '["in_app","email"]',                     'normal', 'فرص البيع'),
  ('overtime',         '["in_app"]',                             'normal', 'طلبات الوقت الإضافي'),
  ('loan',             '["in_app","email"]',                     'normal', 'طلبات القروض'),
  ('exit',             '["in_app","email"]',                     'high',   'طلبات إخلاء الطرف'),
  ('purchase_request', '["in_app","email"]',                     'normal', 'طلبات الشراء'),
  ('purchase_order',   '["in_app","email"]',                     'normal', 'أوامر الشراء'),
  ('expense',          '["in_app"]',                             'normal', 'المصروفات'),
  ('lead',             '["in_app"]',                             'normal', 'العملاء المحتملون'),
  ('umrah',            '["in_app","email","whatsapp"]',          'high',   'العمرة (حجوزات/تأخر معتمر)'),
  ('user',             '["in_app","email"]',                     'high',   'حسابات المستخدمين وكلمات المرور'),
  ('discipline',       '["in_app","email"]',                     'high',   'المذكرات التأديبية'),
  ('attendance',       '["in_app"]',                             'normal', 'الحضور والانصراف'),
  ('receipt',          '["in_app","email"]',                     'normal', 'سندات القبض'),
  ('payment',          '["in_app","email"]',                     'normal', 'سندات الصرف'),
  ('project',          '["in_app"]',                             'normal', 'المشاريع والمعالم')
) AS t(prefix, channels, priority, description)
WHERE NOT EXISTS (
  SELECT 1 FROM notification_routing_rules nr
  WHERE nr."companyId" IS NULL AND nr."eventCategory" = t.prefix
);
