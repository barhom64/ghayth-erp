# مصفوفة الإجراءات الديناميكية — نظام غيث

> كل إجراء خطر يجب أن يعكس: **الصلاحية + حالة السجل + التأكيد + الأثر**. مبنية على مسح فعلي (2026-06-23). تُقرأ مع `UX_ACCEPTANCE_GATE.md`.

## 1. المبدأ

الزر ليس عنصرًا ثابتًا بل **إجراء واعٍ بالسياق**: يظهر/يُعطَّل حسب صلاحية المستخدم، وحالة السجل، واكتمال البيانات، ومرحلة الاعتماد، وحدود المسار القائد/الخادم. وكل إجراء يترك أثرًا (Audit/Event/State/Report).

## 2. المكوّنات الموحّدة (البنية القائمة)

| المكوّن | الموضع | الدور | الحماية المدمجة |
|---|---|---|---|
| `GuardedButton` | `components/shared/permission-gate.tsx:63` | زر يُخفى/يُعطَّل حسب الصلاحية | RBAC (`perm`) — **معتمد ~1750 موضعًا** |
| `usePermission` / `PermissionGate` | `components/shared/permission-gate.tsx` | بوابة صلاحية للعناصر | RBAC |
| `ApprovalActions` | `components/approval-actions.tsx` | قبول/رفض/إرجاع/إحالة/تصعيد | يخفي بلا صلاحية + واعٍ للحالة (`pendingStatuses`) + يطلب سبب |
| `useLifecycleAction` | `hooks/use-lifecycle-action.tsx` | تشغيل انتقالات دورة الحياة موحّدًا | toast + invalidate + سبب + معالجة 403 |
| `ConfirmDeleteDialog` | `components/shared/confirm-delete-dialog.tsx` | حذف آمن | impact-preview + blockers (409) + تعطيل أثناء التنفيذ |
| `ConfirmActionDialog` | `components/shared/confirm-action-dialog.tsx` | إجراء خطر (إغلاق/عكس/إلغاء) | `variant` (destructive/caution/confirm) + `confirmPerm` |
| `DetailActionButtons` | `components/shared/detail-edit-delete-actions.tsx` | تعديل/حذف في التفاصيل | `usePermission(editPerm/deletePerm)` |

## 3. مصفوفة الإجراءات الخطرة

| الإجراء | المسار القائد | الصلاحية | شرط الحالة | التأكيد | الأثر |
|---|---|---|---|---|---|
| اعتماد/موافقة | HR / المالية | `hr:approve` / `finance:update` | `status ∈ pending/draft/in_review/returned` | `ApprovalActions` (سبب اختياري) | حالة معتمدة + Audit + Event |
| رفض | HR / المالية | `hr:approve` / `finance:update` | حالة قيد المراجعة | `ApprovalActions` (سبب إلزامي) | حالة مرفوضة + Audit |
| ترحيل محاسبي (post) | المالية | `finance:approve` | `status==="approved" && !balancesApplied` | زر مقيّد + معاينة قيد | قيد في الدفتر + Audit (دفتر) |
| صرف/دفع (disburse) | المالية | `finance:approve` | عبر صفحة سندات/دفعات محمية | تأكيد صفحة الإنشاء | سند صرف + قيد + Audit |
| إغلاق فترة (close) | المالية | `finance:approve` | الفترة مفتوحة + 0 معلّقات | `ConfirmActionDialog` + عرض `pendingCount` (409) | فترة مغلقة + Audit |
| حذف | المسار المالك | `<module>:delete`/`:update` | حسب الكيان | `ConfirmDeleteDialog` + blockers | حذف ناعم + Audit |

## 4. الفجوات المرصودة (بنود إصلاح مجدولة — لا تُصلح هذه الجولة)

| الموضع | الفجوة | المستوى | الإصلاح المقترح |
|---|---|---|---|
| `pages/umrah/seasons.tsx:63` | «إغلاق الموسم» واعٍ للحالة (`status==="open"`) لكن بلا `GuardedButton` ولا تأكيد | P2 | لفّه بـ `GuardedButton perm="umrah:…"` + `ConfirmActionDialog` |
| ~38 موضع `confirm()` أصلي | نافذة متصفّح بدل الـdialog الموحّد (تكسر RTL، بلا impact/blockers/أثر) | P2 | تحويل لـ `ConfirmDeleteDialog`/`ConfirmActionDialog` — محروس ضد النمو بـ `check:dangerous-actions` |
| أزرار معطّلة بلا `title` (مثل `hr/documents.tsx:472`, `fleet/transport-dispatch.tsx:288`) | سبب التعطيل غير ظاهر للمستخدم | P3 | إضافة `title`/`aria` يشرح السبب |

## 5. الإنفاذ

- **ثابت:** `scripts/src/check-dangerous-actions.mjs` (`check:dangerous-actions`) — يمنع **نمو** نمط `confirm()` الأصلي (baseline مجمّد: 38 موضعًا)، فكل إجراء خطر جديد يجب أن يمرّ عبر المكوّنات الموحّدة. مربوط في `guard.sh`.
- **وقت التشغيل:** `e2e/tests/ux-critical-actions.spec.ts` (`@ux-gate`) — يفشل عند تسرّب نافذة متصفّح أصلية أو وجود أزرار ميتة بلا اسم وصول على الصفحات الحرجة.

## 6. قاعدة القبول
لا يُعتمد مسار إذا كانت أزراره الخطرة لا تعكس الصلاحية أو الحالة أو الأثر، أو تستخدم نافذة المتصفّح الأصلية للتأكيد.
