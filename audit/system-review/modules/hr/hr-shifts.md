# /hr/shifts — `artifacts/ghayth-erp/src/pages/hr/shifts.tsx`

## 1. الميتاداتا
- المسار: `/hr/shifts`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/shifts.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:140`
- المجموعة: `hr`
- الكومبوننت: `Shifts`
- subKey: `shifts` | minRoleLevel: —
- الكيان المستنبط: `shifts`
- سطور الملف: 193
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

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
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `shifts` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L48 _(inline-data-array)_: `const kpis = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/shifts`
- لقطة: `audit/screenshots/hr_shifts.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
