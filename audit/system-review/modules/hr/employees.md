# /employees — `artifacts/ghayth-erp/src/pages/employees.tsx`

## 1. الميتاداتا
- المسار: `/employees`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/employees.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:88`
- المجموعة: `hr`
- الكومبوننت: `Employees`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `employees`
- سطور الملف: 360
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L198: "(بلا تسمية)" → `() => setPreviewItem(employee)`
- L207: "عرض التفاصيل"
- L224: "(بلا تسمية)"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

سجلات الموظفين — Employee master records.

| النوع | الوصف |
|------|------|
| Full-time Saudi | مواطن سعودي بدوام كامل |
| Full-time Expat | مقيم بدوام كامل | with Iqama + visa tracking |
| Part-time | بدوام جزئي |
| Contract | بعقد مؤقت | راجع `hr-contracts.md` |
| Outsource | عبر شركة خارجية | external |
| Intern | متدرّب | راجع `hr-contracts.md` (intern type) |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List employees | GET `/employees` | `employees` | ✅ |
| Add new employee | راجع `employees-create.md` | with GOSI/Qiwa registration | ✅ critical |
| View profile | راجع `employees-byid.md` | ✅ |
| Update personal info | PATCH | with audit | ✅ |
| Update job info | PATCH | راجع `hr-transfers.md` | ✅ |
| Update salary | راجع `hr-salary-components.md` | with approval | ✅ critical |
| Iqama renewal tracking (expats) | reminder | راجع `notifications.md` | ✅ critical |
| Visa expiry tracking (expats) | reminder | ✅ critical |
| Passport expiry tracking | reminder | ✅ |
| Active vs inactive (terminated) | toggle via exit | راجع `hr-exit.md` | ✅ |
| Bank account info | encrypted | for payroll | راجع `hr-payroll.md` | ✅ critical |
| Dependents (for benefits) | per company policy | راجع `hr-dependents.md` | ⚠ |
| Emergency contact | mandatory | ✅ |
| Insurance enrollment | for health/life | راجع `hr-benefits.md` | ⚠ |
| Documents storage | ID, contract, certificates | راجع `documents.md` | ✅ |
| Self-service profile | راجع `hr-employee-profile-byid.md` | for employee | ✅ |
| تكامل مع `users.md` | linked user account | راجع `admin-users.md` | ✅ critical |
| تكامل مع GOSI | external sync | راجع `admin-integrations.md` | ✅ critical |
| تكامل مع Qiwa | external sync | راجع `admin-integrations.md` | ✅ critical |
| تكامل مع Mudad (WPS) | راجع `hr-payroll.md` | ✅ critical |
| تكامل مع `hr-attendance.md` (linked) | ✅ |
| تكامل مع `hr-evaluations.md` | ✅ |
| تكامل مع `fleet-drivers.md` (لو driver) | ✅ |
| Audit log إجباري | كل تعديل | `audit_logs` | ✅ critical |
| **PDPL** — أعلى مستوى confidentiality | salaries, performance, health | masked في reports | ✅ critical |
| Soft delete on exit | preserve for retention | راجع `hr-exit.md` | ✅ |
| RBAC | hr-manager + manager-for-team-scope | ✅ critical |

تحقق يدوي:
- [ ] هل GOSI registration mandatory + automatic عند إنشاء موظف جديد؟
- [ ] هل expat Iqama/Visa expiry يطلق alerts قبل 90/30/7 يوم؟
- [ ] هل manager يرى team الخاص فقط (scope enforcement)?
- [ ] هل salary changes mandatory require approval + audit?
- [ ] هل bank account encrypted at-rest؟

## 4. النمذجة
- الجدول: `employees` (export: `employees`, 13 عمود)
- tenant col: — | createdBy: — | createdAt: ✅ | updatedAt: ✅ | softDelete: — | lifecycle col: ✅

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/employees`
- لقطة: `audit/screenshots/employees.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
