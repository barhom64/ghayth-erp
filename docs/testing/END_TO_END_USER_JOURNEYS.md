# رحلات المستخدم من البداية للنهاية — Ghayth ERP

> **النوع**: تتبع كل خطوة لرحلة مستخدم حقيقية في الكود، من ضغطة الزر الأولى حتى آخر تأثير في القيود/التقارير.
> **التاريخ**: 2026-05-29
> **الحدود**: تتبع كود ساكن، ليس اختبار يدوي. كل رقم سطر دقيق، كل سيناريو مدعوم بدليل.

---

## رحلة #1: تأسيس الشركة من الصفر (First-Time Setup)

**السيناريو**: مالك شركة جديدة (إبراهيم) يفتح النظام لأول مرة. PostgreSQL فارغة. `SEED_DEMO_DATA=false`.

### الخطوات المتوقعة

| الخطوة | الإجراء المتوقع | النتيجة الفعلية |
|---|---|---|
| 1 | الذهاب لـ `/` | يفتح صفحة Login فقط (`login.tsx:316`) |
| 2 | البحث عن "إنشاء شركة" أو "تسجيل" | **مفقود** — لا يوجد رابط |
| 3 | استخدام "نسيت كلمة المرور" | يفتح طلباً موجهاً لـ"مدير النظام" — لا يوجد مدير بعد |
| 4 | تجربة `POST /auth/register` يدوياً | يرد **HTTP 405**: `"إنشاء الحسابات يتم بواسطة المسؤول فقط"` (`auth.ts:231`) |

### النتيجة
🚨 **BLOCKER** — المالك **لا يستطيع** تشغيل النظام دون مطور. الـserver-side `bootstrapAdminUser()` يخرج مباشرة عند رؤية `companies` فارغة (`bootstrapAdmin.ts:156-157`)، فلا يُنشأ أي owner.

### المسار الوحيد الناجح (يحتاج مطور)
1. مطور يشغل `db/seed-admin-user.sql` يدوياً
2. مطور يضبط `SEED_DEMO_DATA=true` ويعيد تشغيل الـapi-server
3. النظام يُنشئ `owner@local.test / Test1234!` (أو `admin@ghayth.com / Admin@123456`)
4. المالك يدخل بهذه البيانات
5. يذهب لـ `/settings/companies` → ينشئ شركته
6. الـ`bootstrapCompany()` ينفذ ويُنشئ: فرع افتراضي، 10 أنواع إجازات، 26 حساب CoA، 6 أدوار، 8 numbering prefixes، 120+ setting

### التوصية
**قبل الإطلاق التجاري**: يجب بناء:
1. واجهة sign-up حقيقية (form ينشئ owner + company في عملية واحدة)
2. وحدة subscription/trial activation
3. صفحة "أول مرة تستخدم النظام" تشرح الخطوات

---

## رحلة #2: إنشاء موظف ومستخدم له

**السيناريو**: System Admin يريد إضافة موظف للشركة وإنشاء حساب له.

### الخطوات

| الخطوة | الموقع | الحالة |
|---|---|---|
| 1 | فتح `/admin/users` → "إضافة مستخدم" | ✅ |
| 2 | في النموذج: يطلب اختيار `employeeId` من قائمة | ⚠ يحتاج موظف موجود مسبقاً |
| 3 | لا يوجد رابط "إنشاء موظف جديد" من هذه الصفحة | 📝 MINOR — تجربة مستخدم محبطة |
| 4 | المستخدم يجب أن يذهب يدوياً لـ `/employees` أولاً | يحتاج معرفة الترتيب |
| 5 | بعد إنشاء الموظف، يعود لـ `/admin/users` ويختاره | ✅ ينجح |

### الكود ذو الصلة
- `admin.ts:200-205`: validates employeeId belongs to company
- `users-tab.tsx:46`: queries `/employees?limit=200` فقط — لا يفتح modal إنشاء

### التوصية
إضافة "إنشاء موظف جديد" inline modal في users-tab.

---

## رحلة #3: دفعة إيجار → قيد محاسبي → ظهور في الميزانية

**السيناريو**: Property Manager يستلم دفعة إيجار نقدية، يسجلها في النظام، يتوقع ظهورها في:
- صفحة الدفعات المستلمة
- قيد دائن في الإيرادات
- التقارير المالية

### تتبع الكود (REAL ✅)

| # | الخطوة | الكود |
|---|---|---|
| 1 | Manager يفتح `/properties/payments` → "تسجيل دفعة" | `properties-payments.tsx` |
| 2 | يملأ النموذج، يضغط "حفظ" | يستدعي `POST /properties/payments/:id/pay` |
| 3 | Backend يفتح `withTransaction` ويلتقط `SELECT … FOR UPDATE` على الـrent_payment | `properties.ts:1929-1942` |
| 4 | يتحقق من حالة العقد (لا يقبل إذا غير active/draft) | `properties.ts:1960` |
| 5 | **قبل** تحديث الـpayment، يستدعي `propertiesEngine.postRentRevenueGL()` | `properties.ts:1978` |
| 6 | الـGL engine يُنشئ JE: Dr 1100 (Cash) Cr 4100 (Rent Revenue) | `propertiesEngine.ts` |
| 7 | إذا JE فشل → `IntegrationError` → الـtransaction يُلغى كاملاً | `properties.ts:1986-1990` |
| 8 | إذا نجح → يحدث `rent_payments` ويكتب `notes = '… JE#' || journalEntryId` | `properties.ts:1993-2003` |
| 9 | بعد commit: `emitEvent("rent_payment.received")` + `createAuditLog` | `properties.ts:2010-2020` |

### تحقق المعايير الـ8

| المعيار | الحالة |
|---|---|
| 1. تمت من الواجهة | ✅ |
| 2. حفظت البيانات | ✅ |
| 3. أمكن استرجاعها | ✅ |
| 4. ظهرت في التقارير | ✅ |
| 5. سجل لها Audit | ✅ |
| 6. أنتجت Event | ✅ |
| 7. احترمت الصلاحيات | ✅ `properties.payments` |
| 8. أثرت على الحالة التشغيلية | ✅ JE محكم |

**النتيجة**: **رحلة مثالية** — أقوى مسار في النظام كله. dual-entry محفوظ، لا cash بدون GL، transaction-safe.

---

## رحلة #4: عمليات أسطول — رحلة مكتملة

**السيناريو**: Fleet Manager يفتح رحلة، يسجل وقود، يقفل الرحلة.

### المسار

1. **إنشاء رحلة**: `POST /fleet/trips` (`fleet.ts:963`) → REAL
2. **تسجيل وقود أثناء الرحلة**: `POST /fleet/fuel-logs` (`fleet.ts:2096`)
   - يُنشئ `fleet_fuel_logs`
   - يستدعي `fleetEngine.postFuelExpenseGL`: Dr 5200 (Fuel) Cr 1100 (Cash)
   - **الـGL غير مغلق-محكم** (`.catch(...)` non-blocking) — قد يحفظ fuel log بدون JE
3. **إقفال الرحلة**: `POST /fleet/trips/:id/complete` (`fleet.ts:1283`)
   - يحسب المسافة من mileage بداية/نهاية
   - يستدعي `postTripCompletionGL` ينشئ JE واحد بأربعة سطور: Fuel + Driver Fare + Depreciation + Cash
   - الـrates من `getFleetCostSettings`

### ⚠ المشكلة الحرجة: ازدواج الوقود

عند إقفال الرحلة، الـengine **يحسب وقود تقديري** بناء على المسافة وكفاءة المركبة:
```
fuelLiters = (distance / fuelEfficiency) * fuelPricePerLiter
```

هذا الحساب **يتم بشكل مستقل عن `fleet_fuel_logs`**. إذا سجل السائق دفعة وقود لهذه الرحلة، وعند الإقفال الـengine ضمّن تقدير الوقود — **يُسجَّل الوقود مرتين**.

**الأثر المحاسبي**: تضخم مصروف الوقود في الـGL.

### التوصية
- إما (a) ربط `fleet_fuel_logs.tripId` وخصم الـlogged_amount من الـtrip estimate
- أو (b) جعل الـtrip-complete يتحقق إذا كان هناك fuel logs ويتخطى الـestimate

(هذا الـbug جدير بـ`CRITICAL_DEFECTS_REPORT.md` كـMAJOR)

---

## رحلة #5: عمرة — فاتورة مبيعات → تحصيل → ميزان مراجعة

**السيناريو**: Umrah Manager يصدر فاتورة لوكيل فرعي، الوكيل يدفع، الـAR يقفل.

### المسار

1. **إصدار فاتورة المبيعات** (Sales Wizard): `pages/umrah/sales-wizard.tsx` → `POST /umrah/invoices/generate` → `umrah-entities.ts:1345`
   - يستدعي `umrahInvoicingEngine.ts:294-337` → `createGuardedJournalEntry`
   - JE: Dr 1200 (AR) / Cr 4200 (Revenue) / Cr 4210 (Penalty) / Cr 2160 (VAT)
   - كل سطر يحمل `umrahAgentId` + `umrahSeasonId` للـdrill-down
   - **BLOCKING** — إذا JE فشل، الفاتورة لا تُحفظ
2. **e-Invoice (ZATCA)**: يستدعي `getEInvoiceProvider(companyId).submit(...)`
   - الـdefault provider = `mock` (يرد cleared بدون شبكة)
   - ZATCA الحقيقي موجود في المسجل لكن opt-in
3. **تحصيل الدفعة**: `POST /umrah/payments` → `umrah-entities.ts:1436`
   - `registerPayment` (`umrahInvoicingEngine.ts:384`) → FIFO/explicit-id allocation
   - JE: Dr 1100/1110 (Cash) / Cr 1200 (AR) — `BLOCKING`
   - الـdimension `umrahAgentId` محفوظ

### النتيجة
✅ **مسار قوي** — sales invoice + payment كلاهما BLOCKING. إذا فشل GL، النظام لا يُحفظ.

**التحفظ الوحيد**: e-Invoice الـZATCA الافتراضي = mock. يجب على المالك تفعيل provider حقيقي قبل الإطلاق.

---

## رحلة #6: عقد إيجار → فاتورة → تحصيل → قيد

**السيناريو**: Property Manager ينشئ عقد إيجار جديد، الإيجار يولّد جدول دفعات، أول دفعة تُحصَّل.

### المسار

1. **إنشاء عقد إيجار**: `POST /properties/contracts` (`properties.ts:1026-1262`)
   - INSERT في `rental_contracts`
   - **يولّد** `contract_payment_schedule` و `rent_payments` (`properties.ts:1182-1190`)
   - **ينقل** حالة الـunit إلى `rented` عبر `applyTransition` (`:1196`)
   - **يُسجل** التزامات obligation للتجديد + الانتهاء (`:1211-1224`)
   - **يصدر** رقم العقد من numbering system (`:1140`)
   - state machine يمنع double-active على نفس الوحدة (`:1085-1100`)
2. **أول دفعة**: راجع رحلة #3 — مسار آمن
3. **تجديد العقد**: `POST /properties/contracts/:id/renew` (`properties.ts:1456`)
4. **إنهاء العقد**: `POST /properties/contracts/:id/terminate` (`properties.ts:1577`)

### النتيجة
✅ **مسار كامل ومحكم** — state machine + obligations + numbering + GL، الكل متكامل.

---

## رحلة #7: نظام صلاحيات — حماية أفقية

**السيناريو**: مستخدم في فرع الرياض يحاول رؤية بيانات فرع جدة.

### الحماية في النظام

1. **في الـbackend route**: كل query يُدخل `scope.allowedCompanies` أو `scope.companyId` كـfilter:
   ```sql
   WHERE "companyId" = ANY($1) AND ...
   ```
2. **في الـDB layer**: composite FK `(clientId, companyId) → clients(id, companyId)` يمنع cross-tenant linking على مستوى DB (PR #1402)
3. **في الـUI**: `<GuardedButton perm="...">` يُخفي الأزرار للمستخدم غير المخول

### الاختبار
- المستخدم في فرع الرياض يفتح `/properties/units` → يرى فقط وحدات `branchId IN allowedBranches`
- يحاول `GET /properties/units/123` حيث 123 في فرع جدة → backend يرد 404 (لا تسريب وجود/عدم وجود)
- يحاول modify endpoint → 403

### النتيجة
✅ **حماية متعددة الطبقات شاملة**.

---

## رحلة #8: تكامل HR → Payroll → GL (تنتظر تقرير الوكيل)

ينتظر تقرير HR/Finance audit agent.

---

## رحلة #9: تكامل Legal → Finance (تنتظر تقرير الوكيل)

ينتظر تقرير Legal/Comms audit agent.

---

## رحلة #10: موظف يطلب إجازة → اعتماد → خصم رصيد → تأثير راتب (تنتظر تقرير الوكيل)

ينتظر تقرير Legal/Comms/Docs/Employee audit agent.

---

## تحليل النتيجة الإجمالية

| الرحلة | الحالة | الـSeverity |
|---|---|---|
| 1. تأسيس الشركة من الصفر | 🚨 BLOCKER | — |
| 2. إنشاء موظف ومستخدم له | ⚠ MINOR (UX) | — |
| 3. دفعة إيجار → قيد | ✅ مثالي | — |
| 4. رحلة → وقود → إقفال | ⚠ MAJOR (ازدواج وقود) | — |
| 5. عمرة sales invoice + تحصيل | ✅ ممتاز | — |
| 6. عقد إيجار → فاتورة → تحصيل | ✅ ممتاز | — |
| 7. حماية أفقية متعددة الطبقات | ✅ شامل | — |
| 8-10. HR/Legal/Employee | ⏳ تنتظر الوكلاء | — |

**النتيجة الجزئية**: المسارات التشغيلية المنفذة قوية ومحكمة. المشاكل في:
1. غياب الـonboarding بالكامل (BLOCKER قبل الإطلاق)
2. ازدواج وقود الأسطول (MAJOR)

---

*وثيقة 3/7 من برنامج اختبار التشغيل الكامل لنظام غيث ERP.*
