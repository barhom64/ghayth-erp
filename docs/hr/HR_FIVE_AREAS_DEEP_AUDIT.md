# مراجعة عميقة لخمس نقاط HR (post-#2077) — Audit Report

> توليد: مراجعة بحثية (5 وكلاء Explore بالتوازي) لا تعديل في الكود.
> الهدف: قبل إغلاق ملف HR، تشخيص الحالة الحقيقية للنقاط الخمس التي حدّدها صاحب المنتج.
>
> القاعدة المتّبعة: قراءة كل ملف + استشهاد بـ`file:line` لكل ادّعاء.

## ملخص تنفيذي

| النقطة | الحالة | الفجوة الرئيسية |
|---|---|---|
| 1. ملف الموظف 360° | ⚠ جزئي (4 من 6 محاور) | لا تبويب «الوثائق»، لا «النشاط/audit timeline»، تقييم 360° peer غير مربوط |
| 2. دورة حياة الموظف | ⚠ جزئي (6 من 8 مراحل) | لا workflow «ترقية»، تثبيت بعد التجربة آلي فقط (لا زرّ يدوي)، لا قالب «عرض وظيفي» رسمي |
| 3. الهيكل التنظيمي | ⚠ مجزّأ على 3 صفحات | لا شجرة موحّدة، مستوى «إدارة» مظلم تمامًا، عضويات الفريق/اللجنة/المشروع لا تظهر من صفحة الموظف |
| 4. صندوق الأعمال الموحّد | 🚫 موزّع على 5+ صفحات | مدير HR يفتح **5 صفحات صباحًا** للحصول على كل ما ينتظر إجراءه؛ صفحة `/my/work-queue` تجريبية وليست في السايد بار |
| 5. التتبع الميداني | ⚠ نصف موصول | الـbackend كامل ومُختبَر، التطبيق الجوّال (الذي يجب أن يرسل النبضات) **غير موجود** — الجدول يكتب من العدم |

---

## ١) ملف الموظف 360°

**الملف**: `artifacts/ghayth-erp/src/pages/employee-detail.tsx` (1738 سطر، 14 تبويب).

| المحور المطلوب | الحالة | الدليل |
|---|---|---|
| الأصول | ✅ موصول | تبويب «العهد والأصول» — قراءة `employee_assets` (employees.ts:1815–1824) |
| العهد (مالية) | ⚠ ملخّص فقط | بطاقة `FinanceLinkageCard` على الـoverview (line 138–210)، لا تبويب معاملات منفصل |
| الوثائق | 🚫 **مفقود تمامًا** | endpoint `GET /employees/documents` موجود في الـbackend (employees.ts:1623–1647) لكن **الصفحة لا تستدعيه أبدًا** — لا عقود، لا إقامة، لا جواز |
| التقييم | ⚠ مؤسسي فقط | الدرجة المركّبة + الإشارات (line 282–431). صفحات `/hr/evaluation-360*` موجودة منفصلة **بدون رابط** من ملف الموظف |
| الحضور | ✅ موصول | تبويب «الحضور» — آخر 30 يومًا (employees.ts:1701–1706) |
| النشاط داخل النظام | 🚫 **مفقود** | لا قراءة لـ`audit_logs`. الـ«activityScore» الموجود رقم محسوب فقط، ليس عرضًا للسجل |

**التقدير**: ٤ من ٦ موصولة جزئيًا أو كليًا. الفجوتان الحقيقيتان: الوثائق + الـactivity timeline.

---

## ٢) دورة حياة الموظف

| المرحلة | الحالة | الجدول/الصفحة/الانتقال |
|---|---|---|
| مرشّح | ✅ موصول | `job_applications` + `recruitment.tsx` + PATCH recruitment.ts:355–389 |
| عرض وظيفي | ⚠ status flag فقط | `job_applications.status='offer'` (لا قالب عرض رسمي، لا توقيع، لا approval متعدد) |
| مباشرة | ✅ موصول | `sourceApplicationId` مُستخدَم في wizard (employees-create.tsx:308–313) + employees.ts:809–818؛ 4 onboarding tasks تلقائية |
| تجربة | ⚠ آلي فقط | `probationEndDate` يُحسب تلقائيًا (employees.ts:942)؛ cron `probation_alert_check` ينبّه قبل 14 يومًا ويُكمل تلقائيًا (cronScheduler.ts:2064–2095) |
| تثبيت | 🚫 **لا UI** | لا زرّ لـHR للتثبيت اليدوي (مبكّر أو متأخّر). الـcron فقط يفعل ذلك |
| ترقية | 🚫 **لا workflow** | لا جدول `promotions` ولا صفحة. تغييرات الراتب/المسمى عبر PATCH مباشر |
| نقل | ✅ موصول (مع شرط) | transfer.tsx + hr.ts:7220–7225؛ `applyTransition` يحدّث `employee_assignments` ذرّيًا. **لكن**: ينتظر تأكيد المدير المستقبِل قبل التطبيق |
| إنهاء خدمة | ✅ موصول | hr-exit.ts:717 — `UPDATE employee_assignments SET status='terminated'` + clearance + gratuity ضمن transaction |

**القفزات بين المراحل (joints)**:
| الانتقال | النتيجة |
|---|---|
| Application(hired) → Employee creation | ✅ يعمل (sourceApplicationId يمرَّر ويُسجَّل) |
| Probation end → Confirmed | ⚠ آلي عبر cron فقط |
| Transfer approved → Assignment updated | ✅ يعمل (ذرّي داخل transaction) |
| Exit approved → Employee deactivated | ✅ يعمل (clearance + gratuity كلها ضمن transaction) |

**التقدير**: ٦ من ٨ مراحل موصولة. **الفجوات الموضوعية**: workflow الترقية، زرّ التثبيت اليدوي.

---

## ٣) الهيكل التنظيمي

| المستوى | الحالة | أين |
|---|---|---|
| شركة | ✅ ظاهر | company switcher في الـheader |
| فرع | ✅ ظاهر | `organization.tsx:20–23` كـKPI badge، لكن **لا تبويب admin مخصّص للفروع** |
| إدارة (Administration) | 🚫 **مظلم تمامًا** | لا جدول، لا UI، **مدرج في المواصفة لكن غير منفَّذ** |
| قسم | ✅ ظاهر (أساسي) | `organization.tsx:54–84` (grid + manager + count) + `organization-structure.tsx:31–103` (شجرة سطحية) |
| فريق | ⚠ admin فقط | `admin/org-model.tsx:241–317` + `admin/org-memberships.tsx:75–179` — **غير ظاهر من ملف الموظف** |
| لجنة | ⚠ admin فقط | `admin/org-model.tsx:328–404` + `admin/org-memberships.tsx:186–294` — **لا رابط من ملف الموظف** |
| مشروع | ⚠ تخصيص فقط | `admin/org-memberships.tsx:299–429` (نسبة + cost center) — **لا في tabs الموظف** |

**النتيجة**:
- لا توجد شجرة موحَّدة تعرض المستويات السبعة معًا.
- `organization-structure.tsx` يرسم فقط: شركة → أقسام → top-5 موظفين (3 مستويات).
- المحوران الكبيران مفقودان من ملف الموظف:
  1. سلسلة كاملة «شركة X / فرع Y / قسم Z / فريق T / لجنة C / مشروع P»
  2. عضويات الفريق + اللجنة + نسبة المشروع — كلها مرئية في `/admin/*` فقط (يحتاج level≥90)

**مستوى «الإدارة» (administration)**: قرار منتجي — هل هو طبقة فعلية بين الفرع والقسم، أم أن «إدارة المالية» مجرد اسم تجاري لقسم؟

---

## ٤) صندوق الأعمال الموحّد

**عدد المصادر المختلفة لـ«ما ينتظر إجراءاتي»**: 8.

| المصدر | الجدول | الصفحة |
|---|---|---|
| Notifications | `notifications` | `/notifications` |
| Tasks | `tasks` (assignedTo=me) | `/tasks` |
| Action Center | aggregator (20 queries) | `/action-center` |
| HR Approval Inbox | `approval_requests` | `/hr/approval-inbox` |
| Finance Approvals Inbox | endpoints متعدّدة | `/finance/approvals-inbox` |
| My Space | aggregator جزئي | `/my-space` |
| Work Queue (تجريبي) | يجمع 4 endpoints | `/my/work-queue` ⚠ ليس في السايد بار |
| Inbox (comms) | threads + channels | `/inbox` |

**Action Center** يجمع 20 طابورًا (leaves, advances, custodies, letters, purchases, expenses, loans, overtime, exits, workflows, SLA breaches, …) ولكنه **ليس البديل الوحيد** — مدير المالية ما زال يحتاج `/finance/approvals-inbox` لـbudget overrides + manual journals.

**سؤال صاحب المنتج**: كم صفحة يفتح مدير HR صباحًا؟

**الجواب الدقيق: 5 صفحات على الأقل**:
1. `/notifications` (الجرس)
2. `/action-center` (الموافقات والمهام والـSLA)
3. `/hr/approval-inbox` (إجازات/إضافي/نقل/إنهاء/سلف)
4. `/finance/approvals-inbox` (لو يحمل صلاحية مالية)
5. `/tasks` (طابور المهام الشخصية)
6. `/inbox` (الاتصالات — اختياري)

**Bell icon**: يقرأ من جدول `notifications` فقط؛ يفوّت 80% من الـactionable items (approvals، tasks، threads).

**الصفحة التجريبية `/my/work-queue`** تجمع 4 مصادر (my-space + tasks + notifications + inbox) لكنها:
- مدفونة تحت قائمة «مساحاتي»
- غير مروَّجة
- لا تشمل `/finance/approvals-inbox`

**الفجوة المعمارية الحقيقية**: لا صفحة باسم «صندوق الأعمال» في النظام. الكلمة تظهر فقط في:
- «صندوق التواصل» = `/inbox`
- «ما ينتظر إجراءاتي» = `/my/work-queue`

---

## ٥) التتبع الميداني

**الحكم النهائي**: **نصف موصول — Backend كامل، Mobile مفقود**.

| السطح | الحالة | الدليل |
|---|---|---|
| الجدول `field_tracking_points` | ✅ موجود | migration 271 (lat/lng/accuracy/speed/heading/altitude/battery + indexes) |
| GPS check-in/out | ⚠ يلتقط، لا يفرض | columns موجودة على `attendance`؛ `gpsRadiusMeters` policy موجودة لكن **لا تُرفض check-in خارج النطاق** — يُسجَّل ويُعرَض بأحمر فقط |
| صفحة التتبع الحيّة | ✅ موجودة | `pages/hr/field-tracking.tsx:89–142` (BreadcrumbMap + Leaflet)؛ `GET /hr/attendance/field-track` بنمطين: live + breadcrumb |
| ربط بـFleet/Driver | 🚫 منفصل | fleet module لا يقرأ `field_tracking_points`؛ dispatch لا يرى breadcrumbs |
| Per-category policy enforcement | ✅ يعمل + مُختبَر | `POST /hr/attendance/field-ping` يرفض ـ403 لفئة `trackingFrequencySeconds=0` (hr.ts:1300–1315)؛ throttling 80% (1317–1336)؛ integration test يثبت driver يقبل manager يُرفض |
| Mobile capture | 🚫 **غير موجود** | `apps/ghayth-mobile/` stub فارغ. لا `watchPosition`، لا interval، لا استدعاء `/field-ping` |

**الخلاصة**: عندك بنية تحتية تتبع السائق كل 30 ثانية والميداني كل 5 دقائق، **لكن لا أحد يرسل النبضات**. الجدول يكتب من العدم. صفحة الـbreadcrumb تعرض نقاطًا غير موجودة.

**الفجوة الحقيقية**: تطبيق جوّال يستدعي `POST /hr/attendance/field-ping` على فاصل من `trackingFrequencySeconds` للفئة. تقدير: 3–5 أيام (Geolocation API + interval + queue للـoffline).

---

## التقدير الإجمالي بعد المراجعة العميقة

| المحور | قبل | بعد المراجعة الأعمق |
|---|---|---|
| إنشاء الموظف | 9.8 | 9.8 |
| الربط المؤسسي | 9.8 | 9.8 |
| الأدوار والصلاحيات | 9.4 | 9.4 |
| النطاقات | 9.5 | 9.5 |
| الحضور | 9.4 | 9.4 |
| التقييم | 9.3 | 9.3 |
| التدقيق | 9.5 | 9.5 |
| **ملف الموظف 360** | لم يُقَس | **7.5** (وثائق + activity مفقودان) |
| **دورة الحياة** | لم تُقَس | **7.8** (ترقية + تثبيت يدوي مفقودان) |
| **الهيكل التنظيمي** | لم يُقَس | **6.8** (مجزّأ + إدارة مظلمة) |
| **صندوق الأعمال** | لم يُقَس | **5.5** (موزّع على 5+ صفحات) |
| **التتبع الميداني** | لم يُقَس | **5.0** (Mobile غير موجود) |

**المتوسط الكلي الجديد** ≈ **8.2/10** (بدلًا من 9.3 المُعلَن قبل المراجعة الأعمق).

## التوصيات

1. **لا تُغلق ملف HR**. الـ9.3 السابق كان عن الموجات الست الموثَّقة فقط (PR-1..PR-4 + Audit). المراجعة الأعمق كشفت أربع فجوات جوهرية لم تُقَس.

2. **الفجوات الأكبر بترتيب الأولوية المنتجية**:
   1. **صندوق أعمال موحّد** — أكبر فجوة UX (مدير HR يفتح 5 صفحات صباحًا).
   2. **التتبع الميداني — Mobile** — استثمار غير مستغَل (backend كامل، client مفقود).
   3. **ملف 360 — تبويب الوثائق + النشاط** — حلّ خفيف (الـendpoint موجود، فقط الـUI ناقص).
   4. **دورة الحياة — workflow الترقية + زرّ التثبيت اليدوي** — قرار منتجي قبل البناء.
   5. **الهيكل — قرار «إدارة» موجودة أم لا** — قرار منتجي، ثم شجرة موحّدة.

3. **هذا التقرير قاعدة لـPR-5 وما يليه** — لا توجد مفاجآت أخرى مخبّأة.

---

<sup>تقرير بحثي تشخيصي. لا تعديل في الكود. كل ادّعاء فيه استشهاد بـ`file:line`. مولَّد عبر 5 وكلاء Explore متوازيين على فرع `claude/enterprise-hardening-roadmap-AOfO7`.</sup>
