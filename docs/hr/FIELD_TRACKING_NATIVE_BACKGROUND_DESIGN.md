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
- ✅ **الأساس backend**: التوكن المحدود + الحارس المركزي + endpoint الإصدار + اختبارات.
- ✅ **تحسين المتصفح**: `field-companion.tsx` يستخدم Wake Lock (يمنع قفل الشاشة) + تحذير عند إخفاء الصفحة. يعمل للموظف المتعاون الذي يُبقي الصفحة مفتوحة.
- ✅ **جسر Capacitor (كود)**: `lib/field-tracking-native.ts` — خامل على الويب (dynamic import بـ@vite-ignore)، ينشط داخل التطبيق الأصلي فيرسل الموقع الخلفي إلى `/my/field/ping` بتوكن Bearer. `field-companion` يجرّب الأصلي أولاً ثم يسقط لمسار المتصفح.
- ✅ **`capacitor.config.ts`**: جاهز (appId `sa.door.ghayth`، webDir `dist`).
- ⏳ **بناء التطبيق الأصلي**: الخطوات أدناه — تُنفَّذ على Replit/ماك/أندرويد ستوديو.

---

## 7. خطوات البناء على الجوال (تُنفَّذ خارج هذه البيئة)

```bash
# 1) تثبيت Capacitor + plugin التتبع الخلفي (MIT مجاني)
cd artifacts/ghayth-erp
pnpm add @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios \
         @capacitor-community/background-geolocation

# 2) بناء الويب ثم توليد المشاريع الأصلية
pnpm build                       # ينتج dist/ (webDir في capacitor.config.ts)
npx cap add android
npx cap add ios                  # iOS يتطلب ماك + Xcode
npx cap sync

# 3) أصل الـAPI للتطبيق الأصلي (الحزمة محلية، فالمسار النسبي لا يكفي)
#    اضبط قبل البناء:  VITE_API_ORIGIN=https://hr.door.sa

# 4) الأذونات الأصلية
#    android/app/src/main/AndroidManifest.xml:
#      <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
#      <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
#      <uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
#      <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
#    ios/App/App/Info.plist:
#      NSLocationAlwaysAndWhenInUseUsageDescription / NSLocationWhenInUseUsageDescription
#      UIBackgroundModes → location

# 5) التشغيل/البناء
npx cap open android             # Android Studio → Run/Build APK
npx cap open ios                 # Xcode → Run/Archive
```

> **ملاحظة Replit:** بيئة الجوال على Replit تكفي لبناء **أندرويد** (الأقوى
> للتتبع الخلفي). iOS يتطلب ماك + Xcode + حساب Apple Developer لمراجعة
> «الموقع: دائمًا».

### بعد التثبيت — لا تغيير على الكود
`field-tracking-native.ts` يكتشف وجود `window.Capacitor` تلقائيًا. فور بناء
التطبيق وتثبيت الـplugin، يتحوّل `field-companion` للمسار الأصلي بلا أي
تعديل إضافي — الكود جاهز ومنتظِر الطبقة الأصلية.
