# غيث ERP — تطبيق الجوال (ghayth-mobile)

عميل جوال (Expo / React Native) لنظام **غيث ERP**. التطبيق **عميل رفيع** (thin client):
كل المنطق والقرارات تمرّ عبر واجهة الـ API والمحركات (engines) القائمة في `artifacts/api-server`.
لا يُكرَّر أي منطق أعمال داخل التطبيق — الخادم هو المرجع النهائي للصلاحيات (RBAC) والتحقق.

## التشغيل

```bash
# من جذر المشروع
pnpm install
# يُدار عبر workflow في Replit (وليس pnpm dev مباشرة):
#   artifacts/ghayth-mobile: expo
```

المعاينة على المسار `/mobile/` عبر البروكسي الموحّد. لفحص الأنواع:

```bash
pnpm --filter @workspace/ghayth-mobile run typecheck
```

## متغيرات البيئة

| المتغير | الوصف | الافتراضي |
| --- | --- | --- |
| `EXPO_PUBLIC_API_DOMAIN` | **تجاوز صريح أعلى أولوية** لنطاق الـ API في بناء الإنتاج. اضبطه ليطابق نطاق الويب (`erp.door.sa`) كي يستهدف الجوال نفس الخلفية/قاعدة البيانات حتى عند البناء على Replit. | `erp.door.sa` (قيمة احتياطية في `scripts/build.js`) |
| `EXPO_PUBLIC_DOMAIN` | نطاق الـ API الذي يتصل به التطبيق (بدون مسار). يقرؤه `lib/api.ts` في وقت التشغيل. | نطاق Replit للتطوير |

يُبنى عنوان الـ API الأساسي من `EXPO_PUBLIC_DOMAIN` في `lib/api.ts`. كل المسارات تبدأ بـ `/api`.

**توحيد الخلفية (الجوال + الويب على نفس السيرفر):** يحلّ `scripts/build.js` نطاق البناء بالترتيب: `EXPO_PUBLIC_API_DOMAIN` ← متغيّرات Replit ← قيمة `erp.door.sa` الاحتياطية. لذا أيّ بناء إنتاجي (على Replit أو على الـ VPS) يحقن `erp.door.sa` في الحزمة، فيستخدم الجوال نفس بيانات الدخول وقاعدة البيانات كالويب. أمّا سكربت `dev` فيبقى على نطاق Replit المحلي للتطوير دون تغيير.

## المصادقة (Auth)

- تسجيل الدخول: `POST /api/auth/mobile/login` ‏`{ email, password }` → ‏`{ accessToken, refreshToken, userRoles, … }`.
- يُخزَّن `accessToken` + `refreshToken` في **SecureStore** (`lib/tokenStore.ts`).
- مصادقة **Bearer** على كل طلب عبر `lib/api.ts` (`apiFetch`).
- تجديد تلقائي عند 401 عبر `POST /api/auth/mobile/refresh` (single-flight: طلب تجديد واحد مشترك).
- استعادة الجلسة عند الإقلاع، وتوجيه `AuthGate` بين شاشة الدخول والتبويبات.
- تسجيل الخروج: `POST /api/auth/logout` ثم مسح SecureStore.
- تغيير كلمة المرور: `POST /api/auth/change-password` ‏`{ currentPassword, newPassword }`.

## التنقّل المبني على الصلاحيات (RBAC)

تُشتق الوحدات الظاهرة من `userRoles[].modules` (انظر `lib/modules.ts`):

- وحدات الخدمة الذاتية ظاهرة دائمًا (لوحة القيادة، مساحتي، الإشعارات).
- **مركز الاعتماد** و**التقويم الموحّد** يتطلبان مستوى إداري `level ≥ 20`
  (مطابق لـ `requireMinLevel(20)` في الخادم) — فلا يظهران للموظف العادي لتفادي زر يُرجِع 403.
- باقي الوحدات تظهر فقط عند وجود منحة (grant) مناسبة. الخادم يبقى المرجع النهائي.

## التصميم

- فرض **RTL** عربي (`I18nManager`) + `lang/dir=rtl` على الويب.
- ثيم فاتح/داكن تلقائي عبر `useColors()` (لوحة زمردي/تركوازي في `constants/colors.ts`).
- مكوّنات مشتركة في `components/ui.tsx`: ‏`Card, ListRow, DetailRow, SectionHeader, StatCard, Badge, EmptyState, ErrorState, LoadingState, FormField, AppButton`.
- جميع الشاشات تعرض حالات تحميل/خطأ/فراغ عربية مع زر إعادة المحاولة.

## حالة الوحدات (مُنجَز مقابل بانتظار التكامل)

| الوحدة | الشاشة | الحالة | نقاط الـ API |
| --- | --- | --- | --- |
| لوحة القيادة | `app/(tabs)/index.tsx` | ✅ مُنجَز | `GET /api/dashboard/summary` |
| مساحتي | `app/(tabs)/me.tsx` | ✅ مُنجَز | `GET /api/my-space` |
| الإشعارات | `app/(tabs)/notifications.tsx` | ✅ مُنجَز | `GET /api/notifications` · `PATCH /api/notifications/:id/read` |
| الملف الشخصي | `app/profile.tsx` | ✅ مُنجَز | `GET /api/auth/me` (من الجلسة) |
| تغيير كلمة المرور | `app/change-password.tsx` | ✅ مُنجَز | `POST /api/auth/change-password` |
| الحضور | `app/hr/attendance.tsx` | ✅ مُنجَز | `GET /api/my-space/attendance` |
| الإجازات | `app/hr/leaves.tsx` | ✅ مُنجَز | `GET /api/hr/leave-requests` |
| طلب إجازة جديد | `app/hr/leave-new.tsx` | ✅ مُنجَز | `POST /api/hr/leave-requests` · `GET /api/hr/leave-types` |
| مركز الاعتماد | `app/action-center.tsx` | ⚠️ عرض فقط | `GET /api/action-center` — الاعتماد/الرفض النهائي عبر الويب حاليًا |
| التقويم الموحّد | `app/calendar.tsx` | ✅ مُنجَز (مدراء) | `GET /api/calendar` |
| متصفّح الوحدات | `app/(tabs)/modules.tsx` | ✅ مُنجَز | يعرض الوحدات المسموح بها |
| المالية / الأسطول / المستودع / العمليات / العمرة / العملاء / المستندات / الدعم / التسويق / العقارات / القانونية / الطلبات / الحوكمة / BI / التقارير / الإعدادات / الإدارة | `app/module/[key].tsx` | ⏳ بانتظار شاشات مخصّصة | الواجهات الخلفية جاهزة؛ تظهر شاشة "قيد الإطلاق" |

### ملاحظات تكامل

- **مركز الاعتماد**: نعرض قوائم العناصر المعلّقة للمتابعة. إجراء الاعتماد/الرفض النهائي
  يحتاج ربط نقاط سير العمل (workflow approve/reject) بمعرّفات السجلات الصحيحة — مؤجَّل لتفادي
  إجراءات خاطئة، ويُنفَّذ حاليًا من تطبيق الويب.
- **طلب إجازة جديد**: في حال توفّر `GET /api/hr/leave-types` تُعرض الأنواع كاختيارات؛ وإلا
  يُكتب النوع نصًّا. التواريخ بصيغة `YYYY-MM-DD` (لا يوجد منتقي تاريخ مثبَّت بعد).

## انحراف موثَّق (Deviation)

التطبيق يستخدم طبقة `apiFetch` محلية (في `lib/api.ts`) **وليس** خطافات
`@workspace/api-client-react` المولّدة، لأن تدفّق Bearer/refresh للجوال وبعض النقاط
غير مغطّاة بالمواصفة الجزئية (partial OpenAPI spec) المولّدة. عند اكتمال المواصفة يُنصح
بالانتقال إلى الخطافات المولّدة.

## بناء للإنتاج (EAS)

```bash
# لمرة واحدة
npm i -g eas-cli && eas login
eas build:configure
# بناء
eas build --platform android --profile preview
eas build --platform ios --profile preview
```

عيّن `EXPO_PUBLIC_DOMAIN` لنطاق الإنتاج في ملف تعريف البناء (eas.json) أو أسرار EAS.
