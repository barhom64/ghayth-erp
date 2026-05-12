# /hr/employee-profile/:id — `artifacts/ghayth-erp/src/pages/hr/shifts-management.tsx`

## 1. الميتاداتا
- المسار: `/hr/employee-profile/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/shifts-management.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:144`
- المجموعة: `hr`
- الكومبوننت: `ShiftsManagement`
- subKey: `shifts` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 186
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L113: "(بلا تسمية)" → `() => setShowAssignForm(!showAssignForm)`
- L125: "(بلا تسمية)" → `() => setShowAssignForm(false)`

### القراءات (GET)
- GET `/hr/shifts`
- GET `/hr/shift-assignments`
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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no id resolver for /hr/employee-profile/:id`
- landedUrl: `?`
- توصية: مغلق
