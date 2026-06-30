-- ===========================================================================
-- 439_seed_geofence_exit_template.sql
-- ---------------------------------------------------------------------------
-- WHAT:    seed `fleet.geofence.exit` — بريد داخلي للمدير حين ترصد مركبة
--          خارج جميع سياجاتها الجغرافية المسموح بها خلال اليوم السابق.
--
-- WHY:     Spec ملف 04 §تنبيهات الأسطول السبعة: «خروج المركبة من السياج
--          الجغرافي → تنبيه». بدل smartAlerts.checkGeofenceViolation
--          المعطّلة، شريحة ٨ تنفّذ المنطق على البيانات الحقيقية في
--          fleet_device_positions + geofence_zones (migration 438).
--
--          الاستعلام يحسب Haversine لكل موضع GPS مقابل كل سياج مركبة،
--          ويُعدّ موضعًا «خارج السياج» إن لم يقع داخل أي سياج فعّال
--          للمركبة. التجميع يومي: مرّة واحدة لكل مركبة لكل يوم تقويمي
--          (idempotent عبر fleet_geofence_exit_alerts).
--
-- PLACEHOLDERS (يطابق موقع الاستدعاء في cronScheduler بدقّة —
-- interpolateTemplate صارم):
--   {{managerName}}, {{driverName}}, {{plateNumber}}, {{vehicleName}},
--   {{exitCount}}, {{firstExitTime}}, {{maxDistanceKm}}, {{exitDate}}
--
-- SAFETY:  pure idempotent seed (WHERE NOT EXISTS). لا أسرار.
--          channel = email فقط (داخلي للمدير) — بلا in_app fan-out
--          (درس Codex P2 من شريحة ١). seeded global default
--          (companyId IS NULL) ليرثه bootstrapCompany.
--
-- @rollback:
--   DELETE FROM notification_templates
--    WHERE "templateKey" = 'fleet.geofence.exit'
--      AND "isDefault" = true AND "companyId" IS NULL;
-- ===========================================================================

INSERT INTO notification_templates
  ("companyId", "templateKey", channel, language, "titleTemplate", "bodyTemplate", variables, "isActive", "isDefault")
SELECT NULL::int, t."templateKey", t.channel, t.language, t."titleTemplate", t."bodyTemplate", t.variables::jsonb, true, true
FROM (VALUES
  ('fleet.geofence.exit', 'email', 'ar', 'خروج سياج جغرافي: {{plateNumber}} — {{exitCount}} موضع يوم {{exitDate}}',
   '<p>الأستاذ/ة {{managerName}}،</p><p>رصدنا المركبة <strong>{{plateNumber}}</strong> ({{vehicleName}}) — السائق <strong>{{driverName}}</strong> — خارج السياجات الجغرافية المسموح بها يوم {{exitDate}}.</p><ul><li>عدد المواضع خارج السياج: <strong>{{exitCount}}</strong></li><li>أوّل وقت خروج: <strong>{{firstExitTime}}</strong></li><li>أقصى مسافة عن أقرب سياج: <strong>{{maxDistanceKm}} كم</strong></li></ul><p>يُرجى مراجعة سبب الخروج مع السائق، والنظر في تعديل السياج أو إجراء توجيهي.</p><p>هذا التنبيه يُرسَل مرّة واحدة لكل مركبة لكل يوم تقويمي.</p>',
   '["managerName","driverName","plateNumber","vehicleName","exitCount","firstExitTime","maxDistanceKm","exitDate"]'),
  ('fleet.geofence.exit', 'email', 'en', 'Geofence exit: {{plateNumber}} — {{exitCount}} positions on {{exitDate}}',
   '<p>Dear {{managerName}},</p><p>Vehicle <strong>{{plateNumber}}</strong> ({{vehicleName}}) — driver <strong>{{driverName}}</strong> — was observed outside its allowed geofences on {{exitDate}}.</p><ul><li>Positions outside zones: <strong>{{exitCount}}</strong></li><li>First exit time: <strong>{{firstExitTime}}</strong></li><li>Farthest distance from nearest zone: <strong>{{maxDistanceKm}} km</strong></li></ul><p>Please review the cause with the driver and consider zone adjustment or disciplinary action.</p><p>This alert is sent once per vehicle per calendar day.</p>',
   '["managerName","driverName","plateNumber","vehicleName","exitCount","firstExitTime","maxDistanceKm","exitDate"]')
) AS t("templateKey", channel, language, "titleTemplate", "bodyTemplate", variables)
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates nt
   WHERE nt."companyId" IS NULL
     AND nt."templateKey" = t."templateKey"
     AND nt.channel = t.channel
     AND nt.language = t.language
);
