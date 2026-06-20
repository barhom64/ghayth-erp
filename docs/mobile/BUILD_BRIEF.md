# أمر بناء تطبيق غيث للجوال — للمطوّر (أندرويد + iOS)

> **كل الكود جاهز ومدموج في `main`.** التطبيق يلفّ نفس موقع الويب (Capacitor) —
> **لا تكتب أي كود واجهة.** مهمتك: البناء، التوقيع، الاختبار. iOS وأندرويد
> يستخدمان **نفس الكود** — الاختلاف الوحيد هو أدوات البناء.

---

## أندرويد (يُبنى على Linux / Replit / ويندوز + Android Studio)

```bash
cd artifacts/ghayth-erp
VITE_API_ORIGIN=https://hr.door.sa bash ../../scripts/mobile/build-android.sh
```
الناتج: `artifacts/ghayth-erp/android/app/build/outputs/apk/debug/app-debug.apk`
→ ثبّته على جوال أندرويد واختبر القائمة أدناه.

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

## المرجع الكامل
- `docs/mobile/README.md` — تفاصيل أوامر البناء.
- `docs/MOBILE_NATIVE_PARITY.md` — كيف يطابق التطبيق الويب (API، CORS، Bearer،
  CSRF، الدفع اللحظي) وما الحُرّاس التي تمنع تكرار العيوب.
