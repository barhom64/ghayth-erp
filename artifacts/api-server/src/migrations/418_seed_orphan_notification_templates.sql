-- ===========================================================================
-- 418_seed_orphan_notification_templates.sql
-- ---------------------------------------------------------------------------
-- WHAT:    seed 10 ORPHANED notification template keys — every key here is
--          USED in code (sendMessage/sendAuthEmail/dispatchNotification call
--          sites) but has NEVER been seeded into notification_templates.
--          The engine currently falls back to nothing for these keys, so any
--          message keyed by them sends with empty title/body (silent failure
--          or stub text). This migration closes that gap.
--
-- WHY:     full-system notification inventory (Jun 2026) revealed 10 keys
--          referenced in routes/lib but absent from notification_templates:
--             auth.new_device_login.email        → lib/authSession.ts
--             employee.self_onboarding           → routes/employees.ts
--             employee.welcome                   → routes/employees.ts
--             fleet.cargo.driver_assigned        → routes/cargo.ts
--             fleet.trip.driver_assigned         → routes/fleet.ts
--             support.csat.survey                → routes/support.ts
--             umrah.pilgrim.overstay_warning     → lib/umrahNotifications.ts
--             umrah.transport.driver_assigned    → routes/umrah.ts
--             umrah.trip.departure_reminder      → lib/umrahNotifications.ts
--             umrah.visa.expiring                → lib/umrahNotifications.ts
--
-- SAFETY:  pure idempotent seed (WHERE NOT EXISTS by company+key+channel+
--          language). No secret material; placeholders are interpolated at
--          send time. Seeds default (`isDefault=true`) rows for EVERY existing
--          company so the per-company override pattern keeps working.
--
-- @rollback:
--   DELETE FROM notification_templates
--    WHERE "templateKey" IN (
--      'auth.new_device_login.email','employee.self_onboarding',
--      'employee.welcome','fleet.cargo.driver_assigned',
--      'fleet.trip.driver_assigned','support.csat.survey',
--      'umrah.pilgrim.overstay_warning','umrah.transport.driver_assigned',
--      'umrah.trip.departure_reminder','umrah.visa.expiring'
--    ) AND "isDefault" = true;
-- ===========================================================================

-- ── PLATFORM-WIDE default for auth.new_device_login.email ──────────────────
-- authSession.ts:359 calls sendAuthEmail with companyId: 0, which makes
-- getEmailTemplate look for ("companyId" = 0 OR "companyId" IS NULL).
-- Seeding only per-company rows below would miss it entirely — the email
-- would silently never send. A single companyId IS NULL row covers every
-- tenant + the system-level send path. Variable names match the call site
-- vars EXACTLY: userName, ip, device, at (interpolateTemplate is strict).
INSERT INTO notification_templates
  ("companyId", "templateKey", channel, language, "titleTemplate", "bodyTemplate", variables, "isActive", "isDefault")
SELECT NULL::int, t."templateKey", t.channel, t.language, t."titleTemplate", t."bodyTemplate", t.variables::jsonb, true, true
FROM (VALUES
  ('auth.new_device_login.email', 'email', 'ar', 'تنبيه أمني: تسجيل دخول من جهاز جديد',
   '<p>مرحباً {{userName}}،</p><p>تم تسجيل الدخول إلى حسابك من جهاز/متصفح جديد.</p><ul><li><strong>الجهاز:</strong> {{device}}</li><li><strong>عنوان IP:</strong> {{ip}}</li><li><strong>الوقت:</strong> {{at}}</li></ul><p>إن كان هذا الدخول منك، تجاهل الرسالة. إن لم يكن، غيّر كلمة مرورك فوراً وراجع جلساتك النشطة.</p>',
   '["userName","device","ip","at"]'),
  ('auth.new_device_login.email', 'email', 'en', 'Security alert: new device login',
   '<p>Hello {{userName}},</p><p>Your account was just signed in from a new device or browser.</p><ul><li><strong>Device:</strong> {{device}}</li><li><strong>IP:</strong> {{ip}}</li><li><strong>Time:</strong> {{at}}</li></ul><p>If this was you, ignore this message. If not, change your password immediately and review your active sessions.</p>',
   '["userName","device","ip","at"]')
) AS t("templateKey", channel, language, "titleTemplate", "bodyTemplate", variables)
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates nt
   WHERE nt."companyId" IS NULL
     AND nt."templateKey" = t."templateKey"
     AND nt.channel = t.channel
     AND nt.language = t.language
);

INSERT INTO notification_templates
  ("companyId", "templateKey", channel, language, "titleTemplate", "bodyTemplate", variables, "isActive", "isDefault")
SELECT c.id, t."templateKey", t.channel, t.language, t."titleTemplate", t."bodyTemplate", t.variables::jsonb, true, true
FROM companies c
CROSS JOIN (VALUES

  -- ── employee.self_onboarding — link sent so a new employee self-completes their profile
  ('employee.self_onboarding', 'email', 'ar', 'أكمل بياناتك الوظيفية في نظام غيث',
   '<p>أهلاً {{employeeName}}،</p><p>أُنشئ ملفك الوظيفي في <strong>نظام غيث</strong>. لإكمال بياناتك (الهوية، الإقامة، المرفقات...) وتفعيل عقدك، افتح الرابط التالي:</p><p><a href="{{onboardingUrl}}">إكمال بيانات التوظيف</a></p><p>الرابط صالح لمدة {{expiresHours}} ساعة.</p>',
   '["employeeName","onboardingUrl","expiresHours"]'),
  ('employee.self_onboarding', 'email', 'en', 'Complete your employment profile in Ghayth',
   '<p>Hello {{employeeName}},</p><p>Your employment record has been created in <strong>Ghayth</strong>. Please complete your profile (ID, residency, attachments…) and activate your contract via:</p><p><a href="{{onboardingUrl}}">Complete onboarding</a></p><p>Valid for {{expiresHours}} hours.</p>',
   '["employeeName","onboardingUrl","expiresHours"]'),

  -- ── employee.welcome — first-day welcome with employee number + job details
  ('employee.welcome', 'email', 'ar', 'مرحباً في فريق العمل - {{empNumber}}',
   '<p>أهلاً {{employeeName}}،</p><p>يسعدنا انضمامك إلى الفريق.</p><ul><li><strong>الرقم الوظيفي:</strong> {{empNumber}}</li><li><strong>المسمى الوظيفي:</strong> {{jobTitle}}</li><li><strong>تاريخ الالتحاق:</strong> {{hireDate}}</li><li><strong>فترة التجربة:</strong> {{probationDays}} يوم</li></ul><p>للوصول إلى النظام تابع رابط الدعوة المُرسَل في رسالة منفصلة.</p>',
   '["employeeName","empNumber","jobTitle","hireDate","probationDays"]'),
  ('employee.welcome', 'email', 'en', 'Welcome to the team — {{empNumber}}',
   '<p>Hello {{employeeName}},</p><p>Welcome aboard.</p><ul><li><strong>Employee #:</strong> {{empNumber}}</li><li><strong>Job title:</strong> {{jobTitle}}</li><li><strong>Hire date:</strong> {{hireDate}}</li><li><strong>Probation:</strong> {{probationDays}} days</li></ul><p>Use the invitation link sent in a separate message to access the system.</p>',
   '["employeeName","empNumber","jobTitle","hireDate","probationDays"]'),

  -- ── fleet.cargo.driver_assigned — WhatsApp to driver for cargo trip
  ('fleet.cargo.driver_assigned', 'whatsapp', 'ar', 'تكليف رحلة شحن',
   'مرحباً {{driverName}}، تم تكليفك برحلة شحن جديدة.\n\nرقم الرحلة: {{cargoRef}}\nمن: {{origin}}\nإلى: {{destination}}\nالشحنة: {{cargoSummary}}\nتاريخ التحميل: {{pickupDate}}\n\nيرجى التأكيد عبر التطبيق.',
   '["driverName","cargoRef","origin","destination","cargoSummary","pickupDate"]'),
  ('fleet.cargo.driver_assigned', 'whatsapp', 'en', 'Cargo trip assignment',
   'Hello {{driverName}}, you have been assigned a new cargo trip.\n\nRef: {{cargoRef}}\nFrom: {{origin}}\nTo: {{destination}}\nLoad: {{cargoSummary}}\nPickup: {{pickupDate}}\n\nConfirm in the app.',
   '["driverName","cargoRef","origin","destination","cargoSummary","pickupDate"]'),

  -- ── fleet.trip.driver_assigned — WhatsApp to driver for passenger trip
  ('fleet.trip.driver_assigned', 'whatsapp', 'ar', 'تكليف رحلة جديدة',
   'مرحباً {{driverName}}، رحلة جديدة بانتظارك.\n\nرقم الرحلة: {{tripRef}}\nالعميل: {{customerName}}\nمن: {{origin}}\nإلى: {{destination}}\nالوقت: {{tripDate}}\nالمركبة: {{vehiclePlate}}\n\nيرجى التأكيد.',
   '["driverName","tripRef","customerName","origin","destination","tripDate","vehiclePlate"]'),
  ('fleet.trip.driver_assigned', 'whatsapp', 'en', 'Trip assignment',
   'Hello {{driverName}}, a new trip is assigned to you.\n\nRef: {{tripRef}}\nCustomer: {{customerName}}\nFrom: {{origin}}\nTo: {{destination}}\nWhen: {{tripDate}}\nVehicle: {{vehiclePlate}}\n\nPlease confirm.',
   '["driverName","tripRef","customerName","origin","destination","tripDate","vehiclePlate"]'),

  -- ── support.csat.survey — customer satisfaction survey after ticket resolution
  ('support.csat.survey', 'email', 'ar', 'كيف كانت تجربتك مع الدعم؟',
   '<p>مرحباً {{customerName}}،</p><p>تم إغلاق تذكرة الدعم رقم <strong>{{ticketRef}}</strong>. نسعد بسماع رأيك:</p><p><a href="{{surveyUrl}}">قيّم تجربتك (دقيقة واحدة)</a></p><p>رأيك يساعدنا على التطوير المستمر. شكراً!</p>',
   '["customerName","ticketRef","surveyUrl"]'),
  ('support.csat.survey', 'email', 'en', 'How was your support experience?',
   '<p>Hello {{customerName}},</p><p>Your support ticket <strong>{{ticketRef}}</strong> has been closed. We''d love your feedback:</p><p><a href="{{surveyUrl}}">Rate your experience (1 min)</a></p><p>Your feedback helps us improve. Thank you!</p>',
   '["customerName","ticketRef","surveyUrl"]'),

  -- ── umrah.pilgrim.overstay_warning — SMS warning to mutamer about overstay
  ('umrah.pilgrim.overstay_warning', 'sms', 'ar', 'تنبيه: تجاوز مدة التأشيرة',
   'تنبيه: تأشيرتك تنتهي {{visaExpiryDate}}. يجب المغادرة قبل هذا التاريخ لتجنب المخالفات. تواصل مع وكيلك: {{agentName}} — {{agentPhone}}.',
   '["visaExpiryDate","agentName","agentPhone"]'),
  ('umrah.pilgrim.overstay_warning', 'sms', 'en', 'Visa overstay warning',
   'Warning: your visa expires {{visaExpiryDate}}. You must leave before this date to avoid penalties. Contact your agent: {{agentName}} — {{agentPhone}}.',
   '["visaExpiryDate","agentName","agentPhone"]'),

  -- ── umrah.transport.driver_assigned — WhatsApp to driver for umrah pilgrim transport
  ('umrah.transport.driver_assigned', 'whatsapp', 'ar', 'تكليف نقل معتمرين',
   'مرحباً {{driverName}}، تم تكليفك بنقل مجموعة معتمرين.\n\nالمجموعة: {{groupName}}\nعدد المعتمرين: {{pilgrimCount}}\nمن: {{origin}}\nإلى: {{destination}}\nالوقت: {{tripDate}}\nالحافلة: {{busPlate}}\n\nيرجى الالتزام بالموعد.',
   '["driverName","groupName","pilgrimCount","origin","destination","tripDate","busPlate"]'),
  ('umrah.transport.driver_assigned', 'whatsapp', 'en', 'Umrah transport assignment',
   'Hello {{driverName}}, you have been assigned to transport a pilgrim group.\n\nGroup: {{groupName}}\nPilgrims: {{pilgrimCount}}\nFrom: {{origin}}\nTo: {{destination}}\nWhen: {{tripDate}}\nBus: {{busPlate}}\n\nPlease be on time.',
   '["driverName","groupName","pilgrimCount","origin","destination","tripDate","busPlate"]'),

  -- ── umrah.trip.departure_reminder — SMS reminder to mutamer before group departure
  ('umrah.trip.departure_reminder', 'sms', 'ar', 'تذكير: موعد رحلة العمرة',
   'تذكير: رحلة العمرة الخاصة بمجموعة {{groupName}} ستنطلق في {{departureDate}} الساعة {{departureTime}} من {{departurePoint}}. يرجى الحضور قبل الموعد بساعة. للاستفسار: {{contactPhone}}.',
   '["groupName","departureDate","departureTime","departurePoint","contactPhone"]'),
  ('umrah.trip.departure_reminder', 'sms', 'en', 'Reminder: Umrah trip departure',
   'Reminder: Your Umrah trip with group {{groupName}} departs on {{departureDate}} at {{departureTime}} from {{departurePoint}}. Please arrive 1 hour early. Contact: {{contactPhone}}.',
   '["groupName","departureDate","departureTime","departurePoint","contactPhone"]'),

  -- ── umrah.visa.expiring — SMS warning when visa nears expiry
  ('umrah.visa.expiring', 'sms', 'ar', 'تنبيه: قرب انتهاء التأشيرة',
   'تنبيه: تأشيرة {{pilgrimName}} تنتهي خلال {{daysRemaining}} يوم ({{expiryDate}}). يرجى ترتيب المغادرة أو التمديد. الوكيل: {{agentName}}.',
   '["pilgrimName","daysRemaining","expiryDate","agentName"]'),
  ('umrah.visa.expiring', 'sms', 'en', 'Visa expiring soon',
   'Warning: visa for {{pilgrimName}} expires in {{daysRemaining}} days ({{expiryDate}}). Please arrange departure or renewal. Agent: {{agentName}}.',
   '["pilgrimName","daysRemaining","expiryDate","agentName"]')
) AS t("templateKey", channel, language, "titleTemplate", "bodyTemplate", variables)
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates nt
   WHERE nt."companyId" = c.id
     AND nt."templateKey" = t."templateKey"
     AND nt.channel = t.channel
     AND nt.language = t.language
);
