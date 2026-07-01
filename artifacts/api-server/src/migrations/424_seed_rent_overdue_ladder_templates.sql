-- ===========================================================================
-- 424_seed_rent_overdue_ladder_templates.sql
-- ---------------------------------------------------------------------------
-- WHAT:    Seed 5 new notification template keys for the rent collection
--          ladder expansion (شريحة ٤ من خطة تفعيل الإشعارات):
--             property.rent.overdue.day5    — يوم 5 → غرامة 2% (للمستأجر)
--             property.rent.overdue.day14   — يوم 14 → موعد متابعة ميدانية
--             property.rent.overdue.day21   — يوم 21 → إنذار رسمي (للمستأجر)
--             property.rent.overdue.day30   — يوم 30 → تصعيد للـ GM والقانونية (داخلي)
--             property.rent.overdue.day60   — يوم 60 → إخلاء (للمستأجر + داخلي)
--
-- WHY:     ملف 05 §إيجار متأخر السداسي (السطر 59):
--          «إيجار 3000 ريال استحقاق 1 مارس: يوم 1 SMS → يوم 5 غرامة 2% = 60 →
--           يوم 14 مهمة متابعة ميدانية → يوم 21 إنذار رسمي →
--           يوم 30 تصعيد GM والقانونية → يوم 60 إخلاء»
--
--          الشريحة ٣ غطّت يوم 1 SMS فقط. هذه الشريحة تكمل الباقي:
--          - تنقل غرامة الـ2% من يوم 60 (الحالي) إلى يوم 5 (المواصفة).
--          - تضيف يوم 21 (إنذار رسمي) كمرحلة جديدة كانت ناقصة.
--          - تستبدل penalty_applied في يوم 60 بـ eviction (المواصفة تطلب إخلاء
--            وليس غرامة في هذا اليوم).
--          - يوم 30 escalation الموجود يُحسَّن بإشعار صريح للـ GM والقانونية.
--          - legal_transfer (يوم 90) يبقى كما هو — مسار اللجوء الأخير.
--
-- PLACEHOLDERS (match the call sites in cronScheduler EXACTLY —
-- interpolateTemplate is strict):
--   day5:   {{tenantName}}, {{unitName}}, {{dueDate}}, {{amount}}, {{lateFee}}
--   day14:  {{tenantName}}, {{unitName}}, {{dueDate}}, {{amount}}, {{lateDays}}
--   day21:  {{tenantName}}, {{unitName}}, {{dueDate}}, {{amount}}, {{lateDays}}
--   day30:  {{managerName}}, {{tenantName}}, {{unitName}}, {{dueDate}},
--           {{amount}}, {{lateDays}}
--   day60:  {{tenantName}}, {{unitName}}, {{dueDate}}, {{amount}}, {{lateDays}}
--
-- SAFETY:  pure idempotent seed (WHERE NOT EXISTS). No secret material.
--          Seeded as GLOBAL defaults (companyId IS NULL) so bootstrapCompany
--          (settings.ts:897) auto-inherits — same pattern as 423 (شريحة ٣).
--
-- @rollback:
--   DELETE FROM notification_templates
--    WHERE "templateKey" IN (
--      'property.rent.overdue.day5','property.rent.overdue.day14',
--      'property.rent.overdue.day21','property.rent.overdue.day30',
--      'property.rent.overdue.day60'
--    ) AND "isDefault" = true AND "companyId" IS NULL;
-- ===========================================================================

INSERT INTO notification_templates
  ("companyId", "templateKey", channel, language, "titleTemplate", "bodyTemplate", variables, "isActive", "isDefault")
SELECT NULL::int, t."templateKey", t.channel, t.language, t."titleTemplate", t."bodyTemplate", t.variables::jsonb, true, true
FROM (VALUES
  -- ── يوم 5 → غرامة 2% (للمستأجر) ─────────────────────────────────────────
  ('property.rent.overdue.day5', 'sms', 'ar', NULL,
   'مرحبًا {{tenantName}}، إيجار وحدة {{unitName}} المستحق {{dueDate}} لم يُسدَّد. تمت إضافة غرامة تأخر 2% = {{lateFee}} ريال. الإجمالي المستحق: {{amount}} ريال.',
   '["tenantName","unitName","dueDate","amount","lateFee"]'),
  ('property.rent.overdue.day5', 'sms', 'en', NULL,
   'Hi {{tenantName}}, rent for {{unitName}} due {{dueDate}} unpaid. 2% late fee = SAR {{lateFee}} applied. Total due: SAR {{amount}}.',
   '["tenantName","unitName","dueDate","amount","lateFee"]'),
  ('property.rent.overdue.day5', 'email', 'ar', 'غرامة تأخر إيجار {{unitName}}',
   '<p>مرحبًا {{tenantName}}،</p><p>مرّت 5 أيام على تاريخ استحقاق إيجار وحدة <strong>{{unitName}}</strong> ({{dueDate}}) دون سداد.</p><ul><li>غرامة تأخر (2%): <strong>{{lateFee}} ريال</strong></li><li>إجمالي المستحق بعد الغرامة: <strong>{{amount}} ريال</strong></li></ul><p>يُرجى السداد في أقرب وقت لتجنّب التصعيد.</p>',
   '["tenantName","unitName","dueDate","amount","lateFee"]'),
  ('property.rent.overdue.day5', 'email', 'en', 'Late fee on rent for {{unitName}}',
   '<p>Hello {{tenantName}},</p><p>5 days have passed since rent for <strong>{{unitName}}</strong> ({{dueDate}}) became due without payment.</p><ul><li>Late fee (2%): <strong>SAR {{lateFee}}</strong></li><li>Total due after fee: <strong>SAR {{amount}}</strong></li></ul><p>Please settle as soon as possible to avoid escalation.</p>',
   '["tenantName","unitName","dueDate","amount","lateFee"]'),
  ('property.rent.overdue.day5', 'whatsapp', 'ar', NULL,
   '🏠 *غرامة تأخر إيجار*\nمرحبًا {{tenantName}}،\nإيجار وحدة *{{unitName}}* المستحق *{{dueDate}}* لم يُسدَّد.\nالغرامة (2%): *{{lateFee}} ريال*\nالإجمالي: *{{amount}} ريال*\nيُرجى السداد لتجنّب التصعيد.',
   '["tenantName","unitName","dueDate","amount","lateFee"]'),
  ('property.rent.overdue.day5', 'whatsapp', 'en', NULL,
   '🏠 *Rent late fee*\nHello {{tenantName}},\nRent for *{{unitName}}* due *{{dueDate}}* unpaid.\nFee (2%): *SAR {{lateFee}}*\nTotal: *SAR {{amount}}*\nPlease settle to avoid escalation.',
   '["tenantName","unitName","dueDate","amount","lateFee"]'),

  -- ── يوم 14 → موعد متابعة ميدانية (للمستأجر) ──────────────────────────────
  ('property.rent.overdue.day14', 'sms', 'ar', NULL,
   '{{tenantName}}، إيجار وحدة {{unitName}} متأخر {{lateDays}} يوم. سيتم التواصل لتحديد موعد زيارة ميدانية. المبلغ المستحق: {{amount}} ريال.',
   '["tenantName","unitName","dueDate","amount","lateDays"]'),
  ('property.rent.overdue.day14', 'sms', 'en', NULL,
   '{{tenantName}}, rent for {{unitName}} is {{lateDays}} days overdue. We will contact you to schedule a site visit. Amount due: SAR {{amount}}.',
   '["tenantName","unitName","dueDate","amount","lateDays"]'),
  ('property.rent.overdue.day14', 'email', 'ar', 'متابعة ميدانية — وحدة {{unitName}}',
   '<p>الأخ/ة {{tenantName}}،</p><p>تأخّر سداد إيجار وحدة <strong>{{unitName}}</strong> المستحق بتاريخ {{dueDate}} <strong>{{lateDays}} يومًا</strong>.</p><ul><li>المبلغ المستحق (مع غرامة التأخر): <strong>{{amount}} ريال</strong></li><li>الإجراء: ستقوم إدارة الأملاك بزيارة ميدانية لتوثيق الوضع.</li></ul><p>للسداد الفوري أو تنسيق موعد، يُرجى التواصل مع الإدارة.</p>',
   '["tenantName","unitName","dueDate","amount","lateDays"]'),
  ('property.rent.overdue.day14', 'email', 'en', 'Site visit follow-up — unit {{unitName}}',
   '<p>Dear {{tenantName}},</p><p>Rent for unit <strong>{{unitName}}</strong> (due {{dueDate}}) is now <strong>{{lateDays}} days overdue</strong>.</p><ul><li>Amount due (incl. late fee): <strong>SAR {{amount}}</strong></li><li>Next step: property management will conduct a site visit to document the situation.</li></ul><p>For immediate payment or to arrange a meeting, please contact management.</p>',
   '["tenantName","unitName","dueDate","amount","lateDays"]'),

  -- ── يوم 21 → إنذار رسمي (للمستأجر) ───────────────────────────────────────
  ('property.rent.overdue.day21', 'sms', 'ar', NULL,
   'إنذار رسمي: إيجار وحدة {{unitName}} متأخر {{lateDays}} يوم. المبلغ: {{amount}} ريال. السداد خلال 9 أيام لتجنّب التصعيد القانوني.',
   '["tenantName","unitName","dueDate","amount","lateDays"]'),
  ('property.rent.overdue.day21', 'sms', 'en', NULL,
   'FORMAL NOTICE: rent for {{unitName}} is {{lateDays}} days overdue. Amount: SAR {{amount}}. Settle within 9 days to avoid legal escalation.',
   '["tenantName","unitName","dueDate","amount","lateDays"]'),
  ('property.rent.overdue.day21', 'email', 'ar', 'إنذار رسمي — تأخر إيجار وحدة {{unitName}}',
   '<p>إلى/ {{tenantName}}،</p><p>تُعدّ هذه رسالة <strong>إنذار رسمي</strong> بتأخر سداد إيجار وحدة <strong>{{unitName}}</strong>:</p><ul><li>تاريخ الاستحقاق: {{dueDate}}</li><li>مدة التأخر: <strong>{{lateDays}} يومًا</strong></li><li>المبلغ المستحق (مع الغرامة): <strong>{{amount}} ريال</strong></li></ul><p>يُرجى السداد خلال <strong>9 أيام</strong> من تاريخ هذا الإنذار. في حال عدم السداد، ستتم إحالة الملف إلى الإدارة العامة والقسم القانوني لاتخاذ الإجراءات اللازمة، والتي قد تشمل الإخلاء.</p>',
   '["tenantName","unitName","dueDate","amount","lateDays"]'),
  ('property.rent.overdue.day21', 'email', 'en', 'FORMAL NOTICE — overdue rent unit {{unitName}}',
   '<p>To: {{tenantName}},</p><p>This is a <strong>formal notice</strong> regarding the overdue rent for unit <strong>{{unitName}}</strong>:</p><ul><li>Due date: {{dueDate}}</li><li>Days overdue: <strong>{{lateDays}}</strong></li><li>Amount due (incl. fee): <strong>SAR {{amount}}</strong></li></ul><p>Please settle within <strong>9 days</strong> of this notice. Failure to do so will result in escalation to General Management and Legal, which may include eviction proceedings.</p>',
   '["tenantName","unitName","dueDate","amount","lateDays"]'),
  ('property.rent.overdue.day21', 'whatsapp', 'ar', NULL,
   '⚠️ *إنذار رسمي*\n{{tenantName}}، إيجار وحدة *{{unitName}}* متأخر *{{lateDays}} يوم*.\nالمبلغ: *{{amount}} ريال*\nالسداد خلال *9 أيام* لتجنّب الإجراءات القانونية.',
   '["tenantName","unitName","dueDate","amount","lateDays"]'),
  ('property.rent.overdue.day21', 'whatsapp', 'en', NULL,
   '⚠️ *FORMAL NOTICE*\n{{tenantName}}, rent for *{{unitName}}* is *{{lateDays}} days overdue*.\nAmount: *SAR {{amount}}*\nSettle within *9 days* to avoid legal action.',
   '["tenantName","unitName","dueDate","amount","lateDays"]'),

  -- ── يوم 30 → تصعيد للـ GM والقانونية (داخلي — email only, no in_app fan-out) ─
  -- درس Codex P2 من شريحة 1: لا in_app بلا assignmentId محدد — يتسرّب لكل
  -- الموظفين. هنا الإرسال صريح بـ recipientEmail/assignmentId لمسؤول GM/legal.
  ('property.rent.overdue.day30', 'email', 'ar', 'تصعيد: إيجار متأخر 30 يوم — {{tenantName}}',
   '<p>الأستاذ/ة {{managerName}}،</p><p>تجاوز إيجار وحدة <strong>{{unitName}}</strong> للمستأجر <strong>{{tenantName}}</strong> 30 يومًا من تاريخ الاستحقاق دون سداد:</p><ul><li>تاريخ الاستحقاق: {{dueDate}}</li><li>مدة التأخر: <strong>{{lateDays}} يومًا</strong></li><li>المبلغ المستحق (مع الغرامة): <strong>{{amount}} ريال</strong></li><li>الإجراءات السابقة: إشعار يوم 1، غرامة يوم 5، زيارة ميدانية يوم 14، إنذار رسمي يوم 21.</li></ul><p>قرارك مطلوب: متابعة قانونية، اتفاق سداد بشروط، أو تأكيد بدء إجراءات الإخلاء عند يوم 60.</p>',
   '["managerName","tenantName","unitName","dueDate","amount","lateDays"]'),
  ('property.rent.overdue.day30', 'email', 'en', 'Escalation: rent overdue 30 days — {{tenantName}}',
   '<p>Dear {{managerName}},</p><p>Rent for unit <strong>{{unitName}}</strong> (tenant: <strong>{{tenantName}}</strong>) is now 30+ days overdue without payment:</p><ul><li>Due date: {{dueDate}}</li><li>Days overdue: <strong>{{lateDays}}</strong></li><li>Amount due (incl. fee): <strong>SAR {{amount}}</strong></li><li>Prior actions: day-1 reminder, day-5 fee, day-14 site visit, day-21 formal notice.</li></ul><p>Your decision required: legal follow-up, structured payment plan, or confirm eviction proceedings at day 60.</p>',
   '["managerName","tenantName","unitName","dueDate","amount","lateDays"]'),

  -- ── يوم 60 → إخلاء (للمستأجر) ────────────────────────────────────────────
  -- نُشعر المستأجر ببدء إجراءات الإخلاء. لا نُنشئ ملف قضية تلقائيًا — قرار
  -- إنساني يبقى مع GM/legal. الإخلاء الفعلي عبر القانوني وليس عبر cron.
  ('property.rent.overdue.day60', 'sms', 'ar', NULL,
   '{{tenantName}}، تجاوز تأخر إيجار وحدة {{unitName}} 60 يومًا. سيتم بدء إجراءات الإخلاء قانونيًا. للمراجعة الفورية اتصل بالإدارة. المستحق: {{amount}} ريال.',
   '["tenantName","unitName","dueDate","amount","lateDays"]'),
  ('property.rent.overdue.day60', 'sms', 'en', NULL,
   '{{tenantName}}, rent for {{unitName}} is now 60+ days overdue. Eviction proceedings will commence. Contact management urgently. Due: SAR {{amount}}.',
   '["tenantName","unitName","dueDate","amount","lateDays"]'),
  ('property.rent.overdue.day60', 'email', 'ar', 'إشعار إخلاء — وحدة {{unitName}}',
   '<p>إلى/ {{tenantName}}،</p><p>تجاوز تأخر سداد إيجار وحدة <strong>{{unitName}}</strong> <strong>60 يومًا</strong>:</p><ul><li>تاريخ الاستحقاق: {{dueDate}}</li><li>المبلغ المستحق: <strong>{{amount}} ريال</strong></li></ul><p>بناءً على عدم الاستجابة للإشعارات والإنذار الرسمي، ستقوم الإدارة العامة بإحالة الملف للإجراءات القانونية لإنهاء العقد <strong>وإخلاء الوحدة</strong>.</p><p>للمراجعة العاجلة أو ترتيب سداد فوري قبل بدء الإجراءات، يُرجى التواصل مع الإدارة خلال 48 ساعة.</p>',
   '["tenantName","unitName","dueDate","amount","lateDays"]'),
  ('property.rent.overdue.day60', 'email', 'en', 'Eviction notice — unit {{unitName}}',
   '<p>To: {{tenantName}},</p><p>Rent for unit <strong>{{unitName}}</strong> is now <strong>60+ days overdue</strong>:</p><ul><li>Due date: {{dueDate}}</li><li>Amount due: <strong>SAR {{amount}}</strong></li></ul><p>Given non-response to prior reminders and the formal notice, General Management will refer the file to legal for contract termination <strong>and eviction</strong>.</p><p>For urgent review or immediate settlement before proceedings begin, contact management within 48 hours.</p>',
   '["tenantName","unitName","dueDate","amount","lateDays"]'),
  ('property.rent.overdue.day60', 'whatsapp', 'ar', NULL,
   '🚨 *إشعار إخلاء*\n{{tenantName}}، إيجار وحدة *{{unitName}}* متأخر *{{lateDays}} يوم*.\nسيتم بدء إجراءات الإخلاء.\nالمستحق: *{{amount}} ريال*\nتواصل مع الإدارة عاجلاً.',
   '["tenantName","unitName","dueDate","amount","lateDays"]'),
  ('property.rent.overdue.day60', 'whatsapp', 'en', NULL,
   '🚨 *Eviction notice*\n{{tenantName}}, rent for *{{unitName}}* is *{{lateDays}} days overdue*.\nEviction proceedings will commence.\nDue: *SAR {{amount}}*\nContact management urgently.',
   '["tenantName","unitName","dueDate","amount","lateDays"]')
) AS t("templateKey", channel, language, "titleTemplate", "bodyTemplate", variables)
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates nt
   WHERE nt."companyId" IS NULL
     AND nt."templateKey" = t."templateKey"
     AND nt.channel = t.channel
     AND nt.language = t.language
);
