# /hr/performance — `artifacts/ghayth-erp/src/pages/hr/performance.tsx`

## 1. الميتاداتا
- المسار: `/hr/performance`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/performance.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:106`
- المجموعة: `hr`
- الكومبوننت: `Performance`
- subKey: `performance` | minRoleLevel: —
- الكيان المستنبط: `performance`
- سطور الملف: 137
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L103: "تقييم جديد"

### القراءات (GET)
- GET `/hr/performance`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/hr.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `performance` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L29 _(inline-data-array)_: `const kpis = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/performance`
- لقطة: `audit/screenshots/hr_performance.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
