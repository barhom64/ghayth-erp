# أمر بناء تطبيق غيث للجوال — للمطوّر (أندرويد + iOS)

> **كل الكود جاهز ومدموج في `main`.** التطبيق يلفّ نفس موقع الويب (Capacitor) —
> **لا تكتب أي كود واجهة.** مهمتك: البناء، التوقيع، الاختبار. iOS وأندرويد
> يستخدمان **نفس الكود** — الاختلاف الوحيد هو أدوات البناء.

---

## المتطلبات المشتركة (مرة واحدة)
- **Node 20+** و **pnpm** مثبّتان.
- استنساخ المستودع وتثبيت الحزم من الجذر:
  ```bash
  git clone <repo-url> ghayth-erp && cd ghayth-erp && pnpm install
  ```
- **HTTPS إلزامي:** مرّر `VITE_API_ORIGIN=https://<خادمك>` في كل بناء — أندرويد
  يحجب `http://` افتراضيًا، وتحديد الموقع يتطلب سياقًا آمنًا.

---

## أندرويد (يُبنى على Linux / Replit / ويندوز + Android Studio)

```bash
cd artifacts/ghayth-erp
VITE_API_ORIGIN=https://hr.door.sa bash ../../scripts/mobile/build-android.sh
```
الناتج: `artifacts/ghayth-erp/android/app/build/outputs/apk/debug/app-debug.apk`
→ ثبّته على جوال أندرويد واختبر القائمة أدناه.

> **لإصدار المتجر الموقّع (AAB لـGoogle Play):** انظر قسم
> [«إصدار موقّع للمتجر»](#-إصدار-موقّع-للمتجر-release) أدناه.

---

## iOS / آيفون (يُبنى على **ماك فقط** — قيد Apple)

**يتطلب:** macOS + Xcode + CocoaPods + حساب Apple Developer.

```bash
cd artifacts/ghayth-erp
VITE_API_ORIGIN=https://hr.door.sa bash ../../scripts/mobile/build-ios.sh
npx cap open ios
```
ثم في Xcode:
1. **Signing & Capabilities** → اختر فريقك (Apple Developer).
2. أضِف أذونات الموقع في `Info.plist` (السكربت يطبعها).
3. **Run** على آيفون، أو **Product › Archive** للرفع إلى TestFlight / App Store.

> **لماذا ماك فقط؟** Apple تمنع بناء iOS على غير macOS. **الكود يدعم iOS
> بالكامل** (نفس المصادقة والتتبع الخلفي والدفع اللحظي) — القيد على الأداة لا
> على نظامنا.

### iOS بلا ماك فيزيائي — خدمات بناء سحابية
لو لا تملك ماك، تبني iOS عن بُعد عبر خدمة CI سحابية فيها ماكات Apple:

| الخدمة | كيف |
|--------|-----|
| **Codemagic** | اربط المستودع → يضيف `codemagic.yaml` → يبني iOS + أندرويد على ماك سحابي ويوقّع تلقائيًا (يحتاج شهادات Apple Developer مرفوعة). الأبسط لـCapacitor. |
| **Ionic Appflow** | خاص بـCapacitor/Ionic — بناء iOS سحابي + توزيع. |
| **GitHub Actions** `macos-latest` | runner ماك مجاني (للعام) — workflow يشغّل `build-ios.sh` ثم `xcodebuild archive`. |
| **EAS Build** (Expo) | يبني iOS سحابيًا؛ يصلح مع Capacitor بإعداد. |
| **MacStadium / ماك مستأجَر** | ماك حقيقي بالساعة/الشهر تبني عليه يدويًا. |

**في كل الحالات:** تظل تحتاج **حساب Apple Developer** ($99/سنة) لتوقيع التطبيق
ورفعه على App Store / TestFlight — هذا قيد Apple لا مفرّ منه.

---

## 🔐 إصدار موقّع للمتجر (release)

الأوامر أعلاه تبني `debug` (تثبيت مباشر للاختبار). للإصدار الموقّع الموجّه للمتجر
مرّر `BUILD_MODE=release` — السكربتات تتكفّل بالباقي.

### أندرويد — AAB لـGoogle Play (+ APK موقّع)
```bash
cd artifacts/ghayth-erp
BUILD_MODE=release \
  KEYSTORE_PATH=/path/to/ghayth.jks \
  KEYSTORE_PASSWORD=*** KEY_ALIAS=ghayth KEY_PASSWORD=*** \
  VITE_API_ORIGIN=https://hr.door.sa bash ../../scripts/mobile/build-android.sh
```
الناتج:
- `android/app/build/outputs/bundle/release/app-release.aab` ← ارفعه على **Google Play Console**
- `android/app/build/outputs/apk/release/app-release.apk` ← تثبيت مباشر موقّع

> أنشئ ملف التوقيع **مرة واحدة** واحفظه بأمان (فقدانه يمنع تحديث التطبيق لاحقًا):
> ```bash
> keytool -genkey -v -keystore ghayth.jks -keyalg RSA -keysize 2048 \
>   -validity 10000 -alias ghayth
> ```

### iOS — أرشفة + IPA موقّع (على ماك)
```bash
cd artifacts/ghayth-erp
BUILD_MODE=release \
  EXPORT_OPTIONS_PLIST=/path/to/ExportOptions.plist \
  DEVELOPMENT_TEAM=ABCDE12345 \
  VITE_API_ORIGIN=https://hr.door.sa bash ../../scripts/mobile/build-ios.sh
```
الناتج: `ios/build/ipa/*.ipa` — ارفعه عبر **Transporter** أو `xcrun altool`. يتطلب
`ExportOptions.plist` فيه `method=app-store` و`teamID`. (بدون `BUILD_MODE=release`
يُجهّز المشروع ويفتح Xcode للتوقيع اليدوي كما في القسم أعلاه.)

---

## ⚠️ مهم قبل البناء
- **عنوان الخادم:** مرّر `VITE_API_ORIGIN=https://<خادمك>` دائمًا، وإلا لن يصل
  التطبيق للبيانات.
- **للإنتاج خلف proxy/nginx:** أضِف `proxy_buffering off;` لمسار
  `/api/realtime/stream` (الدفع اللحظي يحتاج بثًّا غير مخزَّن).

---

## ✅ قائمة الاختبار (نفسها للمنصتين)
- [ ] تسجيل الدخول (يستخدم مسار Bearer تلقائيًا)
- [ ] البيانات تظهر في كل الشاشات (تصل للخادم)
- [ ] الإنشاء / التعديل / الحذف يعمل (لا أخطاء 403)
- [ ] التنزيل / الطباعة / التصدير يعمل
- [ ] التتبع الميداني يستمر والشاشة مقفولة («رفيق الميدان»)
- [ ] الدفع اللحظي: غيّر شيئًا من الويب → يظهر في التطبيق بلا تحديث
- [ ] بعد ٢٠ دقيقة استخدام: الجلسة والدفع اللحظي ما زالا يعملان

---

## ⚠️ تحقّقات إلزامية تُكشف **فقط على الجهاز** (راجعها أولًا)
هذه السيناريوهات لا تظهر في بناء/اختبار الويب — تأكّد منها صراحةً على جوال:

1. **الشاشة ليست بيضاء بعد الفتح.** لو بيضاء → `webDir` لا يطابق مخرجات Vite
   (يجب `dist/public`) أو `BASE_PATH` غير `/`. (مضبوطان في السكربتات؛ تحقّق لو
   عدّلت يدويًا.)
2. **التتبع الخلفي يعمل فعلًا والشاشة مقفولة.** الجسر يقرأ الـplugin من
   `window.Capacitor.Plugins.BackgroundGeolocation`. تأكّد أن الـplugin
   مُسجَّل بعد `cap sync` — لو لم يُسجَّل، يسقط التطبيق صامتًا لمسار المتصفح
   (يتطلب شاشة مفتوحة، لا يتتبّع بالخلفية). راقب سجلّ `field_tracking_pings`
   والشاشة مقفولة.
3. **أذونات الموقع «دائمًا» مُمنوحة.** أندرويد ١٠+ يتطلب موافقة المستخدم
   صراحةً على «السماح طوال الوقت»؛ iOS يتطلب
   `NSLocationAlwaysAndWhenInUseUsageDescription` + `UIBackgroundModes:location`.
4. **الدفع اللحظي يبقى حيًّا بعد ١٥ دقيقة + انقطاع شبكة قصير** (انتهاء التوكن).
   أعِد الاتصال يتجدّد تلقائيًا — راقب أن التغييرات تظل تظهر بعد فترة خمول.
5. **الخادم HTTPS** (لا cleartext). أندرويد يحجب `http://` افتراضيًا، وتحديد
   الموقع يتطلب سياقًا آمنًا — `VITE_API_ORIGIN` يجب أن يكون `https://`.

> إن مرّت هذه الخمسة على جهاز فعلي → الترابط مُثبَت قطعيًا (لا بالكود فقط).

---

## المرجع الكامل
- `docs/mobile/README.md` — تفاصيل أوامر البناء.
- `docs/MOBILE_NATIVE_PARITY.md` — كيف يطابق التطبيق الويب (API، CORS، Bearer،
  CSRF، الدفع اللحظي) وما الحُرّاس التي تمنع تكرار العيوب.
