# /hr/payroll/salary-components — `artifacts/ghayth-erp/src/pages/hr/salary-components.tsx`

## 1. الميتاداتا
- المسار: `/hr/payroll/salary-components`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/salary-components.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:104`
- المجموعة: `hr`
- الكومبوننت: `SalaryComponents`
- subKey: `payroll` | minRoleLevel: —
- الكيان المستنبط: `salary-components`
- سطور الملف: 180
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L133: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/hr/salary-components`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `salary-components` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/payroll/salary-components`
- لقطة: `audit/screenshots/hr_payroll_salary_components.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
