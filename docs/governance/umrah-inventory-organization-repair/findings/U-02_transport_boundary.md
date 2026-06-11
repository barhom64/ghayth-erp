# U-02 — تقرير فحص مصادر النقل داخل مسار العمرة (Service Boundary)

> **PR وثائقي + smoke test يجمّد الحالة. صفر تغيير كود إنتاج.**
>
> **المهمة:** [U-02 من #2080](https://github.com/barhom64/ghayth-erp/issues/2080) — ثاني وآخر مهمة في الموجة الأولى المعتمدة.
> **القاعدة:** *العمرة تطلب النقل عبر عقد الخدمة (#1902 — `transport_bookings`)، ولا تنسخ محرك نقل داخلي* (#1870 + #2071).
> **النطاق:** routes العمرة (`routes/umrah.ts` + `routes/umrah-entities.ts`)، عقد الخدمة (`lib/umrahTransportContract.ts`)، صفحات `pages/umrah/**`. لا فحص خارج العمرة (الـfleet engine ومحرّك الـtransport_bookings مسارات خادمة — خارج النطاق).

## ١. النتيجة باختصار

| العنصر | الحكم |
|--------|-------|
| `lib/umrahTransportContract.ts` (عقد الخدمة الصحيح) | ✅ موجود، يكتب `transport_bookings` فقط، يبثّ `umrah.transport.requested` |
| `routes/umrah-entities.ts` (نقطتا تكامل العقد) | ✅ Thin wrapper نموذجي — يستدعي `createTransportRequestFromUmrah` / `listTransportRequestsForGroup` فقط |
| `routes/umrah.ts` (مسار `/transport*` القديم) | ❌ **مسار نقل موازٍ نشط** — 9 endpoints + 7 كتابات مباشرة على `umrah_transport*` + ربط بـGL عبر `umrahEngine.ts` (`sourceType: "umrah_transport"`) |
| الواجهة `pages/umrah/transport.tsx` | ❌ تستهلك المسار القديم `/umrah/transport` (POST + GET) |
| `pages/umrah/calendar.tsx` | ⚠️ يربط لروابط `/umrah/transport/:id` (القديم) |
| `pages/umrah/reports/transport-requests.tsx` | ✅ يقرأ `transport_bookings` (العقد) — مسار صحيح للقراءة |

**خلاصة U-02:** مصدران للنقل يعملان فعلياً بالتوازي. العقد الصحيح مبني، لكن المسار القديم لا يزال هو الافتراضي على الواجهة وعلى دفتر الأستاذ. U-02 يجمّد عدد مواضع الكتابة على المسار القديم ويمنع توسعه؛ لا يحذف ولا ينقل (نص الإذن: «لا إصلاح بيانات الآن، لا migrations، لا تعديل UI إلا إذا كان لازماً لإغلاق Boundary ومثبتاً بالدليل»). إغلاق الازدواج الفعلي يحتاج إذناً منفصلاً لاحقاً.

## ٢. المنهجية

ست مجموعات بحث مباشرة:

1. أنماط الكتابة على `umrah_transport` (الجدول القديم).
2. أنماط الكتابة على `umrah_transport_pilgrims` (الجدول المرافق القديم).
3. أنماط الكتابة على `transport_bookings` (الجدول الصحيح للعقد) من routes العمرة (يجب أن تكون صفراً — كلها عبر العقد).
4. استيراد واستخدام `umrahTransportContract` في routes العمرة.
5. مَن يستهلك أي endpoint على الواجهة؟
6. القراءات المسموح بها (الإحصاء، لا التجميد).

## ٣. الأدلة الميدانية

### ٣.١ المسار القديم — كتابات `routes/umrah.ts` على `umrah_transport` (4)

```text
2442:  UPDATE umrah_transport SET "deletedAt"=NOW(), "updatedAt"=NOW() ...     (DELETE handler)
2477:  INSERT INTO umrah_transport (...)                                       (POST /transport)
2591:  UPDATE umrah_transport SET ${sets.join(",")} ...                        (PATCH /transport/:id)
2649:  UPDATE umrah_transport SET "pilgrimCount"=$1, "updatedAt"=NOW() ...     (POST /:id/assign-pilgrims)
```

### ٣.٢ كتابات `routes/umrah.ts` على `umrah_transport_pilgrims` (3)

```text
2632:  INSERT INTO umrah_transport_pilgrims (...)                              (POST /:id/assign-pilgrims)
2757:  UPDATE umrah_transport_pilgrims SET ... WHERE "transportId"=$1...       (POST /:id/check-in)
2816:  UPDATE umrah_transport_pilgrims SET ... WHERE "transportId"=$1...       (POST /:id/check-in-bulk)
```

### ٣.٣ Endpoints المسار القديم في `routes/umrah.ts` (9)

```text
2347:  GET  /transport
2362:  GET  /transport/:id
2433:  DELETE /transport/:id
2449:  POST /transport
2544:  PATCH /transport/:id
2606:  POST /transport/:id/assign-pilgrims
2677:  GET  /transport/:id/manifest
2716:  POST /transport/:id/check-in
2777:  POST /transport/:id/check-in-bulk
```

### ٣.٤ ربط المسار القديم بدفتر الأستاذ (الأخطر)

```text
lib/engines/umrahEngine.ts:104  sourceType: "umrah_transport"
lib/engines/umrahEngine.ts:107  guardTable: "umrah_transport"
```

`migration 080_gl_integration_columns.sql:4` أضاف عمود `journalEntryId` على `umrah_transport`. أي أن المسار القديم **يولّد قيوداً مالية** بنفسه — وهذا ينتهك أيضاً قاعدة «العمرة لا تكتب قيوداً خارج engine المالية» إذا كان الـengine المذكور (`umrahEngine` العامة) ليس محرك مالية عمرة المعترف به في #1870 §6 (الذي يضم: Invoicing / Import / Commission / Reclassify). **يُسجَّل في الجرد**؛ خارج إذن U-02 معالجته.

### ٣.٥ المسار الصحيح — العقد `lib/umrahTransportContract.ts`

```text
138:  INSERT INTO transport_bookings (...)
       VALUES (..., 'umrah_group', 'passenger_umrah', umrahGroupId, ...)
186:  emitEvent({ action: "umrah.transport.requested", ... })
```

دالّتان مصدَّرتان: `createTransportRequestFromUmrah`، `listTransportRequestsForGroup`.

### ٣.٦ تكامل العقد في `routes/umrah-entities.ts`

```text
48:   import { createTransportRequestFromUmrah,
49:           listTransportRequestsForGroup,
50:   } from "../lib/umrahTransportContract.js";

976:  router.post("/groups/:id/transport-requests", ..., async (req, res) => {
981:    const result = await createTransportRequestFromUmrah(scope, body);
1134: router.get("/groups/:id/transport-requests", ..., async (req, res) => {
1138:   const rows = await listTransportRequestsForGroup(scope, groupId);
```

**نموذج مثالي للـthin wrapper** — لا بناء حجز، لا كتابة جدول، لا حساب — فقط استدعاء العقد.

### ٣.٧ المسار في الواجهة

```text
pages/umrah/transport.tsx:73    GET  /umrah/transport            ← المسار القديم
pages/umrah/transport.tsx:104   POST /umrah/transport            ← المسار القديم
pages/umrah/transport.tsx:202   /umrah/transport/${r.id}         ← navigate إلى تفصيل القديم
pages/umrah/calendar.tsx:79     /umrah/transport/${ids[0]}       ← روابط إلى القديم
pages/umrah/reports/transport-requests.tsx:4   "Lists every transport_bookings row..."
                                ← قراءة من العقد (مسار صحيح للقراءة)
```

أي أن: **النقل عملياً على الواجهة = المسار القديم.** العقد الجديد مبني وله endpoints صحيحة لكن لم يُستهلك بعد من شاشة النقل الرئيسية.

## ٤. الحكم التفصيلي على Service Boundary

العقد الصحيح يقول (من رأس `umrahTransportContract.ts`):

> *«umrah is the LEADER path; transport is a SERVICE path. Umrah requests transport; the fleet engine fulfils. Umrah does NOT duplicate transport logic or write trip/vehicle/driver state itself.»*

المسار القديم ينتهك هذا تماماً: ينشئ سجلات `umrah_transport` مع `vehicleId`/`driverId`/`tripDate`/`capacity` (انظر السطر 2477)، ويوسم قيوداً مالية بـ`sourceType: "umrah_transport"`. هذا «محرك نقل داخل العمرة» — وهو ما يحظره #2071.

## ٥. ما يفعله U-02 (تجميد لا إصلاح)

ملف الـsmoke: `artifacts/api-server/tests/unit/umrahTransportBoundarySmoke.test.ts`

يثبّت ١٠ invariants:

**§A تأكيد العقد قائم وصحيح**
1. ملف `lib/umrahTransportContract.ts` موجود ويصدّر الدالّتين.
2. `routes/umrah-entities.ts` يستوردهما ويستخدمهما في endpoint كل منهما.
3. العقد يكتب `transport_bookings` فقط — ليس `umrah_transport`.

**§B تجميد المسار القديم على عدده الحالي**
4. `routes/umrah.ts` يحوي **بالضبط 4** عبارات كتابة على `umrah_transport` (INSERT/UPDATE/DELETE) — أي زيادة = الاختبار يفشل = لا توسّع جديد للمسار القديم.
5. `routes/umrah.ts` يحوي **بالضبط 3** عبارات كتابة على `umrah_transport_pilgrims` — نفس الحماية.
6. `routes/umrah-entities.ts` يحوي **صفر** كتابات على `umrah_transport*` — يبقى نظيفاً.

**§C صفر كتابة مباشرة على `transport_bookings` من routes العمرة (يجب أن تمر بالعقد)**
7. `routes/umrah.ts` و`routes/umrah-entities.ts` معاً: صفر `INSERT/UPDATE/DELETE` على `transport_bookings`.

**§D صفر طريق جديد للواجهة على دفتر الأستاذ عبر النقل**
8. صفحات `pages/umrah/transport.tsx` و`pages/umrah/transport-*` لا تذكر `transport_bookings` كتابةً (مسموح بالقراءة في `reports/transport-requests.tsx`).
9. صفر مرجع لـ`umrahTransportContract` من صفحات الواجهة (يجب أن يكون من خلال HTTP فقط).

**§E دلالة Service Boundary**
10. `routes/umrah.ts` لا يستورد `umrahTransportContract` (المسار القديم لا يجب أن يبدأ بخلط نفسه بالعقد قبل قرار توحيد رسمي).

## ٦. ما تم منعه

- **لا توسّع للمسار القديم:** أي endpoint جديد أو كتابة جديدة على `umrah_transport*` من routes العمرة → الـsmoke يفشل.
- **لا تسريب كتابة `transport_bookings`** من routes العمرة بدون عبور العقد.
- **لا تسريب العقد إلى الواجهة** (الواجهة تستهلك HTTP، لا تستورد engines).
- **لا تلوث `routes/umrah-entities.ts`** بكتابات `umrah_transport*` (يبقى المسار النظيف نظيفاً).

## ٧. ما لم يتغير

- صفر تعديل على `routes/umrah.ts` أو `routes/umrah-entities.ts`.
- صفر تعديل على `lib/umrahTransportContract.ts` أو أي engine أو fleet module.
- صفر تعديل على FE — `transport.tsx` و`calendar.tsx` و`reports/transport-requests.tsx` كما هي.
- صفر migrations، صفر تعديل صلاحيات.
- المسار القديم لا يزال يعمل بالكامل (التجميد لا يكسر؛ يمنع التوسّع فقط).

## ٨. الاختبارات

- **smoke جديد:** `umrahTransportBoundarySmoke.test.ts` — 10 invariants، 10/10 خضراء محلياً.
- **smoke قائم:** `umrahFinanceBoundarySmoke.test.ts` (U-01) — يبقى خضراء.
- **smokes/integration tests القائمة** غير ممسوسة (Margin VAT، Split، DimensionalRouting، PerLineVat، NuskPurchaseDimensions، CommissionViaHr، SettingsFinanceKnobs، OverstayPenalty، ServiceProducts، TwoLineInvoice، NuskPurchaseJE، CommissionViaHrJE، FullCycleE2E، Reports Catalog، Policies Catalog).

## ٩. المخاطر

| المخاطرة | احتمال | شدّة | تخفيف |
|---------|--------|------|--------|
| PR مستقبلي يحتاج فعلاً تعديل سطر كتابة على `umrah_transport*` (مثل bug fix) | منخفض-متوسط | منخفضة | الـsentinel يفشل وفي رسالته الترجمة لأي المعدِّل/المضيف ولماذا. تعديل سطر قائم (بدون زيادة العدد) لا يكسر الـregex — العدّ على نمط `INSERT INTO umrah_transport`/`UPDATE umrah_transport`/`DELETE FROM umrah_transport`، فتعديل المحتوى داخل العبارة لا يغيّر العدد |
| ظنّ خاطئ بإغلاق نهائي للنقل بينما المسار القديم لا يزال هو الافتراضي على الواجهة | عالي | متوسطة | التقرير ينصّ صراحةً على أن هذا تجميد لا إصلاح، وأن إغلاق المسار القديم يحتاج إذناً منفصلاً |
| تفسير خاطئ للقراءات الصحيحة على أنها انتهاكات | منخفض | منخفضة | الـsmoke يستثني `reports/transport-requests.tsx` صراحةً (قراءة العقد للتقرير مسار صحيح) |

## ١٠. خطة الرجوع (Rollback)

PR وثائقي + ملف test جديد فقط. الرجوع: `git revert` لـcommit واحد. لا أثر بيانات، لا أثر تشغيلي، لا تغيير في الـAPI surface.

## ١١. ما يُقترح لاحقاً (يتطلب إذناً منفصلاً)

تُسجَّل كمهمة U-02b في الحزمة العامة عند طلبك:

1. تحويل صفحة `pages/umrah/transport.tsx` لاستهلاك endpoint العقد بدل `/umrah/transport` (مع backfill طبقات الواجهة المطلوبة).
2. تجريد المسار القديم تدريجياً (تعطيل endpoints مع إبقاء جدوله للقراءة الأرشيفية).
3. تصفية ربط GL على `sourceType: "umrah_transport"` من `lib/engines/umrahEngine.ts` بعد تأكيد عدم استخدام أي قيود تاريخية تعتمد على هذا المسار.

كلها خارج إذن U-02. التقرير يوضّح الترتيب فقط.

## ١٢. مرجعية

- المهمة: #2080 (الموجة 1، U-02)
- الميثاق: #1870 §7 (عقد خدمة النقل) · #2071 (Service Boundary Lock)
- المرتبط: #1902 (محرك النقل + `transport_bookings`)
- السياق المالي المنجز: #2016 · #2025 · #2027 · #2031 · #2035 · #2084
- U-01 المرفق: تقرير قفل الحدود المالية + smoke
