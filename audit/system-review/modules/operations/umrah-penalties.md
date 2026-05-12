# /umrah/penalties — `artifacts/ghayth-erp/src/pages/umrah/penalties.tsx`

## 1. الميتاداتا
- المسار: `/umrah/penalties`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/penalties.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:55`
- المجموعة: `operations`
- الكومبوننت: `UmrahPenalties`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `penalties`
- سطور الملف: 243
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L109: "(بلا تسمية)" → `(e) => handleWaive(e, p.id)`
- L146: "(بلا تسمية)" → `() => setBulkOpen(true)`

### القراءات (GET)
- GET `/umrah/penalties`



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `penalties` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/umrah/penalties`
- لقطة: `audit/screenshots/umrah_penalties.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
