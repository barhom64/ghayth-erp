# /hr/employee-profile/:id — `artifacts/ghayth-erp/src/pages/hr/employee-profile.tsx`

## 1. الميتاداتا
- المسار: `/hr/employee-profile/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/employee-profile.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:144`
- المجموعة: `hr`
- الكومبوننت: `EmployeeProfile`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 18
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
ملف الموظف الشخصي (Self-Service View) — للموظف نفسه فقط.

| القسم | البيانات | المصدر |
|------|---------|--------|
| Personal info | name, ID, phone, email, address | hr/employees |
| Job info | title, department, manager, hire date | employee_assignments |
| Salary structure (own) | basic + allowances | salary_components |
| Attendance summary | this month + history | hr/attendance |
| Leave balances | remaining per type | hr_leave_balances |
| Documents | عقد العمل، شهادات، خطابات | documents |
| Performance reviews (mine) | KPIs + scores | hr_performance_reviews |
| Training certifications | training_certificates | hr/training |
| Loans (mine) | hr_employee_loans | حساباتي + استلامات |
| Gratuity estimate | محسوب per current salary | hr/gratuity |
| Tasks (mine) | tasks WHERE assignee=me | operations/tasks |
| Pending approvals (mine) | requests + workflows | governance |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Read-only view | GET `/my-space/profile` | aggregations | ✅ |
| Update self info | PATCH `/my-space/profile` (limited fields) | `employees` | ⚠ تحقق من المسموح |
| Request leave | راجع `hr-leaves.md` | ✅ |
| Request loan | راجع `hr-loans.md` | ✅ |
| Update profile picture | storage | `users.avatarUrl` | ✅ |
| تكامل مع dashboard | راجع `misc/dashboard.md` | ✅ |
| **PDPL** — Right to access | export کل بياناتي | PDPL data subject access request | ⚠ |
| **PDPL** — Right to delete | request | حسب retention | ⚠ |
| Audit log | كل تعديل ذاتي | `audit_logs` | ✅ |

تحقق يدوي:
- [ ] هل الموظف يستطيع تعديل phone/address دون موافقة HR؟
- [ ] هل البيانات السرية (تقييمات سرية، 360 upward) محصورة؟
- [ ] هل export PDPL يشمل كل البيانات في 30 يوم max (قانوني)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no id resolver for /hr/employee-profile/:id`
- landedUrl: `?`
- توصية: مغلق
