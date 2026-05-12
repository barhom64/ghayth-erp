# /employees — `artifacts/ghayth-erp/src/pages/hr.tsx`

## 1. الميتاداتا
- المسار: `/employees`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:88`
- المجموعة: `hr`
- الكومبوننت: `HR`
- subKey: `employees` | minRoleLevel: —
- الكيان المستنبط: `employees`
- سطور الملف: 317
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L118: "(بلا تسمية)" → `() => navigate("/employees/create")`

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
