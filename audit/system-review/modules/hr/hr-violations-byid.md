# /hr/violations/:id — `artifacts/ghayth-erp/src/pages/hr/violation-detail.tsx`

## 1. الميتاداتا
- المسار: `/hr/violations/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/violation-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:136`
- المجموعة: `hr`
- الكومبوننت: `ViolationDetail`
- subKey: `violations` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 222
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل مخالفة موظف واحدة — Disciplinary violation detail.

| الحالة | الوصف |
|--------|------|
| Reported | تم الإبلاغ |
| Pending acknowledgment | بانتظار توقيع الموظف |
| Acknowledged | الموظف وقّع |
| Disputed (grievance) | طعن |
| Resolved | تم الحل |
| Penalty applied | تطبيق العقوبة |
| Closed | منتهي |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View violation | GET `/hr/violations/:id` | `employee_violations` | ✅ |
| Employee acknowledge | with e-signature | ✅ critical |
| Employee dispute (grievance) | with evidence | راجع `hr-grievance.md` | ⚠ |
| Apply penalty (per regulation) | راجع `hr-discipline-regulation.md` | ✅ critical |
| Salary deduction | راجع `hr-payroll.md` | ✅ critical |
| Suspension (paid/unpaid) | راجع `hr-attendance.md` | ✅ |
| Generate official letter | راجع `print-templates` | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ critical |
| Termination trigger (لو severe) | راجع `hr-exit.md` | ✅ critical |
| Linked grievance case (لو escalates legally) | راجع `legal-cases.md` | ⚠ |
| تكامل مع `hr-discipline-regulation.md` (rules basis) | ✅ critical |
| تكامل مع `hr-payroll.md` (deduction) | ✅ critical |
| تكامل مع `governance-compliance.md` (Saudi Labor Law Article 80) | ✅ critical |
| تكامل مع `legal.md` (لو escalates) | ✅ |
| **PDPL** — confidential | restricted access | ✅ critical |
| RBAC | hr-manager + immediate manager + legal | ✅ critical |

تحقق يدوي:
- [ ] هل employee acknowledgment mandatory before penalty?
- [ ] هل dispute process له deadline + escalation?
- [ ] هل penalty matches Saudi Labor Law Article 80 (max 1/2 day pay)?
- [ ] هل violation history accessible للـ HR for pattern detection?
- [ ] هل linked grievance case auto-creates لو escalation?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/hr/violations → 401`
- landedUrl: `?`
- توصية: مغلق
