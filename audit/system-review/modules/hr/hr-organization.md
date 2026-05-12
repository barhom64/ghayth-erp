# /hr/organization — `artifacts/ghayth-erp/src/pages/hr/organization.tsx`

## 1. الميتاداتا
- المسار: `/hr/organization`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/organization.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:114`
- المجموعة: `hr`
- الكومبوننت: `Organization`
- subKey: `organization` | minRoleLevel: —
- الكيان المستنبط: `organization`
- سطور الملف: 90
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
- GET `/settings/departments`
- GET `/employees`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
الهيكل التنظيمي. الأقسام + الفروع + العلاقات الإدارية.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إدارة الأقسام | hr | `hr.ts` POST/PATCH `/departments` | `departments` | ✅ |
| ربط بفرع | settings | `departments.branchId` → `branches` | ✅ |
| رئيس القسم (manager) | hr | `departments.managerId` → `employees` | يستخدم في approval chains | ✅ |
| ترتيب هرمي | hr | `departments.parentId` self-FK | ✅ |
| نقل موظف بين الأقسام | hr | `employee_assignments.departmentId` يُحدّث | ✅ يولّد سجل في `employee_transfers` |
| تأثير على approval chains | governance/workflows | `chains.departmentId` ⇄ `departments.id` | ✅ |
| تأثير على ميزانية القسم | finance/budget | `budgets.departmentId` ⇄ | عند النقل: من؟ ⚠ |
| تأثير على manager-board | bi | aggregation per department | views | ✅ |
| إشعار للمدير الجديد | comms | event=`employee_transferred` | `notifications` | ✅ |
| Audit log | core | يقرأ من `employees` (middleware) | ✅ |

تحقق يدوي:
- [ ] هل حذف قسم بدون نقل الموظفين أولاً محظور؟
- [ ] هل إلغاء dependency على manager متوفّى/مستقيل يطلب موافقة قبل التطبيق؟
- [ ] هل تغيير parentId يحدّث كل الـ chains المتفرّعة آلياً؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `organization` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/organization`
- لقطة: `audit/screenshots/hr_organization.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
