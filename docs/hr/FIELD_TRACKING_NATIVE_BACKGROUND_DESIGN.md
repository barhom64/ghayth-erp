# التتبع الميداني الخلفي عبر تطبيق أصلي (Capacitor) — تصميم

> **الدافع:** التتبع الحالي (`/my/field` PWA) يعتمد على `setInterval` +
> `getCurrentPosition` داخل صفحة ويب. متصفحات الجوال **تُجمّد JavaScript
> للتبويب غير النشط** عند مغادرة الصفحة/قفل الشاشة — فيتوقف الإرسال. هذا
> قيد منصة لا خلل برمجي؛ التتبع الخلفي الحقيقي يتطلب طبقة أصلية.
>
> **المبدأ الحاكم:** لا محرّك تتبع جديد. نلفّ كود React الحالي بالكامل في
> Capacitor، ويرسل plugin أصلي إلى **نفس** `POST /api/my/field/ping`
> الموجود (dedup + throttle + سياسة الفئة بلا أي تغيير).

---

## 1. المعمارية

```
تطبيق Capacitor
├── WebView  ← تطبيقكم كما هو (لا تعديل UI)
└── Native Background Geolocation Plugin
      • foreground service (أندرويد) / significant-change (iOS)
      • يلتقط الموقع والتطبيق مقفول أو مُنهى
      • POST /api/my/field/ping  مع  Authorization: Bearer <field-token>
                    │ HTTPS
                    ▼
        نفس الـAPI — منطق الـping بلا لمس
```

---

## 2. المصادقة — الأساس المُنفَّذ في هذا الـPR ✅

الـplugin يرسل HTTP من الطبقة الأصلية، **لا يرى كوكيز الـWebView**. ومن
الخطر تسليمه جلسة كاملة تبقى ساعات على الجهاز. الحل: **توكن محدود النطاق**.

### المُنفَّذ الآن (backend foundation)
- **`signFieldTrackingToken()`** (`lib/auth.ts`): JWT يحمل `scope:"field_tracking"`
  وصلاحية أطول (افتراضي ١٢ ساعة، `FIELD_TRACKING_TOKEN_TTL_HOURS`،
  مقيّدة [١..٢٤]).
- **`authMiddleware`**: أي توكن بـ`scope:"field_tracking"` **يُرفض على كل
  مسار** عدا `/my/field/ping` (قائمة `FIELD_TRACKING_ALLOWED_PATHS`) بـ
  `403 TOKEN_SCOPE_FORBIDDEN`. فالتوكن لا يفتح بقية الـAPI أبداً.
- **`POST /my/field/tracking-token`**: محمي بنفس صلاحية الـping
  (`hr.attendance.checkin:create`)؛ يُصدر التوكن **فقط** لموظف تُتعقّبه
  سياسة الفئة (المكتبي/المدير يأخذ ٤٠٣ لا توكن). يرجّع
  `{ token, expiresAt, minIntervalSeconds, categoryKey }`.
- **`authMiddleware` يقبل `Authorization: Bearer` أصلاً** (موجود مسبقاً) —
  فلا تغيير على endpoint الـping.

### دورة حياة التوكن في الجوال
1. الـWebView (جلسة كاملة) ينادي `POST /my/field/tracking-token`.
2. يحقن `token` في إعداد الـplugin.
3. الـplugin يرسل pings بـBearer حتى والتطبيق مغلق.
4. قبل انتهاء الصلاحية، الـWebView يجدّد التوكن ويعيد الحقن.

---

## 3. الخطوات المتبقية (جوال — خارج هذا الـPR)

| # | الخطوة | المخرج |
|---|--------|--------|
| 1 | `npx cap init` + `cap add android/ios` | يلفّ الـbuild الحالي |
| 2 | تثبيت plugin التتبع (`@transistorsoft/...` تجاري الأقوى، أو `@capacitor-community/background-geolocation` مجاني) | محرّك خلفي |
| 3 | أذونات: `ACCESS_BACKGROUND_LOCATION` / `NSLocationAlwaysUsageDescription` | إذن «دائماً» |
| 4 | كود جسر في `field-companion.tsx`: `Capacitor.isNativePlatform()` → plugin؛ غيره → `setInterval` الحالي (fallback) | تدرّج سلس |
| 5 | بناء/توقيع/رفع TestFlight + Play Internal | نسخة تجريبية |

### كود الجسر (مفهوم)
```ts
if (Capacitor.isNativePlatform()) {
  const { token } = await apiFetch("/my/field/tracking-token", { method: "POST" });
  await BackgroundGeolocation.ready({
    desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
    distanceFilter: 25,
    url: `${API_BASE}/api/my/field/ping`,
    headers: { Authorization: `Bearer ${token}` },
    locationTemplate: '{"lat":<%= latitude %>,"lng":<%= longitude %>,"capturedAt":"<%= timestamp %>","source":"native"}',
    stopOnTerminate: false,
    startOnBoot: true,
    foregroundService: true,
  });
  await BackgroundGeolocation.start();
} else {
  // المتصفح: السلوك الحالي بالضبط (setInterval) — fallback
}
```

---

## 4. ما لا يُلمَس
- منطق `/my/field/ping` (dedup `(assignmentId, capturedAt)` + throttle + سياسة الفئة).
- `/eligibility` و`/my/field/tracking-token` يشتركان في نفس مصدر السياسة.
- صفحة العرض `field-tracking` (خريطة Haversine).
- بقية التطبيق داخل الـWebView.

---

## 5. القيود الصادقة
- **iOS** يقيّد التتبع الخلفي (motion-based)؛ الـplugin التجاري يديره لكن قد تقلّ الدقة عند الثبات الطويل.
- **مراجعة المتجر** تتطلب تبرير إذن «الموقع دائماً» + سياسة خصوصية.
- **البطارية**: `distanceFilter` + motion-detection يخففان الاستهلاك.

---

## 6. حالة التنفيذ
- ✅ **الأساس backend** (هذا الـPR): التوكن المحدود + الحارس المركزي + endpoint الإصدار + اختبارات.
- ⏳ **طبقة Capacitor + الجسر**: PR لاحق (يتطلب بيئة بناء جوال).
