# U-02b — خطة انتقال آمنة لتوحيد مصدر النقل في مسار العمرة

> **PR وثائقي + خطوة حذرة افتتاحية واحدة فقط (smoke إضافي). صفر تعديل سلوكي، صفر حذف، صفر migrations، صفر backfill.**
>
> **المهمة:** خطة U-02b من #2080، تنفّذ تحت إذن المالك المحدود: «إعداد خطة انتقال + تنفيذ حذر صغير، وليس إذناً لحذف المسار القديم دفعة واحدة».
> **القاعدة الحاكمة:** كل مرحلة بعد M1 تحتاج إذناً مستقلاً صريحاً.

## ١. الغرض

تحويل إنشاء طلبات النقل في مسار العمرة من **المسار القديم `umrah_transport`** (يعيش داخل routes العمرة كمحرّك نقل موازٍ) إلى **عقد الخدمة #1902** (`transport_bookings` عبر `lib/umrahTransportContract.ts`) — تدريجياً، بدون كسر للواجهة أو التقارير أو التقويم أو الدفتر.

## ٢. الخريطة الكاملة (الخطوتان 1 و2 من متطلبات المالك)

### ٢.١ كل استهلاك للمسار القديم (`umrah_transport`)

**خلفية الـAPI (`routes/umrah.ts`) — 9 endpoints:**

| السطر | الـEndpoint | الفعل | الكتابة على الجدول |
|--------|-----------|------|---------------------|
| 2347 | `GET    /transport` | قائمة | لا — قراءة |
| 2362 | `GET    /transport/:id` | تفصيل | لا — قراءة |
| 2433 | `DELETE /transport/:id` | حذف ناعم | `UPDATE umrah_transport SET deletedAt=...` |
| 2449 | `POST   /transport` | إنشاء | `INSERT INTO umrah_transport` |
| 2544 | `PATCH  /transport/:id` | تعديل | `UPDATE umrah_transport SET ...` |
| 2606 | `POST   /transport/:id/assign-pilgrims` | إسناد معتمرين | `INSERT INTO umrah_transport_pilgrims` + `UPDATE umrah_transport SET pilgrimCount` |
| 2677 | `GET    /transport/:id/manifest` | مانفست | لا — قراءة |
| 2716 | `POST   /transport/:id/check-in` | تحقّق فردي | `UPDATE umrah_transport_pilgrims` |
| 2777 | `POST   /transport/:id/check-in-bulk` | تحقّق جماعي | `UPDATE umrah_transport_pilgrims` |

**أحداث قديمة (`emitEvent`):**

| السطر | الحدث |
|------|------|
| 2444 | `umrah.transport.deleted` |
| 2503 | `umrah.transport.created` |
| 2507 | `umrah.transport.requested` (مكرّر مع حدث العقد!) |
| 2572 | `umrah.transport.status_changed` |
| 2596 | `umrah.transport.updated` |
| 2654 | `umrah.transport.pilgrims_assigned` |
| 2829 | `umrah.transport.bulk_check_in` |

**ربط دفتر الأستاذ (نشط، عبر مسار محرّك مالي مختلف):**

| الموقع | الحالة |
|--------|--------|
| `migrations/080_gl_integration_columns.sql:4` | عمود `umrah_transport.journalEntryId` (موجود في الـschema، يُملأ فعلاً) |
| `lib/engines/umrahEngine.ts:75` | دالّة `postTransportExpenseGL` — تنشئ JE بـ`sourceType: "umrah_transport"` عبر `financialEngine.postJournalEntry` (نمط مختلف عن `createGuardedJournalEntry` الذي تفحصه U-01) |
| **استدعاء `postTransportExpenseGL`** | **استدعاءان نشطان** — `routes/umrah.ts:2493` (داخل POST /transport) + `lib/postingFailureRetry.ts:137` (مسار retry) |

**ملاحظة معمارية مهمة:** الـsmoke في U-01 يفحص `createGuardedJournalEntry` و`createJournalEntry` فقط؛ المسار القديم يستخدم `umrahEngine.postTransportExpenseGL` الذي يستدعي `financialEngine.postJournalEntry` — مسار مالي شرعي عبر engine، لكنه نمط مختلف لم يلتقطه boundary smoke الموجود. M1 يسدّ هذه الثغرة بتجميد عدد الاستدعاءات.

**الواجهة (الصفحات والمكونات):**

| الملف | السطر | الاستهلاك |
|-------|------|----------|
| `pages/umrah/transport.tsx` | 73 | `GET /umrah/transport` (قائمة) |
| `pages/umrah/transport.tsx` | 104 | `POST /umrah/transport` (إنشاء) |
| `pages/umrah/transport.tsx` | 202 | `navigate /umrah/transport/${id}` (تفصيل) |
| `pages/details/umrah-transport-detail.tsx` | 56–85 | تفصيل + PATCH + DELETE + assign-pilgrims |
| `pages/umrah/calendar.tsx` | 79 | رابط `/umrah/transport/${id}` لطبقة `transport_trip` |
| `components/shared/umrah-tabs-nav.tsx` | 38 | تبويب «النقل» → `/umrah/transport` |
| `components/layout/navigation.registry.ts` | 597 | عنصر «النقل والمواصلات» في القائمة الجانبية |
| `components/layout/sidebar-layout.tsx` | 671–672 | زر «إضافة رحلة» → `/umrah/transport?action=create` |
| `lib/entity-features.ts` | 119 | إدخال `"umrah-transport": {}` (feature catalog FE) |

**التقارير وlifecycle و RBAC و طباعة:**

| الموقع | الدور | الحالة |
|--------|-------|--------|
| `lib/umrahReportsCatalog.ts:183` | تقرير `id: "umrah_transport"` | وصفه «كل طلب نقل عبر العقد الخدمي + حالة Fleet» — أي يقرأ العقد فعلاً |
| `routes/umrah-entities.ts:5231` | `GET /reports/umrah-transport` | يقرأ `transport_bookings` — **لا علاقة بالجدول القديم** |
| `pages/umrah/reports/transport-requests.tsx:85` | يستهلك endpoint التقرير | يستهلك القراءة الجديدة |
| `lib/lifecycleEngine.ts:695` | حالة `entity: "umrah_transport"` | تعريف حالات الجدول القديم |
| `lib/rbac/recordOwnership.ts:46` | ملكية `umrah_transport: "user"` | RBAC على الجدول القديم |
| `lib/print/dataLoader.ts:403` | preset طباعة `umrah_transport` | قالب طباعة قديم |
| `lib/fleet/vehicleCapacity.ts:33` | `"umrah_transport"` في enum مصدر السعة | يقرأ من الجدول القديم في حسابات Fleet |
| `lib/fleet/driverEligibility.ts:40` | `"umrah_transport"` في enum مصدر الأهلية | كذلك |

### ٢.٢ البديل المقابل في العقد الصحيح

| المكوّن | الموقع | الدور |
|---------|--------|-------|
| العقد نفسه | `lib/umrahTransportContract.ts` | يكتب `transport_bookings` (`bookingSource='umrah_group'`، `transportServiceType='passenger_umrah'`)، يبثّ `umrah.transport.requested` |
| Endpoint إنشاء | `routes/umrah-entities.ts:976` `POST /groups/:id/transport-requests` | thin wrapper على `createTransportRequestFromUmrah` |
| Endpoint قراءة المجموعة | `routes/umrah-entities.ts:1134` `GET /groups/:id/transport-requests` | thin wrapper على `listTransportRequestsForGroup` |
| Endpoint تقرير شامل | `routes/umrah-entities.ts:5231` `GET /reports/umrah-transport` | يقرأ `transport_bookings` مع روابط group/agent/season |
| FE تقرير | `pages/umrah/reports/transport-requests.tsx` | يستهلك الـEndpoint الجديد |
| FE materialize | `pages/fleet/transport-integration.tsx` | يحوّل umrah_groups المعلّقة إلى `transport_bookings` (مسار التوحيد الموجود فعلاً) |

## ٣. الاكتشاف المُصحَّح — المسار القديم يكتب JE فعلاً عبر نمط مختلف

ثلاث حقائق مفصلية بعد التحقّق الميداني:

1. **القيود المالية تُنشأ فعلياً على المسار القديم:** `postTransportExpenseGL` يُستدعى من route الإنشاء و من مسار retry. كلٌّ يولّد JE عبر `financialEngine.postJournalEntry` بـ`sourceType: "umrah_transport"`. عمود `journalEntryId` على `umrah_transport` **يُملأ فعلاً**.
2. **هذا النمط لم يلتقطه U-01 smoke:** boundary smoke المالي في U-01 يستهدف `createGuardedJournalEntry` و`createJournalEntry` (الـhelpers في `businessHelpers.ts`). المسار القديم يمر عبر `financialEngine.postJournalEntry` — مسار engine شرعي لكن مختلف. **ليس انتهاكاً صريحاً للحدود** (يمر عبر engine)، لكنه يثبّت تبعية حية بين routes العمرة ودفتر الأستاذ على المسار القديم. M1 يسجّل هذه التبعية ويجمّد عددها.
3. **تقرير الكتالوج يقرأ العقد الجديد:** `umrahReportsCatalog` id="umrah_transport" → endpoint يقرأ `transport_bookings`. القراءة التحليلية محوَّلة فعلاً.
4. **العقد الجديد لا يبثّ نفس الأحداث القديمة:** فقط `umrah.transport.requested`. أحداث `created/updated/deleted/status_changed/pilgrims_assigned/bulk_check_in` تخص القديم وحده.

**أثر هذا الاكتشاف على الخطة:** تحويل الإنشاء للعقد يعني فقد قيود الـGL المالية لـ`umrah_transport` (لا يولّدها العقد). الخيارات حينئذ في M2 وما بعد:
- (أ) العقد ينمو ليطلب قيداً مالياً بعد التنفيذ (الأنسب — يطابق #1870 §7 لأن fleet engine هو المسؤول عن JE التنفيذ).
- (ب) إبقاء `postTransportExpenseGL` يعمل على المسار القديم في فترة dual-write مؤقتة.
- (ج) تأجيل توليد JE إلى أن fleet engine يدعمه (انتقال مرحلي).

القرار بين الثلاثة يحتاج مدخل المالك مع fleet engine team. خارج إذن M1.

## ٤. الاستراتيجية المقترحة (السؤال الرابع من المالك)

من الخيارات الأربعة:
- (أ) تحويل الواجهة فقط للعقد الجديد.
- (ب) إبقاء القديم read-only مؤقتاً.
- (ج) إخفاء الإنشاء القديم فقط.
- (د) backfill لاحق للبيانات القديمة.
- (هـ) بناء adapter يقرأ الاثنين مؤقتاً.

**التوصية: مزيج (ج) + (ب) + (أ) بالترتيب التالي:**

1. أولاً (ج) إخفاء **الإنشاء** القديم فقط — أصغر تغيير، أعمق أثر: كل طلب نقل جديد من العمرة يذهب للعقد، لا كتابة جديدة على `umrah_transport`.
2. بعد إثبات الاستقرار (ب) القديم read-only تماماً — قراءة التفصيل + المانفست + التحقّق على الموجود، لا تحديث.
3. بعد ذلك (أ) تحويل الواجهة لصفحة العقد بالكامل + توجيه التفصيل التاريخي لصفحة قراءة فقط.
4. (د) backfill يحتاج migration مدروسة مع المالك (خارج هذا المسار حالياً).
5. (هـ) adapter غير مطلوب لأن العقد يكفي للجديد والقديم لا يحتاج قراءة موحّدة بعد فصل قراءة التقرير.

## ٥. الخطة بـ8 مراحل

كل مرحلة لها معيار قبول ومخاطر وخطة رجوع. **لا تبدأ مرحلة إلا بعد إذن مستقل صريح من المالك.**

### M0 — هذه الخطة الوثائقية
- **المخرج:** هذا الـPR (تقرير + خطة + smoke افتتاحي حذر).
- **الإذن:** الحالي.

### M1 — الخطوة الافتتاحية الحذرة (smoke تجميد ثاني)
- **المخرج:** smoke جديد `umrahTransportLegacyContainmentSmoke.test.ts` يثبّت:
  - **(أ) ربط GL للمسار القديم مجمَّد عند العدد الحالي** — `postTransportExpenseGL` لها تعريف واحد + استدعاءان معروفان (`routes/umrah.ts:2493` + `lib/postingFailureRetry.ts:137`). أي استدعاء ثالث = توسّع لربط GL القديم = الـsmoke يفشل قبل المراجعة.
  - **(ب) عدد الأحداث القديمة (umrah.transport.deleted/created/requested/status_changed/updated/pilgrims_assigned/bulk_check_in في `routes/umrah.ts`)** مجمَّد عند 7 — أي زيادة = توسّع للمسار القديم.
  - **(ج) endpoint التقرير `/reports/umrah-transport` يقرأ `transport_bookings`** (anchor على `FROM transport_bookings`) — أي تحويل خفي للجدول القديم يفشل.
- **معيار القبول:** الـsmoke الجديد + smoke الموجود (U-02) كلاهما أخضر؛ صفر تعديل على إنتاج.
- **المخاطر:** قراءة ثالثة جديدة شرعية في `umrah.ts` تفشل sentinel U-01 (مستقل، غير ذي صلة). أي bug fix مشروع في الاستدعاءين القائمين لا يكسر الـsmoke (العدّ على عدد الاستدعاءات لا محتواها).
- **الرجوع:** revert ملف الـsmoke.
- **الإذن:** المالك **منحه ضمن «تنفيذ حذر صغير».**

### M2 — feature flag معطّل افتراضياً (config فقط، صفر سلوك)
- **المخرج:** إضافة مفتاح `umrah.transport.legacy_writes_disabled` في `umrahSettingsPoliciesCatalog.ts` بقيمة افتراضية `false` + قراءته في `routes/umrah.ts` POST/PATCH/DELETE handlers لكنه **لا يطبَّق** (مكتوب فقط للقراءة، يُسجَّل في log عند `true`). يُعرض في `/umrah/settings` كـtoggle.
- **معيار القبول:** الـsmoke الموجود كلهم أخضر؛ المفتاح يَظهر في UI كـtoggle بدون أثر تشغيلي؛ guard أخضر.
- **المخاطر:** أي خطأ في الـschema لا يكسر شيئاً (المفتاح بلا فعل سلوكي).
- **الرجوع:** revert ملف السياسة وroute reads.
- **الإذن:** **يحتاج موافقة مستقلة.**

### M3 — تفعيل feature flag (يجمّد الكتابات الجديدة على القديم)
- **المخرج:** عند `true`، endpoints POST/PATCH على المسار القديم في `routes/umrah.ts` تعيد 410 أو 403 برسالة عربية واضحة + رابط للعقد الجديد. القراءة و DELETE تبقى مسموحة.
- **معيار القبول:** صفحة الإنشاء على FE تستقبل الخطأ وتعرض CTA «استخدم النقل عبر مجموعة العمرة». المسار القديم لا يقبل كتابة جديدة. لا أثر على التقارير أو التقويم. الـsmoke `transportBoundarySmoke` يُحدَّث ليطابق العدد الجديد للكتابات (إذا تم إغلاقها كلياً ينخفض من 4 إلى 0 — تعديل واعٍ).
- **المخاطر:** كسر تجربة المستخدم إذا لم تكن صفحة العقد جاهزة. **يجب أن يسبقها M4 (صفحة FE للعقد).**
- **الرجوع:** فصل feature flag (يعيد السلوك القديم).
- **الإذن:** **يحتاج موافقة مستقلة.**

### M4 — صفحة FE جديدة للعقد (لا تحذف القديمة)
- **المخرج:** `pages/umrah/transport-requests.tsx` تستهلك `POST /groups/:id/transport-requests` و`GET /reports/umrah-transport`. تُضاف للملاحة كتبويب فرعي. الصفحة القديمة `transport.tsx` تبقى ظاهرة بشارة «قديم».
- **معيار القبول:** إنشاء طلب من الجديد ينشئ `transport_bookings` بـ`bookingSource='umrah_group'`. القائمة تعرض المنشأ مع طلبات تاريخية إن وُجدت (عبر العقد، لا الجدول القديم).
- **المخاطر:** ازدواج تجربة المستخدم (صفحتان). موصوفة عمداً في M5.
- **الرجوع:** إخفاء صفحة العقد عبر feature flag.
- **الإذن:** **يحتاج موافقة مستقلة.**

### M5 — تحويل الافتراضي + تجميد التقويم على الجديد
- **المخرج:** `umrah-tabs-nav.tsx` تبويب «النقل» يشير لصفحة العقد. `calendar.tsx` طبقة `transport_trip` تربط لـ`/umrah/transport-requests/${bookingId}` (بنية العقد). الصفحة القديمة تبقى مخفية في «أدوات قديمة».
- **معيار القبول:** التقويم يفتح طلب العقد عند النقر. الـsmoke `umrahFinanceBoundarySmoke` ليس له تأثير (لا GL). الـsmoke `umrahTransportBoundarySmoke` يُحدَّث.
- **المخاطر:** روابط محفوظة قديمة تكسر — تخفيف: redirect ناعم في الراوتر للقديم.
- **الرجوع:** عكس الـtabs.
- **الإذن:** **يحتاج موافقة مستقلة.**

### M6 — endpoints القديمة read-only كلياً (بما فيها DELETE)
- **المخرج:** `DELETE /transport/:id` يعيد 410. القراءات (`GET /transport`, `GET /transport/:id`, `GET /transport/:id/manifest`) تستمر. كل أحداث الكتابة القديمة تختفي طبيعياً (لا route يولّدها).
- **معيار القبول:** الـsmoke يقلب sentinels الكتابات إلى 0 (انخفاض واعٍ من 4+3 إلى 0+0).
- **المخاطر:** أداة إدارية قديمة تعتمد على الحذف — تخفيف: trace logs لرصد الاستدعاءات قبل القلب.
- **الرجوع:** إعادة فعل DELETE.
- **الإذن:** **يحتاج موافقة مستقلة.**

### M7 — تصفية الـGL hook الميت
- **المخرج:** حذف `postTransportGL` من `lib/engines/umrahEngine.ts` (dead code مثبت). إضافة comment في `migration 080` يوضّح أن العمود تاريخي لن يُحدَّث.
- **معيار القبول:** الـsmoke يثبت صفر استدعاء و صفر تعريف. الـtypecheck نظيف.
- **المخاطر:** نظري؛ لا استدعاء معروف فعلياً.
- **الرجوع:** revert.
- **الإذن:** **يحتاج موافقة مستقلة.**

### M8 — أرشفة الجدول القديم (يحتاج migration + backfill)
- **المخرج:** migration ينقل سجلات `umrah_transport` (لو وُجد ما يستحق) إلى `transport_bookings` بـ`bookingSource='umrah_legacy_archive'` ثم rename `umrah_transport` → `umrah_transport_archived` (لا DROP).
- **معيار القبول:** اختبار تكامل قبل/بعد على عيّنة بيئة. عدد سجلات الأرشفة مساوٍ لعدد سجلات القديم.
- **المخاطر:** الأكبر في الخطة بأكملها — تحتاج بيئة `db:provision-agent` لمحاكاة + قرار مالك على البيانات التاريخية.
- **الرجوع:** قابلة عبر rename عكسي + إزالة سجلات الأرشفة.
- **الإذن:** **يحتاج موافقة مستقلة كاملة + مراجعة الخطة قبل تنفيذها.**

## ٦. معيار القبول النهائي للمسار كاملاً (الخطوة 5 من المالك)

- ✅ إنشاء طلب نقل جديد من العمرة يذهب إلى `transport_bookings` فقط.
- ✅ لا كتابة جديدة إلى `umrah_transport` (المسار القديم لا يزيد).
- ✅ التقارير والتقويم لا تنكسر.
- ✅ smoke يثبت كل ما سبق.
- ✅ guard أخضر بلا override.
- ✅ لا قيود دفتر أستاذ تتعطّل (لا قيود تخرج المسار القديم اليوم — مثبت).

كل هذا يتحقّق نهاية M6 على أقل تقدير. M7/M8 تنظيف اختياري بعد الاستقرار.

## ٧. ما يفعله هذا الـPR الآن (M1 فقط)

- **التقرير:** هذا الملف.
- **التنفيذ:** smoke واحد إضافي `umrahTransportLegacyContainmentSmoke.test.ts` ينفّذ M1 §A-§C (dead code، sentinel الأحداث، sentinel الـendpoint التقرير).
- **صفر إنتاج، صفر migration، صفر UI، صفر صلاحيات، صفر مساس بـ`routes/umrah.ts` أو `routes/umrah-entities.ts` أو أي محرّك.**

## ٨. ما يحتاج إذنك المنفصل (تذكير)

كل مرحلة من M2 إلى M8 = إذن منفصل. **لا أعدّل، لا أقترح، لا أبدأ M2 قبل موافقتك الصريحة بنصّ مفصَّل (كما طلبت في #2080 لـU-02b).**

## ٩. الملفات المضافة في هذا الـPR

- `docs/governance/umrah-inventory-organization-repair/findings/U-02b_transition_plan.md` (هذا الملف).
- `artifacts/api-server/tests/unit/umrahTransportLegacyContainmentSmoke.test.ts` (smoke M1).

## ١٠. مرجعية

- المهمة الحاكمة: [#2080](https://github.com/barhom64/ghayth-erp/issues/2080)
- الميثاق: [#1870](https://github.com/barhom64/ghayth-erp/issues/1870) §7 (عقد خدمة النقل)
- الميثاق التشغيلي: [#2071](https://github.com/barhom64/ghayth-erp/issues/2071) (Service Boundary Lock)
- محرك النقل: [#1902](https://github.com/barhom64/ghayth-erp/issues/1902)
- U-02 الموجة الأولى: #2095 (مدموج)
