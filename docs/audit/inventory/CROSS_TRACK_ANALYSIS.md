# التحليل العرضي — CROSS_TRACK_ANALYSIS

> **النوع:** تحليل ثابت عرضي — المرحلة ج من تكليف Inventory Auditor المستقل.
> **التاريخ:** 2026-05-21
> **المدخلات:** 11 ملف جرد مساري (`hr · finance · umrah · properties · fleet · warehouses · projects · crm · support · communications · foundation`) — 184 عيبًا مُرقّمًا.
> **الغرض:** رصد العيوب التي تعبر أكثر من مسار، والتكرارات والتعارضات بين المسارات، وفجوات Foundation التي تنزل على المسارات.

---

## 0. ملخص

الجرود المسارية كشفت أن **معظم عيوب غيث ليست مسارية بل نمطية**: نفس الخطأ يتكرر في 4–9 مسارات لأنه ناتج عن غياب طبقة مشتركة أو عن نمط نسخ-ولصق. ثلاثة عشر نمطًا عرضيًا موثَّق أدناه، ثمانية منها **بنيوية** (تحتاج طبقة مشتركة، لا إصلاحًا مساريًا)، وثلاثة **تعارضات بيانات حقيقية** عبر المسارات. الاستنتاج المركزي: إصلاح غيث مسارًا-بمسار سيُعيد إنتاج نفس العيوب؛ المعالجة الصحيحة طبقية.

---

## 1. العيوب التي تعبر أكثر من مسار (Cross-Track Patterns)

### CT-1 — تطبيع النطاق غير مكتمل (#685): `branchId`/`companyId` يدوي عبر 17 ملفًا
**النوع:** scaling · **الخطورة العرضية:** impairing · **المسارات:** Properties · Fleet · Warehouses · Support · Finance · Communications · Foundation (+ HR من تقرير سابق).
الدليل المجمَّع: `FND-013` (17 ملف routes، 68 محمول `"companyId"=$` يدوي)، `properties.ts` (55 endpoint كلها فلاتر يدوية، لا `scopedQuery` — تأكيد F2)، `WH-007`/`WH-010` (حركات المستودع تُدرَج بلا `branchId` فتختفي عن مستخدمي الفرع)، `SUP-011`/`SUP-017` (تعطيل فرع غير متّسق بين `/replies` و`/tickets`)، `FIN-026` (`/journal-manual`/`/payments` بلا scope فرع)، `FND-015` (`effectiveBranchId` يسقط إلى `0`). **CRM وحده يستخدم `buildScopedWhere` فعليًا** (تأكيد مستقل) — وهو الدليل أن الطبقة موجودة لكنها غير متبنّاة. **التشخيص:** ليست عيوبًا 17 منفصلة بل عيب طبقي واحد — عدم فرض `scopedQuery` كعقد إلزامي. **الإصلاح:** فرض `buildScopedWhere` على كل قراءة/كتابة عبر مراجعة معمارية موحَّدة ضمن مسار #685، لا عبر إصلاحات مسارية متفرقة.

### CT-2 — قراءة جدول `employees` مباشرةً من مسارات غير HR
**النوع:** conflict (ملكية بيانات متقاطعة) · **المسارات:** Fleet · Projects · CRM · (Properties/Support/Communications/Documents من F3).
الدليل: `fleet.ts` يقرأ `employees` في 5 مواضع (407/446/1092/1396/2832)؛ `projects.ts` في 6 مواضع (339/534/1278/1287/1720/2080)؛ `crm.ts` يكرّر استعلام HR-assignment **6 مرات** (272/306/473/553/784/1090). كل مسار يعيد تنفيذ منطق «الموظف الفعّال» بنسخته الخاصة. **التشخيص:** لا توجد خدمة `employeeLookup` مشتركة؛ أي تغيير في بنية `employees`/`employee_assignments` يكسر 4+ مسارات بصمت. **الإصلاح:** استخراج دالة `resolveActiveAssignment(employeeId, companyId)` واحدة في `lib/` تستدعيها كل المسارات؛ منع `SELECT ... FROM employees` خارج `routes/hr.ts` و`employees.ts` عبر قاعدة lint/guard.

### CT-3 — `PATCH` عام يرسل حالة نهائية يرفضها الخادم بـ409/409-equivalent
**النوع:** dead/mismatch · **الخطورة:** blocking · **المسارات:** Fleet · Properties · CRM.
الدليل: `FLT-001` (زرّا «إكمال/إلغاء» الرحلة → `PATCH /trips/:id status=completed` مرفوض، والمسار الصحيح `/complete` بلا واجهة)؛ `PROP-001` (زر «إنهاء العقد» → `PATCH status=terminated` مرفوض، والصحيح `/terminate` بلا واجهة)؛ `CRM-002` (نموذج الفرصة يتيح `closed_won/closed_lost` يرفضهما `POST` بـ409). **التشخيص:** نمط واجهة موحَّد — مكوّن تعديل عام يفترض أن أي حقل `status` قابل للكتابة عبر `PATCH`، بينما الخادم يحصر الانتقالات النهائية في endpoints مخصّصة. **الإصلاح:** مراجعة كل مكوّنات «تغيير الحالة» وربطها بالـ endpoint الانتقالي المخصّص، أو السماح للـ `PATCH` العام بقبول الحالات النهائية عبر `applyTransition`.

### CT-4 — أزرار «تعديل» تنتقل إلى مسارات `/:id/edit` غير مُسجَّلة
**النوع:** dead · **الخطورة:** impairing/cosmetic · **المسارات:** Properties · Warehouses · Projects · Communications · Fleet (+ Finance/HR جزئيًا).
الدليل: `PROP-009`/`PROP-010`، `WH-002` (أربع صفحات تفاصيل مستودع)، `PRJ-007`، `COM-006`، `FLT-008`. **التشخيص:** صفحات التفاصيل تُولَّد من قالب موحَّد يضع زر «تعديل» يفترض وجود مسار `/:id/edit`، بينما كثير من المسارات لم تُسجّل صفحة تحرير. **الإصلاح:** إمّا حذف زر «تعديل» من القالب حين لا توجد صفحة تحرير، أو تسجيل صفحات التحرير الناقصة — قرار موحَّد على مستوى قالب صفحة التفاصيل.

### CT-5 — تحوّلات حالة عبر `UPDATE` خام تتجاوز `lifecycleEngine`
**النوع:** scaling/conflict · **المسارات:** Fleet · Properties · Umrah · Finance · HR · Support.
الدليل: `FLT-012` (12 موضعًا)، `PROP-019`/`PROP-020`، `UMR-006`، `FIN-003`، `HR-003` (انتقال بلا `fromStates`)، `SUP-006`. إضافةً إلى **خرائط انتقال مزدوجة**: قائمة محلية في ملف الـ route + `STATE_MACHINES` في `lifecycleEngine.ts` — موثّقة في `SUP-016`، `HR-015` (5 جداول بلا graph)، `UMR` (خرائط مزدوجة). **التشخيص:** `lifecycleEngine` موجود لكنه غير مفروض؛ كل مسار يختار بين استخدامه وبين `UPDATE` خام. **الإصلاح:** تسجيل كل جداول دورة الحياة في `STATE_MACHINES`، وحظر `UPDATE ... SET status` المباشر عبر مراجعة، وحذف الخرائط المحلية.

### CT-6 — `LIMIT` ثابت + ترقيم صفحات وهمي
**النوع:** scaling · **المسارات:** Support · CRM · Finance · Properties · Communications · Umrah · Warehouses · Fleet.
الدليل: `SUP-007` (LIMIT 500)، `CRM-011` (LIMIT 500، يتجاهل page/limit)، `FIN-026`، `PROP-021` (LIMIT 500)، `COM-012` (LIMIT 200)، `UMR-018` (LIMIT 500)، `WH-010`، `FLT-013`. **التشخيص:** الواجهة ترسل `?page=&limit=` لكن المعالِجات تُرجع `page:1` ثابتًا — الترقيم تجميلي. عند تجاوز السقف تختفي الصفوف الأقدم بصمت. **الإصلاح:** اعتماد `CURSOR_PAGINATION` (الموثَّق في `docs/CURSOR_PAGINATION.md`) كعقد إلزامي لكل endpoint قائمة.

### CT-7 — `FileDropZone` تجميلي — المرفقات لا تُرفَع
**النوع:** dead · **المسارات:** Finance · HR · Umrah · Fleet.
الدليل: `FIN-027` (6 صفحات إنشاء مالية)، `UMR-009` (`pilgrim-create`)، `FLT-009` (صيانة/تأمين)، HR (training-create). **التشخيص:** مكوّن `FileDropZone` يجمع ملفات في الحالة المحلية لكن دالة `save()` لا ترفعها ولا يوجد endpoint مرفقات لهذه الكيانات. **الإصلاح:** إمّا إزالة المكوّن من صفحات الإنشاء التي لا تدعم المرفقات، أو بناء endpoint مرفقات موحَّد (كنموذج `umrah/attachments` متعدّد الأشكال) وتعميمه.

### CT-8 — بطاقات KPI تقرأ حقولًا لا يُرجِعها الـ API
**النوع:** mismatch · **المسارات:** Finance · CRM · Support · HR · Fleet · Warehouses.
الدليل: `FIN` (4 صفحات قوائم — receivables/payments/commitments/financial-requests تتوقع `summary`)، `CRM-001` (`wonOpportunities`)، `SUP-001` (تبويب CSAT)، `HR-009` (`stats.active`)، `FLT-003` (TCO)، `WH-006`. **التشخيص:** الواجهة تُكتب مقابل عقد متوقَّع، والـ handler يُرجِع شكلًا مختلفًا — لا عقد API مُولَّد مُلزِم رغم وجود `lib/api-spec` (OpenAPI). **الإصلاح:** توليد عملاء API من `openapi.yaml` (Orval موجود) وفرض استهلاك الأنواع المولَّدة بدل القراءة الحرّة لـ `data?.x`.

### CT-9 — انجراف schema المرجعي عن المهاجرات المُطبَّقة
**النوع:** mismatch · **المسارات:** Support · Properties · Fleet · Projects · Warehouses · Communications.
الدليل: `SUP-017` (migration 171 يضيف `support_tickets.branchId` ولا يُحدَّث `schema_pre.sql`). وبالمقابل عيوب تشير إلى أعمدة **مفقودة فعلًا** (تأكيد مستقل: لا migration يضيفها): `PRJ-001` (`project_tasks.progress`)، `PRJ-003` (`projects.ref/branchId`)، `FLT-010` (`fleet_gps_tracking.companyId`)، `PROP-003` (`rent_payments.companyId/deletedAt`)، `PROP-002` (`property_buildings.floors`)، `PROP-004` (`late_rent_actions.phase` نوع خاطئ). **ملاحظة حرجة:** حارس `check:schema-drift` يبني قاعدة CI من `schema_pre.sql + schema_post.sql` ولا يُطبّق المهاجرات (مؤكَّد من رسالة PR #766) — ومع ذلك تمرّ هذه المراجع لأعمدة غير موجودة على فرع `main` ذي الحارس الأخضر. **هذا يعني أن `check:schema-drift` فيه فجوة تغطية** (يُرجَّح أنه يفحص المعرّفات المقتبسة بعلامات `"..."` فقط ويُغفل أسماء الأعمدة غير المقتبسة في قوائم `INSERT`/تعابير `SET`). يُسجَّل كفجوة Foundation جديدة — انظر §4.

### CT-10 — سياسة ترحيل GL غير موحَّدة (blocking / non-blocking / مبتلَع)
**النوع:** conflict · **المسارات:** Finance · Umrah · HR · Warehouses · Fleet · Properties.
الدليل: `umrahEngine` يرحّل GL **non-blocking مبتلَع** (الفشل `logger.error` فقط، لا يُكتَب في `financial_posting_failures`)؛ `umrahInvoicingEngine` يرحّل **blocking بعد** commit جدول العمرة (نافذة فشل جزئي)؛ `FIN-003` يرحّل **قبل** الانتقال (قيد يتيم عند فشل CHECK)؛ `HR-001` ترحيل مزدوج محتمل للرواتب؛ `FLT-003` كتلة قيد أصل الأسطول معطّلة؛ `PROP-019` سداد متزامن يسمح بازدواج قيد. **التشخيص:** ثلاث سياسات ترحيل مختلفة عبر المسارات، وثلاث لحظات ترحيل مختلفة (قبل/بعد/أثناء الانتقال). **الإصلاح:** واجهة ترحيل GL موحَّدة واحدة، تُستدعى دائمًا داخل نفس transaction الكيان، وتكتب فشلها في `financial_posting_failures` بدل ابتلاعه — مسار Finance، يشمل عزل العمرة.

### CT-11 — استدعاء `createAuditLog` بلا `before/after` أو غياب التدقيق التلقائي
**النوع:** dead/scaling · **المسارات:** Properties · Foundation (+ Umrah سابقًا).
الدليل: `PROP-018` (`PATCH /owners/:id` يدقّق بلا `before/after`)؛ `FND-006` (`auditMiddleware.ENTITY_MAP` يغطّي 42 بادئة ويُغفل legal/store/governance/automation/bi/marketing — ويُغفل أيضًا `notifications`/`notification-engine` حسب خلاف Communications). **التشخيص:** التدقيق التلقائي مقتصر على خريطة بادئات يدوية، والتدقيق اليدوي يُستدعى أحيانًا بحمولة فارغة. **الإصلاح:** توسيع `ENTITY_MAP` ليشمل كل بادئات الـ routes، وفحص lint يرفض `createAuditLog` بلا `before/after` على عمليات التعديل.

### CT-12 — مفاتيح RBAC: moduleKey مقابل featureKey
**النوع:** mismatch/duplicate · **المسارات:** Communications · Foundation (+ CRM-003).
الدليل: `COM-007` (`perm="comms:update"` يستخدم moduleKey بينما الصحيح featureKey `communications`)؛ `FND-010` (كتالوجا RBAC متوازيان: `rbacCatalog.ts` مسطّح و`featureCatalog.ts` شجري)؛ `CRM-003` (نموذج CRM يستدعي endpoint محميًا بصلاحية `hr.employees`). **التشخيص:** نظاما تفويض (`requirePermission` بالكتالوج المسطّح، و`authorize` بالكتالوج الشجري) ومفتاحان متشابهان (`comms` مقابل `communications`). **الإصلاح:** توحيد الكتالوجين، وفحص build يرفض أي `perm`/`feature` لا يطابق `featureCatalog`.

### CT-13 — ميزات backend كاملة بلا أي واجهة (Orphan Surface)
**النوع:** dead · **المسارات:** كلها تقريبًا.
الدليل: `FIN-024` (12+ نظامًا فرعيًا: FX، dunning، memos، payment-run، GRN، vendor-contracts...)؛ `UMR-005`/`UMR-015`/`UMR-016`/`UMR-017` (nusk-invoices، commission-calculations، sales-invoices/payments، letters)؛ `HR-010` (delegations/accruals/approval-chain-definitions)؛ `SUP-009`/`SUP-012`/`SUP-014`؛ `PROP-005`/`PROP-015`؛ `FLT-007`؛ `COM-001`/`COM-002`/`COM-014`؛ `WH-008`/`WH-009`. **التشخيص:** نمط تطوير «backend-first» تُبنى فيه الـ endpoints ثم لا تُوصَل بواجهة — عشرات النقاط اليتيمة. **الإصلاح:** قرار مالك لكل نظام فرعي (بناء واجهة أو إزالة الـ endpoint)؛ لا إصلاح تقني واحد.

---

## 2. التكرارات بين المسارات (Duplication)

| # | الوظيفة المكرّرة | الموقع 1 | الموقع 2 | التشخيص | الحل المقترح |
|---|---|---|---|---|---|
| D1 | إنشاء مشروع | `POST /projects` (`projects.ts`) | `POST /finance/projects` (`finance-hardening.ts:1284` — مكسور، يُدرج أعمدة غير موجودة) | مساران لإنشاء نفس الكيان؛ المالي مكسور بنيويًا (PRJ-003) | إلغاء مسار الإنشاء المالي وتوجيه `project-costing` إلى `POST /projects/:id/costs` السليم |
| D2 | استعلام «التعيين الفعّال للموظف» | `crm.ts` (6×) · `fleet.ts` (5×) · `projects.ts` (6×) | `routes/hr.ts` المرجعي | نفس الاستعلام منسوخ 17+ مرة عبر 3 مسارات (CT-2) | دالة `resolveActiveAssignment` مشتركة في `lib/` |
| D3 | نظاما فترات مالية | `/fiscal-periods` v1 استدلالي (`finance-budget.ts:665`) | `/fiscal-periods-v2` CRUD (`finance-hardening.ts:133`) | FIN-015 — نظامان متوازيان، الواجهة تستخدم v1 العاجز عن الإقفال | اعتماد v2 وحذف v1 |
| D4 | تحويل طلب شراء إلى أمر شراء | `convert` (`finance-purchase.ts:456`) | `convert-to-po` (`finance-purchase.ts:1213` — لا ينسخ البنود) | FIN-020 — مسارا تحويل بسلوكين | توحيد على الأحدث بعد إصلاح نسخ البنود |
| D5 | إدارة `notification_preferences` | `notifications.ts:235` (`ON CONFLICT` رباعي معطوب) | `notification-engine.ts:129` | COM-016 — مساران على نفس الجدول بنموذجين، أحدهما يفشل كل إدراج | توحيد على مسار واحد بقيد `ON CONFLICT` الثلاثي الصحيح |
| D6 | إنشاء طلب صيانة عقار | `POST /maintenance-requests` (`properties.ts:2151`) | `POST /maintenance` (`properties.ts:2969` — مبسّط، يتيم) | PROP-017 — مساران على نفس الجدول | حذف `POST /maintenance` المبسّط |
| D7 | صفحة قاعدة معرفة الدعم | تبويب `KBManagement` داخل `/support` | صفحة `support/kb.tsx` المستقلة | SUP-003 — صفحتان لنفس الـ endpoint | حذف الصفحة المستقلة أو تحويلها لتفصيل مقال (يحلّ SUP-013) |
| D8 | كتالوج RBAC | `rbacCatalog.ts` (مسطّح) | `featureCatalog.ts` (شجري) | FND-010 — مصدرا حقيقة للصلاحيات | توحيد المصدر (CT-12) |
| D9 | التحقق من البيئة | `config.ts` (المصدر المُعلَن) | 68 قراءة `process.env` متناثرة | FND-003 — التوحيد المُعلَن في PR #769 غير مكتمل | إكمال التوحيد: كل قراءة بيئة عبر `config` |
| D10 | جدول السلف | `loan_accounts` | `hr_employee_loans` | HR-016 — جدولان متوازيان، تشغيل الراتب يجمعهما | توثيق الإرثي ودمج البيانات |
| D11 | صفحة استيراد العمرة | `import-wizard.tsx` (`/umrah/import`) | `import.tsx` (`/umrah/import/legacy`) | UMR-014 — صفحتان | حذف الـ legacy |
| D12 | خرائط انتقال الحالة | قوائم محلية في ملفات الـ routes | `STATE_MACHINES` في `lifecycleEngine.ts` | SUP-016/HR-015/UMR — تعريف مزدوج ومتباعد | مصدر واحد في `lifecycleEngine` (CT-5) |
| D13 | حساب «الموظف الفعّال» / مفردات الحالة | `STAGE_LABELS` مكرّرة 3× (CRM-014) | — | تكرار خرائط العرض | استخراج خرائط العرض إلى `lib/labels` |

---

## 3. التعارضات بين المسارات (Conflict)

| # | البيانات المتنازَع عليها | المسار 1 | المسار 2 | قاعدة التعارض | الحل المقترح |
|---|---|---|---|---|---|
| X1 | `clients.totalRevenue` و`clients.classification` | CRM (`crm.ts:775` `handleDealWon`) | Finance (`finance-invoices.ts:639`) + Umrah (`umrah-entities.ts:344`) + cron (`cronScheduler.ts:1653`) | جدول `clients` بلا قيد `UNIQUE` على email/phone؛ أربعة مسارات تكتبه بقواعد مختلفة — CRM يزيد الإيراد عند ربح الصفقة، المالية تزيده عند الفاتورة ⇒ احتساب مزدوج وعملاء مكرّرون | `CRM-013` — قرار مالك: تحديد مالك واحد لـ `totalRevenue` (المالية حصرًا)، إضافة قيد `UNIQUE`، توحيد إنشاء العميل خلف `POST /clients` ذي فحص `FOR UPDATE` |
| X2 | `employees`/`employee_assignments` | HR (المالك) | Fleet · Projects · CRM · Properties · Support (قرّاء مباشرون) | مسارات غير HR تقرأ جدول HR مباشرةً؛ تغيير بنية HR يكسرها بصمت | `CT-2` — خدمة `employeeLookup` مشتركة، ومنع القراءة المباشرة |
| X3 | ترحيل قيد الرواتب إلى GL | `postPayrollRunGL` (وقت تشغيل المسيرة) | `postPayrollPostGL` (وقت `PATCH status=posted`) | `HR-001` — نفس المسيرة قد تُرحَّل مرتين؛ الحماية الوحيدة `sourceKey` idempotency (يحتاج تحقّق runtime) | توحيد نقطة الترحيل في لحظة `posted` فقط، وإزالة الترحيل وقت التشغيل |
| X4 | حالة المركبة/السائق | `fleet.ts` (`UPDATE` خام، 12 موضعًا) | `lifecycleEngine` (الكيان الأب) | `FLT-012` — الكيان الأب يمرّ بالمحرّك بينما المركبة/السائق يُحدَّثان خامًا بلا audit | تسجيل `fleet_vehicles`/`fleet_drivers` في `STATE_MACHINES` |
| X5 | حالة الوحدة العقارية | `properties.ts:1591` (`UPDATE property_units` خام داخل terminate) | `lifecycleEngine` | `PROP-020` — تحرير الوحدة `rented→available` بلا تحوّل مُسجَّل | تمرير تحرير الوحدة عبر `applyTransition` |
| X6 | `support_tickets.slaBreached`/`priority` | `check-sla` + الرد المتأخّر (`support.ts`) | `hourlySlaEscalation` + `dailySlaGeneral` (`cronScheduler.ts`) | `SUP-015` — ثلاثة مسارات تكتب التصعيد بقواعد مختلفة، خطر سباق كتابة | قاعدة تصعيد SLA واحدة في `lib/`، يستدعيها المسار والـ cron |
| X7 | فترة مالية مقفلة تحجب كتابات تشغيلية | `requireGuards("financial")` يغلّف **كامل** `/umrah` | كتابات العمرة غير المالية (إنشاء معتمر/نقل) | بوّابة Finance تمنع إنشاء معتمر إذا كانت الفترة مقفلة — تعارض نطاق | مراجعة: هل يجب أن تحجب البوّابة المالية الكتابات غير المالية؟ (قرار) |
| X8 | استيراد العمرة يُنشئ `umrah_agents` ناقصة | `umrahImportEngine` | مسار `umrah/agents` العادي | الوكلاء المُنشأون آليًا يفتقدون `branchId/createdBy` ⇒ صفوف غير متّسقة مع المسار العادي | توحيد إنشاء الوكيل خلف دالة واحدة |

---

## 4. فجوات Foundation التي تنزل على المسارات

| # | الفجوة | المصدر | المسارات المتأثّرة | الأثر النازل |
|---|---|---|---|---|
| FG1 | `scopedQuery` غير مفروض | `FND-013` | كل المسارات عدا CRM | CT-1 — عزل فروع/شركات غير موثوق؛ صميم #685 |
| FG2 | `auditMiddleware.ENTITY_MAP` يغطّي 42 بادئة فقط | `FND-006` | legal · store · governance · automation · bi · marketing · notifications · notification-engine | تعديلات هذه الوحدات بلا أثر تدقيق تلقائي — فجوة امتثال PDPL |
| FG3 | فشل cron يُسجَّل ولا يُنبَّه | `FND-008` | Umrah (overstay/absconder) · Fleet (fuel) · Finance (invoice overdue) · Support (SLA) | مهمة فاشلة تُجمّد مسارًا تشغيليًا كاملًا بصمت (مثل: توقّف `umrah_daily_status_advance` يُجمّد خط الغرامات) |
| FG4 | `check:schema-drift` فيه فجوة تغطية | `CT-9` (استنتاج جديد) | Projects · Fleet · Properties · Warehouses | مراجع لأعمدة غير موجودة (`PRJ-001`, `FLT-010`, `PROP-003`...) تمرّ الحارس الأخضر — الحارس يفحص المعرّفات المقتبسة فقط ويُغفل أسماء الأعمدة غير المقتبسة |
| FG5 | مجلّدا migrations (164 مُطبَّق + 93 غير مُطبَّق) | `FND-001` | كل المسارات | مطوّر قد يضيف ترحيلًا إلى المجلّد الخطأ فلا يُطبَّق ولا يكشفه حارس |
| FG6 | `lifecycleEngine` غير مفروض؛ خرائط انتقال مزدوجة | `HR-015`, `SUP-016`, `FND` | HR · Fleet · Properties · Umrah · Support · Finance | CT-5 — اتساق دورة الحياة أضعف؛ انتقالات بلا `fromStates` |
| FG7 | كتالوجا RBAC متوازيان | `FND-010` | كل المسارات | CT-12 — خطر انحراف الصلاحيات؛ مفاتيح module/feature متضاربة |
| FG8 | routers حسّاسة بلا حارس تركيب | `FND-004` | rbacV2 · permissions · workflows · gov-integrations · digital-signature · events | أي route جديد بلا `authorize` inline ينكشف لأي مُصادَق (فجوة هيكلية) |
| FG9 | `emitEvent` يُسقط الأحداث غير الحرجة بلا listener | `FND-007` | كل المسارات الباعثة لأحداث غير حرجة | فجوة أثر تدقيق عند `PERSIST_ALL_EVENTS=false` (الافتراضي) |
| FG10 | غياب عقد API مُولَّد مفروض | `CT-8` | Finance · CRM · Support · HR · Fleet · Warehouses | بطاقات/جداول تقرأ حقولًا لا يُرجِعها الـ API — `lib/api-spec` موجود لكن غير مفروض |

---

## 5. خلاصة التحليل العرضي

- **184 عيبًا مساريًا تنحلّ إلى ~13 نمطًا عرضيًا + 10 فجوات Foundation.** الإصلاح المساري المنفصل سيعالج الأعراض ويترك المولّدات.
- **أخطر التعارضات:** X1 (جدول `clients` المشترك — احتساب إيراد مزدوج)، X3 (ترحيل رواتب مزدوج محتمل)، CT-10 (سياسة GL غير موحَّدة).
- **أخطر الفجوات البنيوية:** FG1 (#685 scoping)، FG6 (`lifecycleEngine` غير مفروض)، FG4 (فجوة حارس schema-drift — لم تردْ في أي تقرير سابق).
- **التوصية:** ترتيب الإصلاح طبقيًا لا مساريًا — تُعالَج الأنماط CT-1/CT-2/CT-5/CT-8/CT-10 كمسارات بنيوية مشتركة قبل أي تنظيف مساري، وإلا تكرّرت العيوب.

*انتهى التحليل العرضي — مخرَج المرحلة ج. تدقيق ثابت فقط، لا تعديل كود.*
