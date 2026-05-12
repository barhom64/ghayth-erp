# /employees/:id — `artifacts/ghayth-erp/src/pages/employee-detail.tsx`

## 1. الميتاداتا
- المسار: `/employees/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/employee-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:90`
- المجموعة: `hr`
- الكومبوننت: `EmployeeDetail`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 963
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L347: "(بلا تسمية)" → `() => setActiveTab("attendance")`
- L357: "(بلا تسمية)" → `() => setActiveTab("leaves")`
- L387: "(بلا تسمية)" → `() => setActiveTab("tasks")`
- L422: "(بلا تسمية)" → `() => setActiveTab("payroll")`
- L474: "تعديل" → `govStartEdit`
- L535: "حفظ" → `govSaveEdit`
- L538: "(بلا تسمية)" → `() => setGovEditing(false)`
- L854: "(بلا تسمية)" → `() => setShowPrintMenu(!showPrintMenu)`

### القراءات (GET)
- GET `/documents/templates`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
ملف الموظف. المرجع: `docs/HR_REFERENCE_MODEL.md`. **الكيان الأكثر تشعّباً في النظام** — يلامس كل وحدة HR.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء موظف | hr | `employees.ts` POST `/` | `employees` (global identity) | ✅ |
| تخصيص (تعيين وظيفي) | hr | POST `/employee-assignments` (شركة + فرع + قسم + راتب) | `employee_assignments` (هنا يدخل tenant) | ✅ |
| ربط بمستخدم نظام | auth | اختياري — `users.employeeId` → `employees.id` | تفعيل الـ Self-service | ✅ |
| مكونات الراتب | hr | `salary_components` لكل assignment | يُستخدم في `payroll_runs` | ✅ |
| الحضور | hr/attendance | كل check-in/out يستخدم `assignmentId` | `attendance` | ✅ |
| الإجازات | hr/leaves | `hr_leave_balances` per (employee + year + leaveType) | ✅ |
| السلف | hr/loans | `hr_loans.employeeId` | ✅ |
| المخالفات | hr/discipline | `employee_violations.assignmentId` | ✅ |
| التقييم | hr/performance | `hr_performance_reviews` + `evaluation_cycles` | ✅ |
| التدريب | hr/training | `training_enrollments.employeeId` | ✅ |
| الوثائق | documents | `documents.entityId=employee_id, entityType='employee'` | ✅ |
| مخالفات مرورية (إن سائق) | fleet | `fleet_traffic_violations.driverId` → `drivers.employeeId` | ✅ |
| مكافأة نهاية الخدمة | hr/gratuity | محسوبة من تاريخ التعيين + آخر راتب | `hr_gratuity_calculations` | ✅ |
| إشعارات (تجديد إقامة/جواز/شهادة...) | comms | cron يقرأ `employees.expiringDates` | `notifications` | ✅ |
| تكامل GOSI (التأمينات) | gov-integrations | اختياري | `gosi_submissions` | ⚠ |
| Audit log | core | `auditMiddleware` (`/employees`) | `audit_logs` (entity=`employee`) | ✅ |

تحقق يدوي:
- [ ] هل حذف موظف (soft) يقفل كل assignments تلقائياً ويوقف الرواتب؟
- [ ] هل تغيير الـ assignment (نقل قسم) يحدّث `salary_components` تلقائياً أم يدوي؟
- [ ] هل الموظف الذي مرّ عبر شركات متعددة (نفس tenant) يحتفظ بسجل كامل؟
- [ ] هل GOSI نسبة الموظف vs صاحب العمل محسوبة من نفس مصدر القاعدة؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=SKIP
- ملاحظة: `landed=/dashboard expected=/employees/3`
- لقطة: `audit/screenshots/employees_id.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
