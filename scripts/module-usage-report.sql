-- ════════════════════════════════════════════════════════════════════════════
-- module-usage-report.sql
-- تقرير استخدام الوحدات — يكشف الجداول المملوءة من الفارغة في قاعدتك الحيّة.
--
-- الغرض: التمييز بين «الوحدة مبنيّة ومستعملة» و«مبنيّة لكن فارغة عندك».
-- كل الكود الخلفي حقيقي (دُقِّق)، لكن هذا السكربت وحده يرى بياناتك الفعلية.
--
-- الاستعمال:
--   psql "$DATABASE_URL" -f scripts/module-usage-report.sql
-- (للقراءة فقط — لا يكتب ولا يعدّل أي شيء.)
-- ════════════════════════════════════════════════════════════════════════════

\echo '════════ 1) لقطة سريعة: كل الجداول مرتّبة بعدد السجلات (تقدير حيّ) ════════'
\echo '   (n_live_tup تقدير من الإحصائيات؛ شغّل ANALYZE أولًا لدقّة أعلى. 0 ≈ فارغ)'
SELECT
  relname                       AS "الجدول",
  n_live_tup                    AS "عدد_السجلات_التقريبي",
  CASE WHEN n_live_tup = 0 THEN '— فارغ' ELSE 'مستعمل' END AS "الحالة"
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC, relname;

\echo ''
\echo '════════ 2) الوحدات المدقّقة مجمّعة (الحوكمة/المتجر/التسويق/الأتمتة/الذكاء) ════════'
SELECT
  CASE
    WHEN relname LIKE 'governance\_%' OR relname LIKE 'policy\_%'        THEN 'الحوكمة'
    WHEN relname LIKE 'store\_%'                                          THEN 'المتجر'
    WHEN relname LIKE 'marketing\_%'                                      THEN 'التسويق'
    WHEN relname IN ('cron_jobs','cron_logs','proactive_rules','automation_logs')
                                                                          THEN 'الأتمتة'
    WHEN relname LIKE 'bi\_%'
         OR relname IN ('smart_alerts','kpi_snapshots','employee_kpi_snapshots',
                        'ai_request_logs','client_rfm_scores')           THEN 'الذكاء/AI'
  END                           AS "الوحدة",
  relname                       AS "الجدول",
  n_live_tup                    AS "عدد_السجلات_التقريبي"
FROM pg_stat_user_tables
WHERE relname LIKE 'governance\_%' OR relname LIKE 'policy\_%'
   OR relname LIKE 'store\_%' OR relname LIKE 'marketing\_%' OR relname LIKE 'bi\_%'
   OR relname IN ('cron_jobs','cron_logs','proactive_rules','automation_logs',
                  'smart_alerts','kpi_snapshots','employee_kpi_snapshots',
                  'ai_request_logs','client_rfm_scores')
ORDER BY "الوحدة", n_live_tup DESC;

\echo ''
\echo '════════ 3) عدّ دقيق (COUNT) للجداول المحورية — أبطأ لكنه مضبوط ════════'
-- ملاحظة: إن لم يوجد جدول، احذف سطره. كل سطر للقراءة فقط.
SELECT 'الحوكمة: السياسات'        AS "المؤشّر", COUNT(*) AS "العدد" FROM governance_policies
UNION ALL SELECT 'الحوكمة: المخاطر',            COUNT(*) FROM governance_risks
UNION ALL SELECT 'الحوكمة: التدقيق',            COUNT(*) FROM governance_audits
UNION ALL SELECT 'الحوكمة: الامتثال',           COUNT(*) FROM governance_compliance
UNION ALL SELECT 'المتجر: المنتجات',            COUNT(*) FROM store_products
UNION ALL SELECT 'المتجر: الطلبات',             COUNT(*) FROM store_orders
UNION ALL SELECT 'التسويق: الحملات',            COUNT(*) FROM marketing_campaigns
UNION ALL SELECT 'الأتمتة: مهام cron',          COUNT(*) FROM cron_jobs
UNION ALL SELECT 'الأتمتة: القواعد الاستباقية', COUNT(*) FROM proactive_rules
UNION ALL SELECT 'الأتمتة: سجل التنفيذ',        COUNT(*) FROM automation_logs
UNION ALL SELECT 'الذكاء: التنبيهات',           COUNT(*) FROM smart_alerts
UNION ALL SELECT 'الذكاء: نداءات AI (LLM)',     COUNT(*) FROM ai_request_logs
ORDER BY "العدد" DESC;

\echo ''
\echo 'انتهى. الجداول ذات العدد 0 = مبنيّة لكن لم تُدخَل بياناتها بعد (ليست وهمية).'
