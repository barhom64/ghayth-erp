-- ===========================================================================
-- 431_seed_driver_evaluation_meeting_template.sql
-- ---------------------------------------------------------------------------
-- WHAT:    seed `fleet.driver.evaluation_meeting` template — بريد داخلي
--          للمدير (HR/branch/GM) حين تنخفض «سمعة السائق»
--          (reputationScore) لمستوى يستوجب اجتماع تقييم.
--
-- WHY:     Spec ملف 04 §تنبيهات الأسطول السبعة:
--          «تقييم سائق أقل من 3 = اجتماع تقييم أداء»
--
--          المواصفة على مقياس 1-5 (تقييم Likert)، لكن النظام يخزّن
--          fleet_drivers.reputationScore على 0-100 (محسوب من 90 يومًا
--          عبر driverReputation.ts: 0.4·onTime + 0.4·completion +
--          0.2·start). التحويل المعتمد: «<3 من 5» = «<60 من 100»
--          (نفس النسبة المئوية).
--
--          - 60% أداء = متوسط ضعيف → مطلوب تدخّل (اجتماع تقييم).
--          - عتبة <30 (الأسوأ فقط) كانت ستفوّت السائقين متوسطي الأداء
--            الذين يحتاجون توجيهًا مبكرًا.
--          - القرار يُوثَّق هنا ليكون شفافًا للجوء لاحقًا إن طُلب تعديل
--            العتبة (يُحدَّث الـcron + هذا التعليق، لا تغيير في القالب).
--
--          الموجود اليوم: لا يوجد. لا قالب fleet.driver.* في النظام
--          (آخر تنبيه أسطول هو fleet.breakdown.replacement_candidate
--          من شريحة ٥).
--
-- PLACEHOLDERS (يطابق موقع الاستدعاء في cronScheduler — interpolateTemplate
-- صارم):
--   {{managerName}}, {{driverName}}, {{reputationScore}},
--   {{tripsConsidered}}, {{onTimeRate}}, {{completionRate}}, {{period}}
--
-- SAFETY:  pure idempotent seed (WHERE NOT EXISTS). لا أسرار.
--          channel = email فقط (داخلي للمدير) — بلا in_app fan-out
--          (درس Codex P2 من شريحة ١). seeded global default
--          (companyId IS NULL) ليرثه bootstrapCompany.
--
-- @rollback:
--   DELETE FROM notification_templates
--    WHERE "templateKey" = 'fleet.driver.evaluation_meeting'
--      AND "isDefault" = true AND "companyId" IS NULL;
-- ===========================================================================

INSERT INTO notification_templates
  ("companyId", "templateKey", channel, language, "titleTemplate", "bodyTemplate", variables, "isActive", "isDefault")
SELECT NULL::int, t."templateKey", t.channel, t.language, t."titleTemplate", t."bodyTemplate", t.variables::jsonb, true, true
FROM (VALUES
  ('fleet.driver.evaluation_meeting', 'email', 'ar', 'اجتماع تقييم أداء: السائق {{driverName}} (سمعة {{reputationScore}})',
   '<p>الأستاذ/ة {{managerName}}،</p><p>انخفض مؤشّر سمعة الأداء للسائق <strong>{{driverName}}</strong> إلى <strong>{{reputationScore}}</strong> من 100 خلال {{period}}.</p><ul><li>عدد الرحلات المُحتسبة: <strong>{{tripsConsidered}}</strong></li><li>نسبة الالتزام بالمواعيد: <strong>{{onTimeRate}}%</strong></li><li>نسبة إكمال الرحلات: <strong>{{completionRate}}%</strong></li></ul><p>وفق سياسة الأسطول (سمعة أقل من 60 = أداء متوسّط ضعيف)، يُرجى تحديد موعد <strong>اجتماع تقييم أداء</strong> مع السائق لمراجعة الأسباب وخطّة التحسين.</p><p>هذا التنبيه يُرسَل مرّة واحدة لكل سائق لكل شهر تقويمي.</p>',
   '["managerName","driverName","reputationScore","tripsConsidered","onTimeRate","completionRate","period"]'),
  ('fleet.driver.evaluation_meeting', 'email', 'en', 'Performance evaluation meeting: driver {{driverName}} (reputation {{reputationScore}})',
   '<p>Dear {{managerName}},</p><p>The performance reputation score for driver <strong>{{driverName}}</strong> dropped to <strong>{{reputationScore}}</strong>/100 over {{period}}.</p><ul><li>Trips considered: <strong>{{tripsConsidered}}</strong></li><li>On-time rate: <strong>{{onTimeRate}}%</strong></li><li>Completion rate: <strong>{{completionRate}}%</strong></li></ul><p>Per fleet policy (reputation below 60 = below-average performance), please schedule a <strong>performance evaluation meeting</strong> with the driver to review causes and an improvement plan.</p><p>This alert is sent once per driver per calendar month.</p>',
   '["managerName","driverName","reputationScore","tripsConsidered","onTimeRate","completionRate","period"]')
) AS t("templateKey", channel, language, "titleTemplate", "bodyTemplate", variables)
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates nt
   WHERE nt."companyId" IS NULL
     AND nt."templateKey" = t."templateKey"
     AND nt.channel = t.channel
     AND nt.language = t.language
);
