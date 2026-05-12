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
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

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
