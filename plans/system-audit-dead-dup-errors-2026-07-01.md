# فحص النظام — أخطاء / تكرار / موجود لا يعمل (2026-07-01)

طلب إبراهيم: «فيه اخطاء وفيه تكرار وفيه اشياء موجودة ولكن لا تعمل فعلاً — افحص واكمل».

## ما وجدته فعلًا (بأرقام من الحُرّاس، لا انطباع)

### 1) «موجود لا يعمل» — endpoints بلا مستدعٍ من الواجهة
`check-frontend-backend-wiring`: **211 endpoint خلفي بلا أي نداء من الـSPA**.
- **إيجابيات كاذبة (ليست ميتة):** مسارات تطبيق السائق `/fleet/me/*` و`/fleet/driver/me/*`،
  تنزيلات عبر href `/audit-logs/export` و`calendar.ics`، وويبهوكس/فحوص صحّة.
- **ميتة فعلًا (بُنيت ولم تُربط بواجهة) — عناقيد واضحة:**
  - `/admin/notification-routing/rules` (GET/POST/PATCH/DELETE) + `/chains` — CRUD كامل بلا شاشة.
  - `/admin/communication-control/outbound-queue` (+ bulk-retry) + `/validation` — إدارة طابور بلا شاشة.
  - `/settings/task-sla-reminder` (GET/PUT/DELETE) — إعداد بلا شاشة.
  - `/finance` (36 غير مستخدم — بعضها داخلي مثل assert-postable/compute، لكن chart-of-accounts وdso-trend وfiscal-periods تحتاج تدقيقًا).
  - `/transport/bookings/:id/events` (GET/POST) و`/deductions` و`suggest-assignment`/`estimate-route` — تحتاج تأكيدًا (قد تُستهلك بمسار مختلف).
- **الإجمالي حسب المسار:** finance 36 · fleet 28 · umrah 28 · inbox 15 · transport 13 · admin 11 · settings 11 · (+ باقي).

### 2) مكوّنات يتيمة (dead components)
`check-dead-components`: **5 مكوّنات يتيمة** في الأساس (0 جديدة). تحتاج تسمية وتدقيق.

### 3) تكرار
- `check-dup-filenames`: **15 اسم ملف مكرّر** (allowlisted في الأساس، 0 جديد).
- `check-duplicate-component-content`: **0 مجموعة تكرار محتوى**. ⇒ التكرار محدود ومضبوط، لا تكرار محتوى فعلي جديد.

### 4) أخطاء (compile/tests)
الحُرّاس + typecheck **خضراء** (لا أخطاء ترجمة/اختبار). ⇒ «الأخطاء» المقصودة = **وظيفية/ميزات لا تعمل**،
لا أخطاء بناء. تحتاج تدقيق سلوكي لكل ميزة مشتبهة.

## الحوكمة (دستور غيث)
- **حذف endpoint/صفحة تشغيلية** = قرار معماري، يلزمه إثبات موت تام + **PR مستقل + إذن إبراهيم صريح** (م4).
- **إحياء (ربط) ميزة موجودة غير مربوطة** = إصلاح آمن مسموح (بناء الشاشة الناقصة / ربط الصفحة).
- لذلك: الحذف يُصعّد؛ الإحياء والتوحيد يُنفَّذان دفعة دفعة بعد تأكيد عام.

## خطة مقترحة (دفعة دفعة، مجلس لكل دفعة)
النطاق كبير (211 + 5). لا يُصلَح دفعة واحدة. الأنسب: **مسار واحد في كل مرة**، والقرار: حذف أم إحياء لكل عنقود.
مرشّحون أوائل (وضوح + قيمة):
- (أ) **admin/notification-routing + communication-control**: إمّا إحياء الشاشة أو حذف موثّق (تصعيد).
- (ب) **transport** (مسارنا الحالي): تأكيد events/deductions/suggest-assignment/estimate-route — حيّة أم ميتة، ثم ربط أو حذف.
- (ج) **settings/task-sla-reminder**: إحياء شاشة أو حذف.
- (د) **5 المكوّنات اليتيمة**: تسمية + حذف موثّق أو ربط.

## ⚠️ تصحيح مهم بعد التحقق اليدوي (2026-07-01)

**رقم «211» مضخَّم بشدّة — ~90% إيجابيات كاذبة.** الحارس الساكن يعجز عن حلّ:
- مسارات ديناميكية `/bookings/${id}/x` مقابل نمط `:id`.
- endpoints مُمرَّرة كـprops: `endpoint={`/…/events`}`.
- روابط href/تنزيل: `calendar.ics`، `export`.
- صفحات مربوطة عبر nav/adminRoutes لا عبر apiFetch مباشر.

**تحقّقت يدويًا من ~26 endpoint (transport + admin + settings):**
- `suggest-assignment` ✅ مستخدم (assignment-suggest-dialog) · `/deductions` ✅ (booking-detail:346)
  · `/events` ✅ (booking-detail:787 عبر prop) · `calendar.ics` ✅ (href) · `communication-control`
  ✅ (صفحة كاملة + nav) · `notification-routing` ✅ (admin.tsx/adminRoutes).
- **ميت فعلًا (0 مرجع + منطق خلفي حيّ):**
  - **`settings/task-sla-reminder`** (GET/PUT/DELETE): كرون `inbox_task_sla_reminder_scan` (كل 15د)
    يقرأ الإعداد فعلًا، لكن **لا شاشة لضبطه** ⇒ **إحياء** (بناء شاشة إعداد صغيرة). آمن ومفيد.
  - **`transport/bookings/:id/estimate-route`** (POST): `MapsService.estimateRoute` مستخدم داخليًا
    في محرّك الترشيح، لكن الـendpoint المكشوف بلا مستدعٍ ⇒ **سطح HTTP ميت** ⇒ **حذف (تصعيد)**.

**الخلاصة الصادقة:** النظام ليس فيه «موت متفشٍّ». المجموعة الميتة الحقيقية **صغيرة**؛
تحتاج تحقّقًا يدويًا لكل عنصر (الأداة تُبالغ). المنهج: لكل مسار، افحص endpoints ذات
**صفر مرجع** فقط، وصنّفها إحياء/حذف.

## سياسة إبراهيم (2026-07-01)
**«إحياء ما ينفع + حذف الباقي بإذني»، كل المسارات، دفعة دفعة.** ⇒ إحياء آمن أنفّذه؛ الحذف PR مستقل مُصعَّد.

## القائمة المُتحقَّقة (211 → 32 بصفر مرجع → ~18 ميزة فريدة)

فحص آلي: لكل endpoint، جزءُ مساره المميّز غير موجود إطلاقًا في الواجهة ⇒ مرشّح ميت.

### إحياء (ميزة تشغيلية بلا واجهة — أبنيها آمنًا، دفعة/ميزة):
- **`documents/:id/acls`** (GET/POST/DELETE) — صلاحيات وصول الوثائق بلا شاشة. **قيمة عالية.**
- **`umrah/room-allocations`** (POST/DELETE) + `room-blocks/:id/allocations` — تخصيص الغرف بلا شاشة. **قيمة عالية.**
- **`settings/task-sla-reminder`** (GET/PUT/DELETE) — كرون حيّ بلا ضبط. **أول دفعة (صغيرة).**
- **`settings/inbox-routing`** (GET/PUT/DELETE) — توجيه صندوق الوارد بلا ضبط.
- **`hr/company-document-categories`** + **`hr/employee-document-types`** — إعداد أنواع وثائق HR بلا شاشة.
- **`admin/predefined-roles`** — أدوار جاهزة بلا شاشة.
- **`communications/log/:id/referral-chain`** — سلسلة الإحالة بلا عرض.
- **`properties/contracts/preview-from-ejar`** — معاينة عقد إيجار بلا زر.
- **`umrah/transport/:id/check-in-bulk`** — تسجيل وصول جماعي بلا زر.
- تقارير بلا ربط: `bi/reports/umrah-season-summary` · `umrah/reports/packages-vs-allocations-pricing-drift`.
- `fleet/vehicles/:id/fuel-efficiency` (مقياس بلا عرض) · `inbox/messages/bulk-folder` (نقل جماعي).

### داخلي/خارجي (ليس للواجهة — يُترك، ليس ميتًا):
- `finance/assert-postable` (مساعد تحقّق) · `finance/recurring-invoices/run-due` (كرون) ·
  `fleet/drivers/*/recompute-reputation` + `reputation/recompute-all` (دفعات إدارية) ·
  `public/site/by-host` (يستدعيه الموقع العام) · `settings/companies/purge-preview` (عملية خطرة).

### حذف (سطح HTTP ميت — تصعيد لإذن إبراهيم، PR مستقل):
- **`transport/bookings/:id/estimate-route`** — الخدمة مستخدمة داخليًا، الـendpoint المكشوف لا.
- **`admin/communication-control/outbound-queue`** — الصفحة موجودة لكن لا تستدعي هذه الفرعية (تحقّق: ربط أم حذف).

### للتحقق الإضافي (قد تكون إيجابيات كاذبة عبر مسار متغيّر):
- `inbox/folder-counts` · `umrah/import-logs` — 0 مرجع لكن قد تُستهلَك عبر ثابت مسار.

## أول دفعة تنظيف
- **إحياء `task-sla-reminder`**: شاشة إعداد صغيرة (settings) تربط GET/PUT القائمين — تُتيح ضبط تذكير SLA للمهام.
- **`estimate-route`**: توثيق للحذف (تصعيد) — أو ربط زر تقدير مسار في تفاصيل الحجز إن رأى إبراهيم قيمة.

## الحالة الجارية
سلسلة الدفعات الثلاث: 1 (#3130) مدموجة · 2 (#3158) قيد الدمج (كرون) · 3 (صقل المنتقي) معلّقة.
هذا الفحص أوسع منها — يحتاج قرار إبراهيم على النطاق وسياسة (حذف مقابل إحياء).
