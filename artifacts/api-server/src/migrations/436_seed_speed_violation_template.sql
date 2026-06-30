-- ===========================================================================
-- 434_seed_speed_violation_template.sql
-- ---------------------------------------------------------------------------
-- WHAT:    seed `fleet.speed.violation` — بريد داخلي للمدير حين تتجاوز
--          مركبة الحدّ الفعّال + هامش الـtolerance خلال اليوم الميلادي
--          السابق. التجميع يومي (مرّة واحدة لكل مركبة لكل يوم) لتفادي
--          ضجيج الإشعارات الفوري.
--
-- WHY:     Spec ملف 04 §تنبيهات الأسطول السبعة: «تجاوز السرعة → تنبيه».
--          يكمل ما عطّلته smartAlerts.checkSpeedViolation (التي كانت
--          تبحث في currentSpeed غير الموجود). هنا نستعمل البيانات
--          الحقيقية في fleet_device_positions.speed وسياسة قابلة
--          للضبط في vehicle_speed_limits (شريحة ٧، migration 433).
--
-- PLACEHOLDERS (يطابق موقع الاستدعاء بدقّة — interpolateTemplate صارم):
--   {{managerName}}, {{driverName}}, {{plateNumber}}, {{vehicleName}},
--   {{maxSpeedKph}}, {{limitKph}}, {{toleranceKph}}, {{violationCount}},
--   {{violationDate}}
--
-- SAFETY:  pure idempotent seed (WHERE NOT EXISTS). لا أسرار.
--          channel = email فقط (داخلي للمدير) — بلا in_app fan-out
--          (درس Codex P2 من شريحة ١). seeded global default
--          (companyId IS NULL) ليرثه bootstrapCompany.
--
-- @rollback:
--   DELETE FROM notification_templates
--    WHERE "templateKey" = 'fleet.speed.violation'
--      AND "isDefault" = true AND "companyId" IS NULL;
-- ===========================================================================

INSERT INTO notification_templates
  ("companyId", "templateKey", channel, language, "titleTemplate", "bodyTemplate", variables, "isActive", "isDefault")
SELECT NULL::int, t."templateKey", t.channel, t.language, t."titleTemplate", t."bodyTemplate", t.variables::jsonb, true, true
FROM (VALUES
  ('fleet.speed.violation', 'email', 'ar', 'تجاوز سرعة: {{plateNumber}} — {{violationCount}} حالة يوم {{violationDate}}',
   '<p>الأستاذ/ة {{managerName}}،</p><p>سجّلت المركبة <strong>{{plateNumber}}</strong> ({{vehicleName}}) — السائق <strong>{{driverName}}</strong> — <strong>{{violationCount}} حالة تجاوز سرعة</strong> خلال يوم {{violationDate}}.</p><ul><li>أعلى سرعة مرصودة: <strong>{{maxSpeedKph}} كم/س</strong></li><li>الحدّ الأقصى الفعّال للمركبة: <strong>{{limitKph}} كم/س</strong> (مع هامش +{{toleranceKph}})</li></ul><p>يُرجى مراجعة سلوك القيادة مع السائق، والنظر في إجراءات: تنبيه/جزاء/تقييم أداء.</p><p>هذا التنبيه يُرسَل مرّة واحدة لكل مركبة لكل يوم تقويمي.</p>',
   '["managerName","driverName","plateNumber","vehicleName","maxSpeedKph","limitKph","toleranceKph","violationCount","violationDate"]'),
  ('fleet.speed.violation', 'email', 'en', 'Speeding alert: {{plateNumber}} — {{violationCount}} events on {{violationDate}}',
   '<p>Dear {{managerName}},</p><p>Vehicle <strong>{{plateNumber}}</strong> ({{vehicleName}}) — driver <strong>{{driverName}}</strong> — recorded <strong>{{violationCount}} speeding events</strong> on {{violationDate}}.</p><ul><li>Highest observed speed: <strong>{{maxSpeedKph}} kph</strong></li><li>Effective limit for this vehicle: <strong>{{limitKph}} kph</strong> (with +{{toleranceKph}} tolerance)</li></ul><p>Please review driving behavior with the driver and consider: warning / disciplinary action / performance review.</p><p>This alert is sent once per vehicle per calendar day.</p>',
   '["managerName","driverName","plateNumber","vehicleName","maxSpeedKph","limitKph","toleranceKph","violationCount","violationDate"]')
) AS t("templateKey", channel, language, "titleTemplate", "bodyTemplate", variables)
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates nt
   WHERE nt."companyId" IS NULL
     AND nt."templateKey" = t."templateKey"
     AND nt.channel = t.channel
     AND nt.language = t.language
);
