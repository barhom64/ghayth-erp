# /hr/shifts/management — `artifacts/ghayth-erp/src/pages/hr/shifts.tsx`

## 1. الميتاداتا
- المسار: `/hr/shifts/management`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/shifts.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:142`
- المجموعة: `hr`
- الكومبوننت: `Shifts`
- subKey: `shifts` | minRoleLevel: —
- الكيان المستنبط: `management`
- سطور الملف: 192
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L77: "إضافة وردية"

### القراءات (GET)
- GET `/hr/shifts`
- GET `/hr/shift-assignments`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `management` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L47 _(inline-data-array)_: `const kpis = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/shifts/management`
- لقطة: `audit/screenshots/hr_shifts_management.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
