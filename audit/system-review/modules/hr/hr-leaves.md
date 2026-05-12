# /hr/leaves — `artifacts/ghayth-erp/src/pages/hr/leaves.tsx`

## 1. الميتاداتا
- المسار: `/hr/leaves`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/leaves.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:97`
- المجموعة: `hr`
- الكومبوننت: `Leaves`
- subKey: `leaves` | minRoleLevel: —
- الكيان المستنبط: `leaves`
- سطور الملف: 287
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L188: "نسخ الطلب"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
دورة طلب الإجازة. المرجع: `docs/blueprints/hr-payroll.md` + `docs/HR_REFERENCE_MODEL.md`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء طلب → سير موافقة | governance/workflows | `hr.ts` POST `/leave-requests` → `workflows.ts` | `leave_requests`, `approval_chains`, `approval_chain_steps` | ✅ |
| خصم رصيد الإجازات عند الاعتماد | hr | PATCH `/leave-requests/:id/approve` → خصم من `hr_leave_balances` | `hr_leave_balances.usedDays` | ⚠ تحقق من القيد الذرّي (transaction) |
| تأثير الحضور خلال فترة الإجازة | hr/attendance | `attendance` يقرأ `leave_requests` فينعكس على التقرير | `attendance.status='on_leave'` (إن وُجد) | ⚠ غير مؤكد — تحقق يدوياً |
| إشعار للموظف + المدير | comms | `notification-engine.ts` event=`workflow_approved\|rejected` | `notifications` (actionUrl=`/requests/:id`) | ✅ راجع `docs/action-url-registry.md` |
| تأثير الراتب (لو unpaid) | hr/payroll | `payroll_runs` يستثني الأيام | `payroll_lines.deductions` | ⚠ تحقق من سياسة `unpaid_leave` |
| Audit log | core | `auditMiddleware` | `audit_logs` (entity=`leave_requests`) | ✅ |

تحقق يدوي:
- [ ] إذا أُلغي الطلب بعد الاعتماد، هل يُعاد الرصيد المخصوم؟
- [ ] هل تتزامن `hr_leave_balances` مع رصيد الترحيل السنوي عند تجاوز السنة المالية؟
- [ ] هل يُحدّث الراتب تلقائياً لـ leave بدون راتب أم يدوي عبر `/finance/expenses`؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `leaves` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/leaves`
- لقطة: `audit/screenshots/hr_leaves.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
