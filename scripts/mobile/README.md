# تطبيق غيث للجوال — النظام الكامل (Capacitor)

تطبيق أندرويد/iOS أصلي يحتوي **النظام كامل** (كل المسارات والصفحات كما هي على
الويب)، مع **التتبع الميداني الخلفي** الأصلي. التطبيق يلفّ نفس كود الويب — أي
تحديث على الويب يظهر في التطبيق بعد إعادة المزامنة (`cap sync`).

---

## بناء أندرويد — أمر واحد

على بيئة فيها Android SDK (Replit mobile / جهازك مع Android Studio):

```bash
bash scripts/mobile/build-android.sh
```

السكربت ينفّذ **كل شيء تلقائيًا**:
1. يثبّت Capacitor + plugin التتبع الخلفي
2. يبني النظام الكامل (`pnpm build` → `dist/public/`)
3. يولّد مشروع `android/`
4. يزامن الويب + الـplugins (`cap sync`)
5. يحقن أذونات الموقع الخلفي في AndroidManifest
6. يبني `app-debug.apk` (إن توفّر Android SDK)

الناتج: `artifacts/ghayth-erp/android/app/build/outputs/apk/debug/app-debug.apk`
— ثبّته على جوال الموظف (فعّل «تثبيت من مصادر غير معروفة»).

### أصل الـAPI
افتراضيًا التطبيق يتصل بـ`https://hr.door.sa`. لتغييره:
```bash
VITE_API_ORIGIN=https://your-server bash scripts/mobile/build-android.sh
```

### إصدار موقّع للمتجر (release)
السكربت يبني `debug` افتراضيًا (تثبيت مباشر). للإصدار الموقّع الموجّه لـGoogle Play
مرّر `BUILD_MODE=release` مع بيانات ملف التوقيع (keystore):
```bash
BUILD_MODE=release \
  KEYSTORE_PATH=/path/ghayth.jks KEYSTORE_PASSWORD=*** \
  KEY_ALIAS=ghayth KEY_PASSWORD=*** \
  bash scripts/mobile/build-android.sh
```
ينتج `bundle/release/app-release.aab` (لرفعه على Play Console) + APK موقّع. أنشئ
ملف التوقيع مرة واحدة عبر `keytool -genkey` واحفظه بأمان (فقدانه يمنع التحديثات لاحقًا).

---

## iOS (يتطلب ماك + Xcode + حساب Apple Developer)

```bash
cd artifacts/ghayth-erp
pnpm add @capacitor/core @capacitor/cli @capacitor/ios @capacitor-community/background-geolocation
BASE_PATH=/ VITE_API_ORIGIN=https://hr.door.sa pnpm build
npx cap add ios && npx cap sync ios
npx cap open ios   # Xcode → أضف أذونات الموقع في Info.plist ثم Run/Archive
```
أذونات iOS المطلوبة في `Info.plist`:
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- `NSLocationWhenInUseUsageDescription`
- `UIBackgroundModes` → `location`

---

## كيف يعمل التتبع الخلفي

- التطبيق يكتشف تلقائيًا أنه يعمل داخل Capacitor (`window.Capacitor`).
- صفحة «رفيق الميدان» تطلب توكن تتبع محدود النطاق (`POST /my/field/tracking-token`).
- plugin الموقع يسجّل watcher يبثّ الموقع حتى والتطبيق مقفول/مُصغَّر (foreground
  service)، ويرسل كل نقطة إلى `POST /my/field/ping` بتوكن Bearer.
- على المتصفح العادي يسقط تلقائيًا لمسار Wake Lock (يتطلب شاشة مفتوحة).

التفاصيل المعمارية الكاملة: `docs/hr/FIELD_TRACKING_NATIVE_BACKGROUND_DESIGN.md`.

---

## تحديث محتوى التطبيق لاحقًا

بعد أي تغيير على الويب:
```bash
cd artifacts/ghayth-erp
BASE_PATH=/ VITE_API_ORIGIN=https://hr.door.sa pnpm build && npx cap sync
```
ثم أعد بناء الـAPK. (المحتوى المحمَّل من الخادم يتحدّث فورًا بلا إعادة بناء.)
