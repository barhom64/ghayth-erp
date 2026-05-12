-- Migration 151: seed the 8 umrah notification routing rules from spec §ه
--
-- Without these rows the notification engine (lib/notificationEngine.ts:115)
-- falls back to `["in_app"]` for every umrah event — so an absconder
-- detection that the spec mandates reach WhatsApp + SMS + in-app gets
-- routed to in-app only. This migration plants the per-event channels +
-- priority globally (companyId IS NULL), and per-company overrides are
-- still respected because the loader picks `companyId DESC NULLS LAST`.
--
-- Backward-compatible: ON CONFLICT DO NOTHING so re-runs + companies
-- that already overrode their rules are not touched.

INSERT INTO notification_routing_rules
  ("companyId", "eventCategory", channels, priority, "isActive", description)
VALUES
  -- 1. Mutamers / vouchers import completed → manager + accountant, in-app + email, normal
  (NULL, 'umrah.mutamers.imported',
    '["in_app","email"]'::jsonb, 'normal', true,
    'ملف معتمرين اكتمل — ملخص النتائج لمدير العمرة'),
  (NULL, 'umrah.vouchers.imported',
    '["in_app","email"]'::jsonb, 'normal', true,
    'ملف فواتير اكتمل — ملخص النتائج لمدير العمرة + المحاسبة'),

  -- 2. Overstay detected → manager + accountant, in-app + SMS, high
  (NULL, 'umrah.overstay.detected',
    '["in_app","sms"]'::jsonb, 'high', true,
    'معتمر متجاوز مدة البرنامج — تنبيه عالي'),

  -- 3. Absconder detected → manager + GM, in-app + SMS + WhatsApp, urgent
  -- (notification_routing_rules.priority check constraint accepts:
  --  low/normal/high/urgent — 'urgent' is the highest tier available)
  (NULL, 'umrah.absconder.detected',
    '["in_app","sms","whatsapp"]'::jsonb, 'urgent', true,
    'معتمر متغيّب — تم التبليغ، تنبيه حرج للمدير العام'),

  -- 4. Sales invoice generated → accountant + manager, in-app, normal
  (NULL, 'umrah.sales_invoice.generated',
    '["in_app"]'::jsonb, 'normal', true,
    'فاتورة مبيعات عمرة صدرت'),

  -- 5. Sub-agent unlinked detected → accountant, in-app, high
  (NULL, 'umrah.sub_agent.unlinked',
    '["in_app"]'::jsonb, 'high', true,
    'وكيل فرعي غير مربوط بعميل — يحتاج ربط يدوي'),

  -- 6. Agent overdue (> 30 days) → accountant + manager, in-app + email, high
  (NULL, 'umrah.invoice.overdue',
    '["in_app","email"]'::jsonb, 'high', true,
    'فاتورة عمرة متأخرة أكثر من 30 يوم'),

  -- 7. Employee commission calculated → employee + HR, in-app, normal
  (NULL, 'umrah.commission.calculated',
    '["in_app"]'::jsonb, 'normal', true,
    'عمولة موظف عمرة تم حسابها'),

  -- 8. Season opened → manager, in-app + email, high
  (NULL, 'umrah.season.opened',
    '["in_app","email"]'::jsonb, 'high', true,
    'موسم جديد فُتح — وكلاء يحتاجون ربط')

ON CONFLICT DO NOTHING;
