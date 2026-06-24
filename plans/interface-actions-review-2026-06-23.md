# خطة: مراجعة تخطيط الواجهة وديناميكية الإجراءات — نظام غيث

- **التاريخ:** 2026-06-23
- **الفرع:** `claude/ux-acceptance-gate-fjtcx9` (ضمن PR #2899)
- **النطاق المعتمد:** مراجعة + بوابة إنفاذ (وثائق + حارس ثابت + اختبارات Playwright). **لا إعادة هيكلة فعلية لأزرار المسارات** في هذه الجولة — تُخطَّط وتُنفَّذ لاحقًا دفعات.
- **الحوكمة:** طلب نظام-واسع. عملي بالكامل (لا مساس بالدفتر، لا منطق أعمال، لا schema). إضافي. يمرّ على بوابة الدستور + المجلس على الـdiff.

## ما وجده المسح (قراءة فقط، 4 مساحات استكشاف على الكود الفعلي)

### 1) التنقل وهندسة المعلومات — **ناضج ومحروس**
- مصدر حقيقة واحد: `components/layout/navigation.registry.ts` (432 مدخلًا، 8 أقسام) + `navigation.canonical-map.ts`.
- خط تصفية في `sidebar-layout.tsx`: module → feature-flag → role-level → sub-page → perm → route-registry.
- **6 حُرّاس خضراء:** `gate:nav`, `gate:labels`, `gate:nav-titles`, `gate:tabs`, `gate:quick-actions`, `gate:page-actions`.
- 16 ملف routes، 570 مسارًا؛ المالية تهيمن (207 = ~36%).
- ديون موثّقة في `NAVIGATION_DUPLICATE_INVENTORY.md` (أسماء متعددة لنفس المسار) — **قرار مالك**.

### 2) الإجراءات الخطرة — **محكمة إلى حدٍّ كبير**
- مكوّنات موحّدة: `useLifecycleAction`, `ApprovalActions` (يخفي بلا صلاحية + واعٍ للحالة), `ConfirmDeleteDialog` (impact-preview + blockers), `ConfirmActionDialog`, `GuardedButton` (`permission-gate.tsx:63`), `usePermission`, `DetailActionButtons`.
- **`GuardedButton` معتمد 1750 موضعًا** · صلاحيات مثل `hr:approve`/`finance:approve`/`finance:update` · حالة مثل `status==="approved"`.
- فجوات مرصودة:
  - `pages/umrah/seasons.tsx:63` — «إغلاق الموسم» واعٍ للحالة (`status==="open"`) لكن بلا `GuardedButton` ولا تأكيد.
  - **~50 استدعاء `confirm()` أصلي** (نمط مضادّ) بدل `ConfirmDeleteDialog` — مثل `hr/documents.tsx`, `admin/org-model.tsx`, `hr/wps-run-detail.tsx`.

### 3) نظام التصميم — **أساس موحّد، تطبيق متفاوت**
- `components/ui` (59 مكوّنًا): `Button` (CVA), `FormShell` (671 استخدامًا), `DataTable`, `PageStateWrapper` (تحميل/فراغ/خطأ بأكواد `ApiError`), toast مخصّص.
- فجوات: أزرار `<button>` خام (~6)، تفاوت نص التحميل (جاري/جارٍ)، **655+** صياغة خطأ، **1,279+** صنف لون مضمّن، خلط `FormShell` القديم/الجديد.

### 4) الأزرار الميتة والـMicrointeractions — **نظيف (A-)**
- لا أزرار ميتة. `useApiMutation` موحّد (نجاح/خطأ toast، `onFieldError`/`onCodeError`).
- فجوات صغيرة: أزرار معطّلة بلا `title` (سبب)، تفاوت إظهار «جاري الحفظ»، `confirm()` بسيط في مواضع.

## الدفعات (كلها عملية · لا دفتر)

| # | الدفعة | المخرجات | الحارس/الاختبار |
|---|---|---|---|
| B1 | وثائق المراجعة | `INTERFACE_LAYOUT_REVIEW.md`, `DYNAMIC_ACTIONS_MATRIX.md`, `DESIGN_SYSTEM_GAPS.md`, التقرير النهائي | — |
| B2 | حارس الإجراءات الخطرة | `scripts/src/check-dangerous-actions.mjs` (نمط `confirm()` الأصلي، baseline مجمّد يبدأ أخضر) + اختبار وحدة + baseline | `check:dangerous-actions` + ربطه في guard.sh وpackage.json |
| B3 | اختبارات Playwright للأزرار الحرجة | `e2e/tests/ux-critical-actions.spec.ts` (وسم `@ux-gate`) | يعمل ضمن مسار e2e |

## القاعدة المطبّقة
- الحارس **baseline-freeze**: يجمّد الحالي ويمنع نموّ نمط `confirm()` الأصلي؛ كل دانجر-أكشن جديد يجب أن يمرّ عبر `ConfirmDeleteDialog`/`ConfirmActionDialog`/`GuardedButton`.
- الفجوات القائمة (seasons.tsx، الـ50 confirm، الأزرار بلا title) **توثَّق في التقرير كبنود إصلاح مجدولة** — لا تُصلَح في هذه الجولة (إعادة هيكلة مملوكة للمسارات).

## ما لا يُفعل (حدود)
- لا تعديل على ملفات مملوكة لمسار (umrah/hr/finance…) لإصلاح الأزرار — مؤجّل دفعات.
- لا تغيير schema/API/منطق أعمال/دفتر.
- لا حذف.
