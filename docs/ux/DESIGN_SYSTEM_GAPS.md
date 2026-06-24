# فجوات نظام التصميم — نظام غيث

> جرد مبني على مسح فعلي (2026-06-23) لمكتبة `artifacts/ghayth-erp/src/components/ui` (59 مكوّنًا) وتطبيقها. الأساس موحّد؛ التفاوت في مستوى التطبيق. الإصلاح دفعات لاحقة مملوكة للمسارات.

## 1. النضج

**المرحلة 3/5** — مكوّنات أساس موحّدة قوية، وأنماط تطبيق متفاوتة.

## 2. المكوّنات الموحّدة القائمة

| الفئة | المكوّن | الموضع |
|---|---|---|
| أزرار | `Button` (CVA: default/destructive/outline/secondary/ghost/link + sizes) | `components/ui/button.tsx` |
| نماذج | `FormShell` + `Form*` (react-hook-form + zod) — **671 استخدامًا** | `components/form-shell.tsx`, `components/ui/form.tsx` |
| جداول | `DataTable` (فرز/بحث/تصفية/تحديد جماعي/ترقيم/تحميل/فراغ) | `components/ui/data-table.tsx` |
| حالات الصفحة | `PageStateWrapper` (تحميل/فراغ/خطأ بأكواد `ApiError`) | `components/shared/page-state.tsx` |
| تحميل | `Spinner` (aria «جاري التحميل») + `Skeleton` | `components/ui/spinner.tsx`, `skeleton.tsx` |
| فراغ | `Empty*` | `components/ui/empty.tsx` |
| تنبيهات | `Alert`, `Toast` (مخصّص، `TOAST_LIMIT=1`) | `components/ui/alert.tsx`, `hooks/use-toast.ts` |
| بطاقات/حوار/وسوم | `Card`, `Dialog` (Radix), `Badge` | `components/ui/*` |

## 3. الفجوات (بأدلة)

| # | الفجوة | الدليل | المستوى |
|---|---|---|---|
| 1 | أزرار `<button>` خام تتجاوز `Button` (تنسيق/rate-limit مفقود) | `pages/login.tsx:140`، `components/shared/entity-documents.tsx:13`، `bulk-actions.tsx:50`، `entity-tags.tsx:49,58`، ألوان مضمّنة في `approval-actions.tsx:229` | P2 |
| 2 | تفاوت نص التحميل: «جاري التحميل» / «جارٍ التحميل» / بـ«...» وبدونها | `page-state.tsx` مقابل `vehicle-detail.tsx:265`، `cycle-count-detail.tsx:182` | P3 |
| 3 | **655+** صياغة رسالة خطأ غير موحّدة (تعذّر / فشل / حدث خطأ / خطأ في) | منتشرة عبر ~40 ملفًا في استدعاءات toast | P2 |
| 4 | **1,279+** صنف لون مضمّن (`bg-blue-100`/`text-red-*`…) يتجاوز رموز الحالة الدلالية | `shared/approval-timeline.tsx:9-10`، `entity-timeline.tsx`، `employee-context-card.tsx:93` | P2 |
| 5 | خلط `FormShell` (الجديد) و`Controller`/`useFormContext` (القديم) | `pages/login.tsx:80-102` مقابل بقية النماذج | P3 |
| 6 | أنماط جداول متعددة: `DataTable` + `<Table>` خام + `LineItemsTable` | `data-table.tsx` / `ui/table.tsx` / `shared/line-items-table.tsx` | P3 |
| 7 | `TOAST_LIMIT=1` قد يبتلع نتائج عمليات متتابعة | `hooks/use-toast.ts:8` | P3 |
| 8 | `PageStateWrapper` موحّد لكن بعض الصفحات تبني حالة فراغ مخصّصة | متفرّق | P3 |

## 4. نقاط القوة (لا تُمَسّ)

- معالجة أخطاء مصنّفة بالأكواد (`AUTH_*`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, …) مع نبرة وأيقونة لكل كود — `page-state.tsx`.
- `useApiMutation` موحّد (`onFieldError`/`onCodeError`/`successMessage`/`silent`) — `lib/api.ts`.
- `Button rateLimitAware` لمعالجة حدود المعدّل.

## 5. التوصية (ترتيب الأولوية للدفعات اللاحقة)

1. **توحيد صياغة رسائل الخطأ** (655+) — معجم موحّد (تعذّر/فشل) ثم تطبيق دفعات مملوكة للمسار.
2. **فرض رموز الحالة الدلالية** بدل الألوان المضمّنة (1,279+) — حارس lint لاحق.
3. **استبدال `<button>` الخام بـ `Button`** (~6 مواضع).

> لا بند P0/P1 — الأساس متين. الفجوات تحسينية وتُعالَج دفعات بلا كسر.
