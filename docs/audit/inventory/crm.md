# جرد المسار — CRM

جردٌ ثابتٌ مستقلٌّ لوحدة إدارة علاقات العملاء (الفرص البيعية، العملاء، خط الأنابيب، الأنشطة، بوابة العميل) يغطي ملفّي المسار الخلفيين `crm.ts` و`clients.ts`، وصفحات الواجهة المرتبطة بهما، مع التحقّق المباشر من تطابق الواجهة مع المخطّط ومن نقاط F2/F3 الواردة في التقارير السابقة. كل بند «شغّال» مدعوم بدليل `file:line`. لم يُشغَّل النظام.

ملاحظة قانونية حول النطاق: وحدة `clients` مُركَّبة تحت `requireModule("crm")` (المسار المعتمد)، وجدول `clients` مُشترَك مع بوابة العميل والمالية (الفواتير) والعمرة — وهو محور تعارض عبر المسارات (انظر جدول 5 و CRM-013).

---

## جدول 1 — الصفحات (Pages)

| المعرّف | route | الملف | الحالة | APIs المستدعاة | عيب رئيسي |
|---|---|---|---|---|---|
| P-CRM-01 | `/crm`, `/crm/pipeline` | `pages/crm.tsx` | شغّال | `GET /crm/stats`, `GET /crm/opportunities`, `GET /crm/pipeline` | KPI «مكسوبة» يقرأ `wonOpportunities` غير الموجود في استجابة `/crm/stats` → 0 دائماً (CRM-001) |
| P-CRM-02 | `/crm/create` | `pages/create/crm-create.tsx` | شغّال | `POST /crm/opportunities`, `GET /clients`, `GET /employees` | قائمة المرحلة تعرض `closed_won/closed_lost` بينما الـ backend يرفضهما؛ `GET /employees` يتطلّب صلاحية `hr.employees` (CRM-002، CRM-003) |
| P-CRM-03 | `/crm/activities` | `pages/crm/activities.tsx` | ناقص | `GET /crm/opportunities` | صفحة عرضٍ فقط؛ لا زر إنشاء نشاط ولا استدعاء لـ `POST .../activities`؛ تعتمد على `opp.activities` غير المُرجَع في قائمة الفرص (CRM-004) |
| P-CRM-04 | `/crm/leads/:id` | `pages/crm/lead-detail.tsx` | مكسور | `GET /crm/opportunities/:id`, `GET .../activities`, `GET .../related`, `POST /clients`, `PATCH /crm/opportunities/:id` | زر «تحويل» يتجاوز `/convert` وينشئ عميلاً مكرّراً ويرسل `status:"converted"` غير الصالح؛ `backPath="/crm/leads"` لا يوجد كمسار (CRM-005، CRM-006) |
| P-CRM-05 | `/crm/:id` | `pages/details/opportunity-detail.tsx` | شغّال | `GET /crm/opportunities/:id`, `GET .../activities`, `PATCH /crm/opportunities/:id`, `DELETE /crm/opportunities/:id` | `backPath="/crm/opportunities"` لا يوجد كمسار مُسجَّل (CRM-007) |
| P-CRM-06 | `/clients` | `pages/clients.tsx` | شغّال | `GET /clients` | عمودا «المسؤول» (`assignedToName`) و«نشط» (`status`) لا يردهما الـ backend → فارغان دائماً (CRM-008) |
| P-CRM-07 | `/clients/create` | `pages/create/clients-create.tsx` | شغّال | `POST /clients`, `POST /clients/:id/portal-account` | يرسل `classification:""` (سلسلة فارغة) عند «بدون تصنيف» وهو خارج enum الـ schema (CRM-009) |
| P-CRM-08 | `/clients/:id` | `pages/client-detail.tsx` | شغّال | `GET /clients/:id`, `GET/POST/PATCH /clients/:id/portal-account`, `GET /umrah/sub-agents` | `backPath="/crm/clients"` لا يوجد كمسار مُسجَّل (CRM-010) |

---

## جدول 2 — الأزرار والإجراءات (Actions)

| الصفحة الأم | اسم الزر | الإجراء المتوقّع | API المستهدف | الحالة | نوع العيب |
|---|---|---|---|---|---|
| crm.tsx | فرصة جديدة | الانتقال لـ `/crm/create` | — (Link) | شغّال | — |
| crm.tsx | تعديل (RowActions) | تعديل سطري للفرصة | `PATCH /crm/opportunities/:id` | شغّال | — |
| crm.tsx | حذف (RowActions) | حذف ناعم للفرصة | `DELETE /crm/opportunities/:id` | شغّال | — |
| crm.tsx | معاينة (Eye) | فتح نافذة معاينة | — (محلي) | شغّال | — |
| crm.tsx | تصدير CSV | تصدير الصفوف المُفلترة | — (محلي) | شغّال | — |
| crm-create.tsx | إضافة | إنشاء فرصة | `POST /crm/opportunities` | شغّال | — |
| crm-create.tsx | اختيار المرحلة `closed_won/closed_lost` | إنشاء فرصة مغلقة | `POST /crm/opportunities` | مكسور | mismatch |
| activities.tsx | (لا يوجد زر إنشاء) | تسجيل نشاط جديد | `POST /crm/opportunities/:id/activities` | ناقص | dead |
| lead-detail.tsx | تحويل | تحويل العميل المحتمل إلى عميل | `POST /clients` + `PATCH /crm/opportunities/:id` | مكسور | duplicate |
| lead-detail.tsx | تسجيل اتصال | تسجيل نشاط اتصال | الانتقال لـ `/crm/activities` فقط | ناقص | dead |
| opportunity-detail.tsx | تعديل | تعديل المرحلة/القيمة/الاحتمالية | `PATCH /crm/opportunities/:id` | شغّال | — |
| opportunity-detail.tsx | حذف | حذف ناعم | `DELETE /crm/opportunities/:id` | شغّال | — |
| opportunity-detail.tsx | طباعة/معاينة | طباعة عرض السعر | — (محلي) | شغّال | — |
| clients.tsx | إضافة عميل | الانتقال لـ `/clients/create` | — (Link) | شغّال | — |
| clients.tsx | تعديل/حذف (RowActions) | تعديل/حذف العميل | `PATCH /clients/:id`, `DELETE /clients/:id` | شغّال | — |
| clients-create.tsx | حفظ العميل | إنشاء عميل (+حساب بوابة اختياري) | `POST /clients`, `POST /clients/:id/portal-account` | شغّال | — |
| client-detail.tsx | إنشاء حساب بوابة | إنشاء حساب بوابة | `POST /clients/:id/portal-account` | شغّال | — |
| client-detail.tsx | تفعيل/تعطيل الحساب | تبديل حالة الحساب | `PATCH /clients/:id/portal-account` | شغّال | — |
| client-detail.tsx | تعيين كلمة المرور | إعادة تعيين كلمة المرور | `PATCH /clients/:id/portal-account` | شغّال | — |

---

## جدول 3 — APIs

| Endpoint | Method | الـ handler | الـ schema | UI المستهلكة | الجدول الأساسي | الحالة | عيب |
|---|---|---|---|---|---|---|---|
| `/crm/opportunities` | GET | crm.ts:162 | فلاتر query (stage/status/dateFrom/dateTo) | crm.tsx, activities.tsx | crm_opportunities | شغّال | يتجاهل `page/limit` المرسلين، `LIMIT 500` ثابت (CRM-011 scaling) |
| `/crm/opportunities` | POST | crm.ts:182 | `createOpportunitySchema` crm.ts:91 | crm-create.tsx | crm_opportunities | شغّال | — |
| `/crm/opportunities/:id` | PATCH | crm.ts:372 | `updateOpportunitySchema` crm.ts:107 | crm.tsx, opportunity-detail.tsx, lead-detail.tsx | crm_opportunities | شغّال | يقبل `status` نصاً حراً بلا enum (CRM-006) |
| `/crm/opportunities/:id` | GET | crm.ts:808 | — | lead-detail.tsx, opportunity-detail.tsx | crm_opportunities | شغّال | — |
| `/crm/opportunities/:id/convert` | POST | crm.ts:833 | `convertOpportunitySchema` crm.ts:125 | لا أحد | crm_opportunities | شغّال (يتيم) | لا تستدعيه أي واجهة (CRM-005) |
| `/crm/opportunities/:id` | DELETE | crm.ts:900 | — | opportunity-detail.tsx, crm.tsx | crm_opportunities | شغّال | — |
| `/crm/opportunities/:id/related` | GET | crm.ts:928 | — | lead-detail.tsx | crm_opportunities | شغّال | — |
| `/crm/opportunities/:id/activities` | GET | crm.ts:991 | — | lead-detail.tsx, opportunity-detail.tsx | crm_activities | شغّال | — |
| `/crm/opportunities/:id/activities` | POST | crm.ts:1005 | `createActivitySchema` crm.ts:130 | لا أحد | crm_activities | شغّال (يتيم) | لا واجهة لإنشاء نشاط (CRM-004) |
| `/crm/pipeline` | GET | crm.ts:1036 | — | crm.tsx | crm_opportunities | شغّال | — |
| `/crm/followup-check` | POST | crm.ts:1053 | `followupCheckSchema` (فارغ) crm.ts:136 | لا أحد | crm_activities | شغّال (يتيم) | endpoint بلا واجهة ولا cron مُثبَت ثابتاً (CRM-012) |
| `/crm/analytics` | GET | crm.ts:1130 | — | لا أحد | crm_opportunities | شغّال (يتيم) | لا واجهة تستهلك تحليلات التحويل (CRM-012) |
| `/crm/stats` | GET | crm.ts:1176 | — | crm.tsx | crm_opportunities | شغّال | لا يُرجع `wonOpportunities` المتوقَّع في الواجهة (CRM-001) |
| `/clients` | GET | clients.ts:138 | فلاتر query (search/classification/page/limit) | clients.tsx, crm-create.tsx | clients | شغّال | — |
| `/clients` | POST | clients.ts:184 | `createClientSchema` clients.ts:98 | clients-create.tsx, lead-detail.tsx | clients | شغّال | — |
| `/clients/:id` | GET | clients.ts:260 | — | client-detail.tsx | clients (+invoices/tickets/projects) | شغّال | تجميع 8 استعلامات لكل طلب (CRM-013 scaling) |
| `/clients/:id` | PATCH | clients.ts:373 | `updateClientSchema` clients.ts:110 | clients.tsx | clients | شغّال | — |
| `/clients/auto-create` | POST | clients.ts:409 | `autoCreateClientSchema` clients.ts:120 | لا أحد (واجهة CRM) | clients | شغّال (يتيم) | يُستهلَك من قنوات أخرى (واتساب)؛ لا واجهة CRM (CRM-012) |
| `/clients/:id` | DELETE | clients.ts:456 | — | clients.tsx | clients | شغّال | — |
| `/clients/:id/portal-account` | GET | clients.ts:496 | — | client-detail.tsx | client_portal_accounts | شغّال | — |
| `/clients/:id/portal-account` | POST | clients.ts:517 | `createPortalAccountSchema` clients.ts:126 | client-detail.tsx, clients-create.tsx | client_portal_accounts | شغّال | — |
| `/clients/:id/portal-account` | PATCH | clients.ts:574 | `updatePortalAccountSchema` clients.ts:131 | client-detail.tsx | client_portal_accounts | شغّال | — |
| `/employees` (مرجعي) | GET | employees.ts:195 | — | crm-create.tsx | employees | شغّال | يتطلّب `hr.employees`، يُستدعى من واجهة CRM (CRM-003) |
| `/umrah/sub-agents` (مرجعي) | GET | خارج المسار | — | client-detail.tsx (تبويب العمرة) | umrah_sub_agents | غير قابل للتحقق | يخصّ مسار العمرة |
| `/crm/opportunities/:id` activities داخل GET :id | GET ضمني | crm.ts:815 | — | opportunity-detail.tsx (overdue) | crm_activities | شغّال | — |

> إجمالي نقاط النهاية الأساسية للمسار: 22 ضمن `crm.ts`/`clients.ts` + نقطتان مرجعيتان (`/employees`, `/umrah/sub-agents`) = 24؛ مع احتساب الاستعلام الضمني للأنشطة داخل `GET /crm/opportunities/:id` تُغطّى 25 نقطة تفاعل.

---

## جدول 4 — عدم التطابق UI ↔ API (Mismatches)

| الموقع | ما تُرسله الواجهة | ما يتوقّعه الـ schema | تشخيص ثابت | الإصلاح المقترح |
|---|---|---|---|---|
| crm.tsx:157 | `stats?.wonOpportunities` | `/crm/stats` يُرجع `wonValue` فقط (crm.ts:1193-1197) | الواجهة تقرأ مفتاحاً غير موجود → KPI «مكسوبة» = 0 دائماً | إضافة `wonOpportunities: COUNT(*) FILTER (WHERE stage='closed_won')` في crm.ts:1187، أو تغيير الواجهة لـ `wonValue` |
| crm-create.tsx:113-114 | `stage: "closed_won"` / `"closed_lost"` | `POST /crm/opportunities` يرفض المرحلتين النهائيتين صراحةً (crm.ts:225-234) | خياران في القائمة يُنتجان خطأ 409 مؤكَّداً عند الاختيار | إزالة الخيارين النهائيين من قائمة الإنشاء |
| lead-detail.tsx:109 | `PATCH .../:id { status: "converted" }` | `updateOpportunitySchema.status` نصٌّ حرٌّ بلا enum (crm.ts:115)؛ القيمة المعتمدة `open/closed` | تُكتب قيمة `converted` غير مُعرَّفة؛ المنطق الخلفي لا يفهمها → فرصة «معلَّقة» | استخدام `POST /crm/opportunities/:id/convert` بدل المسار اليدوي؛ وتقييد `status` بـ enum |
| lead-detail.tsx:98-105 | `POST /clients { name, email, phone, company }` | `createClientSchema` لا يحوي حقل `company` (clients.ts:98-108) | الحقل `company` يُتجاهَل صامتاً؛ والاسم يأخذ `contactName` فقط | إزالة `company`؛ والاعتماد على endpoint التحويل الذي يُنشئ/يربط العميل تلقائياً |
| clients-create.tsx:100/INITIAL:21 | `classification: ""` عند «بدون تصنيف» | `createClientSchema.classification` = enum بدون قيمة فارغة، الافتراضي `regular` (clients.ts:102) | إرسال `""` يُسقط zod في خطأ enum بدلاً من استخدام الافتراضي | حذف المفتاح عند الفراغ (`undefined`) أو تعيين `"regular"` |
| clients.tsx:116-119 / 158 | يعرض `assignedToName` و`c.status` | `GET /clients` يُرجع فقط: id,name,phone,email,classification,source,totalRevenue,isBlacklisted,createdAt (clients.ts:163-164) | عمود «المسؤول» و KPI «نشط» فارغان دائماً؛ لا حقل `status` في جدول clients إطلاقاً | إضافة `JOIN employees` لاسم المسؤول، وإزالة KPI «نشط» (لا حالة فعلية للعميل) |
| crm-create.tsx:31-32 | `GET /clients` و`GET /employees` بلا `?limit` | `/clients` افتراضي 20 صفّاً؛ `/employees` صفحة محدودة | قوائم منسدلة مبتورة عند تجاوز العملاء/الموظفين 20 | تمرير `?limit=500` أو نقطة نهاية مُخصَّصة للقوائم المنسدلة |

---

## جدول 5 — التكرار والتعارض (Duplication/Conflict)

| الوظيفة | الموقع 1 | الموقع 2 | نوع التداخل | اقتراح الحل |
|---|---|---|---|---|
| تحويل فرصة إلى عميل | `lead-detail.tsx:96-122` (POST /clients ثم PATCH status) | `crm.ts:833` `POST /opportunities/:id/convert` (الطريق المعتمد عبر lifecycleEngine + handleDealWon) | duplicate | اعتماد endpoint `/convert` حصراً وحذف المنطق اليدوي في الواجهة |
| تحديث `clients.totalRevenue` | `crm.ts:775` (handleDealWon: `+= dealValue`) | `finance-invoices.ts:639` (`+= total - vat` عند الدفع) | conflict | مساران يزيدان نفس العمود بقواعد مختلفة؛ صفقة CRM تُولِّد فاتورة → احتساب مزدوج محتمل. توحيد المصدر في محرّك مالي واحد |
| تعيين `clients.classification` | `clients.ts` PATCH/POST (إدخال يدوي) + `crm.ts:709` (`'crm'`) | `cronScheduler.ts:1653` (إعادة تصنيف آلية) + `umrah-entities.ts:357` (`'umrah_agent'`) | conflict | أربعة مصادر تكتب نفس العمود بلا أولوية مُعلَنة؛ الـ cron يدهس التصنيف اليدوي. تعريف أولوية أو فصل عمود «تصنيف يدوي» عن «آلي» |
| استعلام `employee_assignments` للإسناد النشط | `crm.ts:272-274`، `crm.ts:306`، `crm.ts:473-475`، `crm.ts:553`، `crm.ts:784`، `crm.ts:1090` | نمط متطابق في fleet/projects/support (تقرير F3) | duplicate | استخراج `resolveActiveAssignment(employeeId, companyId)` إلى helper مشترك (يطابق المسار #685) |
| إنشاء سجل `clients` بلا فحص تكرار | `clients.ts:208-228` (POST: فحص email/phone عبر `FOR UPDATE`) | `crm.ts:708-712` (handleDealWon) و`umrah-entities.ts:344` ينشئان بلا فحص | conflict | جدول `clients` بلا قيد UNIQUE على email/phone؛ المسارات الأخرى تُنشئ مكرَّرات. إضافة قيد جزئي `UNIQUE(companyId,phone) WHERE deletedAt IS NULL` |
| خرائط مراحل الفرص (STAGE_LABELS) | `crm.tsx:26-33` | `lead-detail.tsx:29-36` (نسخة مطابقة) + opportunity-detail.tsx يستخدم `STATUSES` العام | duplicate | توحيد في `lib/crm-type-maps.ts` المستخدَم أصلاً في activities.tsx |

---

## يحتاج Runtime Verification

- سلوك `applyTransition` في `crm.ts:866` (lifecycleEngine) عند `toState:"won"` — هل يتسامح مع كون `stage` سبق ضبطه على `closed_won` داخل `handleDealWon`؟ يحتاج تشغيلاً للتأكد من عدم رفض الانتقال مزدوجاً.
- نقطة `/crm/followup-check` (crm.ts:1053): هل يستدعيها cron مجدول فعلياً؟ لم يُعثر على مُستدعٍ ثابت؛ إن لم يوجد فهي تصعيد تذكيرات لا يحدث أبداً.
- استدعاء `crmEngine.requestInvoiceCreation` / `requestLegalContractCreation` / `postDealWonGL` (crm.ts:719-771) عبر `engines/index.js` — التحقق من نجاح حلقة الأحداث ووصول الفاتورة/العقد فعلياً.
- تبويب «العمرة» في client-detail.tsx:794 (`/umrah/sub-agents?clientId=`) — هل يدعم endpoint مسار العمرة الفلترة بـ `clientId`؟ يخصّ مسار العمرة.
- `useRegistryTabs("crm_lead"/"crm_opportunity"/"client")` — لم يُعثر على تسجيل ثابت في `entityMeta.ts`؛ يحتاج تحقّقاً من مصدر التبويبات الديناميكية.
- إخفاء/إظهار الحقول الحسّاسة عبر `maskFields` (هاتف/بريد) حسب الدور — سلوكٌ مرتبط بسياسات RBAC وقت التشغيل.

---

## العيوب المُرقّمة (Defect Register)

- **CRM-001** · mismatch · impairing · narrow · KPI «الفرص المكسوبة» في صفحة CRM يقرأ `stats.wonOpportunities` غير المُرجَع من `/crm/stats` فيظهر 0 دائماً · الدليل: `crm.tsx:157` مقابل `crm.ts:1193-1197` · لا تبعية.
- **CRM-002** · mismatch · impairing · narrow · قائمة المرحلة في نموذج الإنشاء تتيح `closed_won/closed_lost` بينما `POST /crm/opportunities` يرفضهما بـ 409 صريح · الدليل: `crm-create.tsx:113-114` مقابل `crm.ts:225-234` · لا تبعية.
- **CRM-003** · dead · impairing · structural · نموذج إنشاء الفرصة يستدعي `GET /employees` المحمي بصلاحية `hr.employees`؛ مستخدم يملك صلاحية CRM فقط يحصل على 403 وتبقى قائمة «المسند إليه» فارغة · الدليل: `crm-create.tsx:32` مقابل `employees.ts:195` · تبعية: مسار HR / تطبيع RBAC.
- **CRM-004** · dead · impairing · structural · نقطة `POST /crm/opportunities/:id/activities` (crm.ts:1005) موجودة وصحيحة لكن لا واجهة تستدعيها؛ صفحة `activities.tsx` عرضٌ فقط وتعتمد على `opp.activities` غير المُرجَع في قائمة `/crm/opportunities` فتظهر فارغة دائماً · الدليل: `crm.ts:1005`، `activities.tsx:24-31`، `crm.ts:174-178` · لا تبعية.
- **CRM-005** · dead · impairing · structural · نقطة التحويل المعتمدة `POST /crm/opportunities/:id/convert` (crm.ts:833) يتيمة؛ لا تستدعيها أي واجهة · الدليل: `crm.ts:833`، بحث الواجهة بلا نتائج · تبعية: CRM-006.
- **CRM-006** · duplicate · blocking · structural · زر «تحويل» في lead-detail ينشئ عميلاً عبر `POST /clients` ثم يرسل `PATCH {status:"converted"}` — يتجاوز محرّك دورة الحياة، ينشئ عميلاً مكرّراً دائماً (لا يربط الموجود)، ويكتب `status` غير مُعرَّف في enum · الدليل: `lead-detail.tsx:96-122` مقابل `crm.ts:833` و`crm.ts:115` · تبعية: CRM-005.
- **CRM-007** · dead · cosmetic · narrow · `opportunity-detail.tsx` يحدّد `backPath="/crm/opportunities"` وهو مسارٌ غير مُسجَّل في miscRoutes (المُسجَّل `/crm`) · الدليل: `opportunity-detail.tsx:215` مقابل `miscRoutes.tsx:85-90` · لا تبعية.
- **CRM-008** · mismatch · impairing · narrow · صفحة العملاء تعرض عمود «المسؤول» (`assignedToName`) و KPI «نشط» (`c.status`) بينما `GET /clients` لا يُرجع أيّاً منهما ولا يوجد عمود `status` في جدول `clients` · الدليل: `clients.tsx:116-119,158` مقابل `clients.ts:163-164` و schema_pre.sql:3716 · لا تبعية.
- **CRM-009** · mismatch · impairing · narrow · نموذج إنشاء العميل يرسل `classification:""` عند خيار «بدون تصنيف» وهي قيمة خارج enum الـ schema فيفشل zod بدلاً من تطبيق الافتراضي `regular` · الدليل: `clients-create.tsx:21,100` مقابل `clients.ts:102` · لا تبعية.
- **CRM-010** · dead · cosmetic · narrow · `client-detail.tsx` يحدّد `backPath="/crm/clients"` وهو مسارٌ غير مُسجَّل (المُسجَّل `/clients`) · الدليل: `client-detail.tsx:605` مقابل `miscRoutes.tsx:82` · لا تبعية.
- **CRM-011** · scaling · impairing · structural · `GET /crm/opportunities` يتجاهل `page/limit` المرسلين من الواجهة ويفرض `LIMIT 500` ثابتاً بلا OFFSET؛ تحت آلاف الفرص يبتر النتائج والترقيم في الواجهة يصبح وهمياً · الدليل: `crm.ts:174-178` مقابل `crm.tsx:79` · لا تبعية.
- **CRM-012** · dead · cosmetic · structural · ثلاث نقاط خلفية يتيمة بلا أي مستهلك ثابت من واجهة CRM: `POST /crm/followup-check`، `GET /crm/analytics`، `POST /clients/auto-create` (الأخيرة تُستهلَك على الأرجح من قنوات الرسائل لا CRM) · الدليل: `crm.ts:1053,1130`، `clients.ts:409` وبحث الواجهة بلا نتائج · لا تبعية.
- **CRM-013** · conflict · blocking · strategic-decision · جدول `clients` المشترَك بلا قيد UNIQUE على email/phone؛ يُكتَب من 4 مسارات: `clients.ts` (POST مع فحص `FOR UPDATE`)، `crm.ts:708-712` (handleDealWon بلا فحص)، `umrah-entities.ts:344` (بلا فحص)، `cronScheduler.ts:1653` (إعادة تصنيف). كما `totalRevenue` يُزاد من CRM (crm.ts:775) ومن المالية (finance-invoices.ts:639) بقاعدتين مختلفتين → احتساب مزدوج وعملاء مكرّرون · الدليل: schema_post.sql:2464-2468 (PK فقط)، `crm.ts:708-712,775`، `finance-invoices.ts:639` · تبعية: مسارات المالية والعمرة.
- **CRM-014** · duplicate · cosmetic · narrow · خريطة `STAGE_LABELS` مكرّرة حرفياً في `crm.tsx:26-33` و`lead-detail.tsx:29-36`، بينما `opportunity-detail.tsx` يستخدم `STATUSES` العام لنفس المراحل — ثلاث مصادر للمعنى ذاته · الدليل: `crm.tsx:26`، `lead-detail.tsx:29`، `opportunity-detail.tsx:254` · لا تبعية.
- **CRM-015** · scaling · impairing · structural · `GET /clients/:id` ينفّذ 8 استعلامات تجميعية متوازية لكل طلب (فواتير/فرص/تذاكر/مشاريع/ماليات/محادثات/خط زمني/عقود) مع `UNION ALL` على جداول كبيرة بلا فهرسة مُؤكَّدة على `clientId`؛ يثقل تحت كثرة الفواتير · الدليل: `clients.ts:274-352` · لا تبعية.

---

## خلاف مع تقارير سابقة

التقرير المرجعي `docs/audit/UNVERIFIED_PATHS_ARCHITECTURE_MAP.md` (السطر 153) يصنّف العيب **F3** («استعلام HR-assignment مكرّر + قراءات مباشرة لجداول `employees`») كـ **🟠 Medium** ويدرج `crm` ضمن قائمته. خلافنا:

1. **شدّة أعلى من Medium، وليست مجرد تكرار نمط.** التحقّق المباشر يُظهر أن `crm.ts` لا يُكرّر الاستعلام فحسب، بل يستدعيه **ستّ مرّات** (crm.ts:272، 306، 473، 553، 784، 1090). هذا التكرار السداسي داخل ملفٍّ واحد يتجاوز توصيف «نمط مكرّر عبر الوحدات» ويجعل أي تغيير في منطق الإسناد عرضةً للانحراف بين النسخ.

2. **التقرير يغفل تماماً تعارض الكتابة على جدول `clients` المشترَك (CRM-013).** خريطة المسارات تصف `clients` كوحدة CRM فقط (السطر 112) ولا تُشير إلى أن `totalRevenue` و`classification` يُكتبان من المالية والعمرة والـ cron بقواعد متعارضة. هذا تعارضٌ حقيقي عبر المسارات (conflict) أخطر من F2/F3 المُصنَّفَين Medium، ونرفعه إلى **blocking / strategic-decision**.

3. **اتّفاق جزئي مع نفي F2 عن CRM:** التقرير لا يُدرج `crm` ضمن وحدات F2 (تبنّي `scopedQuery` غير المتّسق، السطر 152). تحقّقنا يؤكّد ذلك: `crm.ts:167` و`clients.ts:147` يستخدمان `buildScopedWhere`/`parseScopeFilters` فعلياً — فلا خلاف هنا، لكن نسجّل ملاحظة: كلاهما يمرّر `disableBranchScope:true` لأن جدولَي `crm_opportunities` و`clients` بلا عمود `branchId` (schema_pre.sql:3716، 4220)، وهو قرارٌ بنيويٌّ مقصود لا عيب، خلافاً لما قد يُفهَم من إدراج الوحدة في خرائط النطاق.
