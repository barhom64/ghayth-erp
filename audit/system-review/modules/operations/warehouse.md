# /warehouse — `artifacts/ghayth-erp/src/pages/projects/risks.tsx`

## 1. الميتاداتا
- المسار: `/warehouse`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/projects/risks.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:95`
- المجموعة: `operations`
- الكومبوننت: `ProjectRisks`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `warehouse`
- سطور الملف: 287
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L203: "(بلا تسمية)" → `() => setShowForm(!showForm)` 🔒
- L228: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/projects?limit=100`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `warehouse` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
- ⚠ L41 _(inline-data-array)_: `const PROBABILITY_OPTIONS = [`
- ⚠ L48 _(inline-data-array)_: `const IMPACT_OPTIONS = [`

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/warehouse`
- لقطة: `audit/screenshots/warehouse.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
