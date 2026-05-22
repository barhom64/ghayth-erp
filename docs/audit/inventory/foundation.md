# جرد المسار — Foundation (الطبقة العرضية)

جرد ثابت (static) للطبقة العرضية في نظام غيث ERP — env/config، الصحة والرصد، سياسة الترحيل، نطاق البيانات (scoping)، التدقيق والأحداث، RBAC، التوثيق (auth)، توجيه الإشعارات، والتشفير. الفحص اعتمد قراءة الكود فقط؛ لم يُشغَّل النظام ولم يُعدَّل. كل بند موسوم «شغّال» مدعوم بدليل `file:line`. ما يتعذّر التحقق منه ثابتًا أُحيل صراحةً إلى قسم «يحتاج Runtime Verification».

---

## جدول 1 — الصفحات (Pages)

| المعرّف | route | الملف | الحالة | APIs المستدعاة | عيب رئيسي |
|---|---|---|---|---|---|
| P-ADM-01 | /admin | artifacts/ghayth-erp/src/pages/admin.tsx | شغّال | GET /admin/* | — |
| P-ADM-02 | /admin/users | pages/admin/users.tsx | شغّال | GET/POST /admin/users، POST /admin/users/:id/reset-password | — |
| P-ADM-03 | /admin/roles | pages/admin/roles.tsx | شغّال | GET/POST /admin/roles، GET /rbac/v2/roles | تعايش كتالوجَي RBAC (FND-010) |
| P-ADM-04 | /admin/logs | pages/admin/logs.tsx | شغّال | GET /audit-logs، GET /activity-log | — |
| P-ADM-05 | /admin/integrations | pages/admin-integrations.tsx | شغّال | GET/PUT /gov-integrations | حارس تركيب ناقص (FND-004) |
| P-ADM-06 | /admin/monitoring | pages/admin-monitoring.tsx | غير قابل للتحقق | GET /health/metrics، GET /admin/* | يعتمد بيانات runtime |
| P-ADM-07 | /admin/violations-report | pages/admin-violations-report.tsx | شغّال | GET /admin/violations | — |
| P-ADM-08 | /admin/system-governor | pages/admin-system-governor.tsx | شغّال | GET /admin/governor، systemGovernor | — |
| P-ADM-09 | /admin/policy-engine | pages/admin-policy-engine.tsx | شغّال | GET /admin/policies | — |
| P-ADM-10 | /admin/domain-registry | pages/admin-domain-registry.tsx | شغّال | GET /admin/domains | — |
| P-ADM-11 | /admin/event-monitor | pages/admin-event-monitor.tsx | شغّال | GET /events/log، GET /events/catalog | /log بلا بوّابة دور (FND-005) |
| P-ADM-12 | /admin/posting-failures | pages/admin-posting-failures.tsx | شغّال | GET /admin/posting-failures | — |
| P-ADM-13 | /admin/lifecycle-monitor | pages/admin-lifecycle-monitor.tsx | شغّال | GET /admin/lifecycle | — |
| P-ADM-14 | /admin/rbac-matrix | pages/admin-rbac-matrix.tsx | شغّال | GET /rbac/v2/roles، GET /permissions/role-permissions | — |
| P-ADM-15 | /admin/gl-reconciliation | pages/admin-gl-reconciliation.tsx | شغّال | GET /admin/gl-reconciliation | — |
| P-ADM-16 | /admin/system-registry | pages/admin-system-registry.tsx | شغّال | GET /admin/registry | — |
| P-SET-01 | /settings | artifacts/ghayth-erp/src/pages/settings.tsx | شغّال | GET/PUT /settings | — |
| P-SET-02 | /settings/branches | settings.tsx (نفس المكوّن) | شغّال | GET/POST /settings/branches | — |
| P-SET-03 | /settings/departments | settings.tsx | شغّال | GET/POST /settings/departments | — |
| P-SET-04 | /settings/companies | settings.tsx | شغّال | GET/POST /settings/companies | — |
| P-SET-05 | /settings/audit-log | settings.tsx | شغّال | GET /audit-logs | — |
| P-SET-06 | /settings/rules | pages/settings-rules.tsx | شغّال | GET/POST /rules | — |
| P-SET-07 | /settings/print-templates | pages/settings/print-templates.tsx | شغّال | GET/POST /print/templates | — |

ملاحظة: المسارات `/settings/branches|departments|companies|audit-log` كلها تحمّل نفس مكوّن `Settings` (settingsRoutes.tsx:9-12) — التبويب داخلي؛ سليم وظيفيًا لكنه يخفي حالة tabs عن جدول التوجيه.

---

## جدول 2 — الأزرار والإجراءات (Actions)

| الصفحة الأم | اسم الزر | الإجراء المتوقّع | API المستهدف | الحالة | نوع العيب |
|---|---|---|---|---|---|
| /admin/users | إنشاء مستخدم | إنشاء user + assignment | POST /api/admin/users | شغّال | — |
| /admin/users | إعادة تعيين كلمة المرور | تحديث كلمة مرور | POST /api/admin/users/:id/reset-password | شغّال | — |
| /admin/roles | إنشاء دور | إدراج دور + صلاحيات | POST /api/admin/roles | شغّال | — |
| /admin/roles | حفظ منح الدور | تحديث grants | PUT /api/rbac/v2/roles/:id/grants | شغّال | — |
| /admin/roles | تطبيق قالب دور | استنساخ من template | POST /api/rbac/v2/templates/:id/apply | شغّال | — |
| /admin/integrations | اختبار التكامل | فحص اتصال جهة حكومية | POST /api/gov-integrations/:id/test | شغّال | — |
| /admin/integrations | حفظ التكامل | تحديث إعدادات + سرّ | PUT /api/gov-integrations/:id | شغّال | scaling — السرّ غير مشفّر at-rest (FND-012) |
| /admin/event-monitor | عرض سجل الأحداث | جلب event_logs | GET /api/events/log | شغّال | conflict — بلا بوّابة دور (FND-005) |
| /settings | حفظ الإعدادات | تحديث system_settings | PUT /api/settings | شغّال | — |
| /settings/rules | إنشاء قاعدة | إدراج business_rule | POST /api/rules | شغّال | — |
| /admin/monitoring | تحديث المقاييس | جلب لقطة observability | GET /api/health/metrics | شغّال | — |
| (تشغيلي) | إعادة محاولة فاشل cron | لا يوجد زر — فقط جداول cron_logs | — | ناقص | dead — لا واجهة لإعادة تشغيل/تنبيه فشل cron (FND-008) |

---

## جدول 3 — APIs

| Endpoint | Method | الـ handler | الـ schema | UI المستهلكة | الجدول الأساسي | الحالة | عيب |
|---|---|---|---|---|---|---|---|
| /api/healthz | GET | health.ts:14 | HealthCheckResponse | منصّات الرصد | — | شغّال | — |
| /api/livez | GET | health.ts:29 (getLiveness) | LivenessReport | orchestrator | — | شغّال | — |
| /api/readyz | GET | health.ts:43 (getReadiness) | ReadinessReport | orchestrator | — | شغّال | cached عبر READYZ_CACHE_MS — health.ts:239 |
| /api/health/schema | GET | health.ts:187 | inline JSON | /admin/monitoring | information_schema | شغّال | كشف غير مُصادَق متعمّد (health.ts:186) |
| /api/health/metrics | GET | health.ts:274 | MetricsSnapshot | /admin/monitoring | — | شغّال | محمي بـ authMiddleware + settings:read (PR #775) |
| /api/health/config | GET | health.ts:288 (describeConfig) | inline | /admin/monitoring | — | شغّال | محمي بـ authMiddleware + settings:read (PR #775) |
| /api/auth/login | POST | auth.ts:223 | loginSchema | شاشة الدخول | users, employee_assignments | شغّال | — |
| /api/auth/refresh | POST | auth.ts:376 | — | تلقائي | users | شغّال | — |
| /api/auth/me | GET | auth.ts:530 | — | كل الصفحات | users, user_roles | شغّال | — |
| /api/auth/switch-assignment | POST | auth.ts:473 | — | محوّل التعيين | employee_assignments | شغّال | — |
| /api/auth/change-password | POST | auth.ts:592 | resetPasswordSchema | الملف الشخصي | users | شغّال | — |
| /api/rbac/v2/roles | GET/POST | rbacV2.ts:84/114 | inline zod | /admin/roles | rbac_roles | شغّال | حارس تركيب ناقص (FND-004) |
| /api/rbac/v2/roles/:id/grants | PUT | rbacV2.ts:222 | inline | /admin/roles | rbac_role_grants | شغّال | — |
| /api/permissions/role-permissions | GET/POST | permissions.ts:169/182 | inline | /admin/rbac-matrix | role_permissions | شغّال | حارس تركيب ناقص (FND-004) |
| /api/admin/users | GET/POST | admin.ts | createUserSchema | /admin/users | users | شغّال | — |
| /api/settings | GET/PUT | settings.ts | inline | /settings | system_settings | شغّال | — |
| /api/settings/display | GET | index.ts:150 | inline | عام (قبل auth) | system_settings | شغّال | فكّ JWT يدوي بـ process.env.JWT_SECRET (FND-002) |
| /api/rules | GET/POST | rules.ts | inline | /settings/rules | business_rules | شغّال | — |
| /api/events/catalog | GET | events.ts:59 | EVENT_CATALOG | /admin/event-monitor | (ثابت) | شغّال | — |
| /api/events/log | GET | events.ts:90 | inline | /admin/event-monitor | event_logs | شغّال | conflict — بلا بوّابة دور (FND-005) |
| /api/events/log/stats | GET | events.ts:188 | inline | /admin/event-monitor | event_logs | شغّال | بلا بوّابة دور (FND-005) |
| /api/workflows/* | POST/GET | workflows.ts:103+ | inline | إجراءات الموافقات | workflow_requests | شغّال | حارس تركيب ناقص (FND-004) |
| /api/gov-integrations | GET/PUT | gov-integrations.ts:163/189 | inline | /admin/integrations | gov_integrations | شغّال | mismatch — action:"update" لطلبات GET (FND-009) |
| /api/digital-signature/* | POST/GET | digital-signature.ts:68+ | inline | توقيع المستندات | signature_logs | شغّال | حارس تركيب ناقص (FND-004) |
| /api/audit-logs | GET | auditLogs.ts | inline | /admin/logs | audit_logs | شغّال | محمي requireMinLevel(70) |
| /api/activity-log | GET | activityLog.ts | inline | /admin/logs | activity_log | شغّال | محمي requireMinLevel(70) |

---

## جدول 4 — عدم التطابق UI ↔ API (Mismatches)

| الموقع | ما تُرسله الواجهة | ما يتوقّعه الـ schema | تشخيص ثابت | الإصلاح المقترح |
|---|---|---|---|---|
| gov-integrations.ts:163/357/385/408 | طلبات GET (قراءة فقط) | `authorize({feature:"admin", action:"update"})` | فعل التفويض لا يطابق فعل HTTP — قارئٌ يحتاج صلاحية كتابة admin؛ يحجب أدوار القراءة | تغيير `action` إلى `"view"`/`"list"` لمسارات GET |
| businessHelpers.ts:273 | — | `config.persistAllEvents` (المصدر المُتحقَّق) | الكود يقرأ `process.env.PERSIST_ALL_EVENTS` مباشرة بدل `config` خلافًا لعقد config.ts:28-29 | استبدال بـ `import { config }` واستخدام `config.persistAllEvents` |
| app.ts:63-76 | — | `config.corsOrigins` (محسوبة في config.ts:297-306) | الواجهة الخلفية تبني allowlist الـ CORS من `process.env` مباشرة؛ نسخة config غير مستهلكة | استهلاك `config.corsOrigins` في `cors()` وحذف الحساب اليدوي |
| idempotencyMiddleware.ts:31 | — | `config.idempotencyTtlHours` | يقرأ `process.env.IDEMPOTENCY_TTL_HOURS` مباشرة رغم وجود الحقل في config | استبدال بـ `config.idempotencyTtlHours` |
| fieldEncryption.ts:10/24, secrets.ts:24, pushService.ts:10-12 | — | `config.fieldEncryptionKey`/`secretsEncryptionKey`/`vapid.*` | قراءات `process.env` لمفاتيح حسّاسة بدل config المُتحقَّق — يتجاوز فحص `collectEnvIssues` | تمرير المفاتيح عبر `config` لوحدة واحدة من التحقق |

---

## جدول 5 — التكرار والتعارض (Duplication/Conflict)

| الوظيفة | الموقع 1 | الموقع 2 | نوع التداخل | اقتراح الحل |
|---|---|---|---|---|
| حساب allowlist الـ CORS | config.ts:297-306 (`buildConfig.corsOrigins`) | app.ts:63-76 (بناء يدوي من process.env) | duplicate — منطق متطابق بطريقتين؛ نسخة config ميتة | إسناد `cors()` إلى `config.corsOrigins` وحذف الكتلة في app.ts |
| دليل ترحيل قاعدة البيانات | artifacts/api-server/src/migrations/ (164، مُطبَّق) | artifacts/api-server/migrations/ (93، غير مُطبَّق) | dead — مجلد كامل لا يشير إليه build.mjs ولا migrate.ts ولا الحارس | حذف المجلد الجذري أو دمج المحتوى الناقص في src/migrations |
| قراءة متغيرات البيئة | config.ts (المصدر الموحَّد المعلَن) | 68 قراءة `process.env.X` متناثرة (app.ts، businessHelpers.ts، fieldEncryption.ts، secrets.ts، pushService.ts، objectStorage.ts، aiEngine.ts…) | duplicate/conflict — عقد «المصدر الوحيد» (config.ts:28-29) منقوض؛ env.ts حُذف (PR #769) لكن التوحيد لم يكتمل | ترحيل القراءات إلى `config.*` تدريجيًا + حارس lint يمنع `process.env` خارج config.ts |
| كتالوج RBAC | rbacCatalog.ts (سلاسل صلاحيات مسطّحة + role→perm) | rbac/featureCatalog.ts (شجرة features لـ authorize) | duplicate — تعريفان متوازيان للصلاحيات؛ نقاط دخول مختلفة (requirePermission ↔ authorize) | توحيد على featureCatalog كمصدر واحد واشتقاق السلاسل المسطّحة منه |
| ثبات الحدث في event_logs | businessHelpers.emitEvent (يُدرج عند critical أو PERSIST_ALL_EVENTS) | eventListeners (logEvent داخل كل listener) | conflict سابق محلول — تعليق businessHelpers.ts:215-218 يوثّق ازدواج صفّين سابقًا؛ الآن emitEvent ناشر فقط | لا إصلاح — مُوثَّق ومحلول؛ يبقى خطر فقد حدث غير حرج بلا listener (FND-006) |

---

## يحتاج Runtime Verification

- توصيل ~70 وظيفة cron فعليًا (cronScheduler.ts:3520-3590): تشغيلها في مواعيدها، نجاح `acquireCronLock` على cron_locks، وعدم تعارض الأقفال عند تعدّد النسخ — لا يُتحقَّق ثابتًا.
- سلوك حارس migration-policy وقت التنفيذ: هل `pnpm guard` فعليًا يفشل PR يحوي تغييرًا كاسرًا غير مُعلَن (check-migration-policy.mjs مُدمج في guard.sh:76) — يتطلب تشغيل CI.
- توصيل event listeners: هل كل حدث في eventCatalog له `eventBus.on` مطابق؛ orphan events تفقد صفّها في event_logs (businessHelpers.ts:235) — يتطلب تتبّع تنفيذ.
- التشفير at-rest: هل أعمدة `push_subscriptions.endpoint/p256dh/auth` وأسرار `gov_integrations` مُشفّرة فعليًا في القاعدة الحيّة — pushService.ts:53 يقرأها صراحةً (FND-012)؛ القراءة الثابتة لا تكشف حالة الصفوف.
- سلوك `/readyz` تحت ضغط الفحوص المتكرّرة: فعالية الكاش (READYZ_CACHE_MS) ومهلة الفحص (HEALTH_PROBE_TIMEOUT_MS) — يتطلب قياسًا حيًا.
- ما إذا كان `recordJobRun(...,"failed")` يصل لأي قناة تنبيه عملياتية — حاليًا ثابتًا لا يوجد إرسال (FND-008).

---

## العيوب المُرقّمة (Defect Register)

- **FND-001** · dead · blocking · narrow · مجلد `artifacts/api-server/migrations/` (93 ملف) غير مُطبَّق إطلاقًا — build.mjs:`copyMigrations` ينسخ `src/migrations` فقط وmigrate.ts:432 يقرأ `./migrations` بجانب الـ bundle · الدليل: artifacts/api-server/build.mjs (copyMigrations) + migrate.ts:432 + check-migration-policy.mjs:44 · التبعية: لا شيء — حذف آمن.
- **FND-002** · duplicate · impairing · narrow · `/api/settings/display` يفكّ JWT يدويًا عبر `process.env.JWT_SECRET` بدل `verifyToken`/`config.jwtSecret` — مسار توثيق ثانٍ بقواعد مختلفة · الدليل: routes/index.ts:159-161 · التبعية: lib/auth.ts.
- **FND-003** · duplicate · impairing · structural · 68 قراءة `process.env.X` متناثرة تنقض عقد «المصدر الوحيد» في config.ts:28-29 بعد حذف env.ts (PR #769) — التوحيد غير مكتمل · الدليل: config.ts:28-29 ↔ app.ts:63-76، businessHelpers.ts:273، fieldEncryption.ts:10، secrets.ts:24، idempotencyMiddleware.ts:31 · التبعية: lib/config.ts.
- **FND-004** · mismatch · impairing · structural · routers حسّاسة (rbacV2، permissions، workflows، gov-integrations، digital-signature، events) مُركَّبة دون `requireModule`/`requireMinLevel` بخلاف `/admin` و`/settings` — الحماية تعتمد كليًا على `authorize()` inline لكل route؛ أي route جديد بلا `authorize` ينكشف لأي مُصادَق · الدليل: routes/index.ts:341-366 · التبعية: middlewares/roleGuard.ts.
- **FND-005** · conflict · impairing · narrow · `GET /events/log` و`/log/stats` بلا أي بوّابة دور (authMiddleware فقط، بلا `authorize`) — أي مستخدم مُصادَق يقرأ سجل أحداث شركته بالكامل، خلافًا لبقية مسارات events التي تستخدم `maskFields` فقط دون فحص دخول · الدليل: routes/events.ts:17,90,188 · التبعية: lib/rbac/authorize.ts.
- **FND-006** · scaling · impairing · structural · `auditMiddleware.ENTITY_MAP` يغطّي 42 بادئة فقط ويغفل legal/store/governance/automation/bi/marketing — تعديلات هذه الوحدات لا تولّد `audit.{entity}.{action}` تلقائيًا؛ تتفاقم الفجوة مع نمو الوحدات · الدليل: middlewares/auditMiddleware.ts:8-50 · التبعية: lib/eventBus.ts.
- **FND-007** · scaling · impairing · narrow · أحداث غير حرجة بلا listener تُفقَد من event_logs عند `PERSIST_ALL_EVENTS=false` (الافتراضي) — اكتمال أثر التدقيق PDPL يتطلب تشغيل العلم؛ index.ts:102-108 يحذّر لكن لا يُلزم · الدليل: businessHelpers.ts:266-281 + index.ts:102-109 · التبعية: lib/eventCatalog.ts.
- **FND-008** · dead · impairing · structural · فشل وظيفة cron يُسجَّل في cron_logs + `recordJobRun(...,"failed")` + `logger.error` فقط — لا تنبيه عملياتي ولا واجهة إعادة تشغيل؛ عدّاد `cron.failures` في الذاكرة فقط · الدليل: cronScheduler.ts:142-147 + observability.ts:126-138 · التبعية: lib/notificationService.ts.
- **FND-009** · mismatch · cosmetic · narrow · مسارات GET في gov-integrations محروسة بـ `authorize({action:"update"})` — فعل التفويض لا يطابق فعل HTTP، يحجب أدوار القراءة الخالصة · الدليل: routes/gov-integrations.ts:163,357,385,408 · التبعية: لا شيء.
- **FND-010** · duplicate · impairing · structural · كتالوجا RBAC متوازيان: `rbacCatalog.ts` (مسطّح) و`featureCatalog.ts` (شجري) — نقطتا تفويض مختلفتان (`requirePermission` ↔ `authorize`) تخاطران بانحراف الصلاحيات · الدليل: lib/rbacCatalog.ts ↔ lib/rbac/featureCatalog.ts · التبعية: lib/rbac/authorize.ts.
- **FND-011** · dead · cosmetic · narrow · `requireGovAdmin`/`requireGovRead` في gov-integrations.ts مُعرَّفتان وغير مُستخدَمتين (ظهور وحيد = التعريف) — كود ميت · الدليل: routes/gov-integrations.ts:56,63 · التبعية: لا شيء.
- **FND-012** · scaling · impairing · narrow · جدول `push_subscriptions` فيه عمود `endpointEncrypted` لكن pushService.ts يقرأ `endpoint`/`p256dh`/`auth` كنصّ صريح دون استدعاء `encryptField` — مفاتيح Web Push غير مشفّرة at-rest فعليًا · الدليل: lib/pushService.ts:53 + lib/fieldEncryption.ts (غير مستدعى) · التبعية: lib/fieldEncryption.ts. (يحتاج Runtime Verification لتأكيد حالة الصفوف).
- **FND-013** · scaling · impairing · structural · فلتر النطاق عبر `buildScopedWhere` غير مُتبنّى بشكل موحَّد — 17 ملف routes فيها 68 محمول `"companyId" = $` يدوي؛ الواجهات اليدوية تفقد تتالي الفرع و`?companyIds=` (انحراف #685) — يتفاقم مع تعدّد الشركات/الفروع · الدليل: SCOPE_NORMALIZATION_RCA_685.md §«Headline numbers» + lib/scopedQuery.ts:62 · التبعية: lib/scopedQuery.ts.
- **FND-014** · conflict · cosmetic · narrow · إعادة تركيب `/request-catalog` تعيد كتابة `req.url` يدويًا إلى `/catalog` ثم تستدعي `requestsRouter` — اقتران هشّ بمسار داخلي قد ينكسر صامتًا عند إعادة هيكلة requests.ts · الدليل: routes/index.ts:332-335 · التبعية: routes/requests.ts.
- **FND-015** · mismatch · cosmetic · narrow · `effectiveBranchId` يسقط إلى `0` عند غياب أي فرع (authMiddleware.ts:146) ثم يُمرَّر كـ `branchId: number` — قيمة 0 تتسرّب لمحمولات `branchId = $` فتُرجع صفر صفوف بدل خطأ واضح · الدليل: middlewares/authMiddleware.ts:134-153 · التبعية: lib/scopedQuery.ts.

---

## خلاف مع تقارير سابقة

1. **خلاف مع UNVERIFIED_PATHS_ARCHITECTURE_MAP.md بند F6 (السطر 156) — تصنيف «routers حسّاسة بـ auth فقط».** التقرير السابق يصف rbacV2/permissions/workflows/gov-integrations/digital-signature/events بأنها «auth فقط» مع تحفّظ بأن الحماية inline قائمة. الفحص الموضعي هنا يؤكد أن كل route في rbacV2.ts (السطور 68-826)، permissions.ts (169-280)، workflows.ts (103-480)، gov-integrations.ts (163-510) يحمل فعليًا `authorize({feature,action})` — فهي **ليست «auth فقط»** بل محميّة per-route. لكن **events.ts استثناء حقيقي**: `/log` و`/log/stats` (events.ts:90,188) بلا أي `authorize` — فجوة فعلية لا مجرّد «هيكلية». التصنيف الدقيق: FND-004 (غياب حارس التركيب — هيكلي) منفصل عن FND-005 (غياب بوّابة دور على events/log — فجوة قائمة فعليًا).

2. **خلاف مع UNVERIFIED_PATHS بند F4 + الخلاصة (السطر 24) «لا APIs معطوبة».** التقرير يعلن «لا APIs معطوبة في عيّنة الواجهة». الفحص يكشف أن الطبقة العرضية تحوي تعارضًا تشغيليًا في توحيد البيئة: 68 قراءة `process.env` خلافًا لعقد config.ts:28-29 المعلَن صراحةً بعد PR #769، وتحديدًا `app.ts:63-76` يعيد بناء allowlist الـ CORS كاملًا فيُجمّد منطق `config.corsOrigins` ميتًا. هذا ليس «API معطوب» لكنه نقض عقد بنيوي (FND-003) لم تذكره التقارير السابقة — PR #769 وُصف كـ «توحيد التحقق من البيئة» بينما التوحيد غير مكتمل فعليًا.

3. **خلاف في خطورة F1 dead-directory مقابل تصنيف UNVERIFIED_PATHS.** UNVERIFIED_PATHS يصنّف بنود dead-code (F12/F14) كـ «🟢 Low — تجاهل الآن». مجلد `artifacts/api-server/migrations/` (93 ملف غير مُطبَّق) ليس مذكورًا أصلًا في التقرير، ويُصنَّف هنا **blocking** (FND-001) لا «منخفض»: وجود مجلدَي migrations مختلفين بمحتوى متباين (diff يؤكد تباينًا واسعًا في أسماء الملفات) خطر تشغيلي مباشر — مطوّر قد يضيف ترحيلًا إلى المجلد الخطأ فلا يُطبَّق أبدًا ولا يكشفه أي حارس (check-migration-policy.mjs:44 يفحص src/migrations فقط).
