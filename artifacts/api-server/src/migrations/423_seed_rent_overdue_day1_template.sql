-- ===========================================================================
-- 423_seed_rent_overdue_day1_template.sql
-- ---------------------------------------------------------------------------
-- WHAT:    seed property.rent.overdue.day1 template — a tenant-facing
--          reminder sent on the FIRST day a rent payment goes overdue,
--          BEFORE the existing late_rent_actions ladder (which currently
--          starts at day 3 with 'alert' and is internal-only).
--
-- WHY:     Spec ملف 05 §إيجار متأخر السداسي (السطر 59):
--          «إيجار 3000 ريال استحقاق 1 مارس: يوم 1 SMS → يوم 5 غرامة 2% = 60
--           → يوم 14 مهمة متابعة ميدانية → يوم 21 إنذار رسمي →
--           يوم 30 تصعيد GM والقانونية → يوم 60 إخلاء»
--
--          Today the property cron (monthlyRentPenalties) only does
--          INTERNAL alerts starting at day 3. The tenant is never told
--          directly that their rent is overdue. This template + the new
--          day-1 dispatch in cronScheduler close that gap.
--
-- PLACEHOLDERS (match the call site in cronScheduler EXACTLY —
-- interpolateTemplate is strict):
--   {{tenantName}}, {{unitName}}, {{dueDate}}, {{amount}}
--
-- SAFETY:  pure idempotent seed (WHERE NOT EXISTS). No secret material.
--          Channels seeded: sms (spec calls for SMS specifically) +
--          email (for record/CC) + whatsapp (mobile push) + in_app (for
--          the property manager dashboard).
--
-- @rollback:
--   DELETE FROM notification_templates
--    WHERE "templateKey" = 'property.rent.overdue.day1' AND "isDefault" = true;
-- ===========================================================================

-- Seed as a GLOBAL default (companyId IS NULL) so:
--   1. EXISTING companies pick it up via getTemplate's
--      (companyId = $1 OR companyId IS NULL) fallback.
--   2. FUTURE companies created by bootstrapCompany (settings.ts:897)
--      ALSO pick it up automatically — Codex P2 review caught that
--      seeding per-existing-company would leave new tenants with
--      blank SMS/email rent reminders forever.
INSERT INTO notification_templates
  ("companyId", "templateKey", channel, language, "titleTemplate", "bodyTemplate", variables, "isActive", "isDefault")
SELECT NULL::int, t."templateKey", t.channel, t.language, t."titleTemplate", t."bodyTemplate", t.variables::jsonb, true, true
FROM (VALUES
  -- SMS (spec line 59 explicitly mentions SMS first)
  ('property.rent.overdue.day1', 'sms', 'ar', NULL,
   'مرحبًا {{tenantName}}، إيجار وحدة {{unitName}} المستحق بتاريخ {{dueDate}} ({{amount}} ريال) لم يُسجَّل سداده. يرجى السداد لتجنب غرامة التأخر.',
   '["tenantName","unitName","dueDate","amount"]'),
  ('property.rent.overdue.day1', 'sms', 'en', NULL,
   'Hi {{tenantName}}, rent for unit {{unitName}} due {{dueDate}} (SAR {{amount}}) is not yet paid. Please settle to avoid late fees.',
   '["tenantName","unitName","dueDate","amount"]'),

  -- Email (record trail + CC the property manager via in_app)
  ('property.rent.overdue.day1', 'email', 'ar', 'تذكير: إيجار {{unitName}} لم يُسدَّد',
   '<p>مرحبًا {{tenantName}}،</p><p>نُذكّركم أن إيجار وحدة <strong>{{unitName}}</strong> المستحق بتاريخ <strong>{{dueDate}}</strong> لم يُسجَّل سداده حتى الآن.</p><ul><li><strong>المبلغ:</strong> {{amount}} ريال</li></ul><p>يُرجى السداد في أقرب وقت لتجنّب غرامة التأخر. إن كنتم قد سدّدتم، يُرجى إرسال إيصال السداد للإدارة.</p>',
   '["tenantName","unitName","dueDate","amount"]'),
  ('property.rent.overdue.day1', 'email', 'en', 'Reminder: rent for {{unitName}} not yet paid',
   '<p>Hello {{tenantName}},</p><p>This is a reminder that rent for unit <strong>{{unitName}}</strong> due on <strong>{{dueDate}}</strong> has not yet been recorded as paid.</p><ul><li><strong>Amount:</strong> SAR {{amount}}</li></ul><p>Please settle as soon as possible to avoid late fees. If you have already paid, kindly send the payment receipt to property management.</p>',
   '["tenantName","unitName","dueDate","amount"]'),

  -- WhatsApp (mobile-first reminder)
  ('property.rent.overdue.day1', 'whatsapp', 'ar', NULL,
   '🏠 *تذكير سداد إيجار*\nمرحبًا {{tenantName}}،\nإيجار وحدة *{{unitName}}* المستحق بتاريخ *{{dueDate}}* لم يُسدَّد بعد.\nالمبلغ: *{{amount}} ريال*\nيُرجى السداد لتجنّب الغرامة.',
   '["tenantName","unitName","dueDate","amount"]'),
  ('property.rent.overdue.day1', 'whatsapp', 'en', NULL,
   '🏠 *Rent payment reminder*\nHello {{tenantName}},\nRent for unit *{{unitName}}* due *{{dueDate}}* is not yet paid.\nAmount: *SAR {{amount}}*\nPlease settle to avoid late fees.',
   '["tenantName","unitName","dueDate","amount"]')
) AS t("templateKey", channel, language, "titleTemplate", "bodyTemplate", variables)
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates nt
   WHERE nt."companyId" IS NULL
     AND nt."templateKey" = t."templateKey"
     AND nt.channel = t.channel
     AND nt.language = t.language
);
