# /hr/employee-activation — `artifacts/ghayth-erp/src/pages/hr/employee-activation.tsx`

## 1. الميتاداتا
- المسار: `/hr/employee-activation`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/employee-activation.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:145`
- المجموعة: `hr`
- الكومبوننت: `EmployeeActivation`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `employee-activation`
- سطور الملف: 328
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/employees?limit=200`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
تفعيل الموظف — لحظة الانتقال من `hired` إلى `active`. ينهي onboarding.

| الشرط | المرجع |
|------|--------|
| Onboarding checklist 100% complete | راجع `hr-onboarding-review.md` |
| GOSI registration | gov-integrations | ✅ إجباري للسعوديين |
| Bank account + IBAN | finance | ✅ للراتب |
| RBAC role assigned | راجع `admin-rbac-matrix.md` |
| User account active | auth/users |
| Probation period start | hr | 3 شهور |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Trigger activation | POST `/hr/employees/:id/activate` | `employees.status='active'` | ✅ |
| Auto-trigger عند checklist 100% | راجع `hr-onboarding-review.md` | ✅ |
| ينضمّ لـ payroll | hr/payroll | يدخل في `payroll_runs` التالي | ✅ |
| Self-service متاح | راجع `hr-employee-profile-byid.md` | ✅ |
| ينضمّ لـ approval chains | governance | كـ approver/requester | ✅ |
| إشعار ترحيب | comms | event=`employee_activated` | `notifications` (للموظف + مديره + الفريق) | ✅ |
| Probation review scheduled | hr/performance | بعد 90 يوم | راجع `hr-performance.md` | ⚠ |
| Audit log إجباري | core | `audit_logs` | ✅ |
| تكامل بطاقة الدخول (badge access) | فيزيائي | اختياري إن مرتبط | ⚠ |

تحقق يدوي:
- [ ] هل لا يمكن للموظف check-in قبل التفعيل (guard)؟
- [ ] هل تعطيل ثم إعادة تفعيل يعيد probation أم لا؟
- [ ] هل الموظف في فترة التجربة (probation) له صلاحيات أقل من active؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `employee-activation` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/employee-activation`
- لقطة: `audit/screenshots/hr_employee_activation.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
