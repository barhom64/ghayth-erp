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
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

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
