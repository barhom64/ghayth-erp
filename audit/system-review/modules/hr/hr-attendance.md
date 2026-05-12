# /hr/attendance — `artifacts/ghayth-erp/src/pages/create/employees-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/attendance`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/employees-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:91`
- المجموعة: `hr`
- الكومبوننت: `EmployeesCreate`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `attendance`
- سطور الملف: 483
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(call)_ | `/employees` | POST | 🔴 لم يُعثر على endpoint مطابق |||||||

### تفاصيل الأزرار المرئية
- L185: "(بلا تسمية)"
- L206: "(بلا تسمية)" → `() => setLocation("/employees")`
- L219: "مسح المسودة" → `clearDraft`
- L475: "(بلا تسمية)" → `() => setLocation("/employees")` 🔒
- L476: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
- الجدول: `attendance` (export: `attendance`, 12 عمود)
- tenant col: ✅ | createdBy: — | createdAt: — | updatedAt: — | softDelete: — | lifecycle col: ✅
- FKs: employeeAssignments.id, companies.id, branches.id

## 5. البيانات الوهمية الثابتة
- ⚠ L23 _(inline-data-array)_: `const OPERATIONS = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/attendance`
- لقطة: `audit/screenshots/hr_attendance.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
