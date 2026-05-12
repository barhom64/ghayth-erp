# /operations-center — `artifacts/ghayth-erp/src/pages/operations-center.tsx`

## 1. الميتاداتا
- المسار: `/operations-center`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/operations-center.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:78`
- المجموعة: `operations`
- الكومبوننت: `OperationsCenter`
- subKey: — | minRoleLevel: 40
- الكيان المستنبط: `operations-center`
- سطور الملف: 284
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L117: "الإقفال اليومي"
- L122: "(بلا تسمية)" → `() => { setRefreshKey(k => k + 1); refetch();`
- L174: "(بلا تسمية)"
- L245: "عرض الكل"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع `docs/blueprints/operations.md` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `operations-center` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/operations-center`
- لقطة: `audit/screenshots/operations_center.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
