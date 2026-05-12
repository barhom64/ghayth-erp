# /hr/attendance/:id — `artifacts/ghayth-erp/src/pages/hr/attendance.tsx`

## 1. الميتاداتا
- المسار: `/hr/attendance/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/attendance.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:93`
- المجموعة: `hr`
- الكومبوننت: `Attendance`
- subKey: `attendance` | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 365
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L239: "الاستئذانات"
- L245: "تسجيل حضور"
- L266: "تسجيل حضور"

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L133 _(inline-data-array)_: `const kpis = [`

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: /api/hr/attendance → 401`
- landedUrl: `?`
- توصية: مغلق
