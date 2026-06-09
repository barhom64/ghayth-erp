# دليل تفعيل خرائط Google Maps في غيث

> هذا الدليل للمالك أو مدير النظام. الكود جاهز بالكامل — هذا الدليل
> يوضح الخطوات التشغيلية المطلوبة (فتح حساب Google Cloud + ربط
> البطاقة + تفعيل APIs) قبل أن تعمل الخرائط الحقيقية.

## ماذا يعمل الآن (بدون إعداد)

عند استخدام النظام دون مفتاح Google API، تعمل الخرائط بمزوّد
`manual_only` الافتراضي:

- ✅ تقدير المسافة (Haversine + معامل تفاف 1.3)
- ✅ تقدير المدة (مبني على `defaultDeadheadKmh` من إعدادات التخطيط)
- ✅ روابط الخرائط الخارجية في تطبيق السائق (Google Maps Universal Link)
- ❌ لا يوجد geocoding (تحويل عنوان → إحداثيات)
- ❌ لا يوجد place_id (معرّف فريد للموقع)
- ❌ التقديرات تظهر للمستخدم بشارة "تقدير تقريبي"

## ماذا يضيف Google Maps الحقيقي

- ✅ تقدير دقيق للمسافة والمدة (مبني على شبكة طرق Google + حركة المرور)
- ✅ Geocoding كامل: اكتب "فندق هيلتون مكة" واحصل على lat/lng + place_id
- ✅ Reverse Geocoding: حوّل إحداثيات → عنوان مقروء
- ✅ Distance Matrix لاحتساب أوقات وصول دقيقة في `MapsService.estimateRoute`
- ✅ شارات "دقيق" بدل "تقدير تقريبي" في الشاشات

## ⚠️ مهم: التكاليف

| API | السعر التقريبي (2026) | حدّ مجاني شهري |
|-----|----------------------|----------------|
| Distance Matrix | $5 / 1000 طلب | $200 رصيد شهري مجاني |
| Geocoding | $5 / 1000 طلب | يدخل في $200 المجاني |
| Reverse Geocoding | $5 / 1000 طلب | يدخل في $200 المجاني |

غيث يخزّن نتائج الخرائط في `transport_route_estimates` لمدة 24 ساعة
(قابل للتعديل في إعدادات التخطيط) — فالطلب المكرّر في نفس النافذة
الزمنية لا يُفوتر مرّتين.

## خطوات الإعداد (مرّة واحدة لكل شركة)

### 1. أنشئ مشروع Google Cloud

1. اذهب إلى https://console.cloud.google.com
2. أنشئ مشروعاً جديداً (اسمه مثلاً: `ghayth-erp-maps`)
3. تأكّد من اختيار المشروع في القائمة العلوية

### 2. فعّل APIs المطلوبة

من قائمة "APIs & Services" → "Library":
1. **Distance Matrix API** — لتقدير المسافة والمدة
2. **Geocoding API** — لتحويل عنوان → إحداثيات
3. (اختياري) **Maps JavaScript API** — لعرض الخرائط في الواجهة

اضغط "Enable" لكل واحد.

### 3. اربط بطاقة الفواتير

1. من قائمة "Billing" → "Link a billing account"
2. أدخل بيانات بطاقة الائتمان
3. الـ $200 الشهري المجاني يكفي ~40,000 طلب — للاستخدام التشغيلي
   العادي لشركة نقل متوسطة، التكلفة الفعلية تكون صفر.

### 4. أنشئ مفتاح API

1. من "APIs & Services" → "Credentials"
2. اضغط "Create Credentials" → "API Key"
3. انسخ المفتاح (يبدأ بـ `AIza...`)

### 5. قيّد المفتاح (مهم للأمان)

من شاشة تعديل المفتاح:

1. **Application restrictions**:
   - اختر **"HTTP referrers (web sites)"**
   - أضف نطاق غيث (مثل: `https://app.ghayth.sa/*`)
   - هذا يمنع أي موقع آخر من استخدام مفتاحك حتى لو سُرّب

2. **API restrictions**:
   - اختر **"Restrict key"**
   - فعّل فقط:
     - Distance Matrix API
     - Geocoding API
   - هذا يمنع استخدام المفتاح لخدمات Google أخرى

### 6. أدخل المفتاح في غيث

1. اذهب إلى `/admin/transport-planning-settings`
2. في حقل **"مفتاح API"** الصق المفتاح
3. غيّر **"مزوّد الخرائط"** إلى **"Google Maps"**
4. اضغط حفظ
5. اضغط **"فحص الاتصال"** — يجب أن تظهر علامة ✅ خضراء

## التحقق من العمل

بعد الإعداد، افتح حجزاً أي وستلاحظ:
- في شاشة "اقترح إسناداً": المسافات تظهر بدون شارة "تقريبي"
- في تأكيد الحجز: المسافة والمدة دقيقة
- محرك الترتيب يستخدم المسافة الفعلية في معامل `distance` (وزن 0.5)

## الرجوع للوضع الافتراضي

في أي وقت يمكنك:
1. تغيير المزوّد إلى `manual_only` في إعدادات التخطيط
2. أو حذف المفتاح (يبقى المزوّد google_maps لكن النظام يتراجع تلقائياً
   لـ manual_only ويُسمّي النتائج "تقريبية")

النظام مصمّم بحيث **لا يفشل أبداً** عند مشاكل المزوّد — كل خطأ Google
(timeout / quota / bad key) يؤدي إلى رجوع شفّاف لـ manual_only.

## بدائل Google Maps

نفس المخطط جاهز لـ Mapbox و HERE Maps في `mapsService.ts`، فقط
ينتظر تنفيذ المزوّد المكافئ في `mapsHereProvider.ts` و
`mapsMapboxProvider.ts`. اختر Google الآن لأنّه:
- الأرخص (رصيد $200 مجاني)
- الأشمل في تغطية السعودية
- لديه Arabic language support كامل

## ربط الكود → الإعداد

| ملف | الدور |
|-----|------|
| `artifacts/api-server/src/lib/fleet/mapsService.ts` | الواجهة الموحّدة — لا يستدعي Google مباشرة |
| `artifacts/api-server/src/lib/fleet/mapsGoogleProvider.ts` | تطبيق Google الحقيقي |
| `artifacts/api-server/src/routes/transport-planning.ts` | endpoint الفحص الصحّي |
| `transport_planning_settings.mapProvider` | اختيار المزوّد لكل شركة |
| `transport_planning_settings.mapProviderApiKey` | المفتاح لكل شركة |
| `process.env.GOOGLE_MAPS_API_KEY` | fallback للنشر أحادي المستأجر |
| `transport_route_estimates` | جدول التخزين المؤقت (24h افتراضياً) |
