-- ===========================================================================
-- 425_seed_fleet_breakdown_replacement_template.sql
-- ---------------------------------------------------------------------------
-- WHAT:    seed `fleet.breakdown.replacement_candidate` notification template —
--          internal email alerting GM (or branch director) when a vehicle
--          accumulates 3 or more breakdowns in a single calendar month.
--
-- WHY:     Spec ملف 04 §تنبيهات الأسطول السبعة:
--          «إذا تكررت أعطال مركبة (3 فأكثر/شهر) → تنبيه: هل تُستبدل المركبة؟»
--
--          الموجود اليوم: `smartAlerts.checkVehicleRepeatedBreakdowns` يضع
--          المركبة `under_review` بعد 3 أعطال في 90 يومًا — رد فعل
--          (broadcast) لا أكثر، وبنافذة 90 يومًا (ليس شهر تقويمي كما تنص
--          المواصفة). لا يُرسل بريدًا للمدير ولا يسأل سؤال «هل تُستبدل».
--
--          هذه الشريحة تكمل الفجوة: cron شهري يستعلم عن المركبات بعدد أعطال
--          ≥ 3 في الشهر التقويمي الحالي، ويُرسل تنبيهًا داخليًا للـ GM
--          (أو branch director إن وُجد) مع سؤال الاستبدال الصريح + ملخص
--          الأعطال (العدد والأنواع).
--
-- PLACEHOLDERS (يطابق موقع الاستدعاء في cronScheduler — interpolateTemplate
-- صارم):
--   {{managerName}}, {{plateNumber}}, {{vehicleName}}, {{breakdownCount}},
--   {{month}}, {{categories}}
--
-- SAFETY:  pure idempotent seed (WHERE NOT EXISTS). لا أسرار.
--          channel = email فقط (الجمهور داخلي مدير، نتجنّب in_app fan-out
--          — درس Codex P2 من شريحة ١). seeded global default (companyId
--          IS NULL) ليرثه bootstrapCompany تلقائيًا.
--
-- @rollback:
--   DELETE FROM notification_templates
--    WHERE "templateKey" = 'fleet.breakdown.replacement_candidate'
--      AND "isDefault" = true AND "companyId" IS NULL;
-- ===========================================================================

INSERT INTO notification_templates
  ("companyId", "templateKey", channel, language, "titleTemplate", "bodyTemplate", variables, "isActive", "isDefault")
SELECT NULL::int, t."templateKey", t.channel, t.language, t."titleTemplate", t."bodyTemplate", t.variables::jsonb, true, true
FROM (VALUES
  ('fleet.breakdown.replacement_candidate', 'email', 'ar', 'تنبيه استبدال محتمل: مركبة {{plateNumber}} ({{breakdownCount}} أعطال هذا الشهر)',
   '<p>الأستاذ/ة {{managerName}}،</p><p>سجّلت المركبة <strong>{{plateNumber}}</strong> ({{vehicleName}}) <strong>{{breakdownCount}} أعطال</strong> خلال شهر {{month}}.</p><ul><li>أنواع الأعطال: {{categories}}</li></ul><p>وفق سياسة الأسطول (٣ أعطال أو أكثر في الشهر الواحد)، يُرجى مراجعة الحالة وتحديد ما إذا كانت المركبة مرشّحة للاستبدال أو تحتاج صيانة شاملة.</p><p>هذا التنبيه يُرسَل مرّة واحدة لكل مركبة لكل شهر تقويمي.</p>',
   '["managerName","plateNumber","vehicleName","breakdownCount","month","categories"]'),
  ('fleet.breakdown.replacement_candidate', 'email', 'en', 'Possible replacement: vehicle {{plateNumber}} ({{breakdownCount}} breakdowns this month)',
   '<p>Dear {{managerName}},</p><p>Vehicle <strong>{{plateNumber}}</strong> ({{vehicleName}}) recorded <strong>{{breakdownCount}} breakdowns</strong> during {{month}}.</p><ul><li>Breakdown categories: {{categories}}</li></ul><p>Per fleet policy (3+ breakdowns in a single month), please review and decide whether the vehicle is a replacement candidate or needs comprehensive maintenance.</p><p>This alert is sent once per vehicle per calendar month.</p>',
   '["managerName","plateNumber","vehicleName","breakdownCount","month","categories"]')
) AS t("templateKey", channel, language, "titleTemplate", "bodyTemplate", variables)
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates nt
   WHERE nt."companyId" IS NULL
     AND nt."templateKey" = t."templateKey"
     AND nt.channel = t.channel
     AND nt.language = t.language
);
